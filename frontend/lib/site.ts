// Public links. NEXT_PUBLIC_* values are inlined at build time
// (see the ARG in frontend/Dockerfile).
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL || "";
export const DOCS_URL = REPO_URL ? `${REPO_URL.replace(/\/$/, "")}/tree/main/docs` : "/#architecture";

export const DASHBOARD_PREFIXES = ["/incidents", "/evidence", "/settings"];
export const isDashboard = (path: string) => DASHBOARD_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
