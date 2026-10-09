"""Alertmanager webhook payload (version 4).

Written against the documented format. Confirm against a captured payload
(build-order step 4) before trusting it — extra fields are allowed and kept,
since the raw body is stored verbatim anyway.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class AlertmanagerAlert(BaseModel):
    model_config = ConfigDict(extra="allow")

    status: Literal["firing", "resolved"]
    labels: dict[str, str]
    annotations: dict[str, str] = {}
    startsAt: datetime
    endsAt: datetime | None = None  # "0001-01-01T00:00:00Z" while firing
    generatorURL: str | None = None
    fingerprint: str


class AlertmanagerPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    version: str | None = None
    groupKey: str | None = None
    status: str | None = None  # the group's status, not any individual alert's
    receiver: str | None = None
    alerts: list[AlertmanagerAlert]
