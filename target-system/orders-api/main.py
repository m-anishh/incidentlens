"""orders-api: the public service. Postgres + Redis cache + calls inventory-service.

Failure scenarios this service is built to exhibit (see ../README.md):
  1. pool exhaustion   — small pool, connection held client-side per request
  3. Redis down        — cache path falls back to Postgres instead of raising
  4. one broken route  — POST /admin/break?route=<name>&enabled=true
"""

import asyncio
import json
import os
import time
from contextlib import asynccontextmanager

import asyncpg
import httpx
from fastapi import FastAPI, HTTPException, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from pydantic import BaseModel
from redis.asyncio import Redis
from redis.asyncio.retry import Retry
from redis.backoff import NoBackoff
from redis.exceptions import RedisError

from observability import MetricsMiddleware, log

DATABASE_URL = os.environ["DATABASE_URL"]
REDIS_URL = os.environ["REDIS_URL"]
INVENTORY_URL = os.environ["INVENTORY_URL"]
DB_POOL_SIZE = int(os.environ.get("DB_POOL_SIZE", "5"))
DB_POOL_TIMEOUT_S = float(os.environ.get("DB_POOL_TIMEOUT_S", "2"))
DB_HOLD_MS = int(os.environ.get("DB_HOLD_MS", "100"))
CACHE_TTL_S = int(os.environ.get("CACHE_TTL_S", "300"))
REDIS_TIMEOUT_S = float(os.environ.get("REDIS_TIMEOUT_S", "0.1"))
INVENTORY_TIMEOUT_S = float(os.environ.get("INVENTORY_TIMEOUT_S", "3"))

ROUTES = {"get_order", "list_orders", "create_order"}
state = {"broken": set()}
deps = {}

DB_POOL_SIZE_G = Gauge("db_pool_size", "Configured connection pool size")
DB_POOL_IN_USE = Gauge("db_pool_in_use", "Connections currently checked out")
DB_POOL_WAITING = Gauge("db_pool_waiting", "Requests waiting to acquire a connection")
DB_POOL_ACQUIRE = Histogram(
    "db_pool_acquire_seconds", "Time spent waiting for a pool connection",
    buckets=(0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 3),
)
DB_POOL_TIMEOUTS = Counter("db_pool_timeouts_total", "Pool acquire attempts that timed out")
CACHE_REQUESTS = Counter("cache_requests_total", "Cache lookups", ["result"])  # hit | miss | error
DOWNSTREAM_DURATION = Histogram(
    "downstream_request_duration_seconds", "Outbound HTTP call latency", ["target", "route", "outcome"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5),
)


@asynccontextmanager
async def lifespan(app):
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=DB_POOL_SIZE, max_size=DB_POOL_SIZE)
    deps["pool"] = pool
    deps["redis"] = Redis.from_url(
        REDIS_URL,
        socket_connect_timeout=REDIS_TIMEOUT_S,
        socket_timeout=REDIS_TIMEOUT_S,
        retry=Retry(NoBackoff(), 0),
    )
    deps["http"] = httpx.AsyncClient(base_url=INVENTORY_URL, timeout=INVENTORY_TIMEOUT_S)
    DB_POOL_SIZE_G.set(DB_POOL_SIZE)
    DB_POOL_IN_USE.set_function(lambda: pool.get_size() - pool.get_idle_size())
    log.info("started", extra={"fields": {"db_pool_size": DB_POOL_SIZE, "db_hold_ms": DB_HOLD_MS}})
    yield
    await deps["http"].aclose()
    await deps["redis"].aclose()
    await pool.close()


app = FastAPI(lifespan=lifespan)
app.add_middleware(MetricsMiddleware)


# --- Postgres -----------------------------------------------------------------

@asynccontextmanager
async def db_conn():
    """Acquire a pooled connection and hold it for DB_HOLD_MS in application code.

    The hold is deliberately client-side (asyncio.sleep, not pg_sleep): Postgres
    sees short, cheap queries while orders-api queues on the pool, which is the
    evidence scenario 1's conclusion depends on.
    """
    pool = deps["pool"]
    DB_POOL_WAITING.inc()
    start = time.perf_counter()
    try:
        conn = await pool.acquire(timeout=DB_POOL_TIMEOUT_S)
    except asyncio.TimeoutError:
        DB_POOL_TIMEOUTS.inc()
        log.warning("db pool timeout", extra={"fields": {
            "pool_size": DB_POOL_SIZE, "waited_ms": round((time.perf_counter() - start) * 1000, 1),
        }})
        raise HTTPException(503, "db pool timeout")
    finally:
        DB_POOL_WAITING.dec()
        DB_POOL_ACQUIRE.observe(time.perf_counter() - start)
    try:
        await asyncio.sleep(DB_HOLD_MS / 1000)
        yield conn
    finally:
        await pool.release(conn)


