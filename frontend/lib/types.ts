// Shapes returned by the agent API (backend/app/api/incidents.py).

export type RunStatus = "received" | "collecting" | "reasoning" | "complete" | "partial" | "failed";
export const TERMINAL: RunStatus[] = ["complete", "partial", "failed"];

export interface Report {
  summary: string;
  probable_cause: string;
  cause_service: string;
  confidence: "low" | "medium" | "high";
  evidence: string[];
  reasoning: string;
  suggested_fix: string;
  evidence_gaps: string[];
}

export interface Contrast {
  metric: string;
  unit: string;
  labels: Record<string, string>;
  baseline_mean: number | null;
  incident_mean: number;
  incident_peak: number;
  ratio: number | null;
  summary: string;
}

export interface OnsetSeries {
  metric: string;
  unit: string;
  labels: Record<string, string>;
  points: [number, number][];
}

export interface LogPattern {
  service: string;
  level: string;
  msg: string;
  baseline_count: number;
  incident_count: number;
  samples: string[];
}

export interface Evidence {
  window: { start: string; onset_start: string; end: string } | null;
  contrast: Contrast[];
  onset: OnsetSeries[];
  logs: LogPattern[];
  baseline_quality: { weak: boolean; reasons: string[] };
  missing_sources: string[];
  query_errors: string[];
  findings: string[];
}

export interface RunSummary {
  id: number;
  incident_id: number;
  trigger: "webhook" | "replay";
  status: RunStatus;
  current_step: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  missing_sources: string[];
  weak_baseline: boolean;
  error: { step: string | null; message: string } | null;
  summary: string | null;
}

export interface Run extends RunSummary {
  window_start: string | null;
  window_end: string | null;
  evidence: Evidence | null;
  report: Report | null;
}

export interface Incident {
  id: number;
  fingerprint: string;
  alertname: string;
  service: string | null;
  severity: string | null;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  starts_at: string;
  created_at: string;
  resolved_at: string | null;
  open: boolean;
}

export interface IncidentListItem extends Incident {
  latest_run: RunSummary | null;
}

export interface IncidentDetail extends Incident {
  notification_count: number;
  runs: Run[];
}
