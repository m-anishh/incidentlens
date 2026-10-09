export function time(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export function clock(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "";
  return duration((Date.now() - new Date(iso).getTime()) / 1000) + " ago";
}

export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60 ? `${s % 60}s` : ""}`.trim();
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.round((s % 86400) / 3600)}h`;
}

export function between(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from) return null;
  return ((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 1000;
}

export function labels(l: Record<string, string>): string {
  return Object.entries(l).map(([k, v]) => `${k}=${v}`).join(", ");
}

export function value(v: number, unit: string): string {
  if (unit === "s") return v < 10 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(1)}s`;
  if (unit === "ratio") return `${(v * 100).toFixed(1)}%`;
  if (unit === "bool") return v >= 0.5 ? "up" : "down";
  if (Math.abs(v) >= 100) return v.toFixed(0);
  return v.toFixed(2);
}

export function metricName(m: string): string {
  return m.replace(/_/g, " ");
}
