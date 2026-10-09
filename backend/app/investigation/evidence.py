"""Shape raw collector output into the baseline / onset / contrast structure.

Pure functions — no I/O — so the shaping is unit-testable without Prometheus.
"""

import json
import statistics
from datetime import datetime

from app.investigation.state import Contrast, LogPattern, OnsetSeries, SeriesAggregate

# A series is "notable" enough to send at full resolution when its incident
# peak moves this far from baseline. Everything still appears in the contrast.
NOTABLE_RATIO = 1.5
NOTABLE_ABS = {"ratio": 0.02, "bool": 0.5}


def split(points, onset_start: datetime):
    cut = onset_start.timestamp()
    return [p for p in points if p[0] < cut], [p for p in points if p[0] >= cut]


def aggregate(metric, unit, labels, points) -> SeriesAggregate:
    values = [v for _, v in points]
    return SeriesAggregate(
        metric=metric, unit=unit, labels=labels,
        mean=statistics.fmean(values), p95=_p95(values), samples=len(values),
    )


def contrast(metric, unit, labels, baseline: SeriesAggregate | None, onset_points) -> Contrast:
    values = [v for _, v in onset_points]
    mean, peak = statistics.fmean(values), max(values)
    base = baseline.mean if baseline else None
    ratio = (peak / base) if base else None
    if base is None:
        summary = f"no baseline → peak {fmt(peak, unit)}"
    else:
        summary = f"baseline {fmt(base, unit)} → incident mean {fmt(mean, unit)}, peak {fmt(peak, unit)}"
        if ratio is not None:
            summary += f" (×{ratio:.1f})"
    return Contrast(
        metric=metric, unit=unit, labels=labels, baseline_mean=base,
        incident_mean=mean, incident_peak=peak, ratio=ratio, summary=summary,
    )


def is_notable(c: Contrast) -> bool:
    if c.baseline_mean is None:
        return c.incident_peak > 0
    if c.unit in NOTABLE_ABS:
        # Mean as well as peak: a bool that drops to 0 never raises the peak.
        drift = max(abs(c.incident_peak - c.baseline_mean), abs(c.incident_mean - c.baseline_mean))
        return drift >= NOTABLE_ABS[c.unit]
    if c.baseline_mean == 0:
        return c.incident_peak > 0
    return c.incident_peak / c.baseline_mean >= NOTABLE_RATIO or c.incident_mean / c.baseline_mean <= 1 / NOTABLE_RATIO


def notability(c: Contrast) -> float:
    if c.baseline_mean in (None, 0):
        return float("inf") if c.incident_peak > 0 else 0.0
    return max(c.incident_peak / c.baseline_mean, c.baseline_mean / max(c.incident_mean, 1e-9))


def downsample(metric, unit, labels, onset_points, onset_start: datetime, max_points: int) -> OnsetSeries:
    stride = max(1, -(-len(onset_points) // max_points))  # ceil division
    t0 = onset_start.timestamp()
    pts = [(int(ts - t0), round(v, 6)) for ts, v in onset_points[::stride]]
    return OnsetSeries(metric=metric, unit=unit, labels=labels, points=pts)


def log_patterns(baseline_counts, incident_counts, sample_lines, samples_per_pattern: int) -> list[LogPattern]:
    """Group warning/error lines by (service, level, msg), with counts from both
    portions and a few sample lines from the onset."""
    def key(labels):
        return labels.get("service", "?"), labels.get("level", "?"), labels.get("msg", "?")

    patterns: dict[tuple, LogPattern] = {}
    for row in incident_counts:
        k = key(row["labels"])
        patterns[k] = LogPattern(service=k[0], level=k[1], msg=k[2], baseline_count=0, incident_count=int(row["value"]))
    for row in baseline_counts:
        k = key(row["labels"])
        if k in patterns:
            patterns[k].baseline_count = int(row["value"])
        else:
            patterns[k] = LogPattern(service=k[0], level=k[1], msg=k[2], baseline_count=int(row["value"]), incident_count=0)

    for line in sample_lines:
        try:
            msg = json.loads(line["line"]).get("msg", "?")
        except (ValueError, AttributeError):
            continue
        k = (line["labels"].get("service", "?"), line["labels"].get("level", "?"), msg)
        p = patterns.get(k)
        if p is not None and len(p.samples) < samples_per_pattern:
            p.samples.append(line["line"][:500])

    return sorted(patterns.values(), key=lambda p: p.incident_count - p.baseline_count, reverse=True)


def fmt(v: float, unit: str) -> str:
    if unit == "s":
        return f"{v * 1000:.0f}ms" if v < 10 else f"{v:.1f}s"
    if unit == "ratio":
        return f"{v * 100:.1f}%"
    if unit == "bool":
        return "up" if v >= 0.5 else "down"
    return f"{v:.2f} {unit}"


def _p95(values):
    if len(values) == 1:
        return values[0]
    return statistics.quantiles(values, n=20, method="inclusive")[18]
