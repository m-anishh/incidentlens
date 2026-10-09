# 04 — Alert flow

## Rules (`monitoring/prometheus/rules/target-system.yml`)

| Alert | Expression (per service, method, route) | for |
|---|---|---|
| `HighLatencyP95` | p95 over 1m > 500ms | 2m |
| `HighErrorRate` | 5xx / all over 1m > 5% | 2m |

Both rules carry `for_duration: "2m"` as an annotation. The webhook payload does
not include `for:`, and the agent needs it to find the onset. Keep the two in
sync.

Three of the four scenarios are latency failures, so the error-rate rule alone
would miss them, including the demo case.

## Routing (`monitoring/alertmanager/alertmanager.yml`)

`group_by: [alertname, service]`, `group_wait: 10s`, `group_interval: 1m`,
`repeat_interval: 4h`, `send_resolved: true` → `http://incidentlens:8000/webhook/alertmanager`.

## Payload

**Not yet captured.** The parser (`backend/app/api/schemas.py`) follows
Alertmanager's documented version-4 format. The first time the stack runs,
capture a real firing payload and a real resolved payload and paste them here.
Then confirm:

- [ ] `alerts[]` holds per-alert `status`, `fingerprint`, `startsAt`, `endsAt`
- [ ] `annotations.for_duration` arrives
- [ ] a resolved notification has `status: resolved` and a real `endsAt`
- [ ] grouping puts several routes' alerts in one payload (one incident each)

The raw body is stored verbatim in `webhook_payloads` either way, so a parser
mistake loses nothing: replay can rebuild from the stored JSON.
