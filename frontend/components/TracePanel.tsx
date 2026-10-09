import type { TraceEvent } from "@/lib/types";
import { clock } from "@/lib/format";

const STEP_LABEL: Record<string, string> = {
  window: "Evidence window",
  prometheus: "Metrics · Prometheus",
  loki: "Logs · Loki",
  collecting: "Evidence gathered",
  baseline: "Baseline check",
  reasoning: "Reasoning",
  complete: "Report written",
  partial: "Report written (partial)",
  failed: "Failed",
  load: "Load",
  startup_sweep: "Startup sweep",
};

export type TraceRow = Omit<TraceEvent, "at" | "elapsed_ms"> & { at?: string; elapsed_ms?: number };

/** Ordered list of what an investigation did. Used on the landing page and
 *  as the centrepiece of incident detail. */
export function TracePanel({
  rows, title, meta, running, footer,
}: {
  rows: TraceRow[];
  title?: string;
  meta?: React.ReactNode;
  running?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <div className="trace">
      {(title || meta) && (
        <div className="trace-head">
          {title && <span className="trace-title">{title}</span>}
          {meta && <span className="trace-meta">{meta}</span>}
        </div>
      )}
      <ol className="trace-list">
        {rows.map((r, i) => (
          <li key={i} className={`trace-row lvl-${r.level}`}>
            <span className="trace-node" aria-hidden />
            <div className="trace-body">
              <div className="trace-line">
                <span className="trace-step">{STEP_LABEL[r.step] ?? r.step}</span>
                <span className="trace-time mono">
                  {r.ms !== undefined && <span>{fmtMs(r.ms)}</span>}
                  {r.at && <span className="faint">{clock(r.at)}</span>}
                </span>
              </div>
              <div className="trace-detail">{r.detail}</div>
            </div>
          </li>
        ))}
        {running && (
          <li className="trace-row lvl-running">
            <span className="trace-node" aria-hidden />
            <div className="trace-body"><span className="trace-step muted">working…</span></div>
          </li>
        )}
      </ol>
      {footer && <div className="trace-foot">{footer}</div>}
    </div>
  );
}

function fmtMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
