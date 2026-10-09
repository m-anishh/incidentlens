"use client";

// Isometric 3D architecture: CSS 3D boxes on a tilted floor, data paths drawn
// as wiring on the floor and animated in the direction data flows. Click a
// block to see what it does and what the agent asks of it.

import { useState } from "react";

type Id = "target" | "prom" | "am" | "grafana" | "loki" | "lens" | "ui" | "pg";
type Node = { id: Id; x: number; y: number; title: string; sub: string; brand?: boolean; tall?: boolean };

const W = 180, H = 100;
const NODES: Node[] = [
  { id: "target", x: 40, y: 40, title: "Target system", sub: "orders · inventory" },
  { id: "prom", x: 320, y: 40, title: "Prometheus", sub: "metrics" },
  { id: "am", x: 600, y: 40, title: "Alertmanager", sub: "2 alert rules" },
  { id: "grafana", x: 40, y: 280, title: "Grafana", sub: "for humans" },
  { id: "loki", x: 320, y: 280, title: "Loki", sub: "logs" },
  { id: "lens", x: 600, y: 280, title: "IncidentLens", sub: "agent + LLM", brand: true, tall: true },
  { id: "ui", x: 320, y: 520, title: "UI", sub: "this site" },
  { id: "pg", x: 600, y: 520, title: "Postgres", sub: "runs · reports" },
];

type Edge = { from: Id; to: Id; d: string; kind: "push" | "query" | "read"; label?: [number, number, string] };
const EDGES: Edge[] = [
  { from: "target", to: "prom", d: "M220 90 L320 90", kind: "push", label: [270, 80, "scrape"] },
  { from: "prom", to: "am", d: "M500 90 L600 90", kind: "push", label: [550, 80, "rules"] },
  { from: "am", to: "lens", d: "M690 140 L690 280", kind: "push", label: [702, 215, "webhook"] },
  { from: "lens", to: "pg", d: "M690 380 L690 520", kind: "push", label: [702, 455, "report"] },
  { from: "pg", to: "ui", d: "M600 570 L500 570", kind: "push", label: [550, 560, "poll"] },
  { from: "target", to: "loki", d: "M130 140 L130 230 L410 230 L410 280", kind: "push", label: [146, 222, "Alloy tails logs"] },
  { from: "lens", to: "loki", d: "M600 330 L500 330", kind: "query", label: [550, 320, "LogQL"] },
  { from: "lens", to: "prom", d: "M640 280 L640 190 L450 190 L450 140", kind: "query", label: [545, 182, "PromQL"] },
  { from: "grafana", to: "loki", d: "M220 330 L320 330", kind: "read" },
];

const INFO: Record<Id, { role: string; body: string; detail?: string }> = {
  target: {
    role: "The subject under observation",
    body: "orders-api and inventory-service, with Postgres and Redis behind them. Built to fail in four known ways. The agent never imports or reads its code.",
    detail: "GET /orders/{order_id} · GET /orders · POST /orders",
  },
  prom: {
    role: "Metrics store and alert rules",
    body: "Scrapes every service and both database exporters every 5 seconds. Fires when p95 latency passes 500ms or 5xx passes 5% on any route for two minutes.",
    detail: "histogram_quantile(0.95, sum by (service, route, le) (rate(http_request_duration_seconds_bucket[1m])))",
  },
  am: {
    role: "The only trigger",
    body: "Groups firing alerts and posts them to IncidentLens as a webhook, plus a resolved notification when the alert clears. No human starts an investigation.",
    detail: "POST /webhook/alertmanager",
  },
  grafana: {
    role: "Dashboards, for people",
    body: "Reads the same Prometheus and Loki data for a human looking along. The agent does not use it — its evidence comes straight from the sources.",
  },
  loki: {
    role: "Log store",
    body: "Alloy tails the target's containers and pushes their logs here. The agent counts warnings and errors by message, for the baseline and for the incident.",
    detail: 'sum by (service, msg) (count_over_time({level=~"warning|error"} | json [10m]))',
  },
  lens: {
    role: "The agent",
    body: "Deduplicates the alert by fingerprint, opens a window that starts before the alert, compares the incident with a healthy baseline, asks an LLM for a hypothesis, and records every step. It suggests fixes and never executes them.",
    detail: "window = [startsAt − for − baseline − margin, startsAt + margin]",
  },
  ui: {
    role: "This site",
    body: "Reads incidents, runs and traces from the agent. Read-only by design — it has no way to start an investigation or a replay.",
  },
  pg: {
    role: "The agent's own database",
    body: "Incidents, investigation runs, raw webhook payloads and per-alert notifications. A separate instance from the target's Postgres, so the investigator never shares a failure with what it observes.",
    detail: "incidents · runs · webhook_payloads · alert_notifications",
  },
};

