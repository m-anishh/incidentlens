import Link from "next/link";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { HeroTrace } from "@/components/HeroTrace";
import { RotatingWord } from "@/components/RotatingWord";
import { StatsStrip } from "@/components/StatsStrip";
import { RESULT_LABEL, SCENARIOS } from "@/lib/scenarios";
import { DOCS_URL, REPO_URL } from "@/lib/site";

const PROBLEMS = [
  ["Alert fatigue", "At 3am the page says “latency high on orders-api”. Then come the dashboards, checked one by one, while the cause sits in a service nobody opened yet."],
  ["Context switching", "Grafana, logs, kubectl, the runbook. Each is a tab, each tab switch costs the thread of the investigation."],
  ["Evidence, not assertion", "Most tools say what broke. Few say how they know. A conclusion without the numbers behind it is a guess with good formatting."],
];

const STEPS = [
  ["Alert fires", "Alertmanager posts a webhook. No human starts an investigation and the UI has no button for it — only real alerts open incidents."],
  ["Evidence gathered", "Metrics and logs over the incident window, plus a healthy baseline before it, so every number arrives with its normal value next to it."],
  ["Reasoning", "An LLM correlates the evidence across services and forms a hypothesis — separating the service that alerted from the one that caused it."],
  ["Report", "Probable cause, suggested fix, the evidence gaps it noticed, and the full trace of how it got there."],
];

export default function Landing() {
  return (
    <main className="landing">
      {/* 1 — hero */}
      <section className="hero wrap">
        <div className="hero-copy">
          <span className="pill"><span className="dot" /> Open source</span>
          <h1 className="hero-title">
            Your incidents deserve a better <RotatingWord words={["investigator", "first responder", "witness"]} />
          </h1>
          <p className="hero-sub">
            An AI agent that investigates production incidents, gathers evidence from metrics and logs, and explains what
            probably broke — showing every step it took to get there.
          </p>
          <div className="row hero-actions">
            <Link href="/incidents" className="btn btn-primary">Open dashboard</Link>
            <Link href="/#how-it-works" className="btn">How it works</Link>
          </div>
        </div>
        <HeroTrace />
      </section>

      {/* 2 — stats */}
      <StatsStrip />

      {/* 3 — problem */}
      <section className="section wrap" aria-labelledby="problem">
        <p className="eyebrow">The problem</p>
        <h2 id="problem" className="section-title">Diagnosis is the slow part of an outage</h2>
        <ol className="numbered three">
          {PROBLEMS.map(([title, body], i) => (
            <li key={title}>
              <span className="num mono">{String(i + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 4 — how it works */}
      <section id="how-it-works" className="section wrap" aria-labelledby="how">
        <p className="eyebrow">How it works</p>
        <h2 id="how" className="section-title">From alert to explained cause, without anyone pressing a button</h2>
        <ol className="numbered steps">
          {STEPS.map(([title, body], i) => (
            <li key={title}>
              <span className="num mono">{String(i + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 5 — scenarios */}
      <section id="scenarios" className="section wrap" aria-labelledby="scen">
        <p className="eyebrow">Scenarios</p>
        <div className="spread section-head">
          <h2 id="scen" className="section-title">Four failures with known answers</h2>
          <p className="muted section-aside">
            The target system is built to break in these four ways. Each has a correct conclusion, so the agent is graded,
            not admired. Results are marked only from recorded runs.
          </p>
        </div>
        <div className="scenarios">
          {SCENARIOS.map((s) => (
            <article key={s.n} className={`scenario res-${s.result}`}>
              <div className="spread">
                <span className="scenario-n mono">Scenario {s.n}</span>
                <span className={`badge st-${s.result}`}>{RESULT_LABEL[s.result]}</span>
              </div>
              <h3>{s.title}</h3>
              <dl className="scenario-dl">
                <dt>What breaks</dt><dd>{s.broken}</dd>
                <dt>Induced by</dt><dd className="mono">{s.induce}</dd>
                <dt>Correct conclusion</dt><dd>{s.expected}</dd>
                <dt>What the agent concluded</dt><dd className={s.result === "pending" ? "muted" : ""}>{s.observed}</dd>
              </dl>
            </article>
          ))}
        </div>
      </section>

      {/* 6 — architecture */}
      <section id="architecture" className="section wrap" aria-labelledby="arch">
        <p className="eyebrow">Architecture</p>
        <h2 id="arch" className="section-title">The agent learns about the system only the way an engineer would</h2>
        <p className="muted section-lead">
          It never imports the target&apos;s code. Everything it knows comes through Prometheus and Loki, over a time window
          that starts before the alert so the onset is in view. One Compose file runs it locally and on a single EC2 instance.
        </p>
        <ArchitectureDiagram />
      </section>

      {/* 7 — limits */}
      <section className="section wrap" aria-labelledby="limits">
        <div className="limits">
          <div>
            <p className="eyebrow">What it will not do</p>
            <h2 id="limits" className="section-title">It suggests. It never acts.</h2>
          </div>
          <div className="stack muted">
            <p>
              IncidentLens never restarts, scales, rolls back or edits anything. Automatic remediation is not on the roadmap —
              it is excluded on purpose. A wrong diagnosis that only suggests costs a minute; one that acts can cause the next
              outage.
            </p>
            <p>
              Its conclusions are hypotheses backed by evidence, not certainties. When evidence is missing or the baseline is
              unreliable, the report says so instead of reasoning quietly from half the picture.
            </p>
          </div>
        </div>
      </section>

      {/* 8 — footer */}
      <footer className="footer">
        <div className="wrap footer-inner">
          <div className="stack">
            <span className="wordmark-plain">IncidentLens</span>
            <p className="muted small">Built by Manish Bista.</p>
          </div>
          <nav className="footer-links" aria-label="Footer">
            <Link href="/incidents">Dashboard</Link>
            <Link href="/#scenarios">Scenarios</Link>
            <a href={DOCS_URL}>Docs</a>
            {REPO_URL && <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>}
          </nav>
          <p className="muted small footer-licence">
            Licence: not chosen yet — no LICENSE file in the repository, so the code is not open source until one is added.
          </p>
        </div>
      </footer>
    </main>
  );
}
