"""Pydantic-схемы запросов (контроль корректности данных, отчёт Табл. 27).
Закрытые перечисления (Literal) и ограничения длины защищают целостность данных
и метрики (FR10). Ответы возвращаются как готовые словари доменного слоя."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Channel = Literal["chat", "call", "meeting"]


class ScriptRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=400)
    instruction: Optional[str] = Field(default=None, max_length=400)


class ObjectionRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class SendRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    managerId: str = "m1"


class FeedbackRequest(BaseModel):
    recommendationId: str = Field(min_length=1, max_length=200)
    decision: Literal["accepted", "edited", "rejected"]
    comment: str = Field(default="", max_length=2000)
    clientId: Optional[str] = None
    conversationId: Optional[str] = None
    label: str = Field(max_length=300)
    kind: Literal["manager_work_item", "next_best_action", "priority_recommendation", "crm_draft"] = "manager_work_item"
    managerId: str = "m1"


class NoteRequest(BaseModel):
    clientId: str = Field(min_length=1, max_length=64)
    taskId: Optional[str] = None
    text: str = Field(min_length=1, max_length=4000)
    outcome: Literal["follow_up", "pending", "resolved"] = "follow_up"
    channel: Channel
    nextContactIso: str
    managerId: str = "m1"
