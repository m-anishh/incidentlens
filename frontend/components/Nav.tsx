"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DOCS_URL, REPO_URL, isDashboard } from "@/lib/site";

const SITE_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#scenarios", label: "Scenarios" },
  { href: "/#architecture", label: "Architecture" },
  { href: DOCS_URL, label: "Docs" },
];

const APP_LINKS = [
  { href: "/incidents", label: "Incidents" },
  { href: "/evidence", label: "Evidence" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname() || "/";
  const inApp = isDashboard(path);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [path]);

  const links = inApp ? APP_LINKS : SITE_LINKS;
  const isActive = (href: string) => inApp && (path === href || path.startsWith(href + "/"));

  return (
    <header className={`nav ${scrolled ? "nav-scrolled" : ""}`}>
      <div className="nav-inner">
        <Link href="/" className="wordmark" aria-label="IncidentLens home">
          <Mark /> <span>Incident<span className="accent">Lens</span></span>
          {inApp && <span className="wordmark-section">dashboard</span>}
        </Link>

        <nav className="nav-links" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`nav-link ${isActive(l.href) ? "active" : ""}`}>{l.label}</Link>
          ))}
        </nav>

        <div className="nav-actions">
          {REPO_URL && (
            <a href={REPO_URL} className="nav-icon" aria-label="GitHub repository" target="_blank" rel="noreferrer">
              <GitHub />
            </a>
          )}
          {inApp
            ? <Link href="/" className="btn btn-sm nav-cta">Project site</Link>
            : <Link href="/incidents" className="btn btn-soft btn-sm nav-cta">Open dashboard</Link>}
          <button className="nav-toggle" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}
            onClick={() => setOpen(!open)}>
            <span /><span /><span />
          </button>
        </div>
      </div>

      {open && (
        <div className="nav-sheet" role="dialog" aria-label="Menu">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`sheet-link ${isActive(l.href) ? "active" : ""}`}>{l.label}</Link>
          ))}
          <div className="sheet-actions">
            {inApp
              ? <Link href="/" className="btn">Project site</Link>
              : <Link href="/incidents" className="btn btn-primary">Dashboard</Link>}
            {REPO_URL && <a href={REPO_URL} className="btn" target="_blank" rel="noreferrer"><GitHub /> GitHub</a>}
          </div>
        </div>
      )}
    </header>
  );
}

function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 20 20" aria-hidden>
      <circle cx="9" cy="9" r="6.5" fill="none" stroke="var(--brand)" strokeWidth="2" />
      <circle cx="9" cy="9" r="2" fill="var(--brand)" />
      <path d="M13.8 13.8 18 18" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function GitHub() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
