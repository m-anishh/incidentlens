"use client";

import { useEffect, useState } from "react";
import { duration, median } from "@/lib/format";
import type { IncidentListItem } from "@/lib/types";

/** Only real numbers: two are facts about the product, one is measured. */
export function StatsStrip() {
  const [report, setReport] = useState<{ value: string; note: string }>({ value: "…", note: "reading from the API" });

  useEffect(() => {
    (async () => {
      try {
        const list: IncidentListItem[] = await (await fetch("/api/incidents?limit=200", { cache: "no-store" })).json();
        const times = list
          .map((i) => i.latest_run)
          .filter((r) => r && r.status === "complete" && r.finished_at)
          .map((r) => (new Date(r!.finished_at!).getTime() - new Date(r!.created_at).getTime()) / 1000);
        setReport(times.length
          ? { value: duration(median(times)), note: `median over ${times.length} completed run${times.length > 1 ? "s" : ""}` }
          : { value: "—", note: "no completed runs yet" });
      } catch {
        setReport({ value: "—", note: "agent unreachable" });
      }
    })();
  }, []);

  return (
    <section className="stats-strip" aria-label="Facts">
      <Stat value="2" label="Evidence sources" note="metrics from Prometheus, logs from Loki" />
      <Stat value="0" label="Actions taken on your systems" note="it suggests fixes, never executes them" />
      <Stat value={report.value} label="Time from alert to report" note={report.note} />
    </section>
  );
}

function Stat({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="stat">
      <div className="stat-value mono">{value}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}
