"use client";

import { useEffect, useState } from "react";

export function RotatingWord({ words, interval = 2600 }: { words: string[]; interval?: number }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % words.length), interval);
    return () => clearInterval(t);
  }, [words.length, interval]);

  return (
    <span className="rotating" aria-live="polite">
      {/* Longest word reserves the width so the line never reflows. */}
      <span className="rotating-sizer" aria-hidden>{words.reduce((a, b) => (b.length > a.length ? b : a))}</span>
      <span className="rotating-word" key={i}>{words[i]}</span>
    </span>
  );
}
