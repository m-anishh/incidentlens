// Read-only proxy to the agent API. GET only: the UI has no way to trigger an
// investigation or a replay, by design.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const backend = process.env.BACKEND_URL ?? "http://localhost:8080";
  try {
    const res = await fetch(`${backend}/${path.map(encodeURIComponent).join("/")}`, { cache: "no-store" });
    return new Response(res.body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: "agent API unreachable" }, { status: 502 });
  }
}
