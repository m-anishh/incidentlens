"use client";

import { useEffect, useState } from "react";

// Fetch `url` now and then every `intervalMs(data)` ms. The interval is a
// function so a page can poll fast while a run is in flight and slowly after.
export function usePoll<T>(url: string, intervalMs: (data: T | null) => number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let latest: T | null = null;

    async function tick() {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        latest = (await res.json()) as T;
        if (!cancelled) {
          setData(latest);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs(latest));
    }

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return { data, error };
}
