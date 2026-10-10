export function ComingSoon({ title, line, compact }: { title: string; line: string; compact?: boolean }) {
  return (
    <div className={`soon ${compact ? "soon-compact" : ""}`} aria-disabled="true">
      <span className="tag-soon">COMING SOON</span>
      <span className="soon-title">{title}</span>
      <p className="soon-line">{line}</p>
    </div>
  );
}

export function Principle({ children }: { children: React.ReactNode }) {
  return <div className="principle"><span className="principle-label">Product principle</span><p>{children}</p></div>;
}
