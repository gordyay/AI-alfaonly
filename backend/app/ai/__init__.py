"""Фабрика ИИ-провайдера. По умолчанию — детерминированный слой (без ключей,
воспроизводимо, NFR1/NFR6). При ALFA_AI_PROVIDER=groq подключается внешний
провайдер; при недоступности — откат на детерминированный (запасной режим NFR6)."""

from __future__ import annotations

from functools import lru_cache

from ..config import AI_PROVIDER
from .base import AIProvider
from .deterministic import DeterministicProvider


@lru_cache(maxsize=1)
def get_provider() -> AIProvider:
    if AI_PROVIDER == "groq":
        try:
            from .groq_provider import GroqProvider

            return GroqProvider()
        except Exception:
            return DeterministicProvider()
    return DeterministicProvider()
