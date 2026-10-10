"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// A replay of one recorded investigation (9 Oct 2026, incident #1: orders-api
// POST /orders p95 alert, DeepSeek V3.2 on Bedrock). Numbers are as that run
// stored them in lib/demo/incident-1.json. Per-step timings were not recorded,
// so only the start, alert and finish carry timestamps; the pacing is staged.

type StageId = "alert" | "collect" | "baseline" | "reason" | "report";

interface Line { t: string; text: string; tone?: "ok" | "warn" | "bad" | "brand" }
interface Stage { id: StageId; label: string; sub: string; ms: number; lines: Line[] }

const STAGES: Stage[] = [
  {
    id: "alert", label: "Alert received", sub: "Alertmanager webhook", ms: 3200,
    lines: [
      { t: "12:59:03", text: "HighLatencyP95 firing · orders-api POST /orders", tone: "bad" },
      { t: "12:59:13", text: "fingerprint 63c0bf20 · no open incident → opened #1" },
      { t: "12:59:13", text: "run #1 handed to background · webhook answered 200", tone: "ok" },
    ],
  },
  {
    id: "collect", label: "Evidence collected", sub: "Prometheus · Loki", ms: 3800,
    lines: [
      { t: "12:59:13", text: "window 12:45 → 12:59 UTC · starts before the alert" },
      { t: "", text: "prometheus · 16 queries · latency, errors, calls, pool, cache, DB", tone: "ok" },
      { t: "", text: "loki · warnings and errors grouped by message", tone: "ok" },
      { t: "", text: "405 × “inventory-service slow” from orders-api", tone: "warn" },
    ],
  },
  {
    id: "baseline", label: "Compared to baseline", sub: "10 healthy minutes", ms: 4200,
    lines: [
      { t: "", text: "baseline 12:45–12:55 · onset from 12:55 · quality good", tone: "ok" },
      { t: "", text: "orders-api POST /orders p95   110 ms → 987 ms", tone: "bad" },
      { t: "", text: "call to inventory /reserve p95   5 ms → 975 ms", tone: "bad" },
      { t: "", text: "db pool wait, postgres tx/s, request rate   unchanged", tone: "ok" },
    ],
  },
  {
    id: "reason", label: "Root cause reasoned", sub: "LLM over the evidence", ms: 4200,
    lines: [
      { t: "", text: "symptom: orders-api — its own resources are flat" },
      { t: "", text: "earliest moving signal: downstream /reserve latency", tone: "brand" },
      { t: "", text: "postgres, redis ruled out · traffic constant at 3 req/s" },
      { t: "12:59:27", text: "hypothesis: inventory-service · confidence high", tone: "brand" },
    ],
  },
  {
    id: "report", label: "Report delivered", sub: "cause · fix · gaps", ms: 6000,
    lines: [
      { t: "12:59:27", text: "report written · run #1 complete in 14.8 s", tone: "ok" },
      { t: "12:59:27", text: "suggested fix recorded · not executed", tone: "ok" },
    ],
  },
];

const CONTRAST = [
  { name: "orders-api · POST /orders", sub: "p95 latency — the alert", base: "110 ms", now: "987 ms", ratio: "×9", w: 0.42, moved: true },
  { name: "inventory-service · POST /reserve", sub: "p95 latency", base: "5 ms", now: "987 ms", ratio: "×208", w: 1, moved: true },
  { name: "orders-api → inventory call", sub: "p95 latency", base: "5 ms", now: "975 ms", ratio: "×188", w: 0.95, moved: true },
  { name: "DB pool acquire", sub: "p95 wait", base: "1 ms", now: "1 ms", ratio: "×1.0", w: 0.04, moved: false },
  { name: "Postgres", sub: "transactions/s", base: "18.4", now: "18.4", ratio: "×1.0", w: 0.04, moved: false },
  { name: "Request rate", sub: "orders-api POST /orders", base: "3.0/s", now: "3.0/s", ratio: "×1.0", w: 0.04, moved: false },
];

const SUSPECTS = [
  { name: "orders-api", role: "symptom", tone: "warn" },
  { name: "inventory-service", role: "cause", tone: "bad" },
  { name: "postgres", role: "ruled out", tone: "ok" },
  { name: "redis", role: "ruled out", tone: "ok" },
] as const;

