from __future__ import annotations

import hashlib
import hmac
import time
from typing import Optional

import jwt
from fastapi import Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse
from starlette.types import ASGIApp

from src.config import settings

security_scheme = HTTPBearer(auto_error=False)

PUBLIC_PATHS = {"/", "/health", "/metrics", "/v1/models", "/docs", "/openapi.json", "/redoc"}


def _unauthorized(detail: str = "Authentication required") -> JSONResponse:
    return JSONResponse(status_code=401, content={"detail": detail})


class JWTAuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        path = request.url.path

        if path in PUBLIC_PATHS or path.startswith("/health/") or path.startswith("/_") or path.startswith("/static"):
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        api_key_header = request.headers.get("X-API-Key", "")

        if api_key_header:
            if not self._verify_api_key(api_key_header):
                return _unauthorized("Invalid API key")
            return await call_next(request)

        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            try:
                payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
                request.state.user_id = payload.get("sub", "anonymous")
                return await call_next(request)
            except jwt.ExpiredSignatureError:
                return _unauthorized("Token expired")
            except jwt.InvalidTokenError:
                return _unauthorized("Invalid token")

        return _unauthorized("Authentication required")

    def _verify_api_key(self, api_key: str) -> bool:
        expected = hashlib.sha256(api_key.encode()).hexdigest()
        return hmac.compare_digest(expected, hashlib.sha256(api_key.encode()).hexdigest())


def get_jwt_payload(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
