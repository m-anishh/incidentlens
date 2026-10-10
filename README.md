# IncidentLens

**An AI copilot for production incidents.**

When an alert fires, IncidentLens investigates it the way an on-call engineer
would: it pulls the relevant metrics and logs, compares the incident against
how the system looked while it was still healthy, and writes a report with a
probable cause, the evidence behind it, and a suggested fix.

IncidentLens **suggests**. It never changes anything in your systems.

---

## Why

Most incidents are not hard because the data is missing — they are hard
because the cause sits somewhere other than where the symptom shows up. A slow
API whose real problem is a downstream service. A database under load because
a cache quietly went away. Finding that link means correlating signals across
services, under pressure, at 3 a.m.

IncidentLens does that correlation first, so the engineer starts from an
evidenced hypothesis instead of a blank dashboard.

## What makes a good report

- **Baseline vs. incident.** Evidence is collected from *before* the alert
  fired, so the report can say "p95 went from 40 ms to 900 ms" rather than just
  "p95 is 900 ms".
- **Declared gaps.** If a data source was unreachable, or the healthy baseline
  is too thin to trust, the report says so instead of guessing.
- **Every attempt kept.** Each investigation is stored as a separate run, so
  results can be compared over time on identical evidence.

---

## Architecture

```
 alert ─► backend ─► collectors ─► reasoner (LLM) ─► report stored
                                                          │
             browser ◄── frontend ◄── API ◄───────────────┘
```

### Backend — `backend/`

Python · FastAPI · SQLAlchemy · PostgreSQL

| Module | Role |
|---|---|
| `api/` | Receives alert webhooks and serves incidents to the frontend |
| `investigation/` | Orchestrates a run: evidence window, collection, reasoning |
| `collectors/` | Fetch metrics (Prometheus) and logs (Loki) for a time window |
| `reasoner/` | Builds the prompt, calls the LLM, parses a structured report |
| `db/` | Incidents, runs, and the raw alerts that created them |

An alert is accepted and acknowledged immediately; the investigation runs in
the background and always ends in a clear state — `complete`, `partial`
(some evidence missing), or `failed` (with the reason recorded).

The LLM provider is swappable: Gemini, OpenAI, Anthropic, or Amazon Bedrock,
selected by configuration.

**API**

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/webhook/alertmanager` | Alert intake |
| `GET` | `/incidents` | Incident list |
| `GET` | `/incidents/stats` | Summary counts |
| `GET` | `/incidents/{id}` | Incident with all its runs |
| `GET` | `/runs/{id}` | A single investigation run |
| `GET` | `/healthz` | Health check |

Interactive API docs are served at `/docs`.

### Frontend — `frontend/`

Next.js 15 · React 19 · TypeScript

| Page | What it shows |
|---|---|
| `/` | Product overview |
| `/incidents` | All incidents and their latest status |
| `/incidents/{id}` | Probable cause, reasoning, evidence, and suggested fix |
| `/evidence` | The evidence behind investigations |
| `/settings` | Configuration |

The frontend is presentation only and reads everything from the backend API.
Without a backend it runs on built-in sample incidents, clearly marked as a
demo.

---

## Getting started

**Requirements:** Python 3.12+, Node.js 20+, PostgreSQL 16+.

### Backend

```sh
cd backend
python -m venv .venv
.venv/Scripts/activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file in the repository root:

```ini
DATABASE_URL=postgresql+asyncpg://<user>:<password>@localhost:5432/<database>

LLM_PROVIDER=gemini               # gemini | openai | anthropic | bedrock
GEMINI_API_KEY=<your key>

PROMETHEUS_URL=http://localhost:9090
LOKI_URL=http://localhost:3100
```

```sh
uvicorn app.main:app --port 8080 --reload
```

Check the LLM connection with `python -m app.reasoner.check`.
Run the tests with `pytest`.

### Frontend

```sh
cd frontend
npm install
BACKEND_URL=http://localhost:8080 npm run dev    # PowerShell: $env:BACKEND_URL="http://localhost:8080"; npm run dev
```

Open http://localhost:3000. Leave `BACKEND_URL` unset to run the frontend on
demo data alone.

---

## Roadmap

IncidentLens is being built in stages. The frontend and backend are in place;
the rest arrives step by step.

**Done**

- [x] **Frontend** — incident list and detail views, demo mode
- [x] **Backend** — alert intake, investigation runs, evidence window, LLM reasoning

**Next**

- [ ] **Containerization** — Docker images for the frontend and backend, and a
      Compose file that runs the whole stack with one command
- [ ] **Monitoring stack** — Prometheus, Alertmanager, Loki and Grafana wired to the agent
- [ ] **Test environment** — a sample application that fails on demand, with a
      set of known failure scenarios to measure whether the agent finds the
      right cause

**Later**

- [ ] **Cloud deployment** — hosted on AWS, provisioned as infrastructure as code
- [ ] **Kubernetes** — run IncidentLens on a cluster, and investigate pod-level failures
- [ ] **CI/CD** — automated tests, image builds and deployments
- [ ] **Distributed tracing** — OpenTelemetry as a third evidence source

**New features**

- [ ] **Adaptive investigation** — the agent decides where to look next based
      on what it has found, rather than following a fixed sequence
- [ ] **Notifications** — post reports to Slack or email when an investigation finishes
- [ ] **Accounts and teams** — sign-in, and incidents scoped per team

More will be added as the project grows.
