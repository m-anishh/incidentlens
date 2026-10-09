"""Evidence → prompt text. Pure formatting; no HTTP, no LLM."""

from app.investigation.evidence import fmt
from app.investigation.state import InvestigationState

SYSTEM = """You are an SRE investigating a production alert. You are given evidence \
gathered from Prometheus and Loki over a time window that starts with a healthy \
baseline period and continues through the onset of the problem.

How to reason:
- Separate the symptom (what alerted) from the cause (what changed first, upstream). \
The cause is often in a different service or dependency than the one that alerted.
- Ground every claim in a specific number from the evidence: a baseline → incident \
change, a log pattern count, a time offset from the onset. If a claim has no number \
behind it, it is an assertion, not a finding.
- Look for what did NOT change as well as what did. A flat database while client-side \
latency climbs points away from the database.
- Use the onset time series to order events: whatever moved first is the better \
candidate for the cause.
- State evidence gaps plainly: unreachable sources, a weak baseline, metrics with no data. \
Lower your confidence accordingly.

You suggest fixes; you never execute them. Suggested fixes should be specific and \
reversible where possible, and say how to confirm they worked."""


REPORT_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string", "description": "One or two sentences for the incident list."},
        "probable_cause": {"type": "string"},
        "cause_service": {"type": "string", "description": "The service or dependency where the cause lies."},
        "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
        "evidence": {"type": "array", "items": {"type": "string"},
                     "description": "Each item cites specific numbers from the evidence."},
        "reasoning": {"type": "string", "description": "How the evidence leads to the cause, step by step."},
        "suggested_fix": {"type": "string"},
        "evidence_gaps": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "probable_cause", "cause_service", "confidence",
                 "evidence", "reasoning", "suggested_fix", "evidence_gaps"],
    "additionalProperties": False,
}


def build_prompt(state: InvestigationState) -> str:
    a, w = state.alert, state.window
    out: list[str] = []

    out.append("## Alert")
    out.append(f"- name: {a.alertname}")
    out.append(f"- labels: {_labels(a.labels)}")
    if a.annotations.get("summary"):
        out.append(f"- summary: {a.annotations['summary']}")
    out.append(f"- firing since (startsAt): {a.starts_at.isoformat()}")
    out.append(f"- rule `for:` duration: {a.for_duration_s}s"
               + ("" if a.for_from_annotation else " (ASSUMED — not declared on the rule)"))

    out.append("\n## Evidence window")
    out.append(f"- baseline: {w.start.isoformat()} → {w.onset_start.isoformat()}")
    out.append(f"- onset → end: {w.onset_start.isoformat()} → {w.end.isoformat()}")
    out.append("Onset series below use seconds since onset start (t=0). "
               f"The alert began firing at t={int((a.starts_at - w.onset_start).total_seconds())}s.")

    out.append("\n## Evidence quality")
    out.append(f"- unreachable sources: {', '.join(state.missing_sources) or 'none'}")
    if state.baseline_quality.weak:
        out.append("- baseline is WEAK: " + "; ".join(state.baseline_quality.reasons))
    else:
        out.append("- baseline: healthy")
    for e in state.query_errors:
        out.append(f"- query failed: {e}")
    for f in state.findings:
        out.append(f"- note: {f}")

    out.append("\n## Metrics: baseline → incident")
    if state.contrast:
        for c in sorted(state.contrast, key=lambda c: (c.metric, _labels(c.labels))):
            out.append(f"- {c.metric} {{{_labels(c.labels)}}}: {c.summary}")
    else:
        out.append("(no metric data)")

    out.append("\n## Onset time series (series that moved; t in seconds, values in listed unit)")
    if state.onset:
        for s in state.onset:
            pts = ", ".join(f"{t}:{_short(v, s.unit)}" for t, v in s.points)
            out.append(f"- {s.metric} {{{_labels(s.labels)}}} [{s.unit}]: {pts}")
    else:
        out.append("(none moved notably)")

    out.append("\n## Log patterns (warnings and errors): baseline count → incident count")
    if state.logs:
        for p in state.logs:
            out.append(f"- [{p.service}] {p.level} \"{p.msg}\": {p.baseline_count} → {p.incident_count}")
            for line in p.samples:
                out.append(f"    sample: {line}")
    elif "loki" in state.missing_sources:
        out.append("(logs unavailable)")
    else:
        out.append("(no warnings or errors in either period)")

    out.append("\n## Task")
    out.append("Determine the probable root cause, the evidence for it, and a suggested fix. "
               "Respond with JSON matching the required schema.")
    return "\n".join(out)


def _labels(labels: dict) -> str:
    return ", ".join(f"{k}={v}" for k, v in sorted(labels.items()))


def _short(v: float, unit: str) -> str:
    if unit == "s":
        return f"{v * 1000:.0f}ms"
    if unit == "ratio":
        return f"{v * 100:.1f}%"
    if unit == "bool":
        return fmt(v, unit)
    return f"{v:.2f}"
