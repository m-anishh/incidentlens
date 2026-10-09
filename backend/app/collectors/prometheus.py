"""Prometheus HTTP API. Given a query and a time window, fetch and parse.

Knows nothing about incidents, baselines or LLMs.
"""

import math
from datetime import datetime

import httpx

from app import config
from app.collectors import QueryRejected, SourceUnavailable


async def query_range(promql: str, start: datetime, end: datetime, step_s: int) -> list[dict]:
    """Returns [{"labels": {...}, "points": [(unix_ts, value), ...]}]. NaN/Inf points dropped."""
    data = await _get("/api/v1/query_range", {
        "query": promql, "start": start.timestamp(), "end": end.timestamp(), "step": step_s,
    })
    series = []
    for result in data["result"]:
        points = [(float(ts), float(v)) for ts, v in result["values"] if _finite(v)]
        if points:
            series.append({"labels": _clean(result["metric"]), "points": points})
    return series


async def query(promql: str, at: datetime) -> list[dict]:
    """Instant query. Returns [{"labels": {...}, "value": float}]."""
    data = await _get("/api/v1/query", {"query": promql, "time": at.timestamp()})
    return [
        {"labels": _clean(r["metric"]), "value": float(r["value"][1])}
        for r in data["result"] if _finite(r["value"][1])
    ]


async def _get(path, params):
    try:
        async with httpx.AsyncClient(base_url=config.PROMETHEUS_URL, timeout=config.COLLECTOR_TIMEOUT_S) as client:
            resp = await client.get(path, params=params)
    except httpx.HTTPError as e:
        raise SourceUnavailable(f"prometheus: {e!r}") from e
    if resp.status_code >= 500:
        raise SourceUnavailable(f"prometheus: HTTP {resp.status_code}")
    if resp.status_code >= 400:
        raise QueryRejected(f"prometheus: {resp.text[:300]}")
    return resp.json()["data"]


def _finite(v):
    return math.isfinite(float(v))


def _clean(labels):
    return {k: v for k, v in labels.items() if k not in ("__name__", "instance")}
