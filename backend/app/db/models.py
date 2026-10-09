"""Four tables. See CLAUDE.md → Data model for why the split exists."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

RUN_STATUSES = ("received", "collecting", "reasoning", "complete", "partial", "failed")
TERMINAL_STATUSES = ("complete", "partial", "failed")


class Base(DeclarativeBase):
    pass


class Incident(Base):
    """One firing episode of an alert. Open means resolved_at IS NULL."""

    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64))
    alertname: Mapped[str] = mapped_column(String(200))
    service: Mapped[str | None] = mapped_column(String(200))
    severity: Mapped[str | None] = mapped_column(String(50))
    labels: Mapped[dict] = mapped_column(JSONB)
    annotations: Mapped[dict] = mapped_column(JSONB)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        # Two concurrent webhooks cannot both open an incident for one fingerprint.
        Index(
            "uq_incidents_open_fingerprint", "fingerprint",
            unique=True, postgresql_where=resolved_at.is_(None),
        ),
    )


class Run(Base):
    """One investigation attempt. Many per incident (replay adds runs)."""

    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id"), index=True)
    trigger: Mapped[str] = mapped_column(String(20))  # webhook | replay
    status: Mapped[str] = mapped_column(String(20), default="received", index=True)
    current_step: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    window_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    window_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    evidence: Mapped[dict | None] = mapped_column(JSONB)
    report: Mapped[dict | None] = mapped_column(JSONB)
    missing_sources: Mapped[list] = mapped_column(JSONB, default=list)
    weak_baseline: Mapped[bool] = mapped_column(Boolean, default=False)
    error: Mapped[dict | None] = mapped_column(JSONB)  # {"step": ..., "message": ...}
    trace: Mapped[list] = mapped_column(JSONB, default=list)  # ordered step events, for the UI
    model: Mapped[str | None] = mapped_column(String(200))   # "provider/model" that reasoned


class WebhookPayload(Base):
    """Every raw webhook body, verbatim, once."""

    __tablename__ = "webhook_payloads"

    id: Mapped[int] = mapped_column(primary_key=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    group_key: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(String(20))
    body: Mapped[dict] = mapped_column(JSONB)


class AlertNotification(Base):
    """One row per alert inside a payload. incident_id is NULL for a resolved
    notification that matched no open incident."""

    __tablename__ = "alert_notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    payload_id: Mapped[int] = mapped_column(ForeignKey("webhook_payloads.id"), index=True)
    incident_id: Mapped[int | None] = mapped_column(ForeignKey("incidents.id"), index=True)
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(20))
    alert: Mapped[dict] = mapped_column(JSONB)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
