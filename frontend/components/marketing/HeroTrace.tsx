"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TracePanel, type TraceRow } from "@/components/incidents/TracePanel";
import type { IncidentDetail, IncidentListItem, Run } from "@/lib/types";

// Recorded from the first real scenario-2 investigation (9 Oct 2026, incident
// #1, DeepSeek V3.2 on Bedrock). Counts and numbers are as that run stored them;
// per-step timings were not recorded yet, so none are shown. That run is not
// counted as a pass — see docs/05-agent-design.md.
const RECORDED: TraceRow[] = [
  { step: "window", level: "ok", detail: "baseline 12:45–12:55 · onset 12:55–12:59 UTC" },
  { step: "prometheus", level: "ok", detail: "16 queries · latency, errors, calls, pool, cache, DB" },
  { step: "loki", level: "ok", detail: "warnings and errors, grouped by message" },
  { step: "collecting", level: "ok", detail: "30 series vs baseline · 6 moved · 2 log patterns" },
  { step: "reasoning", level: "ok", detail: "deepseek.v3.2 → inventory-service · high confidence" },
];

const FINDINGS = [
  ["inventory-service /reserve p95", "5ms → 912ms"],
  ["orders-api → inventory call p95", "5ms → 859ms"],
  ["Postgres query time, pool wait", "unchanged"],
];

export function HeroTrace() {
  const [live, setLive] = useState<{ incident: IncidentDetail; run: Run } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list: IncidentListItem[] = await (await fetch("/api/incidents?limit=20", { cache: "no-store" })).json();
        const candidate = list.find((i) => i.latest_run?.status === "complete");
        if (!candidate) return;
        const detail: IncidentDetail = await (await fetch(`/api/incidents/${candidate.id}`, { cache: "no-store" })).json();
        const run = detail.runs.find((r) => r.status === "complete" && r.trace?.length);
        if (run) setLive({ incident: detail, run });
      } catch {
        /* backend unreachable: keep the recorded example */
      }
    })();
  }, []);

  if (live) {
    const { incident, run } = live;
    return (
      <div className="hero-trace compact">
        <TracePanel
          title={`Incident #${incident.id} · ${incident.alertname}`}
          meta={<span className="mono">{incident.service} {incident.labels.method} {incident.labels.route}</span>}
          rows={run.trace}
          footer={
            <>
              <p className="trace-conclusion">
                Probable cause: <span className="mono">{run.report?.cause_service}</span>. {run.report?.summary}
              </p>
              <Link href={`/incidents/${incident.id}`} className="small">Open this investigation</Link>
            </>
          }
        />
        <p className="hero-trace-note">Latest completed run, live from this deployment.</p>
      </div>
    );
  }

  return (
    <div className="hero-trace compact">
      <TracePanel
        title="Incident #1 · HighLatencyP95"
        meta={<span className="mono">orders-api POST /orders</span>}
        rows={RECORDED}
        footer={
          <>
            <table className="findings">
              <tbody>
                {FINDINGS.map(([what, change]) => (
                  <tr key={what}><td>{what}</td><td className="mono">{change}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="trace-conclusion">
              Probable cause: <span className="mono">inventory-service</span> — orders-api is only the symptom.
            </p>
          </>
        }
      />
      <p className="hero-trace-note">
        Recorded run, 9 Oct 2026. Its evidence also contained the operator&apos;s own &ldquo;delay set&rdquo; log line, so it is not
        counted as a pass.
      </p>
    </div>
  );
}
