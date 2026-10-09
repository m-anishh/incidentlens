# 006 — Runs separate from incidents

**Chosen:** `incidents` (dedup key, alert state) and `runs` (investigation status, evidence, report), many runs per incident; plus `webhook_payloads` and `alert_notifications`.
**Rejected:** one incidents table with status and report columns.
**Why:** replay must not overwrite — comparing a prompt change against the previous attempt on identical evidence is how prompt work is evaluated. Investigation status and alert state are independent (a run can be complete while the alert still fires), so they live in different tables. One webhook can carry alerts for several incidents, so the payload is stored once and each alert links to its own incident.
