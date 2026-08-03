from __future__ import annotations

import time
from typing import Optional

import httpx

from src.config import settings


class RateLimitExceeded(Exception):
    def __init__(self, model: str, retry_after: int = 60) -> None:
        self.model = model
        self.retry_after = retry_after
        super().__init__(f"Rate limit exceeded for model {model}")


class RateLimiterClient:
    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None

    async def start(self) -> None:
        self._client = httpx.AsyncClient(base_url=settings.rate_limiter_url, timeout=5.0)

    async def stop(self) -> None:
        if self._client:
            await self._client.aclose()

    async def check(self, model: str, user_id: Optional[str] = None) -> None:
        if not settings.enable_rate_limiting or not self._client:
            return

        params = {"model": model}
        if user_id:
            params["user_id"] = user_id

        try:
            resp = await self._client.get("/check", params=params)
            if resp.status_code == 429:
                data = resp.json()
                raise RateLimitExceeded(
                    model=model,
                    retry_after=data.get("retry_after", 60),
                )
        except httpx.RequestError:
            pass

    async def increment(self, model: str, user_id: Optional[str] = None) -> None:
        if not self._client:
            return

        try:
            await self._client.post("/increment", json={"model": model, "user_id": user_id})
        except httpx.RequestError:
            pass

    async def local_check(self, model: str, rpm_allowed: int) -> bool:
        from src.utils.cache import cache

        window = int(time.time() / 60)
        key = f"ratelimit:{model}:{window}"
        count = await cache.get(key)
        if count is None:
            await cache.set(key, 1, 60)
            return True
        if isinstance(count, int) and count >= rpm_allowed:
            return False
        await cache.increment(key)
        return True


rate_limiter = RateLimiterClient()
