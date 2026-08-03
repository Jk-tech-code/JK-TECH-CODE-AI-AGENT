from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class GeneratedImage(Base):
    __tablename__ = "generated_images"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    request_id = Column(String, nullable=False, index=True)
    model_used = Column(String, nullable=False)
    prompt = Column(Text, nullable=False)
    task_type = Column(String, nullable=False)
    storage_path = Column(String, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    format = Column(String, default="png")
    file_size = Column(Integer, nullable=True)
    quality_score = Column(Float, nullable=True)
    safety_score = Column(Float, nullable=True)
    cost = Column(Float, default=0.0)
    user_id = Column(String, nullable=True, index=True)
    brand_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BrandProfile(Base):
    __tablename__ = "brand_profiles"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    user_id = Column(String, nullable=False, index=True)
    logo_url = Column(String, nullable=True)
    colors = Column(Text, nullable=True)
    typography = Column(Text, nullable=True)
    imagery_style = Column(String, nullable=True)
    icon_style = Column(String, nullable=True)
    layout_preferences = Column(Text, nullable=True)
    logo_placement = Column(String, default="bottom-right")
    brand_voice = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    key_hash = Column(String, nullable=False, unique=True)
    label = Column(String, nullable=True)
    user_id = Column(String, nullable=False, index=True)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


def init_db(dsn: str) -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(dsn, echo=False, pool_size=10, max_overflow=5)
    return async_sessionmaker(engine, expire_on_commit=False)


async def run_migrations(dsn: str) -> None:
    sync_dsn = dsn.replace("+asyncpg", "").replace("+psycopg2", "").replace("+aiosqlite", "")
    engine = create_engine(sync_dsn)
    Base.metadata.create_all(engine)
    engine.dispose()
