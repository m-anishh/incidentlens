# 007 — Evidence window reaches back past startsAt

**Chosen:** `[startsAt − for − baseline − margin, startsAt + margin]`, with `for` read from a `for_duration` rule annotation.
**Rejected:** querying from `startsAt`.
**Why:** Prometheus sets `startsAt` when the alert begins *firing*, after `for:` has elapsed. Querying from there shows only the plateau and misses the onset — in scenario 2, inventory-service slowing while orders-api is still healthy sits entirely before `startsAt`. The baseline gives the LLM a reference for normal: "40ms → 900ms" is evidence; "900ms" is an assertion.
