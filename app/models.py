from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    new = "new"
    in_progress = "in_progress"
    done = "done"


class ChannelType(str, Enum):
    chat = "chat"
    call = "call"
    meeting = "meeting"


class FeedbackDecision(str, Enum):
    accepted = "accepted"
    rejected = "rejected"
    edited = "edited"


class Product(BaseModel):
    id: str
    name: str
    category: str
    risk_level: str
    margin_level: str
    currency: str


class ProductHolding(BaseModel):
    product_id: str
    name: str
    category: str
    status: str
    balance: float
    opened_at: datetime
    risk_level: str
    margin_level: str
    currency: str


class Client(BaseModel):
    id: str
    full_name: str
    segment: str = "Alfa Only"
    risk_profile: str
    manager_id: str
    age: int
    city: str
    preferred_channel: str
    family_status: str
    occupation: str
    income_band: str
    portfolio_value: float
    cash_balance: float
    churn_risk: str
    last_contact_at: Optional[datetime] = None
    next_contact_due_at: Optional[datetime] = None
    notes_summary: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    products: List[ProductHolding] = Field(default_factory=list)


class Task(BaseModel):
    id: str
    client_id: str
    title: str
    description: str
    status: TaskStatus
    due_at: datetime
    created_at: datetime
    channel: ChannelType
    priority_label: str = "unknown"
    task_type: str
    source_system: str
    product_code: Optional[str] = None


class Message(BaseModel):
    id: str
    conversation_id: str
    sender: str
    text: str
    created_at: datetime


class Conversation(BaseModel):
    id: str
    client_id: str
    channel: ChannelType
    topic: str
    started_at: datetime
    messages: List[Message] = Field(default_factory=list)


class CRMNote(BaseModel):
    id: str
    client_id: str
    manager_id: str
    task_id: Optional[str] = None
    note_text: str
    outcome: str
    channel: Optional[ChannelType] = None
    follow_up_date: Optional[datetime] = None
    created_at: datetime


class FollowUp(BaseModel):
    id: str
    client_id: str
    crm_note_id: str
    due_at: datetime
    reason: str
    completed: bool = False


class RecommendationFeedback(BaseModel):
    id: str
    recommendation_id: str
    manager_id: str
    recommendation_type: str = "manual_review"
    decision: FeedbackDecision
    comment: Optional[str] = None
    created_at: datetime


class CreateCRMNoteRequest(BaseModel):
    client_id: str
    manager_id: str = "m1"
    task_id: Optional[str] = None
    note_text: str
    outcome: str
    channel: Optional[ChannelType] = None
    follow_up_date: Optional[datetime] = None


class FeedbackRequest(BaseModel):
    recommendation_id: str
    manager_id: str
    recommendation_type: str = "manual_review"
    decision: FeedbackDecision
    comment: Optional[str] = None
