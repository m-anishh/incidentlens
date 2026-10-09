"""inventory-service: downstream dependency of orders-api.

Scenario 2 switch: POST /admin/delay?ms=800 adds latency to every request.
"""

import asyncio

from fastapi import FastAPI, Response
from prometheus_client import CONTENT_TYPE_LATEST, Gauge, generate_latest
from pydantic import BaseModel

from observability import MetricsMiddleware, log

app = FastAPI()
app.add_middleware(MetricsMiddleware)

state = {"delay_ms": 0}

# Exposed so a human can confirm the switch in Grafana. The agent is evaluated
# on finding the cause from latency, not from this gauge.
INJECTED_DELAY = Gauge("inventory_injected_delay_ms", "Artificial delay currently applied")
INJECTED_DELAY.set_function(lambda: state["delay_ms"])


class Reservation(BaseModel):
    sku: str
    qty: int


@app.post("/reserve")
async def reserve(body: Reservation):
    if state["delay_ms"]:
        await asyncio.sleep(state["delay_ms"] / 1000)
    return {"sku": body.sku, "qty": body.qty, "reserved": True}


@app.post("/admin/delay")
async def set_delay(ms: int = 0):
    state["delay_ms"] = max(ms, 0)
    log.info("admin: delay set", extra={"fields": {"delay_ms": state["delay_ms"]}})
    return state


@app.get("/admin/state")
async def get_state():
    return state


@app.get("/healthz")
async def healthz():
    return {"ok": True}


@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
