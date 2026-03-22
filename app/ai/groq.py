from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from ..db import utc_now
from ..models import (
    AISummaryDraft,
    AssistantLLMResponse,
    GenerateScriptResponse,
    ObjectionAnalysis,
    ObjectionWorkflowDraft,
    SalesScriptDraft,
    SummarizeDialogResponse,
)
from .base import AIProvider, AIProviderError


@dataclass(frozen=True)
class GroqSettings:
    api_key: str | None
    model: str = "llama-3.1-8b-instant"
    fast_model: str = "llama-3.1-8b-instant"

    @classmethod
    def from_env(cls) -> "GroqSettings":
        return cls(
            api_key=os.getenv("GROQ_API_KEY"),
            model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
            fast_model=os.getenv("GROQ_FAST_MODEL", "llama-3.1-8b-instant"),
        )


class GroqProvider(AIProvider):
    def __init__(self, settings: GroqSettings) -> None:
        self.settings = settings

    @classmethod
    def from_env(cls) -> "GroqProvider":
        return cls(GroqSettings.from_env())

    def generate_script(self, context: dict[str, Any]) -> GenerateScriptResponse:
        if not self.settings.api_key:
            raise AIProviderError(
                "GROQ_API_KEY is not configured. Set it before starting the server, for example: export GROQ_API_KEY=..."
            )

        messages = self.build_script_messages(context)
        response_format = self.build_script_response_format()

        try:
            client = self._create_client()
            content, model_name = self._request_summary_content(
                client=client,
                messages=messages,
                response_format=response_format,
            )
            try:
                draft = self.parse_script_content(content)
            except AIProviderError:
                repaired_content, repair_model_name = self._repair_script_content(
                    client=client,
                    invalid_content=content,
                    response_format=response_format,
                )
                draft = self.parse_script_content(repaired_content)
                model_name = repair_model_name
        except AIProviderError:
            raise
        except Exception as exc:
            raise AIProviderError(self._build_friendly_provider_error(exc)) from exc

        return GenerateScriptResponse(
            draft=draft,
            model_name=model_name,
            generated_at=utc_now(),
        )

    def summarize_dialog(self, context: dict[str, Any]) -> SummarizeDialogResponse:
        if not self.settings.api_key:
            raise AIProviderError(
                "GROQ_API_KEY is not configured. Set it before starting the server, for example: export GROQ_API_KEY=..."
            )

        messages = self.build_summary_messages(context)
        response_format = self.build_summary_response_format()

        try:
            client = self._create_client()
            content, model_name = self._request_summary_content(
                client=client,
                messages=messages,
                response_format=response_format,
            )
            try:
                draft = self.parse_summary_content(content)
            except AIProviderError:
                repaired_content, repair_model_name = self._repair_summary_content(
                    client=client,
                    invalid_content=content,
                    response_format=response_format,
                )
                draft = self.parse_summary_content(repaired_content)
                model_name = repair_model_name
        except AIProviderError:
            raise
        except Exception as exc:
            raise AIProviderError(self._build_friendly_provider_error(exc)) from exc

        return SummarizeDialogResponse(
            draft=draft,
            model_name=model_name,
            generated_at=utc_now(),
        )

    def classify_objection(self, context: dict[str, Any]) -> ObjectionAnalysis:
        if not self.settings.api_key:
            raise AIProviderError(
                "GROQ_API_KEY is not configured. Set it before starting the server, for example: export GROQ_API_KEY=..."
            )

        messages = self.build_objection_messages(context)
        response_format = self.build_objection_response_format()

        try:
            client = self._create_client()
            content, _model_name = self._request_summary_content(
                client=client,
                messages=messages,
                response_format=response_format,
            )
            try:
                return self.parse_objection_content(content)
            except AIProviderError:
                repaired_content, _repair_model_name = self._repair_objection_content(
                    client=client,
                    invalid_content=content,
                    response_format=response_format,
                )
                return self.parse_objection_content(repaired_content)
        except AIProviderError:
            raise
        except Exception as exc:
            raise AIProviderError(self._build_friendly_provider_error(exc)) from exc

    def assistant_chat(self, context: dict[str, Any]) -> AssistantLLMResponse:
        if not self.settings.api_key:
            raise AIProviderError(
                "GROQ_API_KEY is not configured. Set it before starting the server, for example: export GROQ_API_KEY=..."
            )

        messages = self.build_assistant_messages(context)
        response_format = self.build_assistant_response_format()

        try:
            client = self._create_client()
            content, _model_name = self._request_summary_content(
                client=client,
                messages=messages,
                response_format=response_format,
            )
            try:
                return self.parse_assistant_content(content)
            except AIProviderError:
                repaired_content, _repair_model_name = self._repair_assistant_content(
                    client=client,
                    invalid_content=content,
                    response_format=response_format,
                )
                return self.parse_assistant_content(repaired_content)
        except AIProviderError:
            raise
        except Exception as exc:
            raise AIProviderError(self._build_friendly_provider_error(exc)) from exc

    @staticmethod
    def build_summary_messages(context: dict[str, Any]) -> list[dict[str, str]]:
        system_prompt = (
            "Ты помощник персонального менеджера Alfa Only. "
            "Сформируй только структурированный результат по переданному контексту. "
            "Не выдумывай факты, продукты, обещания, даты или договоренности. "
            "Если данных недостаточно, явно укажи это в data_gaps. "
            "Пиши на русском языке деловым стилем, пригодным для CRM. "
            "Верни только JSON без markdown и без дополнительных комментариев."
        )
        user_prompt = (
            "Сформируй summary контакта и черновик CRM-заметки строго по этому контексту.\n"
            "Если follow-up не нужен, верни follow_up_required=false и follow_up_date=null.\n"
            "Если follow-up нужен и дата из контекста не следует явно, оставь follow_up_date=null и укажи пробел в data_gaps.\n\n"
            "Формат JSON:\n"
            "{\n"
            '  "contact_summary": "string",\n'
            '  "key_points": ["string"],\n'
            '  "outcome": "follow_up | info_sent | meeting_scheduled | not_now | closed_no_action",\n'
            '  "crm_note_draft": "string",\n'
            '  "follow_up_required": true,\n'
            '  "follow_up_date": "ISO datetime or null",\n'
            '  "follow_up_reason": "string or null",\n'
            '  "data_gaps": ["string"]\n'
            "}\n\n"
            f"{json.dumps(context, ensure_ascii=False, indent=2)}"
        )
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    def build_summary_response_format(self) -> dict[str, Any] | None:
        if self._supports_json_schema(self.settings.model):
            return {
                "type": "json_schema",
                "json_schema": {
                    "name": "ai_summary_draft",
                    "strict": self._supports_strict_json_schema(self.settings.model),
                    "schema": AISummaryDraft.model_json_schema(),
                },
            }

        if self._supports_json_object(self.settings.model):
            return {"type": "json_object"}

        return {
            "type": "json_object",
        }

    def build_script_response_format(self) -> dict[str, Any] | None:
        if self._supports_json_schema(self.settings.model):
            return {
                "type": "json_schema",
                "json_schema": {
                    "name": "sales_script_draft",
                    "strict": self._supports_strict_json_schema(self.settings.model),
                    "schema": SalesScriptDraft.model_json_schema(),
                },
            }

        return {"type": "json_object"}

    def build_assistant_response_format(self) -> dict[str, Any] | None:
        if self._supports_json_schema(self.settings.model):
            return {
                "type": "json_schema",
                "json_schema": {
                    "name": "assistant_chat_response",
                    "strict": self._supports_strict_json_schema(self.settings.model),
                    "schema": AssistantLLMResponse.model_json_schema(),
                },
            }

        return {"type": "json_object"}

    def build_objection_response_format(self) -> dict[str, Any] | None:
        if self._supports_json_schema(self.settings.model):
            return {
                "type": "json_schema",
                "json_schema": {
                    "name": "objection_analysis",
                    "strict": self._supports_strict_json_schema(self.settings.model),
                    "schema": ObjectionAnalysis.model_json_schema(),
                },
            }

        return {"type": "json_object"}

    @staticmethod
    def build_repair_messages(invalid_content: str) -> list[dict[str, str]]:
        system_prompt = (
            "Ты исправляешь JSON-ответ другого ассистента для CRM-процесса Alfa Only. "
            "Верни только валидный JSON без markdown и комментариев. "
            "Нельзя добавлять новые факты, которых нет в исходном тексте."
        )
        user_prompt = (
            "Исправь этот JSON так, чтобы он соответствовал схеме:\n"
            "{\n"
            '  "contact_summary": "string",\n'
            '  "key_points": ["string"],\n'
            '  "outcome": "follow_up | info_sent | meeting_scheduled | not_now | closed_no_action",\n'
            '  "crm_note_draft": "string",\n'
            '  "follow_up_required": true,\n'
            '  "follow_up_date": "ISO datetime or null",\n'
            '  "follow_up_reason": "string or null",\n'
            '  "data_gaps": ["string"]\n'
            "}\n\n"
            "Исходный ответ модели:\n"
            f"{invalid_content[:6000]}"
        )
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    @staticmethod
    def build_assistant_messages(context: dict[str, Any]) -> list[dict[str, str]]:
        system_prompt = (
            "Ты внутренний AI-ассистент персонального менеджера Alfa Only. "
            "Отвечай только по переданному контексту и базе знаний. "
            "Не выдумывай факты, не придумывай клиентов, суммы, договоренности или продукты. "
            "Если данных не хватает, честно скажи об этом. "
            "Пиши на русском языке, кратко и по делу. "
            "Верни только JSON без markdown и дополнительных комментариев."
        )
        user_prompt = (
            "Сформируй ответ ассистента по этому контексту.\n\n"
            "Формат JSON:\n"
            "{\n"
            '  "answer": "string",\n'
            '  "citations": ["ctx1", "ctx2"],\n'
            '  "suggested_actions": ["string"],\n'
            '  "requires_client_context": false,\n'
            '  "action_type": "string or null"\n'
            "}\n\n"
            f"{json.dumps(context, ensure_ascii=False, indent=2)}"
        )
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    @staticmethod
    def build_script_messages(context: dict[str, Any]) -> list[dict[str, str]]:
        system_prompt = (
            "Ты помощник персонального менеджера Alfa Only. "
            "Подготовь sales script только по переданному контексту. "
            "Не выдумывай факты, цифры, обещания, договоренности, продукты или условия. "
            "Пиши на русском языке, деловым и персональным стилем, без агрессивного давления. "
            "Если есть сигнал avoid_pressure, делай мягкий тон. "
            "Если есть сигнал keep_message_short, делай короткий готовый текст. "
            "Если канал chat, верни готовое сообщение клиенту. "
            "Если канал call или meeting, верни короткий spoken-script или opener. "
            "Верни основной вариант, короткий follow-up, следующий шаг и минимум два альтернативных варианта. "
            "Верни только JSON без markdown и без дополнительных комментариев."
        )
        user_prompt = (
            "Подготовь sales script по этому контексту.\n\n"
            "Формат JSON:\n"
            "{\n"
            '  "manager_talking_points": ["string"],\n'
            '  "ready_script": "string",\n'
            '  "channel": "chat | call | meeting",\n'
            '  "contact_goal": "string or null",\n'
            '  "product_name": "string or null",\n'
            '  "tone": "string or null",\n'
            '  "follow_up_message": "string or null",\n'
            '  "next_step": "string or null",\n'
            '  "alternatives": [{"label": "string", "manager_talking_points": ["string"], "ready_script": "string"}]\n'
            "}\n\n"
            f"{json.dumps(context, ensure_ascii=False, indent=2)}"
        )
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    @staticmethod
    def build_objection_messages(context: dict[str, Any]) -> list[dict[str, str]]:
        system_prompt = (
            "Ты помогаешь персональному менеджеру Alfa Only классифицировать возражение клиента. "
            "Определи один доминирующий тип возражения только по переданному контексту. "
            "Не выдумывай факты и не смешивай несколько типов без необходимости. "
            "Верни только JSON."
        )
        user_prompt = (
            "Классифицируй возражение клиента.\n\n"
            "Формат JSON:\n"
            "{\n"
            '  "objection_type": "price | risk | timing | trust | complexity | no_need | other",\n'
            '  "objection_label": "string",\n'
            '  "confidence": 0.0,\n'
            '  "evidence": ["string"],\n'
            '  "customer_intent": "string or null"\n'
            "}\n\n"
            f"{json.dumps(context, ensure_ascii=False, indent=2)}"
        )
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    @staticmethod
    def build_assistant_repair_messages(invalid_content: str) -> list[dict[str, str]]:
        system_prompt = (
            "Ты исправляешь JSON-ответ AI-ассистента Alfa Only. "
            "Верни только валидный JSON без markdown и комментариев."
        )
        user_prompt = (
            "Исправь этот JSON так, чтобы он соответствовал схеме:\n"
            "{\n"
            '  "answer": "string",\n'
            '  "citations": ["ctx1"],\n'
            '  "suggested_actions": ["string"],\n'
            '  "requires_client_context": false,\n'
            '  "action_type": "string or null"\n'
            "}\n\n"
            "Исходный ответ модели:\n"
            f"{invalid_content[:6000]}"
        )
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    @staticmethod
    def build_script_repair_messages(invalid_content: str) -> list[dict[str, str]]:
        system_prompt = (
            "Ты исправляешь JSON-ответ AI для sales script в Alfa Only. "
            "Верни только валидный JSON без markdown и комментариев."
        )
        user_prompt = (
            "Исправь этот JSON так, чтобы он соответствовал схеме:\n"
            "{\n"
            '  "manager_talking_points": ["string"],\n'
            '  "ready_script": "string",\n'
            '  "channel": "chat | call | meeting",\n'
            '  "contact_goal": "string or null",\n'
            '  "product_name": "string or null",\n'
            '  "tone": "string or null",\n'
            '  "follow_up_message": "string or null",\n'
            '  "next_step": "string or null",\n'
            '  "alternatives": [{"label": "string", "manager_talking_points": ["string"], "ready_script": "string"}]\n'
            "}\n\n"
            "Исходный ответ модели:\n"
            f"{invalid_content[:6000]}"
        )
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    @staticmethod
    def build_objection_repair_messages(invalid_content: str) -> list[dict[str, str]]:
        system_prompt = (
            "Ты исправляешь JSON-ответ AI для objection classification в Alfa Only. "
            "Верни только валидный JSON без markdown и комментариев."
        )
        user_prompt = (
            "Исправь этот JSON так, чтобы он соответствовал схеме:\n"
            "{\n"
            '  "objection_type": "price | risk | timing | trust | complexity | no_need | other",\n'
            '  "objection_label": "string",\n'
            '  "confidence": 0.0,\n'
            '  "evidence": ["string"],\n'
            '  "customer_intent": "string or null"\n'
            "}\n\n"
            "Исходный ответ модели:\n"
            f"{invalid_content[:6000]}"
        )
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    @staticmethod
    def parse_summary_content(content: str) -> AISummaryDraft:
        try:
            payload = json.loads(content)
        except json.JSONDecodeError as exc:
            raise AIProviderError("Groq returned invalid JSON for summary draft.") from exc

        try:
            return AISummaryDraft.model_validate(payload)
        except ValidationError as exc:
            raise AIProviderError("Groq returned invalid structured summary payload.") from exc

    @staticmethod
    def parse_assistant_content(content: str) -> AssistantLLMResponse:
        try:
            payload = json.loads(content)
        except json.JSONDecodeError as exc:
            raise AIProviderError("Groq returned invalid JSON for assistant chat.") from exc

        try:
            return AssistantLLMResponse.model_validate(payload)
        except ValidationError as exc:
            raise AIProviderError("Groq returned invalid structured assistant payload.") from exc

    @staticmethod
    def parse_script_content(content: str) -> SalesScriptDraft:
        try:
            payload = json.loads(content)
        except json.JSONDecodeError as exc:
            raise AIProviderError("Groq returned invalid JSON for sales script.") from exc

        try:
            return SalesScriptDraft.model_validate(payload)
        except ValidationError as exc:
            raise AIProviderError("Groq returned invalid structured sales script payload.") from exc

    @staticmethod
    def parse_objection_content(content: str) -> ObjectionAnalysis:
        try:
            payload = json.loads(content)
        except json.JSONDecodeError as exc:
            raise AIProviderError("Groq returned invalid JSON for objection classification.") from exc

        try:
            return ObjectionAnalysis.model_validate(payload)
        except ValidationError as exc:
            raise AIProviderError("Groq returned invalid structured objection payload.") from exc

    @staticmethod
    def _extract_message_content(response: Any) -> str:
        try:
            message = response.choices[0].message
        except Exception as exc:
            raise AIProviderError("Groq response does not contain message content.") from exc

        parsed = getattr(message, "parsed", None)
        if parsed is not None:
            if isinstance(parsed, str) and parsed.strip():
                return parsed
            return json.dumps(parsed, ensure_ascii=False)

        content = getattr(message, "content", None)

        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text")
                    if text:
                        parts.append(text)
            content = "\n".join(parts)

        if not isinstance(content, str) or not content.strip():
            raise AIProviderError("Groq returned empty content for summary draft.")

        return content

    def _request_summary_content(
        self,
        client: Any,
        messages: list[dict[str, str]],
        response_format: dict[str, Any] | None,
    ) -> tuple[str, str]:
        request_payload = {
            "model": self.settings.model,
            "messages": messages,
            "temperature": 0.2,
        }
        if response_format is not None:
            request_payload["response_format"] = response_format
        response = client.chat.completions.create(**request_payload)
        return self._extract_message_content(response), getattr(response, "model", self.settings.model)

    def _repair_summary_content(
        self,
        client: Any,
        invalid_content: str,
        response_format: dict[str, Any] | None,
    ) -> tuple[str, str]:
        try:
            return self._request_summary_content(
                client=client,
                messages=self.build_repair_messages(invalid_content),
                response_format=response_format,
            )
        except Exception as exc:
            raise AIProviderError(
                "Модель вернула некорректный ответ, и автоматическое исправление не помогло. Попробуйте еще раз."
            ) from exc

    def _repair_assistant_content(
        self,
        client: Any,
        invalid_content: str,
        response_format: dict[str, Any] | None,
    ) -> tuple[str, str]:
        try:
            return self._request_summary_content(
                client=client,
                messages=self.build_assistant_repair_messages(invalid_content),
                response_format=response_format,
            )
        except Exception as exc:
            raise AIProviderError(
                "Ассистент получил некорректный ответ модели, и автоматическое исправление не помогло. Попробуйте еще раз."
            ) from exc

    def _repair_script_content(
        self,
        client: Any,
        invalid_content: str,
        response_format: dict[str, Any] | None,
    ) -> tuple[str, str]:
        try:
            return self._request_summary_content(
                client=client,
                messages=self.build_script_repair_messages(invalid_content),
                response_format=response_format,
            )
        except Exception as exc:
            raise AIProviderError(
                "Модель вернула некорректный sales script, и автоматическое исправление не помогло. Попробуйте еще раз."
            ) from exc

    def _repair_objection_content(
        self,
        client: Any,
        invalid_content: str,
        response_format: dict[str, Any] | None,
    ) -> tuple[str, str]:
        try:
            return self._request_summary_content(
                client=client,
                messages=self.build_objection_repair_messages(invalid_content),
                response_format=response_format,
            )
        except Exception as exc:
            raise AIProviderError(
                "Модель вернула некорректную классификацию возражения, и автоматическое исправление не помогло."
            ) from exc

    def _create_client(self) -> Any:
        try:
            from groq import Groq
        except ImportError as exc:
            raise AIProviderError("The 'groq' package is required for Groq integration.") from exc

        return Groq(
            api_key=self.settings.api_key,
            timeout=30.0,
        )

    @staticmethod
    def _build_friendly_provider_error(exc: Exception) -> str:
        raw_message = str(exc)
        if isinstance(exc, TimeoutError) or "timeout" in raw_message.lower():
            return "Сервис генерации временно не ответил. Попробуйте еще раз."
        if "invalid api key" in raw_message.lower() or "authentication" in raw_message.lower():
            return "Не удалось авторизоваться в Groq. Проверьте GROQ_API_KEY."
        return "Сервис генерации временно недоступен. Попробуйте еще раз."

    @staticmethod
    def _supports_strict_json_schema(model_name: str) -> bool:
        return model_name in {"openai/gpt-oss-20b", "openai/gpt-oss-120b"}

    @staticmethod
    def _supports_json_schema(model_name: str) -> bool:
        return model_name in {"openai/gpt-oss-20b", "openai/gpt-oss-120b"}

    @staticmethod
    def _supports_json_object(model_name: str) -> bool:
        return model_name in {
            "llama-3.1-8b-instant",
            "llama-3.3-70b-versatile",
            "openai/gpt-oss-20b",
            "openai/gpt-oss-120b",
        }
