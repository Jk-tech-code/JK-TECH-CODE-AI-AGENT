from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class RequestLog(Base):
    __tablename__ = "request_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    request_id = Column(String, nullable=False, index=True)
    model = Column(String, nullable=False)
    provider = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    latency_ms = Column(Integer, nullable=True)
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    cost = Column(Float, nullable=True)
    error = Column(Text, nullable=True)
    user_id = Column(String, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ModelMetrics(Base):
    __tablename__ = "model_metrics"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    model = Column(String, nullable=False, index=True)
    total_requests = Column(Integer, default=0)
    total_errors = Column(Integer, default=0)
    avg_latency_ms = Column(Float, nullable=True)
    p99_latency_ms = Column(Float, nullable=True)
    total_cost = Column(Float, default=0.0)
    window_start = Column(DateTime(timezone=True), nullable=False)
    window_end = Column(DateTime(timezone=True), nullable=False)


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    key_hash = Column(String, nullable=False, unique=True)
    label = Column(String, nullable=True)
    user_id = Column(String, nullable=False, index=True)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=True)


def init_db(dsn: str) -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(dsn, echo=False, pool_size=20, max_overflow=10)
    return async_sessionmaker(engine, expire_on_commit=False)


async def run_migrations(dsn: str) -> None:
    sync_dsn = dsn.replace("+asyncpg", "").replace("+psycopg2", "").replace("+aiosqlite", "")
    engine = create_engine(sync_dsn)
    Base.metadata.create_all(engine)
    engine.dispose()
