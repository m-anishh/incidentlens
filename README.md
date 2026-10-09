# IncidentLens

An AI DevOps incident copilot. An alert fires, the agent gathers evidence from
Prometheus and Loki, an LLM reasons over it, and the agent writes a report with
a probable cause and a suggested fix. It **suggests** — it never remediates.

See `CLAUDE.md` for the design and `docs/` for each step.

## Run it

Requires Docker Desktop (or Docker Engine + Compose v2).

```sh
cp .env.example .env          # set ANTHROPIC_API_KEY and passwords
docker compose up -d --build
```

| URL | What |
|---|---|
| http://localhost:3000 | IncidentLens UI |
| http://localhost:8080/docs | Agent API |
| http://localhost:3001 | Grafana (anonymous admin) |
| http://localhost:9090 | Prometheus |
| http://localhost:9093 | Alertmanager |
| http://localhost:8000 | orders-api (target system) |

Then follow `target-system/README.md`: warm up, induce a scenario, and watch
the incident appear.

## Replay (development only)

```sh
curl -X POST localhost:8080/incidents/<id>/replay
```

Adds a new run to an existing incident, against the original alert's time
window. Not exposed in the UI.

## Tests

```sh
cd backend && pip install -r requirements.txt && pytest
```
