#!/usr/bin/env python3
"""Run the four failure scenarios in sequence and record what the agent concluded.

Run on the host, from the repo root (stdlib only):

    nohup python3 scripts/run_eval.py 2 4 1 3 > eval/run.log 2>&1 &

For each scenario: wait for a clean baseline, induce it, wait for the
incidents it causes to be investigated, record the reports, clear it, wait for
the alerts to resolve. Results go to eval/results-<timestamp>.json. Grading is
done by a human reading the reports against EXPECTED — not by string matching.
"""

import json
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "http://localhost:8080"
BASELINE_S = 15 * 60          # healthy traffic needed before inducing
INCIDENT_TIMEOUT_S = 12 * 60  # alert `for:` + investigation
SETTLE_S = 90                 # after the first incident, wait for related alerts
RESOLVE_TIMEOUT_S = 10 * 60
TERMINAL = {"complete", "partial", "failed"}

EXPECTED = {
    1: "Client-side DB pool exhaustion in orders-api; Postgres itself healthy (low TPS / fast queries)",
    2: "inventory-service is slow; orders-api latency is a downstream effect",
    3: "Redis down → cache misses → Postgres load / pool saturation in orders-api",
    4: "One route (GET /orders/{order_id}) failing with 5xx; other routes healthy",
}


def log(msg):
    print(f"{datetime.now(timezone.utc):%H:%M:%S} {msg}", flush=True)


def get(path):
    with urllib.request.urlopen(API + path, timeout=15) as r:
        return json.load(r)


def scenario(n, action):
    subprocess.run(["scripts/scenario.sh", str(n), action], check=True)


def ts(iso):
    return datetime.fromisoformat(iso).timestamp()


def orders_api_started():
    out = subprocess.run(
        ["docker", "inspect", "-f", "{{.State.StartedAt}}",
         subprocess.check_output(["docker", "compose", "ps", "-q", "orders-api"], text=True).strip()],
        capture_output=True, text=True, check=True).stdout.strip()
    return datetime.fromisoformat(out[:26].rstrip("Z") + "+00:00").timestamp()


def wait_for_baseline(last_disruption):
    ready_at = max(last_disruption, orders_api_started()) + BASELINE_S
    while (wait := ready_at - time.time()) > 0:
        log(f"waiting {int(wait // 60)}m{int(wait % 60):02d}s for a clean baseline")
        time.sleep(min(wait, 60))
    while [i for i in get("/incidents") if i["open"]]:
        log("an incident is still open; waiting for it to resolve")
        time.sleep(30)


def wait_for_investigations(t0):
    deadline, first_seen = time.time() + INCIDENT_TIMEOUT_S, None
    while time.time() < deadline:
        new = [i for i in get("/incidents") if ts(i["created_at"]) >= t0]
        if new and first_seen is None:
            first_seen = time.time()
            log(f"first incident after {int(first_seen - t0)}s")
        done = new and all(i["latest_run"] and i["latest_run"]["status"] in TERMINAL for i in new)
        if done and time.time() - first_seen >= SETTLE_S:
            return new
        time.sleep(15)
    return [i for i in get("/incidents") if ts(i["created_at"]) >= t0]


def wait_for_resolution(ids):
    deadline = time.time() + RESOLVE_TIMEOUT_S
    while time.time() < deadline:
        if not [i for i in get("/incidents") if i["id"] in ids and i["open"]]:
            return True
        time.sleep(15)
    return False


def record(incident):
    d = get(f"/incidents/{incident['id']}")
    run = d["runs"][0]
    rep, ev = run.get("report") or {}, run.get("evidence") or {}
    return {
        "incident_id": d["id"], "alert": d["alertname"],
        "labels": {k: d["labels"].get(k) for k in ("service", "method", "route")},
        "run_id": run["id"], "status": run["status"], "error": run["error"],
        "weak_baseline": run["weak_baseline"], "baseline_reasons": ev.get("baseline_quality", {}).get("reasons", []),
        "missing_sources": run["missing_sources"],
        "cause_service": rep.get("cause_service"), "confidence": rep.get("confidence"),
        "summary": rep.get("summary"), "probable_cause": rep.get("probable_cause"),
        "evidence": rep.get("evidence"), "suggested_fix": rep.get("suggested_fix"),
        "evidence_gaps": rep.get("evidence_gaps"),
        "log_patterns_seen": [f"[{p['service']}] {p['msg']}: {p['baseline_count']}→{p['incident_count']}"
                              for p in ev.get("logs", [])],
    }


def main(order):
    Path("eval").mkdir(exist_ok=True)
    out = Path(f"eval/results-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.json")
    results, last_disruption = [], 0.0
    for n in order:
        wait_for_baseline(last_disruption)
        t0 = time.time()
        log(f"=== scenario {n}: inducing")
        scenario(n, "on")
        try:
            incidents = wait_for_investigations(t0)
        finally:
            log(f"scenario {n}: clearing")
            scenario(n, "off")
        entry = {"scenario": n, "expected": EXPECTED[n], "induced_at": datetime.fromtimestamp(t0, timezone.utc).isoformat(),
                 "incidents": [record(i) for i in incidents], "grade": "TODO: human"}
        if not incidents:
            log(f"scenario {n}: NO INCIDENT fired within {INCIDENT_TIMEOUT_S // 60} min")
        for r in entry["incidents"]:
            log(f"scenario {n}: #{r['incident_id']} {r['labels']} → {r['status']}, cause_service={r['cause_service']} ({r['confidence']})")
        results.append(entry)
        out.write_text(json.dumps(results, indent=2))
        resolved = wait_for_resolution({i["id"] for i in incidents})
        log(f"scenario {n}: alerts {'resolved' if resolved else 'NOT resolved in time'}")
        last_disruption = time.time()
    log(f"done → {out}")


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or [2, 4, 1, 3])
