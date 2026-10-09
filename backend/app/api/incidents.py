"""Read endpoints for the frontend, plus replay (a dev tool, not in the UI)."""

from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.db import repo
from app.db.models import Incident, Run
from app.investigation.pipeline import investigate

router = APIRouter()


def _incident(i: Incident) -> dict:
    return {
        "id": i.id, "fingerprint": i.fingerprint, "alertname": i.alertname, "service": i.service,
        "severity": i.severity, "labels": i.labels, "annotations": i.annotations,
        "starts_at": i.starts_at, "created_at": i.created_at, "resolved_at": i.resolved_at,
        "open": i.resolved_at is None,
    }


def _run(r: Run, full: bool = True) -> dict:
    report = r.report or {}
    out = {
        "id": r.id, "incident_id": r.incident_id, "trigger": r.trigger, "status": r.status,
        "current_step": r.current_step, "created_at": r.created_at, "started_at": r.started_at,
        "finished_at": r.finished_at, "missing_sources": r.missing_sources,
        "weak_baseline": r.weak_baseline, "error": r.error, "model": r.model,
        "summary": report.get("summary"), "cause_service": report.get("cause_service"),
        "confidence": report.get("confidence"),
    }
    if full:
        out |= {"window_start": r.window_start, "window_end": r.window_end,
                "evidence": r.evidence, "report": r.report, "trace": r.trace or []}
    return out


@router.get("/incidents")
async def list_incidents(
    state: Literal["open", "resolved"] | None = Query(None, description="Filter by alert state"),
    limit: int = Query(100, ge=1, le=500),
):
    rows = await repo.list_incidents(state, limit)
    return [
        _incident(i) | {"run_count": n or 0, "latest_run": _run(r, full=False) if r else None}
        for i, r, n in rows
    ]


@router.get("/incidents/stats")
async def incident_stats():
    return await repo.incident_stats()


@router.get("/incidents/{incident_id}")
async def get_incident(incident_id: int):
    incident, runs, notifications = await repo.get_incident(incident_id)
    if incident is None:
        raise HTTPException(404, "incident not found")
    return _incident(incident) | {"notification_count": notifications, "runs": [_run(r) for r in runs]}


@router.get("/runs/{run_id}")
async def get_run(run_id: int):
    run = await repo.get_run(run_id)
    if run is None:
        raise HTTPException(404, "run not found")
    return _run(run)


@router.post("/incidents/{incident_id}/replay", status_code=202)
async def replay(incident_id: int, background: BackgroundTasks):
    """New run on an existing incident, against the original alert's window."""
    run_id = await repo.create_replay_run(incident_id)
    if run_id is None:
        raise HTTPException(404, "incident not found")
    background.add_task(investigate, run_id)
    return {"run_id": run_id}
