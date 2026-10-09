# 001 — Python over Node for the agent

**Chosen:** Python + FastAPI.
**Rejected:** Node/TypeScript (shared language with the frontend).
**Why:** The Prometheus/Loki client ecosystem and LangGraph (step 9) are most mature in Python. The target-system services use Python too, so one instrumentation pattern (`prometheus_client`) covers both sides.
