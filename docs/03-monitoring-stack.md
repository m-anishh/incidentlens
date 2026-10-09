# 03 — Monitoring stack

## Metrics

Prometheus scrapes every 5s (fast feedback while inducing scenarios):

| Job | Target | `service` label |
|---|---|---|
| orders-api | `orders-api:8000/metrics` | orders-api |
| inventory-service | `inventory-service:8000/metrics` | inventory-service |
| postgres | `postgres-exporter:9187` | target-postgres |
| redis | `redis-exporter:9121` | redis |

The `service` label is attached by Prometheus, not by the apps, so it is
uniform across exporters.

Signals per scenario:

| # | Signal |
|---|---|
| 1 | `db_pool_waiting`, `db_pool_acquire_seconds`, `db_pool_timeouts_total` up; `pg_stat_database_xact_commit` rate and `pg_stat_statements` mean time flat |
| 2 | `http_request_duration_seconds` on `inventory-service /reserve` and `downstream_request_duration_seconds{target="inventory-service"}` up |
| 3 | `redis_up` → 0, `cache_requests_total{result="error"}` up, Postgres TPS up, pool demand at capacity |
| 4 | `http_requests_total{status="500"}` on one `route` only |

`pg_stat_statements` is preloaded in the target Postgres so the exporter can
report query duration — needed to show "the database is fast" in scenario 1.

## Logs

**Ingestion path:** Alloy → Loki (push). Alloy discovers containers via the
Docker socket (`discovery.docker`), keeps only the target system's services,
tails their output (`loki.source.docker`), promotes the JSON `level` field to a
label, and pushes to `loki:3100/loki/api/v1/push`. Loki never pulls.

The agent's own containers are excluded: its logs are not evidence about the
target.

Both services log one JSON line per request plus event lines
(`db pool timeout`, `cache unavailable, falling back to postgres`,
`inventory-service slow`, `unhandled exception`).

Retention: Prometheus 15d, Loki 15d — matched, so a replayable incident has
both sources.

## Grafana

Datasources (`prometheus`, `loki` uids) and one dashboard are provisioned from
the repo. **IncidentLens — Target system** (`monitoring/grafana/dashboards/`)
is Grafana's home page. Its rows:

- **At a glance:** firing alerts, worst p95, 5xx rate, req/s, Redis up/down,
  pool utilisation.
- **Requests:** p95 and 5xx by route, with the alert thresholds drawn in, plus
  request rate and orders-api → inventory p95.
- **orders-api internals:** pool in use / waiting / timeouts, cache
  hit / miss / error.
- **Datastores:** Postgres TPS, mean query time, active connections.
- **Logs:** warnings and errors from Loki.

Firing alerts are drawn as annotations, so each scenario's onset is visible on
every panel. Anonymous admin, tunnel access only.
