"use client";

import { useEffect, useState } from "react";
import { CONTACT_URL } from "@/lib/site";

/** Shown on dashboard pages when no agent backend is connected. */
export function DemoBanner() {
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    fetch("/api/_mode", { cache: "no-store" })
      .then((r) => r.json())
      .then((m) => setDemo(Boolean(m.demo)))
      .catch(() => setDemo(true));
  }, []);

  if (!demo) return null;
  return (
    <div className="demo-banner" role="status">
      <div className="demo-banner-inner">
        <span className="demo-dot" aria-hidden />
        <span>
          <strong>Live demo.</strong> You are looking at sample incidents recorded from a real investigation. Nothing
          here updates.
        </span>
        {CONTACT_URL && <a href={CONTACT_URL} className="demo-cta">Connect your stack →</a>}
      </div>
    </div>
  );
}
