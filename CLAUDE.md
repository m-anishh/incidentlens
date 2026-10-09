# IncidentLens

An AI DevOps incident copilot: an agent that investigates production incidents
and suggests fixes. An alert fires, the agent gathers evidence from logs and
metrics, an LLM reasons over that evidence, and the agent produces a report
with a probable cause and a suggested fix.

The agent **suggests**. It never executes a remediation.

## Status

Local development. Nothing deployed yet.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Agent backend | Python + FastAPI | Prometheus/Loki clients and LangGraph are most mature in Python |
| Frontend | Next.js + TypeScript | Existing familiarity; only needs 2 screens |
| Agent database | Postgres | Fixed schema, lifecycle states, fingerprint and resolved-status lookups — all relational. **A separate instance from the target system's**, so the agent never shares a failure domain with what it observes |
| Metrics | Prometheus | Scrapes every service in the target system |
| Alerting | Alertmanager | Posts a webhook to the agent — the only production trigger |
| Log shipping | Grafana Alloy | Tails container logs into Loki. Promtail reached EOL on 2026-03-02; most tutorials still reference it and are out of date |
| Logs | Loki | Queried over HTTP, same as Prometheus |
| Dashboards | Grafana | Not rebuilt in the frontend |
| Load generator | k6 (or Locust) | Mandatory, not optional — see below |
| Runtime | Docker Compose | One file, runs locally and on EC2 unchanged |

Deliberately **not** in scope yet: Kubernetes, distributed tracing
(OpenTelemetry + Tempo/Jaeger), LangGraph. Add each once the core loop works.

### Why the load generator is mandatory

`rate()` and `histogram_quantile()` over a series with no samples return
nothing — not zero, nothing. With no traffic there is no p95, no error rate,
and no alert will ever fire. Beyond that:

- Scenario 1 is *defined* by concurrent load: pool exhaustion needs more
  simultaneous requests than the pool has connections.
- Scenario 3 needs sustained traffic for cache misses to show up as database
  load.

Steady background traffic runs whenever the stack is up.

---

## Repository layout

```
incidentlens/
├── README.md
├── CLAUDE.md
├── .env.example
├── docker-compose.yml
│
├── backend/               # FastAPI agent — API and database live here
│   ├── app/
│   │   ├── main.py        # FastAPI entry point, startup sweep
│   │   ├── config.py      # env vars, one place only
│   │   ├── api/           # routes: alert webhook, incident reads, replay
│   │   ├── investigation/ # orchestration — decides what runs in what order
│   │   │   ├── state.py   # shared state object (used by both versions)
│   │   │   ├── pipeline.py # v1: linear sequence
│   │   │   └── graph.py   # later: LangGraph nodes and conditional edges
│   │   ├── collectors/    # prometheus.py, loki.py — evidence gathering
│   │   ├── reasoner/      # prompt building, LLM call, response parsing
│   │   └── db/            # models and connection
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/              # Next.js — UI only, no business logic
│
├── target-system/         # the monitored application — not part of the product
│   ├── orders-api/        # public service: Postgres + Redis + calls inventory
│   ├── inventory-service/ # downstream dependency
│   ├── loadgen/           # k6 script — steady background traffic
│   └── README.md          # how to induce each failure scenario
│
├── monitoring/
│   ├── prometheus/        # prometheus.yml, alert rules
│   ├── alertmanager/      # alertmanager.yml, webhook target
│   ├── loki/
│   ├── alloy/             # log shipping config — tails container logs
│   └── grafana/           # datasources, dashboards
│
└── docs/
    ├── 00-overview.md
    ├── 01-architecture.md
    ├── 02-local-setup.md
    ├── 03-monitoring-stack.md
    ├── 04-alert-flow.md
    ├── 05-agent-design.md
    ├── 06-frontend.md
    ├── 07-aws-deployment.md
    └── decisions/         # one file per decision, with the reasoning
```

### Boundaries

- `backend/` holds all API and database code. No business logic in the frontend.
- `frontend/` is presentation only. It reads from the agent's API.
- `target-system/` is the subject under observation, not part of the product.
  The agent must never import from it or depend on its internals — it learns
  about it only through Prometheus and Loki, exactly as it would with any
  third-party application.
- `target-system/` is built as thin as possible: no auth, no real schema, no
  tests. It exists to fail in interesting ways. Time spent polishing it is
  time stolen from the agent.
- The agent's Postgres and the target system's Postgres are **different
  instances**. Scenario 3 drives heavy load onto the target's database; sharing
  one instance would degrade the investigator exactly when it is needed.
