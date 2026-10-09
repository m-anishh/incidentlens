"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Sparkline } from "@/components/Sparkline";
import { AlertBadge as AlertState, RunBadge as StatusBadge } from "@/components/StatusBadge";
import { labels, time, value } from "@/lib/format";
import { TERMINAL, type IncidentDetail, type Run, type RunStatus } from "@/lib/types";
import { usePoll } from "@/lib/usePoll";

const STEPS: RunStatus[] = ["received", "collecting", "reasoning"];

export default function IncidentPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = usePoll<IncidentDetail>(`/api/incidents/${id}`, (d) =>
    d?.runs.some((r) => !TERMINAL.includes(r.status)) ? 2000 : 15000,
  );
  const [selected, setSelected] = useState<number | null>(null);

  if (error && !data) return <p className="error">Could not load incident: {error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const run = data.runs.find((r) => r.id === selected) ?? data.runs[0];

  return (
    <>
      <p><Link href="/">← Incidents</Link></p>
      <h1>
        #{data.id} {data.alertname} <AlertState open={data.open} />
      </h1>
      <dl className="meta">
        <dt>Labels</dt><dd className="mono">{labels(data.labels)}</dd>
        {data.annotations.summary && (<><dt>Summary</dt><dd>{data.annotations.summary}</dd></>)}
        <dt>Firing since</dt><dd>{time(data.starts_at)}</dd>
        <dt>Resolved</dt><dd>{data.resolved_at ? time(data.resolved_at) : "still firing"}</dd>
        <dt>Notifications</dt><dd>{data.notification_count}</dd>
      </dl>

      {data.runs.length > 1 && (
        <div className="runs">
          Runs:{" "}
          {data.runs.map((r, idx) => (
            <button key={r.id} className={r.id === run?.id ? "run active" : "run"} onClick={() => setSelected(r.id)}>
              #{r.id} {r.trigger}{idx === 0 ? " (latest)" : ""} · <StatusBadge status={r.status} />
            </button>
          ))}
        </div>
      )}

      {run ? <RunView run={run} /> : <p className="muted">No investigation runs.</p>}
    </>
  );
}

