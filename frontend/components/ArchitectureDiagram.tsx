// Inline SVG: the alert path along the top, the log path and Grafana below.
// Solid arrows push data; dashed arrows are the agent's queries.

const W = 132, H = 56;
const top = 52, bottom = 210;
const xs = [16, 182, 348, 514, 680, 846];

function Node({ x, y, title, sub, brand }: { x: number; y: number; title: string; sub: string; brand?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={W} height={H} rx={8}
        fill={brand ? "rgba(46,127,224,0.12)" : "var(--raised)"}
        stroke={brand ? "var(--brand)" : "var(--line)"} strokeWidth={brand ? 1.5 : 1} />
      <text x={x + W / 2} y={y + 24} textAnchor="middle" className="arch-title">{title}</text>
      <text x={x + W / 2} y={y + 42} textAnchor="middle" className="arch-sub">{sub}</text>
    </g>
  );
}

export function ArchitectureDiagram() {
  const mid = top + H / 2;
  return (
    <div className="arch-wrap">
      <svg viewBox="0 0 994 300" className="arch" role="img"
        aria-label="Target system is scraped by Prometheus, which alerts through Alertmanager to IncidentLens. IncidentLens queries Prometheus and Loki, stores reports in Postgres, and the UI reads them. Alloy ships logs to Loki; Grafana reads Prometheus and Loki.">
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10z" fill="var(--muted)" />
          </marker>
          <marker id="arr-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10z" fill="var(--brand)" />
          </marker>
        </defs>

        {/* alert path */}
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1={xs[i] + W} y1={mid} x2={xs[i + 1] - 4} y2={mid} stroke="var(--muted)" strokeWidth={1.3} markerEnd="url(#arr)" />
        ))}
        <text x={(xs[0] + W + xs[1]) / 2} y={mid - 8} textAnchor="middle" className="arch-edge">scrape</text>
        <text x={(xs[1] + W + xs[2]) / 2} y={mid - 8} textAnchor="middle" className="arch-edge">rules</text>
        <text x={(xs[2] + W + xs[3]) / 2} y={mid - 8} textAnchor="middle" className="arch-edge">webhook</text>
        <text x={(xs[3] + W + xs[4]) / 2} y={mid - 8} textAnchor="middle" className="arch-edge">report</text>
        <text x={(xs[4] + W + xs[5]) / 2} y={mid - 8} textAnchor="middle" className="arch-edge">poll</text>

        {/* agent queries Prometheus (arc above) */}
        <path d={`M ${xs[3] + W / 2} ${top} C ${xs[3] + W / 2} ${top - 44}, ${xs[1] + W / 2} ${top - 44}, ${xs[1] + W / 2} ${top - 4}`}
          fill="none" stroke="var(--brand)" strokeWidth={1.3} strokeDasharray="5 4" markerEnd="url(#arr-b)" />
        <text x={(xs[1] + xs[3]) / 2 + W / 2} y={top - 30} textAnchor="middle" className="arch-edge brand">PromQL</text>

        {/* log path: Alloy tails the target's containers into Loki */}
        <path d={`M ${xs[0] + W / 2} ${top + H} L ${xs[0] + W / 2} ${bottom - 26} L ${xs[2] + W / 2} ${bottom - 26} L ${xs[2] + W / 2} ${bottom - 4}`}
          fill="none" stroke="var(--muted)" strokeWidth={1.3} markerEnd="url(#arr)" />
        <text x={xs[0] + W / 2 + 10} y={bottom - 34} className="arch-edge">Alloy tails container logs</text>

        {/* agent queries Loki */}
        <path d={`M ${xs[3] + W / 2} ${top + H} L ${xs[3] + W / 2} ${bottom + H / 2} L ${xs[2] + W + 4} ${bottom + H / 2}`}
          fill="none" stroke="var(--brand)" strokeWidth={1.3} strokeDasharray="5 4" markerEnd="url(#arr-b)" />
        <text x={xs[3] + W / 2 + 8} y={bottom + H / 2 - 8} className="arch-edge brand">LogQL</text>

        {/* Grafana reads Prometheus and Loki — for humans, not the agent */}
        <line x1={xs[1] + W / 2} y1={bottom} x2={xs[1] + W / 2} y2={top + H + 4} stroke="var(--faint)" strokeWidth={1.2} strokeDasharray="2 4" />
        <line x1={xs[1] + W} y1={bottom + H / 2} x2={xs[2]} y2={bottom + H / 2} stroke="var(--faint)" strokeWidth={1.2} strokeDasharray="2 4" />

        <Node x={xs[0]} y={top} title="Target system" sub="orders · inventory" />
        <Node x={xs[1]} y={top} title="Prometheus" sub="metrics" />
        <Node x={xs[2]} y={top} title="Alertmanager" sub="2 rules" />
        <Node x={xs[3]} y={top} title="IncidentLens" sub="agent + LLM" brand />
        <Node x={xs[4]} y={top} title="Postgres" sub="runs · reports" />
        <Node x={xs[5]} y={top} title="UI" sub="this site" />
        <Node x={xs[2]} y={bottom} title="Loki" sub="logs" />
        <Node x={xs[1]} y={bottom} title="Grafana" sub="for humans" />
      </svg>
    </div>
  );
}