- Monitoring config is data, not code. It stays in `monitoring/`.

---

## Architecture

```
target-system  →  Prometheus  →  Alertmanager  →  [webhook]  →  agent
     ↑                                                       ↓
  loadgen                              collectors query Prometheus + Loki
                                                             ↓
                                                   reasoner calls the LLM
                                                             ↓
                                                   report written to database
                                                             ↓
                                                   frontend polls and displays
```

### Data model

Four tables. The split exists because an incident can be investigated more
than once (replay), because replay needs the original payload, and because one
webhook can carry alerts for several incidents.

**`incidents`** — one per firing episode of an alert.

| Field | Meaning |
|---|---|
| `fingerprint` | Alertmanager's per-alert fingerprint — the dedup key |
| `resolved_at` | Timestamp, or NULL. **"Open" means NULL** |
| alert labels | service, severity, alertname, etc. |

Required constraint: a unique partial index on `fingerprint` where
`resolved_at IS NULL`. Without it, two webhooks arriving together can both find
no open incident and both create one.

**`runs`** — one per investigation attempt. Many per incident.

| Field | Meaning |
|---|---|
| `incident_id` | Parent |
| `status` | `received`, `collecting`, `reasoning`, `complete`, `partial`, `failed` |
| evidence, report | What this run gathered and concluded |
| `started_at`, `finished_at` | Timing |

**`webhook_payloads`** — every raw webhook body received, stored verbatim and
once. Keeps the payload-level fields intact: `groupKey`, `groupLabels`,
`commonLabels`, `externalURL`.

**`alert_notifications`** — one row per alert inside a payload.

| Field | Meaning |
|---|---|
| `payload_id` | Parent webhook body |
| `incident_id` | The incident this alert maps to |
| raw alert JSON | `fingerprint`, `status`, `startsAt`, `endsAt`, labels, annotations |

The split exists because **one webhook can carry alerts belonging to different
incidents**, so a single `incident_id` on the payload would be wrong. Storing
the payload once and linking each alert separately keeps both the group context
and the per-incident trail.

Replay needs the *original* alert JSON to reconstruct the time window. A parsed
summary is not enough.

**The key separation:** `status` describes an investigation run; `resolved_at`
describes whether the alert is still firing. They are independent. A run can be
`complete` while the incident is still open — the agent finished, the problem
did not. Dedup keys on open, never on status.

### The webhook handler

The handler **must not investigate inline**. Alertmanager expects a fast
response, and an investigation takes seconds — LLM calls alone can run 10–20s.

One webhook carries **many alerts**. The payload has an `alerts[]` array, each
entry with its own `fingerprint`, `status`, `startsAt` and `endsAt`. The
payload-level `status` describes the group, not the individual alert.

Store the raw body in `webhook_payloads`, then loop over `alerts[]`, writing
an `alert_notifications` row for each:

1. Alert `status: resolved` → set `resolved_at` on the matching open incident.
   **If there is no open incident, log it and move on — do not error.** This
   happens legitimately when the firing webhook was missed or never stored.
2. Look up the fingerprint among open incidents — if one exists, the
   notification is already stored, so just move on. No investigation, no LLM
   call.
3. Otherwise create an incident and its first run with `status: received`
4. Hand the run to a background task

Then return 200 once, for the whole payload.

Steps 1 and 2 are not optional. Without them, every `repeat_interval`
notification for an ongoing outage starts a fresh investigation.

The frontend polls the run until its status changes. `BackgroundTasks` is
sufficient for a single instance; Celery or arq only if that is outgrown.

### Run lifecycle

A run must always reach a terminal state. Nothing stays mid-flight.

```
received → collecting → reasoning → complete | partial | failed
```

- `partial` — some evidence source was unreachable, but the investigation ran
  anyway. The report must state which evidence was missing. An agent that
  declares its own evidence gaps is more trustworthy than one that quietly
  reasons from half the picture.
- `failed` — the investigation could not produce a report. Record why: which
  step failed and with what error.
- A timeout forces a terminal state.

**Startup sweep.** `BackgroundTasks` runs inside the API process, so a restart
mid-investigation strands a run in `collecting` forever — an in-process timeout
cannot fire if the process is gone. On startup, mark any **run** in a
non-terminal state older than the timeout as `failed`, with the reason
recorded. The sweep touches runs, never incidents.

### The evidence time window

