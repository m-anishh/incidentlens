// Not built yet. Shown in the UI, dimmed, so the gap is visible rather than hidden.
export const COMING_SOON = {
  traces: { title: "Traces as a third evidence source", line: "OpenTelemetry spans from Tempo or Jaeger, so a slow request can be followed across services hop by hop." },
  kubernetes: { title: "Kubernetes pod investigation", line: "Restarts, OOM kills, pending pods and node pressure on k3s, read as evidence alongside metrics and logs." },
  notifications: { title: "Slack and Teams notifications", line: "Post the conclusion and a link to the trace into the incident channel when a run finishes." },
  topology: { title: "Service topology map", line: "A live graph of which service calls which, drawn from traffic, with the suspected cause highlighted." },
  memory: { title: "Memory of past investigations", line: "Recognise a failure it has seen before and say what the fix was last time." },
  branching: { title: "Branching multi-step investigation", line: "Look at what it found and decide where to look next, instead of asking the same queries every time." },
} as const;

export const REMEDIATION_PRINCIPLE =
  "Automatic remediation is not coming. IncidentLens suggests fixes and never executes them — by design, not by backlog.";
