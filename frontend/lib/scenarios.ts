// The evaluation set and what has actually been observed.
// Update `result` only from a recorded run — see docs/05-agent-design.md.
// A conclusion that was never seen is "pending", never "pass".

export type Result = "pass" | "fail" | "pending";

export interface Scenario {
  n: number;
  title: string;
  broken: string;
  induce: string;
  expected: string;
  result: Result;
  observed: string;
}

export const SCENARIOS: Scenario[] = [
  {
    n: 1,
    title: "Connection pool exhaustion",
    broken: "More concurrent requests than orders-api has database connections.",
    induce: "Burst load past the pool of 5",
    expected: "Bottleneck is the client-side pool in orders-api. Postgres stays fast and lightly loaded.",
    result: "pending",
    observed: "Not yet run.",
  },
  {
    n: 2,
    title: "Slow downstream service",
    broken: "inventory-service answers 800ms late. orders-api is the one that alerts.",
    induce: "POST /admin/delay?ms=800",
    expected: "Cause is in a different service: inventory-service. orders-api is only the symptom.",
    result: "pending",
    observed:
      "Seen once naming inventory-service with high confidence (downstream p95 5ms → 859ms, Postgres and cache flat). " +
      "Not counted: that run's evidence included the operator's own \"delay set\" log line. Re-run pending.",
  },
  {
    n: 3,
    title: "Cache outage",
    broken: "Redis stops. Reads fall back to Postgres.",
    induce: "docker compose stop redis",
    expected: "Two hops from the symptom: cache misses drive database load, which drives latency.",
    result: "pending",
    observed: "Not yet run.",
  },
  {
    n: 4,
    title: "One broken route",
    broken: "GET /orders/{order_id} throws on every request. Other routes are fine.",
    induce: "POST /admin/break?route=get_order",
    expected: "Narrowed to the single route by label, not blamed on the whole service.",
    result: "pending",
    observed: "Not yet run.",
  },
];

export const RESULT_LABEL: Record<Result, string> = {
  pass: "passed",
  fail: "failed",
  pending: "not yet verified",
};
