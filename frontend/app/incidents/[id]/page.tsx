"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ComingSoon } from "@/components/ComingSoon";
import { Sparkline } from "@/components/Sparkline";
import { COMING_SOON } from "@/lib/roadmap";
import { AlertBadge, RunBadge, WeakBaselineBadge } from "@/components/StatusBadge";
import { TracePanel, type TraceRow } from "@/components/TracePanel";
import { between, clock, duration, labels, time, value } from "@/lib/format";
import { TERMINAL, type Contrast, type Evidence, type IncidentDetail, type Run } from "@/lib/types";
import { usePoll } from "@/lib/usePoll";

export default function IncidentPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = usePoll<IncidentDetail>(`/api/incidents/${id}`, (d) =>
    d?.runs.some((r) => !TERMINAL.includes(r.status)) ? 2000 : 15000,
  );
  const [selected, setSelected] = useState<number | null>(null);

  if (error && !data) {
    return (
      <main className="page">
        <Link href="/incidents" className="small">All incidents</Link>
        <div className="callout bad" style={{ marginTop: 16 }}>Could not load incident {id}: <span className="mono">{error}</span></div>
      </main>
    );
  }
  if (!data) return <main className="page"><p className="muted">Loading…</p></main>;

  const run = data.runs.find((r) => r.id === selected) ?? data.runs[0];
  const isLatest = run && run.id === data.runs[0]?.id;

  return (
    <main className="page detail">
      <Link href="/incidents" className="small back">All incidents</Link>

      <WhatFired incident={data} />

      {!run && <div className="callout">No investigation runs for this incident.</div>}
      {run && (
        <>
          {!isLatest && (
            <div className="callout">
              Viewing earlier run #{run.id}. <button className="linkish" onClick={() => setSelected(null)}>Show latest</button>
            </div>
          )}
          <Conclusion run={run} />
          <ExecutionTrace run={run} incident={data} />
          {run.evidence && <EvidenceView ev={run.evidence} />}
        </>
      )}

      <RunHistory runs={data.runs} current={run?.id} onSelect={setSelected} />

      <section className="block soon-row" aria-label="Not built yet">
        <ComingSoon compact {...COMING_SOON.memory} />
        <ComingSoon compact {...COMING_SOON.topology} />
      </section>
    </main>
  );
}

/* 1 — what fired ----------------------------------------------------------- */

function WhatFired({ incident: i }: { incident: IncidentDetail }) {
  return (
    <section className="block">
      <div className="spread">
        <h1 className="detail-title">
          <span className="faint mono">#{i.id}</span> {i.alertname}
        </h1>
        <AlertBadge open={i.open} />
      </div>
      {i.annotations.summary && <p className="muted">{i.annotations.summary}</p>}
      <dl className="facts">
        <div><dt>Service</dt><dd className="mono">{i.service ?? "—"}</dd></div>
        <div><dt>Route</dt><dd className="mono">{i.labels.route ? `${i.labels.method ?? ""} ${i.labels.route}` : "—"}</dd></div>
        <div><dt>Firing since</dt><dd className="mono">{time(i.starts_at)}</dd></div>
        <div>
          <dt>{i.open ? "Firing for" : "Resolved"}</dt>
          <dd className="mono">{i.open ? duration(between(i.starts_at, null)) : `${time(i.resolved_at)} · lasted ${duration(between(i.starts_at, i.resolved_at))}`}</dd>
        </div>
        <div><dt>Severity</dt><dd>{i.severity ?? "—"}</dd></div>
        <div><dt>Notifications</dt><dd className="mono">{i.notification_count}</dd></div>
      </dl>
    </section>
  );
}

/* 2 — the conclusion ------------------------------------------------------- */