**`startsAt` is not when the problem began.** Prometheus sets it when the alert
transitions to firing, which is *after* the rule's `for:` duration has elapsed.
Querying from `startsAt` shows only the plateau — the system already broken —
and misses the onset, where the causal signal actually lives. In scenario 2,
the moment inventory-service latency starts climbing while orders-api is still
healthy sits entirely before `startsAt`, and it is the most diagnostic slice of
the whole timeline.

The collectors' contract:

```
window = [ startsAt − for − baseline − margin , startsAt + margin ]
```

- **`for`** — read from the alerting rule. The webhook payload does not expose
  it, so **put it in the rule's annotations** (`for_duration: 5m`) and have the
  agent read it from the alert rather than hardcoding a value.
- **`baseline`** — roughly 10 minutes of healthy traffic before degradation
  began. Without it the LLM sees only broken numbers and has no reference for
  normal. "p95 went from 40ms to 900ms" is an evidenced conclusion; "p95 is
  900ms" is an assertion.
- **`margin`** — a few minutes either side, configurable.

Baseline comparison is most of what separates an evidenced root-cause claim
from a plausible-sounding one. This applies identically to live investigations
and replays.

#### The two portions are collected differently

The log line cap is **per query, not per window section**. With a shared cap,
healthy baseline noise eats lines that should have gone to the onset. So:

| Portion | What is collected |
|---|---|
| Baseline | Metrics only, as **aggregates** — p50/p95, request rate, error rate, Postgres TPS. A few numbers per series. Few or no logs. |
| Onset → now | Full-resolution series plus logs, capped. |

Collectors return a **pre-computed contrast**, not two raw series for the LLM
to diff itself: `baseline p95 40ms → incident p95 900ms`. Cheaper in tokens,
and it is the comparison you actually want made.

This asymmetry shapes `state.py`: baseline and onset are distinct fields with
different structures, plus the contrast. Not one undifferentiated evidence
blob. Get this right now — `state.py` is what carries unchanged into LangGraph
at step 9.

#### The baseline has to actually be healthy

Start the stack, start load, induce a failure two minutes later, and the
"baseline" is warm-up noise: cold connection pools, an empty Redis, containers
still settling. The comparison is then meaningless.

- `target-system/README.md` must state: run load for at least
  `baseline + several` minutes before inducing anything. **For scenario 3,
  specifically warm the cache** — an unwarmed Redis means you are already
  serving from Postgres, so stopping Redis changes nothing and the scenario
  silently does not happen.
- The collector **flags a weak baseline** — one overlapping container start, or
  with too few samples — so the reasoner can say the comparison is weak. Same
  "declare your gaps" principle as `partial`.

**A weak baseline is not `partial`.** `partial` means a source was
unreachable; a weak baseline means every source answered but the comparison is
untrustworthy. Different causes, different fixes. Keep the flag separate from
`status` and surface both in the report.

### Triggers and replay

Alertmanager's webhook is the only thing that creates an incident.

A **replay endpoint** exists alongside it: given an existing incident, it
creates a **new run** on that incident and re-investigates against the current
code. A development and demo tool — it never invents an incident, and it is not
exposed in the frontend. It exists because iterating on prompts by inducing
real failures and waiting out Alertmanager's `for:` duration is unworkable.

Replay queries the **original alert's time window**, reconstructed from the
stored alert JSON using the window contract above — not "now". Replaying
against the current time investigates a healthy system and produces nonsense.

Keeping runs rather than overwriting is what lets you compare a prompt change
against the previous attempt on identical evidence.

Replay is bounded by retention: Prometheus keeps 15 days by default, Loki
whatever is configured. Older incidents can be read but not replayed.

### Layer rules

- Collectors are dumb. Given a time window and a filter, they fetch and return
  parsed data. They know nothing about LLMs.
- The reasoner knows nothing about HTTP. It receives evidence, returns a
  structured report.
- Orchestration lives in `investigation/`, never in route handlers. The API
  layer accepts a webhook and hands off; it does not know how an investigation
  is sequenced.

### The LangGraph migration path

LangGraph is not a new component — it is a replacement for the contents of
`investigation/`. It arrives at step 9, because the branching cannot be
designed before the collectors' real output shapes are known.

`state.py` is what makes the migration cheap. Define one Pydantic model holding
the alert, the baseline aggregates, the onset series and logs, the contrast
between them, the weak-baseline flag, findings, and step count. The linear pipeline
passes it between functions; LangGraph later uses the same object as its graph
state. Collectors, reasoner and db are untouched either way.

