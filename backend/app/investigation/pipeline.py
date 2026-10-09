"""v1: a linear sequence. Load → window → collect → reason → persist.

Every run ends in a terminal state: complete, partial (a source was
unreachable) or failed (no report, with the failing step recorded). A timeout
forces `failed`.
"""

import asyncio
import logging

from app import config
from app.collectors import QueryRejected, SourceUnavailable, loki, prometheus
from app.db import repo
from app.investigation import catalog, evidence
from app.investigation.state import BaselineQuality, InvestigationState
from app.investigation.window import alert_info, compute_window
from app.reasoner import reason

log = logging.getLogger(__name__)


async def investigate(run_id: int) -> None:
    """Entry point for the background task. Never raises."""
    progress = {"step": "load"}
    try:
        await asyncio.wait_for(_investigate(run_id, progress), timeout=config.RUN_TIMEOUT_S)
    except asyncio.TimeoutError:
        await repo.fail_run(run_id, progress["step"], f"timed out after {config.RUN_TIMEOUT_S}s")
    except Exception as e:  # noqa: BLE001 — any failure must still reach a terminal state
        log.exception("run %s failed at %s", run_id, progress["step"])
        await repo.fail_run(run_id, progress["step"], f"{type(e).__name__}: {e}")


async def _investigate(run_id: int, progress: dict) -> None:
    run, incident, first_alert = await repo.load_run_context(run_id)
    if first_alert is None:
        raise ValueError("incident has no stored firing alert to rebuild the window from")

    state = InvestigationState(run_id=run_id, incident_id=incident.id, alert=alert_info(first_alert))
    state.window = compute_window(state.alert, repo.utcnow())
    if not state.alert.for_from_annotation:
        state.findings.append(
            f"alert has no for_duration annotation; assumed {config.FALLBACK_FOR_DURATION} to place the onset"
        )

    progress["step"] = "collecting"
    await repo.update_run(
        run_id, status="collecting", current_step="collecting", started_at=repo.utcnow(),
        window_start=state.window.start, window_end=state.window.end,
    )
    await asyncio.gather(_collect_metrics(state), _collect_logs(state))
    state.step_count += 1

    if {"prometheus", "loki"} <= set(state.missing_sources):
        raise RuntimeError("no evidence source reachable: prometheus and loki both unavailable")

    progress["step"] = "reasoning"
    await repo.update_run(
        run_id, status="reasoning", current_step="reasoning",
        evidence=_evidence_json(state), missing_sources=state.missing_sources,
        weak_baseline=state.baseline_quality.weak,
    )
    state.report = await reason(state)
    state.step_count += 1

    await repo.update_run(
        run_id,
        status="partial" if state.missing_sources else "complete",
        current_step=None,
        finished_at=repo.utcnow(),
        report=state.report.model_dump(mode="json"),
    )


async def _collect_metrics(state: InvestigationState) -> None:
    w = state.window
    results = await asyncio.gather(
        *(prometheus.query_range(q, w.start, w.end, config.QUERY_STEP_S) for _, _, q in catalog.METRICS),
        return_exceptions=True,
    )
    if any(isinstance(r, SourceUnavailable) for r in results):
        state.missing_sources.append("prometheus")
        return

    contrasts = []
    for (name, unit, _), result in zip(catalog.METRICS, results):
        if isinstance(result, QueryRejected):
            state.query_errors.append(f"{name}: {result}")
            continue
        if isinstance(result, Exception):
            raise result
        for series in result:
            base_pts, onset_pts = evidence.split(series["points"], w.onset_start)
            base = evidence.aggregate(name, unit, series["labels"], base_pts) if base_pts else None
            if base:
                state.baseline.append(base)
            if onset_pts:
                contrasts.append((evidence.contrast(name, unit, series["labels"], base, onset_pts), onset_pts))

    state.contrast = [c for c, _ in contrasts]
    notable = sorted((x for x in contrasts if evidence.is_notable(x[0])),
                     key=lambda x: evidence.notability(x[0]), reverse=True)
    state.onset = [
        evidence.downsample(c.metric, c.unit, c.labels, pts, w.onset_start, config.ONSET_POINTS_PER_SERIES)
        for c, pts in notable[: config.MAX_ONSET_SERIES]
    ]
    state.baseline_quality = await _baseline_quality(state)


async def _baseline_quality(state: InvestigationState) -> BaselineQuality:
    """Weak when a process started inside the window, or the baseline is thin.
    Separate from `partial`: every source answered, the comparison is suspect."""
    w = state.window
    quality = BaselineQuality()

    try:
        starts = await prometheus.query(catalog.PROCESS_START, w.end)
    except (SourceUnavailable, QueryRejected) as e:
        state.query_errors.append(f"process_start: {e}")
        starts = []
    for row in starts:
        if row["value"] > w.start.timestamp():
            quality.reasons.append(
                f"{row['labels'].get('service', '?')} (re)started inside the evidence window — baseline includes warm-up"
            )

    expected = (w.onset_start - w.start).total_seconds() / config.QUERY_STEP_S
    rate_samples = [b.samples for b in state.baseline if b.metric == "http_request_rate"]
    if not rate_samples:
        quality.reasons.append("no request-rate samples in the baseline period")
    elif max(rate_samples) < 0.5 * expected:
        quality.reasons.append(
            f"baseline has {max(rate_samples)} of ~{int(expected)} expected samples — traffic started late or scrapes gapped"
        )

    quality.weak = bool(quality.reasons)
    return quality


async def _collect_logs(state: InvestigationState) -> None:
    w = state.window
    baseline_s = int((w.onset_start - w.start).total_seconds())
    incident_s = max(int((w.end - w.onset_start).total_seconds()), 1)
    try:
        baseline_counts, incident_counts, lines = await asyncio.gather(
            loki.query(catalog.log_count_query(baseline_s), w.onset_start),
            loki.query(catalog.log_count_query(incident_s), w.end),
            # Forward from the onset: the earliest lines are the most diagnostic.
            loki.query_range(catalog.LOG_SELECTOR, w.onset_start, w.end, config.LOG_LINE_LIMIT, "forward"),
        )
    except SourceUnavailable:
        state.missing_sources.append("loki")
        return
    except QueryRejected as e:
        state.query_errors.append(f"logs: {e}")
        return
    state.logs = evidence.log_patterns(baseline_counts, incident_counts, lines, config.LOG_SAMPLES_PER_PATTERN)


def _evidence_json(state: InvestigationState) -> dict:
    return state.model_dump(mode="json", exclude={"report", "run_id", "incident_id"})