export function LiveWorkflow() {
  const [stage, setStage] = useState(0);
  const [shown, setShown] = useState(0); // lines revealed in the current stage
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  // Start when scrolled into view, not on page load.
  useEffect(() => {
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(rm);
    if (rm) { setStage(STAGES.length - 1); setShown(99); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) { started.current = true; setPlaying(true); }
    }, { threshold: 0.35 });
    if (root.current) io.observe(root.current);
    return () => io.disconnect();
  }, []);

  // Reveal the stage's lines one by one, then move on; loop after the report.
  useEffect(() => {
    if (!playing) return;
    const s = STAGES[stage];
    const step = s.ms / (s.lines.length + 1);
    const id = setTimeout(() => {
      if (shown < s.lines.length) setShown(shown + 1);
      else if (stage < STAGES.length - 1) { setStage(stage + 1); setShown(0); }
      else { setStage(0); setShown(0); }
    }, shown < s.lines.length ? step : step * (stage === STAGES.length - 1 ? 3 : 1));
    return () => clearTimeout(id);
  }, [playing, stage, shown]);

  const jump = useCallback((i: number) => { setStage(i); setShown(STAGES[i].lines.length); setPlaying(false); }, []);
  const restart = () => { setStage(0); setShown(0); setPlaying(true); };

  const log = STAGES.slice(0, stage + 1).flatMap((s, i) => (i < stage ? s.lines : s.lines.slice(0, shown)));
  const current = STAGES[stage];
  const progress = (stage + Math.min(shown, current.lines.length) / (current.lines.length || 1)) / STAGES.length;

  return (
    <div className="wf" ref={root}>
      <div className="wf-bar">
        <span className="wf-live"><span className={`wf-live-dot ${playing ? "on" : ""}`} /> {playing ? "Replaying" : "Paused"}</span>
        <span className="wf-incident mono">#1 · HighLatencyP95 · orders-api POST /orders</span>
        <div className="wf-ctrl">
          {!reduced && (
            <button type="button" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
          )}
          <button type="button" onClick={restart} aria-label="Restart" title="Restart"><RestartIcon /></button>
        </div>
      </div>

      <ol className="wf-steps" style={{ "--wf-progress": progress } as React.CSSProperties}>
        {STAGES.map((s, i) => (
          <li key={s.id}>
            <button type="button" onClick={() => jump(i)} aria-current={i === stage ? "step" : undefined}
              className={`wf-step ${i < stage ? "done" : i === stage ? "active" : ""}`}>
              <span className="wf-node mono">{i < stage ? <CheckIcon /> : String(i + 1).padStart(2, "0")}</span>
              <span className="wf-step-label">{s.label}</span>
              <span className="wf-step-sub">{s.sub}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="wf-body">
        <div className="wf-console" aria-live="polite">
          <div className="wf-console-head mono"><i /><i /><i /> incidentlens · run #1</div>
          <ul className="wf-log mono">
            {log.map((l, i) => (
              <li key={i} className={`tone-${l.tone ?? "plain"}`}><span className="wf-t">{l.t || "·"}</span>{l.text}</li>
            ))}
            {stage < STAGES.length - 1 || shown < current.lines.length ? <li className="wf-caret" aria-hidden>▍</li> : null}
          </ul>
        </div>

        <div className="wf-panel" key={current.id}>
          {current.id === "alert" && (
            <div className="wf-card">
              <span className="wf-kicker">Incoming alert</span>
              <h4>p95 latency above 500 ms on orders-api POST /orders</h4>
              <dl className="wf-kv">
                <div><dt>severity</dt><dd><span className="badge st-failed">page</span></dd></div>
                <div><dt>firing since</dt><dd className="mono">12:59:03 UTC</dd></div>
                <div><dt>rule holds for</dt><dd className="mono">2m — onset is earlier</dd></div>
              </dl>
            </div>
          )}

          {current.id === "collect" && (
            <div className="wf-card">
              <span className="wf-kicker">Evidence window</span>
              <h4>Starts before the alert, so the onset is in view</h4>
              <div className="wf-window" aria-hidden>
                <span className="seg base">baseline</span><span className="seg onset">onset</span><span className="seg fire">firing</span>
              </div>
              <div className="wf-sources">
                <div><strong className="mono">16</strong><span>Prometheus queries</span></div>
                <div><strong className="mono">405</strong><span>matching warnings in Loki</span></div>
                <div><strong className="mono">0</strong><span>sources unreachable</span></div>
              </div>
            </div>
          )}

          {current.id === "baseline" && (
            <div className="wf-card">
              <span className="wf-kicker">Baseline → incident</span>
              <h4>What moved, and what did not</h4>
              <ul className="wf-contrast">
                {CONTRAST.map((c, i) => (
                  <li key={c.name} className={c.moved ? "moved" : "flat"} style={{ animationDelay: `${i * 120}ms` }}>
                    <div className="wf-c-name"><span>{c.name}</span><small>{c.sub}</small></div>
                    <div className="wf-c-bar"><i style={{ "--w": c.w } as React.CSSProperties} /></div>
                    <div className="wf-c-val mono"><span className="muted">{c.base} →</span> {c.now} <b>{c.ratio}</b></div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {current.id === "reason" && (
            <div className="wf-card">
              <span className="wf-kicker">Correlation</span>
              <h4>Separating the service that alerted from the one that broke</h4>
              <div className="wf-chain" aria-hidden>
                <span className="wf-svc warn">orders-api</span>
                <span className="wf-arrow">calls</span>
                <span className="wf-svc bad">inventory-service</span>
              </div>
              <ul className="wf-suspects">
                {SUSPECTS.map((s) => (
                  <li key={s.name} className={`tone-${s.tone}`}><span className="mono">{s.name}</span><span>{s.role}</span></li>
                ))}
              </ul>
            </div>
          )}

          {current.id === "report" && (
            <div className="wf-card wf-report">
              <div className="spread">
                <span className="wf-kicker">Probable cause</span>
                <span className="badge st-complete">high confidence</span>
              </div>
              <h4>inventory-service POST /reserve slowed to ~1 s, and orders-api waited on it</h4>
              <p className="muted small">
                Downstream latency moved first; orders-api&apos;s pool, the database and the cache stayed flat. orders-api is
                the symptom, not the cause.
              </p>
              <div className="wf-fix">
                <span className="wf-kicker">Suggested fix · not executed</span>
                <p>Find what changed on inventory-service&apos;s /reserve path and revert it. Confirm by p95 returning to ~5 ms.</p>
              </div>
              <Link href="/incidents/1" className="btn btn-primary btn-sm">Open the full investigation →</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayIcon() { return <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>; }
function PauseIcon() { return <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden><path d="M5 4h3v12H5zM12 4h3v12h-3z" fill="currentColor" /></svg>; }
function RestartIcon() {
  return <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden><path d="M4 9a6 6 0 1 1 2 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M4 4v5h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function CheckIcon() { return <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden><path d="M5 10.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