function Conclusion({ run }: { run: Run }) {
  const rep = run.report;
  const gaps = run.evidence?.baseline_quality.reasons ?? [];
  return (
    <section className="block" aria-labelledby="conclusion">
      <div className="spread block-head">
        <h2 id="conclusion">Conclusion</h2>
        <div className="row"><RunBadge status={run.status} />{run.weak_baseline && <WeakBaselineBadge />}</div>
      </div>

      {run.status === "failed" && (
        <div className="callout bad">
          <strong>No report.</strong> The run failed at <span className="mono">{run.error?.step ?? "an unknown step"}</span>:{" "}
          <span className="mono">{run.error?.message}</span>
        </div>
      )}

      {!TERMINAL.includes(run.status) && (
        <div className="callout">Investigating — currently <span className="mono">{run.current_step ?? run.status}</span>. This page updates on its own.</div>
      )}

      {rep && (
        <div className="conclusion">
          <div className="hypothesis">
            <p className="eyebrow">Hypothesis · {rep.confidence} confidence</p>
            <p className="hypothesis-cause">
              Most likely cause: <span className="mono">{rep.cause_service}</span>
            </p>
            <p>{rep.summary}</p>
            <p className="muted">{rep.probable_cause}</p>
          </div>
          <div className="fix">
            <p className="eyebrow">Suggested fix · not executed</p>
            <p className="prose">{rep.suggested_fix}</p>
          </div>
        </div>
      )}

      {(run.weak_baseline || run.missing_sources.length > 0 || (rep?.evidence_gaps.length ?? 0) > 0) && (
        <div className="callout warn gaps">
          <strong>What this conclusion rests on less firmly</strong>
          <ul>
            {run.missing_sources.map((s) => <li key={s}><span className="mono">{s}</span> was unreachable, so this run is partial.</li>)}
            {gaps.map((g) => <li key={g}>Weak baseline: {g}. Comparisons with “normal” are unreliable.</li>)}
            {rep?.evidence_gaps.map((g, k) => <li key={k}>{g}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

/* 3 — execution trace ------------------------------------------------------ */

function ExecutionTrace({ run, incident }: { run: Run; incident: IncidentDetail }) {
  const rows: TraceRow[] = run.trace?.length ? run.trace : reconstruct(run);
  const reconstructed = !run.trace?.length;
  const ev = run.evidence;
  const byMetric = useMemo(() => groupByMetric(ev?.contrast ?? []), [ev]);

  return (
    <section className="block" aria-labelledby="trace">
      <div className="spread block-head">
        <h2 id="trace">Execution trace</h2>
        <span className="muted small">
          {run.model && <span className="mono">{run.model} · </span>}
          {run.finished_at ? `report in ${duration(between(run.created_at, run.finished_at))}` : "running"}
        </span>
      </div>
      <p className="muted small block-lead">
        Every step the agent took, in order. This is what separates an investigation from a guess.
        {reconstructed && " This run predates step-by-step recording, so the steps are reconstructed from what it stored."}
      </p>

      <TracePanel
        rows={rows}
        running={!TERMINAL.includes(run.status)}
        title={`Run #${run.id} · ${run.trigger}`}
        meta={<span className="mono">{incident.service} {incident.labels.method} {incident.labels.route}</span>}
      />

      {ev && (
        <div className="trace-detail-grid">
          <details className="panel">
            <summary className="panel-body">Prometheus — what was queried and what came back ({byMetric.length} metrics)</summary>
            <table className="data compact">
              <thead><tr><th>Metric</th><th className="num">Series</th><th className="num">Moved</th></tr></thead>
              <tbody>
                {byMetric.map((m) => (
                  <tr key={m.metric}><td className="mono">{m.metric}</td><td className="num mono">{m.series}</td><td className="num mono">{m.moved || ""}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
          <details className="panel">
            <summary className="panel-body">Loki — warning and error patterns ({ev.logs.length})</summary>
            {ev.logs.length === 0
              ? <p className="panel-body muted small">None in either period.</p>
              : (
                <table className="data compact">
                  <thead><tr><th>Service</th><th>Message</th><th className="num">Baseline</th><th className="num">Incident</th></tr></thead>
                  <tbody>
                    {ev.logs.map((p, k) => (
                      <tr key={k}><td className="mono">{p.service}</td><td>{p.msg}</td><td className="num mono">{p.baseline_count}</td><td className="num mono">{p.incident_count}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
          </details>
          {run.report && (
            <details className="panel" open>
              <summary className="panel-body">The agent&apos;s reasoning and the evidence it cited</summary>
              <div className="panel-body stack reasoning">
                <ul className="cited">{run.report.evidence.map((e, k) => <li key={k}>{e}</li>)}</ul>
                <p className="prose muted">{run.report.reasoning}</p>
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

/** For runs recorded before the trace existed: rebuild the steps from stored fields. */
function reconstruct(run: Run): TraceRow[] {
  const ev = run.evidence;
  const rows: TraceRow[] = [];
  if (run.window_start) {
    rows.push({ step: "window", level: "ok", detail: `${clock(run.window_start)} → ${clock(run.window_end)} (baseline, then onset)` });
  }
  if (ev) {
    rows.push(run.missing_sources.includes("prometheus")
      ? { step: "prometheus", level: "error", detail: "unreachable — metrics missing from this run" }
      : { step: "prometheus", level: "ok", detail: `${ev.contrast.length} series compared with baseline, ${ev.onset.length} moved notably` });
    rows.push(run.missing_sources.includes("loki")
      ? { step: "loki", level: "error", detail: "unreachable — logs missing from this run" }
      : { step: "loki", level: "ok", detail: `${ev.logs.length} warning/error patterns` });
    rows.push(ev.baseline_quality.weak
      ? { step: "baseline", level: "warn", detail: "weak baseline: " + ev.baseline_quality.reasons.join("; ") }
      : { step: "baseline", level: "ok", detail: "baseline healthy" });
  }
  if (run.report) {
    rows.push({ step: "reasoning", level: "ok", detail: `cause: ${run.report.cause_service} (${run.report.confidence} confidence)` });
  }
  if (run.status === "failed") {
    rows.push({ step: run.error?.step ?? "failed", level: "error", detail: run.error?.message ?? "failed" });
  } else if (TERMINAL.includes(run.status)) {
    rows.push({ step: run.status, level: run.status === "partial" ? "warn" : "ok", detail: "run finished" });
  }
  return rows;
}

function groupByMetric(cs: Contrast[]) {
  const m = new Map<string, { metric: string; series: number; moved: number }>();
  for (const c of cs) {
    const e = m.get(c.metric) ?? { metric: c.metric, series: 0, moved: 0 };
    e.series += 1;
    if (moved(c)) e.moved += 1;
    m.set(c.metric, e);
  }
  return [...m.values()];
}

function moved(c: Contrast) {
  if (c.baseline_mean === null) return c.incident_peak > 0;
  if (c.unit === "bool" || c.unit === "ratio") return Math.abs(c.incident_peak - c.baseline_mean) >= 0.02 || Math.abs(c.incident_mean - c.baseline_mean) >= 0.02;
  if (c.baseline_mean === 0) return c.incident_peak > 0;
  return c.incident_peak / c.baseline_mean >= 1.5 || c.incident_mean / c.baseline_mean <= 1 / 1.5;
}

/* 4 — evidence ------------------------------------------------------------- */

function EvidenceView({ ev }: { ev: Evidence }) {
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => [...ev.contrast].sort((a, b) => Number(moved(b)) - Number(moved(a)) || score(b) - score(a)), [ev]);
  const shown = all ? sorted : sorted.filter(moved).slice(0, 14);

  return (
    <section className="block" aria-labelledby="evidence">
      <div className="spread block-head"><h2 id="evidence">Evidence</h2></div>

      <h3 className="sub">Baseline → incident</h3>
      {shown.length === 0
        ? <p className="muted small">No series moved notably.</p>
        : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Metric</th><th>Labels</th><th className="num">Baseline</th><th className="num">Incident mean</th><th className="num">Peak</th></tr></thead>
              <tbody>
                {shown.map((c, k) => (
                  <tr key={k}>
                    <td className="mono small">{c.metric}</td>
                    <td className="mono small muted">{labels(c.labels)}</td>
                    <td className="num mono">{c.baseline_mean === null ? "—" : value(c.baseline_mean, c.unit)}</td>
                    <td className="num mono">{value(c.incident_mean, c.unit)}</td>
                    <td className="num mono">
                      {value(c.incident_peak, c.unit)}
                      {c.ratio !== null && c.ratio >= 1.5 && <span className="ratio"> ×{c.ratio >= 10 ? c.ratio.toFixed(0) : c.ratio.toFixed(1)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <button className="linkish" onClick={() => setAll(!all)}>
        {all ? "Show only series that moved" : `Show all ${ev.contrast.length} series, including the ones that stayed flat`}
      </button>

      {ev.onset.length > 0 && (
        <>
          <h3 className="sub">Series that moved, from onset</h3>
          <div className="sparks">
            {ev.onset.map((s, k) => {
              const ys = s.points.map((p) => p[1]);
              return (
                <div key={k} className="spark">
                  <div className="mono small">{s.metric}</div>
                  <div className="mono faint small spark-labels">{labels(s.labels)}</div>
                  <Sparkline points={s.points} />
                  <div className="mono small muted">{value(Math.min(...ys), s.unit)} – {value(Math.max(...ys), s.unit)}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h3 className="sub">Log lines</h3>
      {ev.logs.length === 0
        ? <p className="muted small">No warnings or errors in either period.</p>
        : ev.logs.map((p, k) => (
          <div key={k} className="logpattern">
            <div className="spread">
              <span><span className="mono">{p.service}</span> · {p.level} · {p.msg}</span>
              <span className="mono small muted">{p.baseline_count} → {p.incident_count}</span>
            </div>
            {p.samples.map((s, j) => <pre key={j} className="logline">{s}</pre>)}
          </div>
        ))}
    </section>
  );
}

function score(c: Contrast) {
  if (!c.baseline_mean) return c.incident_peak > 0 ? 1e9 : 0;
  return Math.max(c.incident_peak / c.baseline_mean, c.baseline_mean / Math.max(c.incident_mean, 1e-9));
}

/* 5 — run history ---------------------------------------------------------- */

function RunHistory({ runs, current, onSelect }: { runs: Run[]; current?: number; onSelect: (id: number) => void }) {
  return (
    <section className="block" aria-labelledby="runs">
      <div className="spread block-head"><h2 id="runs">Run history</h2><span className="muted small">{runs.length} run{runs.length === 1 ? "" : "s"}</span></div>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Run</th><th>Trigger</th><th>Status</th><th>Started</th><th className="num">Time to report</th><th>Cause</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className={`clickable ${r.id === current ? "selected" : ""}`} onClick={() => onSelect(r.id)}
                onKeyDown={(e) => e.key === "Enter" && onSelect(r.id)} tabIndex={0}>
                <td className="mono">#{r.id}</td>
                <td>{r.trigger}</td>
                <td><RunBadge status={r.status} /></td>
                <td className="mono small">{time(r.created_at)}</td>
                <td className="num mono">{r.finished_at ? duration(between(r.created_at, r.finished_at)) : "—"}</td>
                <td className="mono small">{r.cause_service ?? r.report?.cause_service ?? (r.status === "failed" ? <span className="error">failed at {r.error?.step}</span> : "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
