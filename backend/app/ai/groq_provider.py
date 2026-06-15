"""Внешний ИИ-провайдер (Groq). Использует детерминированный слой как основу и
запасной режим: при отсутствии ключа или любой ошибке вызова возвращается
детерминированный результат, поэтому интерфейс остаётся работоспособным (NFR6).

Текущая зона LLM — переписывание черновика ответа клиенту в более живой текст
при сохранении смысла, обоснования и источников (структура и факты — из
детерминированного слоя, без домысливания, NFR4)."""

from __future__ import annotations

from typing import Any, Optional

from ..config import GROQ_API_KEY, GROQ_MODEL
from ..domain.context import first_name, has_pending_incoming
from .deterministic import DeterministicProvider


class GroqProvider(DeterministicProvider):
    name = "groq"

    def __init__(self) -> None:
        self._client = None
        if GROQ_API_KEY:
            try:
                from groq import Groq

                self._client = Groq(api_key=GROQ_API_KEY)
            except Exception:
                self._client = None

    def _complete(self, system: str, user: str) -> Optional[str]:
        if not self._client:
            return None
        try:
            resp = self._client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=0.4,
                max_tokens=320,
            )
            return resp.choices[0].message.content
        except Exception:
            return None

    def generate_reply(self, ctx: dict[str, Any]) -> dict[str, Any]:
        base = super().generate_reply(ctx)
        if not self._client:
            return base
        client = ctx["client"]
        insight = ctx.get("insight") or {}
        system = (
            "Ты — ассистент персонального менеджера премиального банка Alfa Only. "
            "Перепиши черновик ответа клиенту на русском: коротко, тепло, без давления, "
            "сохрани смысл и факты, не добавляй новых обещаний и цифр. Верни только текст ответа."
        )
        user = (
            f"Клиент: {first_name(ctx)}, риск-профиль {client.get('riskAppetite')}. "
            f"Непрочитанное обращение: {'да' if has_pending_incoming(ctx) else 'нет'}. "
            f"Темы: {', '.join(insight.get('topics', [])) or '—'}. "
            f"Ограничения: {', '.join(insight.get('constraints', [])) or '—'}.\n\n"
            f"Черновик: {base['text']}"
        )
        text = self._complete(system, user)
        if text and text.strip():
            return {**base, "text": text.strip()}
        return base
