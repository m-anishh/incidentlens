# 005 — Exporter throughput, not container CPU, for scenario 1

**Chosen:** `postgres_exporter` (TPS, active connections, `pg_stat_statements` mean query time) plus orders-api's own pool metrics.
**Rejected:** container CPU via cAdvisor.
**Why:** cAdvisor is awkward on Docker Desktop for Windows. "Postgres is barely working while the client queues on its pool" is stronger evidence of client-side exhaustion than a CPU graph, and it is something the LLM can reason about in words.
**Consequence:** the connection hold is done client-side (`asyncio.sleep` while holding the connection), never `pg_sleep`, so Postgres itself stays fast.
