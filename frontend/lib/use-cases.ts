// The failure shapes IncidentLens is built to tell apart. Each is one where the
// alerting service and the causing service — or route — are not the same.
// Measured results against these live in docs/05-agent-design.md, not here.

export interface UseCase {
  title: string;
  symptom: string;
  finding: string;
}

export const USE_CASES: UseCase[] = [
  {
    title: "Connection pool exhaustion",
    symptom: "Latency climbs on your API while the database looks idle.",
    finding: "Points at the client-side pool, not Postgres — low query time and throughput while requests queue.",
  },
  {
    title: "Slow downstream service",
    symptom: "orders-api pages you. Its own CPU, memory and database are flat.",
    finding: "Follows the call to inventory-service and shows its latency rising first. The alerting service is only the symptom.",
  },
  {
    title: "Cache outage",
    symptom: "Latency rises everywhere reads happen.",
    finding: "Traces it two hops back: cache misses push load onto the database, which pushes latency onto requests.",
  },
  {
    title: "One broken route",
    symptom: "Error rate is up on a service.",
    finding: "Narrows it to the single failing route by label, instead of blaming the whole service.",
  },
];