const TITLE = Object.fromEntries(NODES.map((n) => [n.id, n.title])) as Record<Id, string>;

export function ArchitectureDiagram() {
  const [sel, setSel] = useState<Id>("lens");
  const linked = (e: Edge) => e.from === sel || e.to === sel;
  const neighbours = EDGES.filter(linked).map((e) => (e.from === sel ? e.to : e.from));
  const info = INFO[sel];

  return (
    <div className="iso-wrap">
      <div className="iso-stage">
        <div className="iso-plane">
          <svg className="iso-wires" viewBox="0 0 820 640" aria-hidden>
            <defs>
              <marker id="iso-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0 0 10 5 0 10z" fill="#7d8ea5" />
              </marker>
              <marker id="iso-arr-b" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0 0 10 5 0 10z" fill="#1f6feb" />
              </marker>
            </defs>
            {EDGES.map((e, i) => (
              <g key={i} className={linked(e) ? "edge on" : "edge off"}>
                <path d={e.d} className={`wire wire-${e.kind}`} />
                {e.kind !== "read" && (
                  <path d={e.d} className={`pulse pulse-${e.kind}`} markerEnd={e.kind === "query" ? "url(#iso-arr-b)" : "url(#iso-arr)"} />
                )}
                {e.label && (
                  <text x={e.label[0]} y={e.label[1]} className={`wire-label ${e.kind === "query" ? "brand" : ""}`}
                    textAnchor={e.label[2].length > 10 ? "start" : "middle"}>{e.label[2]}</text>
                )}
              </g>
            ))}
          </svg>

          {NODES.map((n) => {
            const state = n.id === sel ? "selected" : neighbours.includes(n.id) ? "linked" : "dim";
            return (
              <button key={n.id} type="button" onClick={() => setSel(n.id)} aria-pressed={n.id === sel}
                aria-label={`${n.title}: ${INFO[n.id].role}`}
                className={`block ${n.brand ? "block-brand" : ""} ${n.tall ? "block-tall" : ""} is-${state}`}
                style={{ left: n.x, top: n.y, width: W, height: H }}>
                <span className="face side-s" />
                <span className="face side-e" />
                <span className="face side-n" />
                <span className="face side-w" />
                <span className="face top">
                  <span className="block-title">{n.title}</span>
                  <span className="block-sub">{n.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="iso-panel" aria-live="polite">
        <span className="iso-panel-role">{info.role}</span>
        <h3>{TITLE[sel]}</h3>
        <p>{info.body}</p>
        {info.detail && <code className="iso-panel-code">{info.detail}</code>}
        {neighbours.length > 0 && (
          <div className="iso-panel-links">
            <span>Connected to</span>
            {neighbours.map((id) => (
              <button key={id} type="button" className="chip" onClick={() => setSel(id)}>{TITLE[id]}</button>
            ))}
          </div>
        )}
        <span className="iso-hint">Click any block</span>
      </aside>

      <ul className="iso-legend" aria-hidden>
        <li><i className="lg-push" /> data pushed</li>
        <li><i className="lg-query" /> the agent&apos;s queries</li>
        <li><i className="lg-read" /> read by humans</li>
      </ul>
    </div>
  );
}
