"""The evidence window contract.

    window = [ startsAt − for − baseline − margin , startsAt + margin ]

startsAt is when the alert began *firing*, which is after `for:` elapsed. The
onset — where the causal signal is — sits before it.
"""

import re
from datetime import datetime, timedelta

from app import config
from app.investigation.state import AlertInfo, Window

_DURATION = re.compile(r"(\d+)(ms|s|m|h|d)")
_UNIT_S = {"ms": 0.001, "s": 1, "m": 60, "h": 3600, "d": 86400}


def parse_duration(text: str) -> int:
    """Prometheus duration ('2m', '1m30s', '1h') → whole seconds."""
    parts = _DURATION.findall(text.strip())
    if not parts or "".join(n + u for n, u in parts) != text.strip():
        raise ValueError(f"not a duration: {text!r}")
    return int(sum(int(n) * _UNIT_S[u] for n, u in parts))


def alert_info(alert: dict) -> AlertInfo:
    """Build AlertInfo from the stored raw alert JSON (live run or replay alike)."""
    annotations = alert.get("annotations") or {}
    declared = annotations.get("for_duration")
    try:
        if not declared:
            raise ValueError("no for_duration annotation")
        for_s, from_annotation = parse_duration(declared), True
    except ValueError:
        for_s, from_annotation = parse_duration(config.FALLBACK_FOR_DURATION), False
    labels = alert.get("labels") or {}
    return AlertInfo(
        fingerprint=alert["fingerprint"],
        alertname=labels.get("alertname", "unknown"),
        labels=labels,
        annotations=annotations,
        starts_at=datetime.fromisoformat(alert["startsAt"].replace("Z", "+00:00")),
        for_duration_s=for_s,
        for_from_annotation=from_annotation,
    )


def compute_window(alert: AlertInfo, now: datetime) -> Window:
    margin = timedelta(minutes=config.MARGIN_MINUTES)
    onset_start = alert.starts_at - timedelta(seconds=alert.for_duration_s) - margin
    start = onset_start - timedelta(minutes=config.BASELINE_MINUTES)
    # A live run starts seconds after startsAt, so "now" bounds it; a replay
    # gets the full margin after startsAt.
    end = min(alert.starts_at + margin, now)
    return Window(start=start, onset_start=onset_start, end=end)
