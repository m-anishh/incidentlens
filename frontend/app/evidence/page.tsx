import { ComingSoon } from "@/components/ComingSoon";
import { COMING_SOON } from "@/lib/roadmap";

const SOURCES = [
  {
    name: "Metrics",
    via: "Prometheus · PromQL",
    what: "Request latency and errors per route, calls between services, the database connection pool, cache hits and misses, Postgres throughput and query time, Redis health, process CPU.",
    how: "A healthy 10-minute baseline is reduced to a few numbers per series; the onset is kept at full resolution. Each series arrives as a baseline → incident comparison.",
  },
  {
    name: "Logs",
    via: "Loki · LogQL",
    what: "Warning and error lines from the target system's containers, shipped by Alloy.",
    how: "Grouped by message with counts for the baseline and the incident, plus a few sample lines from the onset. Capped per query so a noisy service cannot flood the report.",
  },
];

export default function EvidenceSources() {
  return (
    <main className="page">
      <div className="page-head">
        <h1>Evidence</h1>
        <p className="muted small">Where the agent looks, and what it brings back. It learns about the system only through these.</p>
      </div>

      <div className="sources">
        {SOURCES.map((s) => (
          <section key={s.name} className="panel source">
            <div className="panel-head">
              <h2>{s.name}</h2>
              <span className="row"><span className="mono small muted">{s.via}</span><span className="badge st-complete">wired</span></span>
            </div>
            <div className="panel-body stack">
              <p>{s.what}</p>
              <p className="muted small">{s.how}</p>
            </div>
          </section>
        ))}
        <ComingSoon {...COMING_SOON.traces} />
        <ComingSoon {...COMING_SOON.kubernetes} />
      </div>
    </main>
  );
}
