# 003 — Alloy over the Docker Loki logging driver

**Chosen:** Grafana Alloy tailing containers via the Docker socket, pushing to Loki.
**Rejected:** the Loki Docker logging driver (a Docker plugin per host); Promtail (EOL 2026-03-02).
**Why:** Alloy is configuration in the repo (`monitoring/alloy/`), needs no plugin installed on the host, works unchanged on EC2, and can filter (only target-system services) and relabel (`service`, `level`) before shipping. The logging driver would make `docker logs` depend on Loki being reachable.
