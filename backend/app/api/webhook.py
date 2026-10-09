"""Alertmanager webhook — the only thing that creates an incident.

Accept, dedup, persist, hand off, return 200. Never investigates inline.
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import ValidationError

from app.api.schemas import AlertmanagerPayload
from app.db import repo
from app.investigation.pipeline import investigate

router = APIRouter()


@router.post("/webhook/alertmanager")
async def alertmanager_webhook(request: Request, background: BackgroundTasks):
    body = await request.json()
    try:
        payload = AlertmanagerPayload.model_validate(body)
    except ValidationError as e:
        raise HTTPException(422, f"not an Alertmanager webhook payload: {e.errors()[:3]}")

    run_ids = await repo.ingest_alertmanager_payload(body, payload.alerts)
    for run_id in run_ids:
        background.add_task(investigate, run_id)
    return {"alerts": len(payload.alerts), "investigations_started": run_ids}
