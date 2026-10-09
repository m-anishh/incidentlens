import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "IncidentLens",
  description: "AI incident investigation — suggestions only, never remediation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">IncidentLens</Link>
          <span className="muted">suggests fixes · never executes them</span>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
