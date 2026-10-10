// Public links. NEXT_PUBLIC_* values are inlined at build time
// (see .env.example and the ARG in Dockerfile).
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL || "";
// Empty when there is no repository to link to; the nav and footer then hide "Docs".
export const DOCS_URL = REPO_URL ? `${REPO_URL.replace(/\/$/, "")}/tree/main/docs` : "";
// Where "Get early access" goes: a form, a calendar link or a mailto:. Hidden when unset.
export const CONTACT_URL = process.env.NEXT_PUBLIC_CONTACT_URL || "";

export const DASHBOARD_PREFIXES = ["/incidents", "/evidence", "/settings"];
export const isDashboard = (path: string) => DASHBOARD_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
