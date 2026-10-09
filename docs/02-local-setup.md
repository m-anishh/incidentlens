# 02 — Local setup and the target system

Status: **running on EC2** (see `07-aws-deployment.md`). The stack is up and
healthy, and the baseline numbers below are measured. The failure scenarios
have not been induced yet.

## Bring-up

```sh
cp .env.example .env
docker compose up -d --build
docker compose ps        # every service healthy; loadgen running
```

Verify step 1 before going further:

- [ ] `curl localhost:8000/metrics | grep http_requests_total` shows
      `route="/orders/{order_id}"` — a template, never a number
- [ ] `curl -X POST "localhost:8001/admin/delay?ms=800"` slows `POST /orders`
- [ ] `docker compose stop redis` slows orders-api **without** 5xx from the
      cache path (some 503s from pool timeouts are expected)
- [ ] `curl -X POST "localhost:8000/admin/break?route=get_order"` gives 500s on
      that route only

## Sizing (why these numbers)

| Setting | Value | Reason |
|---|---|---|
| Pool size | 5 | Small enough to exhaust on a laptop |
| Hold per DB request | 100ms, client-side | Capacity = 5 / 0.1 = 50 req/s. Client-side so Postgres stays fast — scenario 1's evidence |
| Pool acquire timeout | 2s | Produces distinct `db pool timeout` lines instead of unbounded queueing |
| Steady load | 45 + 3 + 3 req/s | Healthy DB demand ≈ 0.6 connections (cached reads skip the DB). With Redis down it is ≈ 5.1 — just past capacity, so scenario 3 actually degrades |
| Burst (scenario 1) | 60 req/s | ≈ 6.6 connections of demand against 5 |
| Inventory client timeout | 3s | Above the 800ms injected delay, so scenario 2 is latency, not errors |
| Redis timeouts | 100ms, no retries | Redis being down costs at most 100ms per request instead of hanging |
| k6 `maxVUs` | 60 steady, 3× rate burst | Sized for degraded (~2s) latency so load holds steady when responses slow |

## Measured (fill in on first run)

| Measurement | Value |
|---|---|
| Healthy p95, `GET /orders/{order_id}` (cached) | 4.9ms |
| Healthy p95, `GET /orders` | 109.5ms |
| Healthy p95, `POST /orders` | 109.6ms |
| Healthy p95, inventory-service `POST /reserve` | 4.7ms |
| Scenario 1 p95 | _TBD_ |
| Scenario 3 p95 | _TBD_ |

Measured on EC2 `m7i-flex.large` (eu-north-1), 2026-10-09, steady load only.
The 500ms latency threshold sits about 4.5× above the slowest healthy route.

**Histogram buckets matter.** The first measurement read 242ms for the DB
routes. Every request took about 102ms, so all of them fell into the
0.1–0.25s bucket, and `histogram_quantile` interpolates linearly inside a
bucket. Finer buckets around 100ms (0.11, 0.125, 0.15, 0.2) fixed it. Without
the fix the agent's baseline would have been 2.4× too high.