The migration is then: write `graph.py`, change which one the background task
calls, delete `pipeline.py`. Add the dependency to `requirements.txt` at that
point, not before.

Why it becomes necessary: the linear pipeline cannot diagnose failure scenario
2. Diagnosing a cascading latency problem requires inspecting what was found
and deciding where to look next — orders-api resource use flat, so query
inventory-service, then Postgres, then Redis, stopping when found. That is a
conditional edge, not a fixed sequence. Build the linear version first and let
the limitation surface on its own.

---

## Failure scenarios — the evaluation set

The target system exists to produce these four failures. Each has a known
correct answer, so they double as the test set for measuring whether the agent
is actually useful or merely fluent. All four assume loadgen is running.

| # | How to induce it | Correct conclusion | Alert that must fire |
|---|---|---|---|
| 1 | Raise loadgen concurrency past the DB connection pool size | Pool exhaustion on the client side. Request latency and pool-timeout log lines rise while Postgres serves few queries at low latency — the bottleneck is `orders-api`, not the database | p95 latency |
| 2 | Add artificial delay to `inventory-service` | Cause is in a *different service*. `orders-api` latency spikes while its own resource use stays flat; the delay originates downstream | p95 latency |
| 3 | Stop the Redis container | Cache misses cascade into database load. The symptom appears two hops from the cause | p95 latency |
| 4 | Break one route's code path | Error rate rises for a single endpoint only. The agent must narrow by label rather than blaming the whole service | error rate |

**Three of four are latency failures.** An error-rate rule alone catches only
scenario 4 — including the demo case, which would never fire. Both rules are
required before the agent is worth building.

**Scenario 1 evidence note.** The expected conclusion deliberately avoids
container CPU, which needs cAdvisor and is awkward on Docker Desktop for
Windows. `postgres_exporter` already exposes active connections, transactions
per second and query duration; "Postgres is barely working while the client
times out" is stronger evidence of client-side pool exhaustion than a CPU graph
anyway, and it is something the agent can reason about in words.

**Scenario 3 requires a deliberate design choice.** `orders-api` must *fall
back to Postgres* when Redis is unavailable, not raise. If it errors instead,
you get an error spike — scenario 4 again — rather than the two-hop cascade
this scenario is meant to test. Build the fallback on purpose and document it.

**Scenario 4 depends on correct metric labels.** HTTP metrics must be labeled
by **route template** (`/orders/{id}`), never the raw path (`/orders/12345`).
Raw paths explode label cardinality and make narrowing by route impossible —
which is the entire skill this scenario tests. Verify this when instrumenting
in step 1, not after.

**Failures are induced by runtime switches, never code edits.** Rebuilding a
container to break a route restarts it — resetting counters, gapping the
scrape, and placing a container start exactly where the baseline should be,
which flags the baseline weak. Use admin endpoints instead, excluded from
metrics:

- `inventory-service`: `POST /admin/delay?ms=800` — scenario 2
- `orders-api`: `POST /admin/break?route=...` — scenario 4

The broken path still exists in the code; it sits behind a switch.

**Scenario 1's delay must be held client-side, not in Postgres.** Holding the
connection with `pg_sleep` puts the latency *inside* the database, so
`postgres_exporter` reports high query duration and the evidence then supports
the wrong conclusion — a slow database rather than client-side pool exhaustion.
Acquire a connection, `await asyncio.sleep(...)` in application code, run a
trivial query, release. Postgres then shows low TPS and low query duration
while orders-api queues, which is what the scenario's conclusion requires.

Size the pool so exhaustion is reachable on a laptop: a pool of 5 with a 100ms
hold saturates around 50 req/s. A 20ms hold needs 250 req/s, which Docker
Desktop on Windows may not deliver. Set the loadgen's `maxVUs` for the
*degraded* latency, not the healthy one — otherwise it drops iterations as
responses slow, load falls, and the scenario oscillates instead of staying
broken.

**Baseline latency is set in step 1 and fixes the alert threshold in step 4.**
Record the measured healthy p95 in `docs/02-local-setup.md` so the rule is
chosen against a real number rather than guessed.

Scenario 2 is the demo case: it is the one a human cannot diagnose from a
single dashboard, so correlation across services is where the agent earns its
place.

An agent that passes 1 and 4 but fails 2 and 3 has learned to read logs, not to
investigate. Track which scenarios pass as the project progresses.

---

## Conventions

**Naming.** `IncidentLens` in prose, docs and UI. `incidentlens` lowercase for
the repository folder, Docker service names and the Python package — no
hyphens, since a hyphenated package name cannot be imported.

