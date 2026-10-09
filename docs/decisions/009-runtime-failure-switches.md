# 009 — Failures induced by runtime switches

**Chosen:** admin endpoints (`/admin/delay`, `/admin/break`) and `docker compose stop redis`; a separate k6 profile for the scenario 1 burst.
**Rejected:** editing code and rebuilding containers to break things.
**Why:** a rebuild restarts the container — counters reset, scrapes gap, and a process start lands where the baseline should be, which (correctly) flags the baseline weak. The broken code path still exists; it sits behind a switch. `/admin/*` is excluded from metrics so operator actions never look like traffic.
