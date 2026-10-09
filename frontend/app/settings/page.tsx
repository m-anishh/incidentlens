import { ComingSoon, Principle } from "@/components/ComingSoon";
import { COMING_SOON, REMEDIATION_PRINCIPLE } from "@/lib/roadmap";

export default function Settings() {
  return (
    <main className="page">
      <div className="page-head">
        <h1>Settings</h1>
        <p className="muted small">
          Nothing here is editable yet. Configuration lives in the server&apos;s <code>.env</code> and the alert rules in{" "}
          <code>monitoring/prometheus/rules/</code>.
        </p>
      </div>

      <div className="settings">
        <section className="stack">
          <h2 className="settings-h">Notifications</h2>
          <ComingSoon {...COMING_SOON.notifications} />
        </section>
        <section className="stack">
          <h2 className="settings-h">Investigation</h2>
          <ComingSoon {...COMING_SOON.branching} />
          <ComingSoon {...COMING_SOON.memory} />
          <ComingSoon {...COMING_SOON.topology} />
        </section>
        <section className="stack">
          <h2 className="settings-h">Remediation</h2>
          <Principle>{REMEDIATION_PRINCIPLE}</Principle>
        </section>
      </div>
    </main>
  );
}
