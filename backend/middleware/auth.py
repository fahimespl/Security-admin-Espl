"""
API Key authentication middleware for mutation endpoints.

Requires X-API-Key header to match BACKEND_API_KEY env var.
If BACKEND_API_KEY is not set (e.g. local dev without it), auth is skipped.
"""

import os
from fastapi import Request, HTTPException

BACKEND_API_KEY = os.getenv("BACKEND_API_KEY", "").strip()

async def require_api_key(request: Request):
    """Dependency to require API key for sensitive operations."""
    if not BACKEND_API_KEY:
        return  # Dev mode / no key set — skip auth

    key = request.headers.get("X-API-Key", "")
    if not key or key != BACKEND_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
