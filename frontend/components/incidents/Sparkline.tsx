export function Sparkline({ points, width = 220, height = 44 }: { points: [number, number][]; width?: number; height?: number }) {
  if (points.length < 2) return <svg width={width} height={height} />;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => ((x - x0) / (x1 - x0 || 1)) * (width - 4) + 2;
  const sy = (y: number) => height - 2 - ((y - y0) / (y1 - y0 || 1)) * (height - 4);
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} className="sparkline" role="img" aria-label="onset time series">
      <path d={d} fill="none" strokeWidth={1.5} />
    </svg>
  );
}
