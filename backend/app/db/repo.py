"""Database operations. No HTTP, no LLM, no sequencing decisions."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.models import TERMINAL_STATUSES, AlertNotification, Incident, Run, WebhookPayload
from app.db.session import SessionLocal

log = logging.getLogger(__name__)


def utcnow():
    return datetime.now(timezone.utc)


# --- Webhook ingestion ----------------------------------------------------------

async def ingest_alertmanager_payload(body: dict, alerts: list) -> list[int]:
    """Store the payload and apply dedup per alert. Returns run ids to investigate.

    For each alert:
      1. resolved      → close the open incident (or log if there is none)
      2. open exists   → attach the notification only
      3. otherwise     → new incident + first run
    """
    new_runs: list[int] = []
    async with SessionLocal() as session, session.begin():
        payload = WebhookPayload(body=body, group_key=body.get("groupKey"), status=body.get("status"))
        session.add(payload)
        await session.flush()

        # raw: the alert exactly as Alertmanager sent it; alert: the validated view.
        for raw, alert in zip(body["alerts"], alerts):
            open_incident = await _open_incident(session, alert.fingerprint)

            if alert.status == "resolved":
                if open_incident is None:
                    log.warning("resolved alert with no open incident", extra={"fingerprint": alert.fingerprint})
                else:
                    open_incident.resolved_at = _resolved_time(alert)
                session.add(_notification(payload.id, open_incident, alert, raw))
                continue

            if open_incident is not None:
                session.add(_notification(payload.id, open_incident, alert, raw))
                continue

            # ON CONFLICT against the partial unique index: a concurrent webhook
            # that opened this incident first makes our insert a no-op.
            incident_id = await session.scalar(
                pg_insert(Incident)
                .values(
                    fingerprint=alert.fingerprint,
                    alertname=alert.labels.get("alertname", "unknown"),
                    service=alert.labels.get("service"),
                    severity=alert.labels.get("severity"),
                    labels=alert.labels,
                    annotations=alert.annotations,
                    starts_at=alert.startsAt,
                )
                .on_conflict_do_nothing(index_elements=["fingerprint"], index_where=Incident.resolved_at.is_(None))
                .returning(Incident.id)
            )
            if incident_id is None:
                existing = await _open_incident(session, alert.fingerprint)
                session.add(_notification(payload.id, existing, alert, raw))
                continue

            session.add(AlertNotification(
                payload_id=payload.id, incident_id=incident_id, fingerprint=alert.fingerprint,
                status=alert.status, alert=raw,
            ))
            run = Run(incident_id=incident_id, trigger="webhook", status="received")
            session.add(run)
            await session.flush()
            new_runs.append(run.id)

    return new_runs


async def _open_incident(session, fingerprint):
    return await session.scalar(
        select(Incident).where(Incident.fingerprint == fingerprint, Incident.resolved_at.is_(None))
    )


def _notification(payload_id, incident, alert, raw):
    return AlertNotification(
        payload_id=payload_id, incident_id=incident.id if incident else None,
        fingerprint=alert.fingerprint, status=alert.status, alert=raw,
    )


def _resolved_time(alert):
    # endsAt is the resolution time on resolved alerts; fall back to now if absent.
    if alert.endsAt and alert.endsAt.year > 1:
        return alert.endsAt
    return utcnow()


# --- Runs -----------------------------------------------------------------------

async def create_replay_run(incident_id: int) -> int | None:
    async with SessionLocal() as session, session.begin():
        if await session.get(Incident, incident_id) is None:
            return None
        run = Run(incident_id=incident_id, trigger="replay", status="received")
        session.add(run)
        await session.flush()
        return run.id


async def load_run_context(run_id: int):
    """The run, its incident, and the incident's first firing alert JSON —
    the original alert, which replay needs to rebuild the window."""
    async with SessionLocal() as session:
        run = await session.get(Run, run_id)
        incident = await session.get(Incident, run.incident_id)
        first_alert = await session.scalar(
            select(AlertNotification.alert)
            .where(AlertNotification.incident_id == incident.id, AlertNotification.status == "firing")
            .order_by(AlertNotification.id)
            .limit(1)
        )
        return run, incident, first_alert


async def update_run(run_id: int, **fields):
    async with SessionLocal() as session, session.begin():
        await session.execute(update(Run).where(Run.id == run_id).values(**fields))


async def fail_run(run_id: int, step: str | None, message: str):
    await update_run(
        run_id, status="failed", finished_at=utcnow(),
        error={"step": step, "message": message},
    )


async def sweep_stranded_runs(timeout_s: int) -> int:
    """Startup sweep. A run left non-terminal by a restart can never finish on
    its own; mark it failed. Touches runs only, never incidents."""
    cutoff = utcnow() - timedelta(seconds=timeout_s)
    async with SessionLocal() as session, session.begin():
        result = await session.execute(
            update(Run)
            .where(Run.status.not_in(TERMINAL_STATUSES), Run.created_at < cutoff)
            .values(
                status="failed", finished_at=utcnow(),
                error={"step": "startup_sweep", "message": "run stranded by a process restart"},
            )
        )
        return result.rowcount


# --- Reads for the API ------------------------------------------------------------

async def list_incidents(limit: int = 100):
    async with SessionLocal() as session:
        latest_run = (
            select(Run.incident_id, func.max(Run.id).label("run_id"))
            .group_by(Run.incident_id)
            .subquery()
        )
        rows = await session.execute(
            select(Incident, Run)
            .outerjoin(latest_run, latest_run.c.incident_id == Incident.id)
            .outerjoin(Run, Run.id == latest_run.c.run_id)
            .order_by(Incident.id.desc())
            .limit(limit)
        )
        return rows.all()


async def get_incident(incident_id: int):
    async with SessionLocal() as session:
        incident = await session.get(Incident, incident_id)
        if incident is None:
            return None, [], 0
        runs = (await session.scalars(
            select(Run).where(Run.incident_id == incident_id).order_by(Run.id.desc())
        )).all()
        notification_count = await session.scalar(
            select(func.count()).select_from(AlertNotification).where(AlertNotification.incident_id == incident_id)
        )
        return incident, runs, notification_count


async def get_run(run_id: int):
    async with SessionLocal() as session:
        return await session.get(Run, run_id)
