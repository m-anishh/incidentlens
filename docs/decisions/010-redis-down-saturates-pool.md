# 010 — Scenario 3 sized to saturate the pool

**Chosen:** 45 req/s of cached reads, so Redis down sends ≈ 4.5 extra connections of demand to a pool of 5.
**Rejected:** a light read rate (Redis down would move cached-read latency from ~3ms to ~105ms — real, but below a 500ms alert threshold, so the alert never fires).
**Why:** the scenario has to fire an alert to be evaluable. The resulting chain — Redis → database load → pool saturation → latency — is a genuine two-hop cascade. It overlaps with scenario 1's pool symptoms on purpose: the distinguishing evidence is `redis_up = 0`, cache errors, and *rising* Postgres TPS (flat in scenario 1). An agent that confuses the two has not investigated.