**Service addressing.** Inside Compose, use service names, never localhost:
`http://prometheus:9090`, `http://loki:3100`. These resolve identically on EC2.

**Configuration.** Every endpoint, key and credential comes from an environment
variable, read in `config.py`. Nothing hardcoded in application code. `.env`
locally, real env vars on the server.

**LLM access.** All LLM calls go through a single `ask_llm(prompt)` wrapper.
Local development may use a direct API key; AWS deployment may use Bedrock.
Swapping providers must touch one file.

**Evidence volume.** Log queries must be bounded by time window and line count
before reaching the LLM. Unbounded log dumps will exceed the context limit. The
cap is **per query**, which is why the baseline is collected as aggregates
rather than logs — see the evidence window contract.

---

## Build order

Steps 1–4 contain no AI and are where most of the time goes. Do not skip ahead.

1. `target-system` running in Compose: orders-api, inventory-service, Postgres,
   Redis, plus `postgres_exporter` and `redis_exporter` (the databases do not
   expose `/metrics` themselves). Also in this step:
   - **loadgen** producing steady background traffic
   - HTTP metrics labeled by **route template**, not raw path
   - the **Redis fallback to Postgres** for scenario 3, built while writing the
     cache path
   - a README documenting how to induce each scenario, including the warm-up
     requirement before inducing anything

   Thin and ugly is correct everywhere else.
2. Prometheus scraping all services and both exporters, visible in Grafana —
   induce each of the four failure scenarios manually and confirm the signal is
   visible. If a human cannot see it in Grafana, the agent cannot find it
   either. Confirm the exporters support scenario 1's conclusion without
   container CPU.
3. Alloy shipping both services' container logs into Loki, queryable in
   Grafana. Decide and document the ingestion path here — Loki never pulls.
4. Alertmanager firing **two rules — p95 latency and error rate** — posting to
   a stub endpoint on the agent that only logs the payload. **Capture the real
   payload before writing any parsing code**, and confirm the `alerts[]`
   structure, per-alert `fingerprint`, and what a `resolved` notification looks
   like.
5. Collectors: implement the window contract — `startsAt − for − baseline −
   margin` — with baseline collected as aggregates and onset at full resolution
   plus logs. Return a pre-computed contrast and a weak-baseline flag. Add
   `for_duration` to both alerting rules' annotations so the agent can read it
   rather than hardcoding it.
6. **Settle the schema first** — incidents, runs, webhook_payloads,
   alert_notifications, with the partial unique index — then build the
   reasoner: evidence → LLM → structured report, persisted to a run. Startup
   sweep over runs.
7. Frontend: two screens only — incident list, and incident detail showing the
   latest run's status, evidence, reasoning and suggested fix, with earlier
   runs accessible. No manual trigger in the UI.
8. AWS: single EC2 instance, same Compose file

Then, in order:

9. **LangGraph** — replace `pipeline.py` with `graph.py` once the linear
   version has visibly failed scenario 2. This comes before Kubernetes because
   it improves the thing the project is actually judged on.
10. **Kubernetes** — k3s on EC2, investigate pod-level failures
11. **Tracing** — OpenTelemetry plus Tempo or Jaeger, adding the third evidence
    source the original concept calls for

---

## Working with me on this project

- **Write the code.** Create the files and show me what you made. Do not ask
  whether I want code, and do not explain what you are about to write before
  writing it.
- Explanation comes *after*, and only for the parts where a real choice was
  made — why the pool size is 5, why the timeout is 3s. Boilerplate (Compose,
  Dockerfiles, config) needs no commentary at all.
- Where a decision has trade-offs, state them and give a recommendation, then
  proceed with your recommendation rather than waiting for me.
- Flag when something I'm asking for conflicts with the build order above.
- Ask at most one question before starting work. If something is unspecified,
  pick a sensible default, say what you assumed, and keep going.

## Documentation discipline

Every completed step gets a `docs/` entry while it is fresh. Decisions with
alternatives get a file in `docs/decisions/` recording what was chosen, what
was rejected, and why — this is the material a project defence actually needs.

Decisions already made and worth writing up: Python over Node, Postgres over
Mongo, Alloy over the Docker logging driver, deferring LangGraph, exporter
throughput rather than container CPU for scenario 1, separating runs from
incidents so replay is comparable, widening the evidence window past `startsAt`
to capture onset and baseline, and collecting baseline as aggregates rather
than full series.
