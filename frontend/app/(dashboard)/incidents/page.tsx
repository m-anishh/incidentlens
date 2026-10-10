"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertBadge, RunBadge, WeakBaselineBadge } from "@/components/incidents/StatusBadge";
import { ago, duration, median, time } from "@/lib/format";
import { TERMINAL, type IncidentListItem, type Stats } from "@/lib/types";
import { usePoll } from "@/lib/usePoll";

type Filter = "all" | "open" | "resolved";
const DAY_MS = 24 * 3600 * 1000;

export default function IncidentList() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  // Fetch everything once; filter client-side so the counters stay global.
  const { data, error } = usePoll<IncidentListItem[]>("/api/incidents?limit=200", (d) =>
    d?.some((i) => i.latest_run && !TERMINAL.includes(i.latest_run.status)) ? 3000 : 10000,
  );
  const { data: stats } = usePoll<Stats>("/api/incidents/stats", () => 15000);

  const counters = useMemo(() => {
    if (!data) return null;
    const runs = data.map((i) => i.latest_run).filter(Boolean) as NonNullable<IncidentListItem["latest_run"]>[];
    const reportTimes = runs
      .filter((r) => TERMINAL.includes(r.status) && r.status !== "failed" && r.finished_at)
      .map((r) => (new Date(r.finished_at!).getTime() - new Date(r.created_at).getTime()) / 1000);
    const today = stats?.runs_24h
      ? Object.values(stats.runs_24h).reduce((a, b) => a + (b ?? 0), 0)
      : runs.filter((r) => Date.now() - new Date(r.created_at).getTime() < DAY_MS).length;
    return {
      open: data.filter((i) => i.open).length,
      today,
      medianReport: median(reportTimes),
      reportN: reportTimes.length,
    };
  }, [data, stats]);

  const rows = useMemo(() => {
    if (!data) return null;
    const q = query.trim().toLowerCase();
    return data.filter((i) =>
      (filter === "all" || (filter === "open" ? i.open : !i.open)) &&
      (!q || [i.alertname, i.service, i.labels.route, i.labels.method, i.latest_run?.summary, i.latest_run?.cause_service]
        .some((f) => f?.toLowerCase().includes(q))),
    );
  }, [data, filter, query]);

  return (
    <main className="page">
      <div className="spread page-head">
        <div>
          <h1>Incidents</h1>
          <p className="muted small">Opened automatically when an alert fires. Every investigation starts on its own.</p>
        </div>
        <div className="counters" aria-label="Summary">
          <Counter label="Open incidents" value={counters ? String(counters.open) : "…"} tone={counters?.open ? "warn" : undefined} />
          <Counter label="Investigations, last 24h" value={counters ? String(counters.today) : "…"} />
          <Counter label="Median time to report" value={counters ? duration(counters.medianReport) : "…"}
            title={counters ? `over ${counters.reportN} finished run(s)` : undefined} />
        </div>
      </div>

      <div className="toolbar">
        <div className="seg" role="tablist" aria-label="Alert state">
          {(["all", "open", "resolved"] as Filter[]).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "open" ? "Firing" : "Resolved"}
            </button>
          ))}
        </div>
        <input className="search" type="search" placeholder="Filter by alert, service, route or cause" value={query}
          onChange={(e) => setQuery(e.target.value)} aria-label="Filter incidents" />
      </div>

      {error && !data && <div className="callout bad">Could not reach the agent API: <span className="mono">{error}</span></div>}
      {data === null && !error && <p className="muted">Loading…</p>}

      {data && data.length === 0 && <Waiting />}
      {data && data.length > 0 && rows && rows.length === 0 && <p className="muted empty-filter">No incidents match this filter.</p>}

      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table className="data incidents">
            <thead>
              <tr>
                <th>Alert</th>
                <th>Service and route</th>
                <th>Alert state</th>
                <th>Investigation</th>
                <th>Summary</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const r = i.latest_run;
                return (
                  <tr key={i.id} className="clickable" onClick={() => router.push(`/incidents/${i.id}`)}
                    onKeyDown={(e) => e.key === "Enter" && router.push(`/incidents/${i.id}`)} tabIndex={0}>
                    <td className="nowrap">
                      <span className="faint mono small">#{i.id}</span> <span className="strong">{i.alertname}</span>
                    </td>
                    <td className="mono small" data-label="Service and route">
                      {i.service ?? "—"}
                      {i.labels.route && <span className="muted"> {i.labels.method} {i.labels.route}</span>}
                    </td>
                    <td data-label="Alert state"><AlertBadge open={i.open} /></td>
                    <td data-label="Investigation">
                      <div className="cell-stack">
                        <RunBadge status={r?.status ?? "none"} />
                        {r?.weak_baseline && <WeakBaselineBadge />}
                        {i.run_count > 1 && <span className="faint small">{i.run_count} runs</span>}
                      </div>
                    </td>
                    <td className="summary" data-label="Summary">
                      {r?.summary
                        ? <>{r.cause_service && <span className="mono cause">{r.cause_service}</span>}{r.summary}</>
                        : r?.status === "failed"
                          ? <span className="error">Failed at {r.error?.step ?? "unknown step"}</span>
                          : <span className="faint">—</span>}
                    </td>
                    <td className="nowrap mono small" data-label="Started" title={time(i.starts_at)}>{ago(i.starts_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Counter({ label, value, tone, title }: { label: string; value: string; tone?: "warn"; title?: string }) {
  return (
    <div className={`counter ${tone ? `tone-${tone}` : ""}`} title={title}>
      <span className="counter-value mono">{value}</span>
      <span className="counter-label">{label}</span>
    </div>
  );
}

function Waiting() {
  return (
    <div className="waiting panel">
      <div className="panel-body stack">
        <h2>No incidents yet</h2>
        <p className="muted">
          No incidents yet. One opens when Alertmanager fires — p95 latency above 500ms, or more than 5% of requests
          failing, on any route for two minutes. The investigation starts on its own and the report appears here.
        </p>
        <p className="faint small">This page never triggers anything itself — incidents come only from real alerts.</p>
      </div>
    </div>
  );
}
