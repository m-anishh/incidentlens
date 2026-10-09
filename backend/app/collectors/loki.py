"""Loki HTTP API. Given a LogQL query, a time window and a line cap, fetch and parse.

The line cap is mandatory: unbounded log dumps would exceed the LLM context.
"""

from datetime import datetime

import httpx

from app import config
from app.collectors import QueryRejected, SourceUnavailable


async def query_range(logql: str, start: datetime, end: datetime, limit: int,
                      direction: str = "forward") -> list[dict]:
    """Returns [{"ts": unix_ts, "labels": {...}, "line": str}], at most `limit` lines."""
    data = await _get("/loki/api/v1/query_range", {
        "query": logql, "start": _ns(start), "end": _ns(end), "limit": limit, "direction": direction,
    })
    lines = []
    for stream in data["result"]:
        for ts_ns, line in stream["values"]:
            lines.append({"ts": int(ts_ns) / 1e9, "labels": stream["stream"], "line": line})
    lines.sort(key=lambda l: l["ts"], reverse=(direction == "backward"))
    return lines[:limit]


async def query(logql: str, at: datetime) -> list[dict]:
    """Instant metric query (e.g. count_over_time). Returns [{"labels": {...}, "value": float}]."""
    data = await _get("/loki/api/v1/query", {"query": logql, "time": _ns(at)})
    return [{"labels": r["metric"], "value": float(r["value"][1])} for r in data["result"]]


async def _get(path, params):
    try:
        async with httpx.AsyncClient(base_url=config.LOKI_URL, timeout=config.COLLECTOR_TIMEOUT_S) as client:
            resp = await client.get(path, params=params)
    except httpx.HTTPError as e:
        raise SourceUnavailable(f"loki: {e!r}") from e
    if resp.status_code >= 500:
        raise SourceUnavailable(f"loki: HTTP {resp.status_code}")
    if resp.status_code >= 400:
        raise QueryRejected(f"loki: {resp.text[:300]}")
    return resp.json()["data"]


def _ns(dt: datetime) -> int:
    return int(dt.timestamp() * 1e9)
