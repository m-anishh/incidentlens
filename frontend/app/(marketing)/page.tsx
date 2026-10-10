import Link from "next/link";
import { HeroTrace } from "@/components/marketing/HeroTrace";
import { LiveWorkflow } from "@/components/marketing/LiveWorkflow";
import { RotatingWord } from "@/components/marketing/RotatingWord";
import { ComingSoon } from "@/components/ui/ComingSoon";
import { StatsStrip } from "@/components/marketing/StatsStrip";
import { COMING_SOON } from "@/lib/roadmap";
import { USE_CASES } from "@/lib/use-cases";
import { CONTACT_URL, DOCS_URL, REPO_URL } from "@/lib/site";

const PROBLEMS = [
  ["The page names the symptom", "At 3am the page says “latency high on orders-api”. Then come the dashboards, checked one by one, while the cause sits in a service nobody opened yet."],
  ["Context is scattered across tools", "Grafana, logs, kubectl, the runbook. Each is a tab, each tab switch costs the thread of the investigation."],
  ["Conclusions arrive without proof", "Most tools say what broke. Few say how they know. A conclusion without the numbers behind it is a guess with good formatting."],
];

const STEPS = [
  ["Triggered by your alerts", "Alertmanager posts a webhook and the investigation starts on its own. Only real alerts open incidents — there is nothing to click."],
  ["Evidence measured against a baseline", "Metrics and logs over the incident window, plus a healthy baseline before it, so every number arrives with its normal value next to it."],
  ["Correlated across services", "An LLM correlates the evidence across services and forms a hypothesis — separating the service that alerted from the one that caused it."],
  ["Reported with its evidence", "Probable cause, suggested fix, the evidence gaps it noticed, and the full trace of how it got there."],
];

export default function Landing() {
  return (
    <main className="landing">
      {/* 1 — hero */}
      <div className="hero-band">
      <section className="hero wrap">
        <div className="hero-copy">
          <span className="pill"><span className="dot" /> Now in early access</span>
          <h1 className="hero-title">
            Your incidents deserve a better <RotatingWord words={["investigator.", "first responder.", "witness."]} />
          </h1>
          <p className="hero-sub">
            An AI agent that investigates production incidents, gathers evidence from metrics and logs, and explains what
            probably broke — showing every step it took to get there.
          </p>
          <div className="row hero-actions">
            <Link href="/incidents" className="btn btn-primary">Try the live demo</Link>
            {CONTACT_URL
              ? <a href={CONTACT_URL} className="btn">Get early access</a>
              : <Link href="/#how-it-works" className="btn">See how it works</Link>}
          </div>
          <p className="hero-stack">
            Works with Prometheus <i /> Loki <i /> Alertmanager <i /> Grafana
          </p>
        </div>
        <HeroTrace />
      </section>
      </div>

      {/* 2 — stats */}
      <div className="wrap"><StatsStrip /></div>

      {/* 3 — problem */}
      <section className="section wrap" aria-labelledby="problem">
        <p className="eyebrow">The problem</p>
        <h2 id="problem" className="section-title">Detection is solved. Diagnosis is what keeps outages long.</h2>
        <ol className="editorial">
          {PROBLEMS.map(([title, body], i) => (
            <li key={title}>
              <span className="big-num mono">{String(i + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 4 — how it works */}
      <section id="how-it-works" className="band" aria-labelledby="how">
        <div className="wrap">
        <p className="eyebrow">How it works</p>
        <h2 id="how" className="section-title">From alert to root-cause report, with no one pressing a button</h2>
        <ol className="timeline">
          {STEPS.map(([title, body], i) => (
            <li key={title}>
              <span className="step-dot mono">{String(i + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </li>
          ))}
        </ol>
        </div>
      </section>

      {/* 5 — use cases */}
      <section id="use-cases" className="section wrap" aria-labelledby="uses">
        <p className="eyebrow">Use cases</p>
        <div className="spread section-head">
          <h2 id="uses" className="section-title">Built for the incidents a single dashboard cannot explain</h2>
          <p className="muted section-aside">
            The service that pages you is often not the one that broke. IncidentLens is built to separate the symptom from
            the cause, and to show the numbers that tell them apart.
          </p>
        </div>
        <div className="scenarios">
          {USE_CASES.map((u, i) => (
            <article key={u.title} className="scenario">
              <span className="scenario-n mono">{String(i + 1).padStart(2, "0")}</span>
              <h3>{u.title}</h3>
              <p className="scenario-broken">{u.symptom}</p>
              <dl className="scenario-dl">
                <div><dt>What IncidentLens looks for</dt><dd>{u.finding}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      {/* 6 — live workflow */}
      <section id="workflow" className="band" aria-labelledby="wf">
        <div className="wrap">
        <p className="eyebrow">Live workflow</p>
        <div className="spread section-head">
          <h2 id="wf" className="section-title">Watch an investigation, from alert to root cause</h2>
          <p className="muted section-aside">
            A replay of a recorded investigation. orders-api paged; the cause was one service downstream. Click any stage
            to inspect it.
          </p>
        </div>
        <LiveWorkflow />
        <div className="wf-trust">
          <div><strong>Read-only</strong><span>Queries the Prometheus and Loki you already run. Nothing installed on your hosts.</span></div>
          <div><strong>Evidence first</strong><span>Every claim carries its baseline number, and the report lists what it could not see.</span></div>
          <div><strong>Self-hosted</strong><span>Runs in your own infrastructure. Your telemetry never leaves it.</span></div>
        </div>
        </div>
      </section>

      {/* roadmap — visible, dimmed, not working */}
      <section id="roadmap" className="section wrap" aria-labelledby="road">
        <p className="eyebrow">Roadmap</p>
        <h2 id="road" className="section-title">What&apos;s next</h2>
        <p className="muted section-lead">Coming soon. None of these ship today.</p>
        <div className="soon-grid">
          {Object.values(COMING_SOON).map((c) => <ComingSoon key={c.title} title={c.title} line={c.line} />)}
        </div>
      </section>

      {/* 7 — limits */}
      <section className="section wrap" aria-labelledby="limits">
        <div className="limits">
          <div>
            <p className="eyebrow">Human in the loop</p>
            <h2 id="limits" className="section-title">It recommends. Your team decides.</h2>
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
            <p className="muted small">AI incident investigation for teams on Prometheus and Loki.</p>
          </div>
          <nav className="footer-links" aria-label="Footer">
            <Link href="/incidents">Live demo</Link>
            <Link href="/#use-cases">Use cases</Link>
            {DOCS_URL && <a href={DOCS_URL}>Docs</a>}
            {REPO_URL && <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>}
          </nav>
          <p className="muted small footer-licence">© {new Date().getFullYear()} IncidentLens</p>
        </div>
      </footer>
    </main>
  );
}
