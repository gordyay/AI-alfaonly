"""Абстракция поставщика ИИ — аналог «LLM-шлюза» целевой архитектуры (§6.4).
Сервисы работают только с этим контрактом; замена реализации (детерминированный
слой ↔ изолированная LLM банка / внешний провайдер) не меняет API."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional


class AIProvider(ABC):
    name: str = "abstract"

    @abstractmethod
    def generate_reply(self, ctx: dict[str, Any]) -> dict[str, Any]:
        """Черновик ответа на входящее (UC-04): {text, rationale, sources}."""

    @abstractmethod
    def generate_script(
        self, ctx: dict[str, Any], goal: str, instruction: Optional[str] = None
    ) -> dict[str, Any]:
        """Персональный сценарий продаж (FR3/FR5)."""

    @abstractmethod
    def generate_objection(self, ctx: dict[str, Any], objection_text: str) -> dict[str, Any]:
        """Разбор возражения (FR4)."""

    @abstractmethod
    def generate_summary(self, ctx: dict[str, Any]) -> dict[str, Any]:
        """Сводка контакта + черновик CRM (FR6)."""

    @abstractmethod
    def answer_question(self, ctx: dict[str, Any], question: str) -> dict[str, Any]:
        """Ответ ассистента по кейсу на ограниченном контексте (FR9/NFR4)."""
