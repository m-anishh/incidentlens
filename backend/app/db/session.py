from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app import config
from app.db.models import Base

engine = create_async_engine(config.DATABASE_URL, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

# Columns added after the first deploy. create_all never alters an existing
# table, so each addition is applied idempotently here. Move to Alembic before
# the first change that is not a plain ADD COLUMN.
_ADDED_COLUMNS = [
    "ALTER TABLE runs ADD COLUMN IF NOT EXISTS trace JSONB DEFAULT '[]'::jsonb",
    "ALTER TABLE runs ADD COLUMN IF NOT EXISTS model VARCHAR(200)",
]


async def create_schema():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in _ADDED_COLUMNS:
            await conn.execute(text(stmt))
