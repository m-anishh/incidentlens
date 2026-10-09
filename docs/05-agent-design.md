# 05 — Agent design (v1, linear)

## Request path

`POST /webhook/alertmanager` (`api/webhook.py`):

1. Validate the payload, store the raw body in `webhook_payloads`.
2. For each alert, in one transaction (`db/repo.py`):
   - resolved → set `resolved_at` on the open incident; none open → log, carry on
   - open incident with this fingerprint → store the notification only
   - otherwise → `INSERT … ON CONFLICT DO NOTHING` against the partial unique
     index, create the first run (`received`)
3. Schedule `investigate(run_id)` as a `BackgroundTask` per new run.
4. Return 200.

No LLM call, no Prometheus query, happens before the response.

## Pipeline (`investigation/pipeline.py`)

```
load run + first firing alert JSON
  → window (window.py)
  → collecting: Prometheus catalog ∥ Loki counts + samples
  → reasoning: prompt → ask_llm → Report
  → complete | partial
```

All of it under `asyncio.wait_for(RUN_TIMEOUT_S)`. Any exception or the
timeout → `failed` with `{step, message}`. The startup sweep in `main.py` fails
runs a restart left non-terminal.

## Evidence

| Portion | Collected as |
|---|---|
| Baseline `[start, onset_start)` | `SeriesAggregate`: mean, p95, sample count per series |
| Onset `[onset_start, end]` | `OnsetSeries`: ≤20 downsampled points, only for series that moved (≤12) |
| Both | `Contrast`: one line per series, `baseline 40ms → incident mean 900ms, peak 1.2s (×30)` |
| Logs | Warning/error patterns grouped by (service, level, msg): baseline count → incident count, ≤3 sample lines each from the onset |

Log counts come from LogQL `count_over_time` — aggregates, so the baseline
costs no log lines. Sample lines are capped at `LOG_LINE_LIMIT` per query,
taken forward from the onset.

**Weak baseline** (`BaselineQuality`): a `process_start_time_seconds` inside the
window, or fewer than half the expected request-rate samples. Reported
separately from `partial`.

**Partial**: Prometheus or Loki unreachable (connection/timeout/5xx). A
rejected query (4xx) is recorded in `query_errors` and does not make the run
partial. Both sources unreachable → `failed`.

## Reasoner

`reasoner/llm.py` is the only provider-aware file: `ask_llm(prompt, system,
json_schema)` → text. `LLM_PROVIDER` selects Anthropic, OpenAI, Gemini or
Bedrock. Running now: **Bedrock, `deepseek.v3.2`**, authorised by the EC2
instance role — no API key. Providers with schema enforcement get the schema
natively; on Bedrock the schema goes in the prompt and the JSON is extracted,
key-checked, and retried once. `python -m app.reasoner.check` smoke-tests
whichever provider is configured.

`reasoner/prompt.py` turns state into text. The system prompt asks for
symptom-versus-cause separation, a number behind every claim, attention to what
did *not* change, and an explicit list of evidence gaps.

## Known limitation (by design)

The catalog (`investigation/catalog.py`) is fixed: every run asks the same
queries. The pipeline cannot decide to look deeper at inventory-service because
orders-api's resources were flat. That is scenario 2's challenge and the
reason for LangGraph at step 9. Record here which scenarios v1 passes.

| Scenario | v1 result |
|---|---|
| 1 pool exhaustion | _not yet run_ |
| 2 slow downstream | **Correct, but contaminated** (2026-10-09, DeepSeek V3.2 on Bedrock). Both incidents (orders-api `POST /orders` symptom, inventory-service `POST /reserve`) named inventory-service, high confidence, citing downstream p95 5ms → 859ms with Postgres/cache flat. However the evidence included the operator log line `admin: delay set` — the answer leaked. Switch logs are now `info` (not collected). **Re-run required.** |
| 3 Redis down | _not yet run_ |
| 4 broken route | _not yet run_ |
