# 002 — Postgres over Mongo for the agent database

**Chosen:** Postgres, a separate instance from the target system's.
**Rejected:** MongoDB.
**Why:** The schema is fixed and relational (incidents → runs, payloads → notifications). Dedup needs a *partial unique index* on `fingerprint WHERE resolved_at IS NULL`, which Postgres provides natively and which makes the concurrent-webhook race safe with `INSERT … ON CONFLICT DO NOTHING`. JSONB still holds raw payloads and evidence verbatim.
**Separate instance:** scenario 3 drives load onto the target's Postgres; sharing it would degrade the investigator exactly when it is needed.