def serialize(row):
    order = dict(row)
    order["created_at"] = order["created_at"].isoformat()
    return order


# --- Redis --------------------------------------------------------------------

async def cache_get(key):
    try:
        raw = await deps["redis"].get(key)
    except (RedisError, OSError, asyncio.TimeoutError) as e:
        CACHE_REQUESTS.labels("error").inc()
        log.warning("cache unavailable, falling back to postgres", extra={"fields": {"error": repr(e)}})
        return None
    CACHE_REQUESTS.labels("hit" if raw is not None else "miss").inc()
    return json.loads(raw) if raw is not None else None


async def cache_set(key, value):
    try:
        await deps["redis"].set(key, json.dumps(value), ex=CACHE_TTL_S)
    except (RedisError, OSError, asyncio.TimeoutError):
        pass  # already logged on the read path; the response still succeeds


# --- Scenario 4 ---------------------------------------------------------------

def apply_legacy_pricing(route_name, order):
    """Regression path, reachable only when the route is switched to broken.

    Reads a column that no longer exists — a real KeyError with a real
    traceback, scoped to a single route.
    """
    if route_name in state["broken"]:
        order["total"] = order["total_cents"] / 100
    return order


# --- Routes -------------------------------------------------------------------

class NewOrder(BaseModel):
    sku: str
    qty: int
    customer: str


@app.get("/orders/{order_id}")
async def get_order(order_id: int):
    key = f"order:{order_id}"
    order = await cache_get(key)
    if order is None:
        async with db_conn() as conn:
            row = await conn.fetchrow(
                "SELECT id, sku, qty, customer, created_at FROM orders WHERE id = $1", order_id)
        if row is None:
            raise HTTPException(404, "order not found")
        order = serialize(row)
        await cache_set(key, order)
    return apply_legacy_pricing("get_order", order)


@app.get("/orders")
async def list_orders(limit: int = 10):
    async with db_conn() as conn:
        rows = await conn.fetch(
            "SELECT id, sku, qty, customer, created_at FROM orders ORDER BY id DESC LIMIT $1", min(limit, 50))
    return [apply_legacy_pricing("list_orders", serialize(r)) for r in rows]


@app.post("/orders", status_code=201)
async def create_order(body: NewOrder):
    # Reserve before touching the pool: holding a connection across the
    # downstream call would turn scenario 2 into pool exhaustion.
    start = time.perf_counter()
    outcome = "ok"
    try:
        resp = await deps["http"].post("/reserve", json={"sku": body.sku, "qty": body.qty})
        resp.raise_for_status()
    except httpx.TimeoutException:
        outcome = "timeout"
        log.warning("inventory-service timeout", extra={"fields": {"timeout_s": INVENTORY_TIMEOUT_S}})
        raise HTTPException(504, "inventory-service timeout")
    except httpx.HTTPError as e:
        outcome = "error"
        log.warning("inventory-service error", extra={"fields": {"error": repr(e)}})
        raise HTTPException(502, "inventory-service error")
    finally:
        elapsed = time.perf_counter() - start
        DOWNSTREAM_DURATION.labels("inventory-service", "/reserve", outcome).observe(elapsed)
        if elapsed > 0.5 and outcome == "ok":
            log.warning("inventory-service slow", extra={"fields": {"duration_ms": round(elapsed * 1000, 1)}})

    async with db_conn() as conn:
        row = await conn.fetchrow(
            "INSERT INTO orders (sku, qty, customer) VALUES ($1, $2, $3) "
            "RETURNING id, sku, qty, customer, created_at",
            body.sku, body.qty, body.customer)
    return apply_legacy_pricing("create_order", serialize(row))


# --- Operator -----------------------------------------------------------------

@app.post("/admin/break")
async def set_broken(route: str, enabled: bool = True):
    if route not in ROUTES:
        raise HTTPException(400, f"route must be one of {sorted(ROUTES)}")
    (state["broken"].add if enabled else state["broken"].discard)(route)
    log.info("admin: route break switched", extra={"fields": {"route": route, "enabled": enabled}})
    return {"broken": sorted(state["broken"])}


@app.get("/admin/state")
async def get_state():
    return {"broken": sorted(state["broken"])}


@app.get("/healthz")
async def healthz():
    return {"ok": True}


@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
