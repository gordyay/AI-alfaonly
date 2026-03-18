from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from ..models import AssistantLLMResponse, GenerateScriptResponse, SummarizeDialogResponse


class AIProviderError(Exception):
    pass


class AIProvider(ABC):
    @abstractmethod
    def generate_script(self, context: dict[str, Any]) -> GenerateScriptResponse:
        raise NotImplementedError

    @abstractmethod
    def summarize_dialog(self, context: dict[str, Any]) -> SummarizeDialogResponse:
        raise NotImplementedError

    @abstractmethod
    def assistant_chat(self, context: dict[str, Any]) -> AssistantLLMResponse:
        raise NotImplementedError

    @abstractmethod
    def classify_objection(self, context: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError
