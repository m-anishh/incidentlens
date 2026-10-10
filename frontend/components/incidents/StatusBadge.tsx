import type { Confidence, RunStatus } from "@/lib/types";

/** Investigation status of a run. Never used for alert state. */
export function RunBadge({ status }: { status: RunStatus | "none" }) {
  return <span className={`badge st-${status}`}>{status === "none" ? "no run" : status}</span>;
}

/** Whether the alert is still firing. Never used for investigation status. */
export function AlertBadge({ open }: { open: boolean }) {
  return <span className={`badge ${open ? "st-firing" : "st-resolved"}`}>{open ? "firing" : "resolved"}</span>;
}

export function WeakBaselineBadge() {
  return <span className="badge st-weak" title="The healthy period before the incident is unreliable">weak baseline</span>;
}

export function ConfidenceText({ confidence }: { confidence: Confidence | null | undefined }) {
  if (!confidence) return null;
  return <span className={`conf conf-${confidence}`}>{confidence} confidence</span>;
}
