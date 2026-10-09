# target-system

The application IncidentLens observes. Not part of the product: no auth, no
real schema, no tests. It exists to fail in four known ways.

| Service | Role |
|---|---|
| `orders-api` (:8000) | Public service. Postgres pool of 5, Redis cache, calls inventory-service |
| `inventory-service` (:8001) | Downstream dependency of `POST /orders` |
| `target-postgres`, `redis` | Datastores, with `postgres-exporter` and `redis-exporter` |
| `loadgen` | k6, steady traffic: 45 req/s `GET /orders/{id}` (50 hot ids), 3 req/s `GET /orders`, 3 req/s `POST /orders` |

## Before inducing anything: warm up

Run the stack with loadgen for **at least 15 minutes** first. The agent
compares a 10-minute baseline against the incident; a baseline that overlaps
startup (cold pool, empty cache) is flagged weak and the comparison is
worthless.

Check the cache is warm before scenario 3: in Prometheus,
`rate(cache_requests_total{result="hit"}[1m])` should be close to 45/s and
`result="miss"` near zero. If Redis is cold, stopping it changes nothing.

## Inducing the four scenarios

Failures are toggled at runtime. Never rebuild a container to break it: a
restart resets counters, leaves a gap in scrapes and drops a process start into
the baseline.

### 1 — DB pool exhaustion (client side)

```sh
docker compose --profile burst run --rm loadgen-burst      # 60 req/s extra on GET /orders, 15 min
# stop: Ctrl+C
```

Each DB request holds a pooled connection 100ms **in application code**
(`asyncio.sleep`, not `pg_sleep`), so pool capacity is 5 / 0.1s = 50 req/s.
The burst pushes past it: requests queue on the pool, `db pool timeout` lines
appear, `db_pool_waiting` climbs — while Postgres TPS and query time stay low.

### 2 — Slow downstream

```sh
curl -X POST "localhost:8001/admin/delay?ms=800"
curl -X POST "localhost:8001/admin/delay?ms=0"       # restore
```

`POST /orders` latency rises by ~800ms. orders-api calls inventory-service
**before** acquiring a DB connection, so the slowness does not turn into pool
exhaustion. The 3s client timeout is above the delay, so this stays a latency
failure, not timeouts.

### 3 — Redis down

```sh
docker compose stop redis
docker compose start redis      # restore
```

The cache path falls back to Postgres (100ms Redis timeouts, no retries). The
45 req/s of cached reads all reach the database, pushing pool demand to ~5.1
connections against 5 — so latency climbs on every DB route. Two hops: Redis →
Postgres load → latency. `redis_up` drops to 0 and `cache unavailable` lines
appear.

### 4 — One broken route

```sh
curl -X POST "localhost:8000/admin/break?route=get_order&enabled=true"
curl -X POST "localhost:8000/admin/break?route=get_order&enabled=false"   # restore
```

Routes: `get_order`, `list_orders`, `create_order`. The broken path reads a
column that no longer exists — a real `KeyError` and traceback, on one route
template only.

## Admin endpoints

`/admin/*`, `/metrics` and `/healthz` are excluded from HTTP metrics so
operator actions never appear as traffic. Admin switches are logged at
`info`, below the warning/error level the agent collects, so the switch itself
never appears in the evidence. A real outage does not announce itself, and an
agent that reads "delay set" has been handed the answer. They live in process
memory — one uvicorn worker per service.
