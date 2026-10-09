from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app import config
from app.db.models import Base

engine = create_async_engine(config.DATABASE_URL, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def create_schema():
    # create_all is enough while the schema is young. Move to Alembic before
    # the first change that has to preserve existing rows.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
