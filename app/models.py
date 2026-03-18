from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


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


class AISummaryOutcome(str, Enum):
    follow_up = "follow_up"
    info_sent = "info_sent"
    meeting_scheduled = "meeting_scheduled"
    not_now = "not_now"
    closed_no_action = "closed_no_action"


class AssistantMessageRole(str, Enum):
    user = "user"
    assistant = "assistant"
    tool = "tool"


class AssistantSnapshotType(str, Enum):
    manager_overview = "manager_overview"
    client_overview = "client_overview"
    portfolio_overview = "portfolio_overview"
    conversation_overview = "conversation_overview"
    recommendation_overview = "recommendation_overview"
    crm_overview = "crm_overview"


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
    ai_summary_text: Optional[str] = None
    ai_summary_generated_at: Optional[datetime] = None
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


class ConversationInsights(BaseModel):
    tone_label: Optional[str] = None
    urgency_label: Optional[str] = None
    responsiveness_pattern: Optional[str] = None
    client_response_avg_minutes: Optional[int] = None
    manager_response_avg_minutes: Optional[int] = None
    next_contact_due_at: Optional[datetime] = None
    next_contact_reason: Optional[str] = None
    preferred_follow_up_channel: Optional[ChannelType] = None
    preferred_follow_up_format: Optional[str] = None
    interest_tags: List[str] = Field(default_factory=list)
    objection_tags: List[str] = Field(default_factory=list)
    mentioned_product_codes: List[str] = Field(default_factory=list)
    action_hints: List[str] = Field(default_factory=list)


class Conversation(BaseModel):
    id: str
    client_id: str
    channel: ChannelType
    topic: str
    started_at: datetime
    messages: List[Message] = Field(default_factory=list)
    insights: Optional[ConversationInsights] = None


class DialogFactorBreakdown(BaseModel):
    t_wait: float
    c_value: float
    u_comm: float
    p_sale: float
    r_churn: float


class DialogRecommendation(BaseModel):
    client_id: str
    conversation_id: str
    client_name: str
    last_message_preview: str
    last_message_at: Optional[datetime] = None
    mini_summary: str
    priority_score: int
    priority_label: str
    why: List[str] = Field(default_factory=list)
    next_best_action: str
    factor_breakdown: DialogFactorBreakdown


class DialogFeedItem(DialogRecommendation):
    pass


class AISummaryDraft(BaseModel):
    contact_summary: str
    key_points: List[str] = Field(default_factory=list)
    outcome: AISummaryOutcome
    crm_note_draft: str
    follow_up_required: bool
    follow_up_date: Optional[datetime] = None
    follow_up_reason: Optional[str] = None
    data_gaps: List[str] = Field(default_factory=list)


class SalesScriptDraft(BaseModel):
    manager_talking_points: List[str] = Field(default_factory=list)
    ready_script: str
    channel: ChannelType


class SummarizeDialogRequest(BaseModel):
    client_id: str
    conversation_id: str
    manager_id: str = "m1"


class GenerateScriptRequest(BaseModel):
    client_id: str
    conversation_id: str
    manager_id: str = "m1"
    instruction: Optional[str] = None


class SummarizeDialogResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    draft: AISummaryDraft
    model_name: str
    generated_at: datetime


class GenerateScriptResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    draft: SalesScriptDraft
    model_name: str
    generated_at: datetime


class AssistantCitation(BaseModel):
    snapshot_id: str
    title: str
    snapshot_type: AssistantSnapshotType
    client_id: Optional[str] = None
    excerpt: Optional[str] = None


class AssistantThread(BaseModel):
    id: str
    manager_id: str
    title: str
    last_selected_client_id: Optional[str] = None
    memory_summary: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AssistantMessageActionPayload(BaseModel):
    action_type: str
    sales_script_draft: Optional[SalesScriptDraft] = None


class AssistantMessageRecord(BaseModel):
    id: str
    thread_id: str
    role: AssistantMessageRole
    content: str
    citations: List[AssistantCitation] = Field(default_factory=list)
    used_context: List[AssistantCitation] = Field(default_factory=list)
    action_payload: Optional[AssistantMessageActionPayload] = None
    created_at: datetime


class AssistantKBSnapshot(BaseModel):
    id: str
    manager_id: str
    client_id: Optional[str] = None
    snapshot_type: AssistantSnapshotType
    title: str
    content_text: str
    source_updated_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class AssistantLLMResponse(BaseModel):
    answer: str
    citations: List[str] = Field(default_factory=list)
    suggested_actions: List[str] = Field(default_factory=list)
    requires_client_context: bool = False
    action_type: Optional[str] = None


class AssistantActionResult(BaseModel):
    action_type: str
    client_id: Optional[str] = None
    conversation_id: Optional[str] = None
    draft: Optional[AISummaryDraft] = None
    sales_script_draft: Optional[SalesScriptDraft] = None
    note: Optional[str] = None


class AssistantThreadCreateRequest(BaseModel):
    manager_id: str = "m1"
    selected_client_id: Optional[str] = None
    title: Optional[str] = None


class AssistantThreadDetail(BaseModel):
    thread: AssistantThread
    messages: List[AssistantMessageRecord] = Field(default_factory=list)


class AssistantChatRequest(BaseModel):
    manager_id: str = "m1"
    thread_id: str
    message: str
    selected_client_id: Optional[str] = None


class AssistantChatResponse(BaseModel):
    thread: AssistantThread
    assistant_message: AssistantMessageRecord
    citations: List[AssistantCitation] = Field(default_factory=list)
    used_context: List[AssistantCitation] = Field(default_factory=list)
    action_result: Optional[AssistantActionResult] = None


class CRMNote(BaseModel):
    id: str
    client_id: str
    manager_id: str
    task_id: Optional[str] = None
    note_text: str
    outcome: str
    channel: Optional[ChannelType] = None
    follow_up_date: Optional[datetime] = None
    follow_up_reason: Optional[str] = None
    summary_text: Optional[str] = None
    source_conversation_id: Optional[str] = None
    ai_generated: bool = False
    ai_draft_payload: Optional[AISummaryDraft] = None
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


class ActivityLogEntry(BaseModel):
    id: str
    recommendation_type: str
    client_id: str
    conversation_id: Optional[str] = None
    manager_id: str
    action: str
    payload_excerpt: Optional[str] = None
    created_at: datetime


class CreateCRMNoteRequest(BaseModel):
    client_id: str
    manager_id: str = "m1"
    task_id: Optional[str] = None
    note_text: str
    outcome: str
    channel: Optional[ChannelType] = None
    follow_up_date: Optional[datetime] = None
    follow_up_reason: Optional[str] = None
    summary_text: Optional[str] = None
    source_conversation_id: Optional[str] = None
    ai_generated: bool = False
    ai_draft_payload: Optional[AISummaryDraft] = None


class FeedbackRequest(BaseModel):
    recommendation_id: str
    manager_id: str
    recommendation_type: str = "manual_review"
    decision: FeedbackDecision
    comment: Optional[str] = None
