from datetime import datetime, timedelta, timezone

import pytest

from app import config
from app.investigation import evidence
from app.investigation.state import InvestigationState
from app.investigation.window import alert_info, compute_window, parse_duration
from app.reasoner.prompt import build_prompt

T0 = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)


def raw_alert(**annotations):
    return {
        "status": "firing", "fingerprint": "abc123",
        "labels": {"alertname": "HighLatencyP95", "service": "orders-api", "route": "/orders"},
        "annotations": annotations,
        "startsAt": "2026-10-09T12:00:00.000Z", "endsAt": "0001-01-01T00:00:00Z",
    }


@pytest.mark.parametrize("text,seconds", [("2m", 120), ("30s", 30), ("1m30s", 90), ("1h", 3600)])
def test_parse_duration(text, seconds):
    assert parse_duration(text) == seconds


@pytest.mark.parametrize("text", ["", "2x", "m2", "2m junk"])
def test_parse_duration_rejects(text):
    with pytest.raises(ValueError):
        parse_duration(text)


def test_window_reaches_back_past_for_and_baseline():
    a = alert_info(raw_alert(for_duration="2m"))
    w = compute_window(a, now=T0 + timedelta(hours=1))
    margin = timedelta(minutes=config.MARGIN_MINUTES)
    assert w.onset_start == T0 - timedelta(minutes=2) - margin
    assert w.start == w.onset_start - timedelta(minutes=config.BASELINE_MINUTES)
    assert w.end == T0 + margin  # replay: full margin after startsAt


def test_live_window_ends_now():
    a = alert_info(raw_alert(for_duration="2m"))
    now = T0 + timedelta(seconds=15)
    assert compute_window(a, now).end == now


def test_missing_for_annotation_falls_back_and_is_flagged():
    a = alert_info(raw_alert())
    assert not a.for_from_annotation
    assert a.for_duration_s == parse_duration(config.FALLBACK_FOR_DURATION)


def test_contrast_and_notability():
    onset_start = T0
    pts = [(T0.timestamp() - 60 * i, 0.04) for i in range(1, 11)] + \
          [(T0.timestamp() + 15 * i, 0.9) for i in range(10)]
    base_pts, onset_pts = evidence.split(sorted(pts), onset_start)
    base = evidence.aggregate("http_p95_latency", "s", {}, base_pts)
    c = evidence.contrast("http_p95_latency", "s", {}, base, onset_pts)
    assert c.summary.startswith("baseline 40ms → incident mean 900ms, peak 900ms")
    assert evidence.is_notable(c)

    flat = evidence.contrast("postgres_mean_query_time", "s", {}, base, base_pts)
    assert not evidence.is_notable(flat)


def test_bool_drop_is_notable_even_when_peak_unchanged():
    base = evidence.aggregate("redis_up", "bool", {}, [(1, 1.0), (2, 1.0)])
    c = evidence.contrast("redis_up", "bool", {}, base, [(3, 1.0), (4, 0.0), (5, 0.0)])
    assert evidence.is_notable(c)


def test_downsample_caps_points_and_uses_onset_offsets():
    pts = [(T0.timestamp() + i, float(i)) for i in range(100)]
    s = evidence.downsample("m", "per s", {}, pts, T0, max_points=20)
    assert len(s.points) <= 20
    assert s.points[0] == (0, 0.0)


def test_log_patterns_contrast_counts_and_samples():
    baseline = [{"labels": {"service": "orders-api", "level": "warning", "msg": "db pool timeout"}, "value": "0"}]
    incident = [{"labels": {"service": "orders-api", "level": "warning", "msg": "db pool timeout"}, "value": "412"}]
    lines = [{"ts": 1, "labels": {"service": "orders-api", "level": "warning"},
              "line": '{"msg": "db pool timeout", "waited_ms": 2001}'}] * 5
    patterns = evidence.log_patterns(baseline, incident, lines, samples_per_pattern=3)
    assert len(patterns) == 1
    p = patterns[0]
    assert (p.baseline_count, p.incident_count, len(p.samples)) == (0, 412, 3)


def test_prompt_declares_gaps():
    a = alert_info(raw_alert())
    state = InvestigationState(run_id=1, incident_id=1, alert=a, window=compute_window(a, T0))
    state.missing_sources = ["loki"]
    state.baseline_quality.weak = True
    state.baseline_quality.reasons = ["orders-api (re)started inside the evidence window"]
    prompt = build_prompt(state)
    assert "unreachable sources: loki" in prompt
    assert "baseline is WEAK" in prompt
    assert "ASSUMED" in prompt
    assert "(logs unavailable)" in prompt
