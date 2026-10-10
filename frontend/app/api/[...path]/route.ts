// Read-only proxy to the agent API. GET only: the UI has no way to trigger an
// investigation or a replay, by design.
//
// Without a backend — BACKEND_URL unset, or set but unreachable — it serves
// recorded demo data (two real scenario-2 incidents) so the frontend runs on
// its own. GET /api/_mode tells the UI which one it is getting.

import incidents from "@/lib/demo/incidents.json";
import incident1 from "@/lib/demo/incident-1.json";
import incident2 from "@/lib/demo/incident-2.json";

export const dynamic = "force-dynamic";

const DETAILS: Record<string, unknown> = { "1": incident1, "2": incident2 };

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = new URL(req.url);
  const backend = process.env.BACKEND_URL;

  if (path[0] === "_mode") {
    return Response.json({ demo: !backend || !(await reachable(backend)) });
  }

  if (backend) {
    try {
      const res = await fetch(`${backend}/${path.map(encodeURIComponent).join("/")}${url.search}`, {
        cache: "no-store", signal: AbortSignal.timeout(5000),
      });
      return new Response(res.body, {
        status: res.status,
        headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
      });
    } catch {
      /* unreachable: fall through to demo data */
    }
  }
  return demo(path, url.searchParams);
}

async function reachable(backend: string) {
  try {
    return (await fetch(`${backend}/healthz`, { cache: "no-store", signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

type Item = { open: boolean };

function demo(path: string[], q: URLSearchParams) {
  if (path[0] !== "incidents") return Response.json({ detail: "not available in demo mode" }, { status: 404 });

  if (path.length === 1) {
    const state = q.get("state");
    const list = (incidents as Item[]).filter((i) => !state || (state === "open" ? i.open : !i.open));
    return Response.json(list);
  }
  if (path[1] === "stats") return Response.json({ detail: "not available in demo mode" }, { status: 404 });

  const detail = DETAILS[path[1]];
  return detail ? Response.json(detail) : Response.json({ detail: "incident not found" }, { status: 404 });
}
