# 06 — Frontend

Next.js 15 (app router), TypeScript, no UI library. Two screens:

- `/` — incident list: alert, service/route, firing/resolved, latest run status,
  summary. Polls every 3s while any run is in flight, else 10s.
- `/incidents/[id]` — header (labels, firing since, resolved, notification
  count); run picker (latest selected, earlier runs one click away); lifecycle
  strip; evidence gaps; report; evidence (onset sparklines, baseline → incident
  table, log patterns with samples). Polls every 2s while a run is in flight.

The browser talks only to `/api/*`, a GET-only proxy route
(`app/api/[...path]/route.ts`) that forwards to `BACKEND_URL` at request time.
GET-only is deliberate: the UI cannot start an investigation or a replay.
