import type { RunStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: RunStatus | "none" }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export function AlertState({ open }: { open: boolean }) {
  return <span className={`badge ${open ? "badge-firing" : "badge-resolved"}`}>{open ? "firing" : "resolved"}</span>;
}
