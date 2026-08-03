from __future__ import annotations

import json
from typing import Any, Optional

import redis.asyncio as redis

from src.config import settings


class CacheClient:
    def __init__(self) -> None:
        self._pool: Optional[redis.Redis] = None

    async def connect(self) -> None:
        try:
            self._pool = redis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=2)
        except Exception:
            self._pool = None

    async def disconnect(self) -> None:
        if self._pool:
            await self._pool.aclose()

    async def get(self, key: str) -> Optional[Any]:
        if not self._pool:
            return None
        val = await self._pool.get(key)
        if val is None:
            return None
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return val

    async def set(self, key: str, value: Any, ttl_seconds: int = 300) -> None:
        if not self._pool:
            return
        serialized = json.dumps(value, default=str)
        await self._pool.setex(key, ttl_seconds, serialized)

    async def delete(self, key: str) -> None:
        if self._pool:
            await self._pool.delete(key)


cache = CacheClient()
