"""JSON logging and Prometheus HTTP metrics, labeled by route template."""

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

from prometheus_client import Counter, Histogram

SERVICE = os.environ["SERVICE_NAME"]

# Paths never recorded in metrics: operator switches and scrape traffic would
# otherwise show up as real traffic in the evidence.
UNMETERED_PREFIXES = ("/admin", "/metrics", "/healthz")

HTTP_REQUESTS = Counter(
    "http_requests_total",
    "HTTP requests handled",
    ["method", "route", "status"],
)
HTTP_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["method", "route"],
    # Fine around 100ms: DB routes sit just above the 100ms connection hold, and
    # histogram_quantile interpolates linearly inside a bucket — with a 0.1–0.25
    # bucket a steady 102ms reads as p95 ≈ 242ms.
    buckets=(0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.11, 0.125, 0.15, 0.2, 0.25,
             0.5, 0.75, 1, 1.5, 2, 3, 5, 10),
)


class JsonFormatter(logging.Formatter):
    def format(self, record):
        out = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "service": SERVICE,
            "msg": record.getMessage(),
        }
        out.update(getattr(record, "fields", {}))
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out)


def get_logger():
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger(SERVICE)
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger


log = get_logger()


class MetricsMiddleware:
    """Pure ASGI middleware.

    Reads the matched route template from scope["route"] after the app has run,
    so /orders/123 is recorded as /orders/{order_id}. Unhandled exceptions are
    turned into a 500 here, logged once as JSON, and counted — rather than
    re-raised into uvicorn's plain-text traceback logger.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"].startswith(UNMETERED_PREFIXES):
            return await self.app(scope, receive, send)

        start = time.perf_counter()
        status = 500
        response_started = False

        async def send_wrapper(message):
            nonlocal status, response_started
            if message["type"] == "http.response.start":
                status = message["status"]
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            status = 500
            log.exception("unhandled exception", extra={"fields": {"route": _route(scope), "method": scope["method"]}})
            if not response_started:
                await send({"type": "http.response.start", "status": 500,
                            "headers": [(b"content-type", b"application/json")]})
                await send({"type": "http.response.body", "body": b'{"detail":"internal error"}'})
        finally:
            elapsed = time.perf_counter() - start
            route = _route(scope)
            method = scope["method"]
            HTTP_REQUESTS.labels(method, route, str(status)).inc()
            HTTP_DURATION.labels(method, route).observe(elapsed)
            log.info("request", extra={"fields": {
                "method": method, "route": route, "status": status,
                "duration_ms": round(elapsed * 1000, 1),
            }})


def _route(scope):
    route = scope.get("route")
    return route.path if route is not None else "unmatched"
