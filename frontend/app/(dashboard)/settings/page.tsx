import { ComingSoon, Principle } from "@/components/ui/ComingSoon";
import { COMING_SOON, REMEDIATION_PRINCIPLE } from "@/lib/roadmap";

export default function Settings() {
  return (
    <main className="page">
      <div className="page-head">
        <h1>Settings</h1>
        <p className="muted small">
          Read-only in this release. Data sources, alert rules and the model are configured when the agent is
          deployed.
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
          <h2 className="settings-h">Remediation policy</h2>
          <Principle>{REMEDIATION_PRINCIPLE}</Principle>
        </section>
      </div>
    </main>
  );
}
