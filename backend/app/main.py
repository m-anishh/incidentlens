import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import config
from app.api import incidents, webhook
from app.db import repo
from app.db.session import create_schema

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("incidentlens")


@asynccontextmanager
async def lifespan(app):
    await create_schema()
    swept = await repo.sweep_stranded_runs(config.RUN_TIMEOUT_S)
    if swept:
        log.warning("startup sweep marked %d stranded run(s) failed", swept)
    yield


app = FastAPI(title="IncidentLens", lifespan=lifespan)
app.include_router(webhook.router)
app.include_router(incidents.router)


@app.get("/healthz")
async def healthz():
    return {"ok": True}
