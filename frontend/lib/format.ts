export function time(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function labels(l: Record<string, string>): string {
  return Object.entries(l).map(([k, v]) => `${k}=${v}`).join(", ");
}

export function value(v: number, unit: string): string {
  if (unit === "s") return v < 10 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(1)}s`;
  if (unit === "ratio") return `${(v * 100).toFixed(1)}%`;
  if (unit === "bool") return v >= 0.5 ? "up" : "down";
  return `${v.toFixed(2)}`;
}