function RunView({ run }: { run: Run }) {
  const ev = run.evidence;
  return (
    <>
      <section>
        <h2>Lifecycle</h2>
        <ol className="lifecycle">
          {STEPS.map((s) => (
            <li key={s} className={stepClass(run, s)}>{s}</li>
          ))}
          <li className={TERMINAL.includes(run.status) ? `done term-${run.status}` : ""}>
            {TERMINAL.includes(run.status) ? run.status : "complete | partial | failed"}
          </li>
        </ol>
        <p className="muted">
          {run.trigger} run · created {time(run.created_at)} · finished {time(run.finished_at)}
          {run.window_start && <> · evidence window {time(run.window_start)} → {time(run.window_end)}</>}
        </p>
        {run.error && (
          <p className="error">
            Failed at <b>{run.error.step ?? "unknown step"}</b>: {run.error.message}
          </p>
        )}
      </section>

      {(run.missing_sources.length > 0 || ev?.baseline_quality.weak || (ev?.query_errors.length ?? 0) > 0 || (ev?.findings.length ?? 0) > 0) && (
        <section className="gaps">
          <h2>Evidence gaps</h2>
          <ul>
            {run.missing_sources.map((s) => <li key={s}><b>{s}</b> was unreachable — this run is partial.</li>)}
            {ev?.baseline_quality.reasons.map((r) => <li key={r}>Weak baseline: {r}</li>)}
            {ev?.query_errors.map((e) => <li key={e} className="mono">{e}</li>)}
            {ev?.findings.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </section>
      )}

      {run.report && (
        <section className="report">
          <h2>Report <span className={`badge conf-${run.report.confidence}`}>{run.report.confidence} confidence</span></h2>
          <p className="lead">{run.report.summary}</p>
          <h3>Probable cause — <span className="mono">{run.report.cause_service}</span></h3>
          <p>{run.report.probable_cause}</p>
          <h3>Evidence</h3>
          <ul>{run.report.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
          <h3>Reasoning</h3>
          <p className="prose">{run.report.reasoning}</p>
          <h3>Suggested fix</h3>
          <p className="prose fix">{run.report.suggested_fix}</p>
          {run.report.evidence_gaps.length > 0 && (
            <>
              <h3>Gaps the agent declared</h3>
              <ul>{run.report.evidence_gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
            </>
          )}
        </section>
      )}

      {ev && <EvidenceView ev={ev} />}
    </>
  );
}

function stepClass(run: Run, step: RunStatus): string {
  const order = [...STEPS, "terminal"];
  const at = TERMINAL.includes(run.status) ? order.length - 1 : order.indexOf(run.status);
  const idx = order.indexOf(step);
  if (run.status === "failed" && run.error?.step === step) return "failed";
  if (idx < at) return "done";
  if (idx === at) return "current";
  return "";
}

function EvidenceView({ ev }: { ev: NonNullable<Run["evidence"]> }) {
  const [showAll, setShowAll] = useState(false);
  const contrast = [...ev.contrast].sort((a, b) => notability(b) - notability(a));
  const shown = showAll ? contrast : contrast.slice(0, 15);

  return (
    <section>
      <h2>Evidence collected</h2>

      {ev.onset.length > 0 && (
        <>
          <h3>Onset — series that moved</h3>
          <div className="sparks">
            {ev.onset.map((s, i) => (
              <div key={i} className="spark">
                <div className="mono small">{s.metric}</div>
                <div className="muted small">{labels(s.labels)}</div>
                <Sparkline points={s.points} />
                <div className="small">
                  {value(Math.min(...s.points.map((p) => p[1])), s.unit)} – {value(Math.max(...s.points.map((p) => p[1])), s.unit)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h3>Metrics: baseline → incident</h3>
      <table className="list">
        <thead><tr><th>Metric</th><th>Labels</th><th>Baseline</th><th>Incident mean</th><th>Peak</th></tr></thead>
        <tbody>
          {shown.map((c, i) => (
            <tr key={i}>
              <td className="mono">{c.metric}</td>
              <td className="mono small">{labels(c.labels)}</td>
              <td>{c.baseline_mean === null ? "—" : value(c.baseline_mean, c.unit)}</td>
              <td>{value(c.incident_mean, c.unit)}</td>
              <td>{value(c.incident_peak, c.unit)}{c.ratio !== null && c.ratio >= 1.5 ? ` (×${c.ratio.toFixed(1)})` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {contrast.length > 15 && (
        <button className="link" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show fewer" : `Show all ${contrast.length} series`}
        </button>
      )}

      <h3>Log patterns (warnings &amp; errors)</h3>
      {ev.logs.length === 0 ? (
        <p className="muted">None in either period.</p>
      ) : (
        <table className="list">
          <thead><tr><th>Service</th><th>Level</th><th>Message</th><th>Baseline</th><th>Incident</th></tr></thead>
          <tbody>
            {ev.logs.map((p, i) => (
              <tr key={i}>
                <td>{p.service}</td>
                <td>{p.level}</td>
                <td>
                  {p.msg}
                  {p.samples.length > 0 && (
                    <details><summary className="small">{p.samples.length} sample(s)</summary>
                      {p.samples.map((s, j) => <pre key={j}>{s}</pre>)}
                    </details>
                  )}
                </td>
                <td>{p.baseline_count}</td>
                <td>{p.incident_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function notability(c: { baseline_mean: number | null; incident_peak: number; incident_mean: number }): number {
  if (!c.baseline_mean) return c.incident_peak > 0 ? 1e9 : 0;
  return Math.max(c.incident_peak / c.baseline_mean, c.baseline_mean / Math.max(c.incident_mean, 1e-9));
}
