"use client";

import Link from "next/link";
import { AlertState, StatusBadge } from "@/components/StatusBadge";
import { ago, time } from "@/lib/format";
import { TERMINAL, type IncidentListItem } from "@/lib/types";
import { usePoll } from "@/lib/usePoll";

export default function IncidentList() {
  const { data, error } = usePoll<IncidentListItem[]>("/api/incidents", (d) =>
    d?.some((i) => i.latest_run && !TERMINAL.includes(i.latest_run.status)) ? 3000 : 10000,
  );

  return (
    <>
      <h1>Incidents</h1>
      {error && <p className="error">Could not load incidents: {error}</p>}
      {data === null && !error && <p className="muted">Loading…</p>}
      {data?.length === 0 && (
        <p className="muted">No incidents yet. They appear here when Alertmanager fires.</p>
      )}
      {data && data.length > 0 && (
        <table className="list">
          <thead>
            <tr>
              <th>#</th>
              <th>Alert</th>
              <th>Service / route</th>
              <th>Alert state</th>
              <th>Investigation</th>
              <th>Summary</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {data.map((i) => (
              <tr key={i.id}>
                <td><Link href={`/incidents/${i.id}`}>{i.id}</Link></td>
                <td><Link href={`/incidents/${i.id}`}>{i.alertname}</Link></td>
                <td className="mono">
                  {i.service ?? "—"}
                  {i.labels.route ? ` ${i.labels.method ?? ""} ${i.labels.route}` : ""}
                </td>
                <td><AlertState open={i.open} /></td>
                <td>
                  <StatusBadge status={i.latest_run?.status ?? "none"} />
                  {i.latest_run?.weak_baseline && <span className="badge badge-warn" title="weak baseline">weak baseline</span>}
                </td>
                <td className="summary">{i.latest_run?.summary ?? <span className="muted">—</span>}</td>
                <td title={time(i.starts_at)}>{ago(i.starts_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
