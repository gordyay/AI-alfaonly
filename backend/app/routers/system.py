"""Системные эндпоинты: проверка работоспособности."""

from __future__ import annotations

from fastapi import APIRouter

from ..ai import get_provider
from ..config import AI_PROVIDER

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "aiProvider": get_provider().name, "configured": AI_PROVIDER}
