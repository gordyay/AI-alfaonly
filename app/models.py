from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class TaskStatus(str, Enum):
    new = "new"
    in_progress = "in_progress"
    done = "done"


class WorkItemType(str, Enum):
    task = "task"
    communication = "communication"
    opportunity = "opportunity"


class RecommendationStatus(str, Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    edited = "edited"


class GeneratedArtifactType(str, Enum):
    summary = "summary"
    crm_note = "crm_note"
    sales_script = "sales_script"
    objection_workflow = "objection_workflow"


class ChannelType(str, Enum):
    chat = "chat"
    call = "call"
    meeting = "meeting"
    email = "email"


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


class CRMNoteType(str, Enum):
    crm_summary = "crm_summary"
    outbound_reply = "outbound_reply"


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
    propensity_overview = "propensity_overview"


class ProductFitLabel(str, Enum):
    strong = "strong"
    medium = "medium"
    weak = "weak"


class ObjectionType(str, Enum):
    price = "price"
    risk = "risk"
    timing = "timing"
    trust = "trust"
    complexity = "complexity"
    no_need = "no_need"
    other = "other"


class ReplySource(str, Enum):
    manual = "manual"
    script = "script"
    objection = "objection"
    assistant = "assistant"


class AssistantScopeKind(str, Enum):
    case = "case"
    global_scope = "global"


class AssistantTaskKind(str, Enum):
    summary_crm = "summary_crm"
    sales_script = "sales_script"
    objection_workflow = "objection_workflow"
    reply_draft = "reply_draft"
    client_qa = "client_qa"
    general_qa = "general_qa"


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
    business_goal: Optional[str] = None
    source_system: str
    linked_conversation_id: Optional[str] = None
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


class WorkItemFactorBreakdown(BaseModel):
    urgency: float
    client_value: float
    engagement: float
    commercial_potential: float
    churn_risk: float
    ai_context: float


class WorkItem(BaseModel):
    id: str
    item_type: WorkItemType
    client_id: str
    client_name: str
    title: str
    summary: str
    priority_score: int
    priority_label: str
    why: List[str] = Field(default_factory=list)
    next_best_action: str
    expected_benefit: str
    factor_breakdown: WorkItemFactorBreakdown
    recommendation_id: str
    recommendation_status: RecommendationStatus = RecommendationStatus.pending
    recommendation_type: str = "manager_work_item"
    ai_context_note: Optional[str] = None
    due_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    channel: Optional[ChannelType] = None
    task_id: Optional[str] = None
    task_status: Optional[TaskStatus] = None
    task_type: Optional[str] = None
    business_goal: Optional[str] = None
    conversation_id: Optional[str] = None
    source_system: Optional[str] = None
    product_code: Optional[str] = None
    product_name: Optional[str] = None
    client_churn_risk: Optional[str] = None
    case_id: Optional[str] = None
    source_interaction_id: Optional[str] = None


class CockpitSection(BaseModel):
    id: str
    title: str
    subtitle: str
    item_type: WorkItemType
    items: List[WorkItem] = Field(default_factory=list)


class CockpitStats(BaseModel):
    actionable_items: int
    urgent_items: int
    due_today_items: int
    opportunity_items: int
    clients_in_focus: int


class ManagerCockpit(BaseModel):
    manager_id: str
    generated_at: datetime
    stats: CockpitStats
    focus_item: Optional[WorkItem] = None
    sections: List[CockpitSection] = Field(default_factory=list)
    work_queue: List[WorkItem] = Field(default_factory=list)


class CaseInteraction(BaseModel):
    id: str
    case_id: str
    client_id: str
    channel: ChannelType
    title: str
    started_at: datetime
    summary: str
    outcome: Optional[str] = None
    next_step: Optional[str] = None
    is_text_based: bool = False
    message_count: int = 0
    last_activity_at: Optional[datetime] = None
    messages: List[Message] = Field(default_factory=list)
    insights: Optional[ConversationInsights] = None


class CaseTimelineEvent(BaseModel):
    id: str
    case_id: str
    interaction_id: str
    channel: ChannelType
    event_type: str
    created_at: datetime
    title: str
    text: str
    sender: Optional[str] = None
    is_outbound: bool = False


class GeneratedArtifact(BaseModel):
    id: str
    artifact_type: GeneratedArtifactType
    client_id: str
    title: str
    summary: str
    created_at: datetime
    source_conversation_id: Optional[str] = None
    source_task_id: Optional[str] = None
    case_id: Optional[str] = None
    source_interaction_id: Optional[str] = None


class ProductPropensityFactors(BaseModel):
    product_fit: float
    affordability: float
    behavioral_signal: float
    relationship_depth: float
    portfolio_gap: float


class ProductPropensityItem(BaseModel):
    product_id: str
    product_name: str
    category: str
    score: int
    fit_label: ProductFitLabel
    reasons: List[str] = Field(default_factory=list)
    data_gaps: List[str] = Field(default_factory=list)
    next_best_action: str
    factors: ProductPropensityFactors
    already_holds: bool = False


class ProductPropensityResponse(BaseModel):
    client_id: str
    generated_at: datetime
    items: List[ProductPropensityItem] = Field(default_factory=list)


class ProductPlanCandidate(BaseModel):
    client_id: str
    client_name: str
    product_id: str
    product_name: str
    score: int
    fit_label: ProductFitLabel
    reasons: List[str] = Field(default_factory=list)
    next_best_action: str


class ProductPlanResponse(BaseModel):
    manager_id: str
    product_id: str
    generated_at: datetime
    items: List[ProductPlanCandidate] = Field(default_factory=list)


class AISummaryDraft(BaseModel):
    contact_summary: str
    key_points: List[str] = Field(default_factory=list)
    outcome: AISummaryOutcome
    crm_note_draft: str
    follow_up_required: bool
    follow_up_date: Optional[datetime] = None
    follow_up_reason: Optional[str] = None
    grounding_facts: List[str] = Field(default_factory=list)
    data_gaps: List[str] = Field(default_factory=list)


class SalesScriptVariant(BaseModel):
    label: str
    manager_talking_points: List[str] = Field(default_factory=list)
    ready_script: str
    style: Optional[str] = None
    tactic: Optional[str] = None


class SalesScriptDraft(BaseModel):
    manager_talking_points: List[str] = Field(default_factory=list)
    ready_script: str
    channel: ChannelType
    contact_goal: Optional[str] = None
    product_name: Optional[str] = None
    tone: Optional[str] = None
    follow_up_message: Optional[str] = None
    next_step: Optional[str] = None
    grounding_facts: List[str] = Field(default_factory=list)
    data_gaps: List[str] = Field(default_factory=list)
    alternatives: List[SalesScriptVariant] = Field(default_factory=list)


class ObjectionAnalysis(BaseModel):
    objection_type: ObjectionType
    objection_label: str
    confidence: float = 0.0
    evidence: List[str] = Field(default_factory=list)
    customer_intent: Optional[str] = None


class ObjectionHandlingOption(BaseModel):
    title: str
    response: str
    rationale: str
    style: Optional[str] = None
    tactic: Optional[str] = None


class ObjectionWorkflowDraft(BaseModel):
    analysis: ObjectionAnalysis
    handling_options: List[ObjectionHandlingOption] = Field(default_factory=list)
    what_not_to_say: List[str] = Field(default_factory=list)
    next_step: str
    grounding_facts: List[str] = Field(default_factory=list)
    data_gaps: List[str] = Field(default_factory=list)


class SummarizeDialogRequest(BaseModel):
    client_id: Optional[str] = None
    case_id: Optional[str] = None
    conversation_id: Optional[str] = None
    source_interaction_id: Optional[str] = None
    manager_id: str = "m1"
    recommendation_id: Optional[str] = None


class GenerateScriptRequest(BaseModel):
    client_id: Optional[str] = None
    case_id: Optional[str] = None
    conversation_id: Optional[str] = None
    source_interaction_id: Optional[str] = None
    manager_id: str = "m1"
    instruction: Optional[str] = None
    contact_goal: Optional[str] = None
    recommendation_id: Optional[str] = None


class ObjectionWorkflowRequest(BaseModel):
    client_id: Optional[str] = None
    case_id: Optional[str] = None
    conversation_id: Optional[str] = None
    source_interaction_id: Optional[str] = None
    manager_id: str = "m1"
    objection_text: Optional[str] = None
    recommendation_id: Optional[str] = None


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
    artifact_id: Optional[str] = None


class ObjectionWorkflowResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    draft: ObjectionWorkflowDraft
    model_name: str
    generated_at: datetime
    artifact_id: Optional[str] = None


class ScriptSelectionRequest(BaseModel):
    artifact_id: str
    manager_id: str = "m1"
    variant_label: str
    selected_text: Optional[str] = None


class ObjectionSelectionRequest(BaseModel):
    artifact_id: str
    manager_id: str = "m1"
    option_title: str
    selected_response: Optional[str] = None


class ScriptGenerationRecord(BaseModel):
    id: str
    client_id: str
    manager_id: str
    recommendation_id: Optional[str] = None
    conversation_id: Optional[str] = None
    case_id: Optional[str] = None
    source_interaction_id: Optional[str] = None
    contact_goal: Optional[str] = None
    selected_variant_label: Optional[str] = None
    selected_text: Optional[str] = None
    draft: SalesScriptDraft
    created_at: datetime
    selected_at: Optional[datetime] = None


class ObjectionWorkflowRecord(BaseModel):
    id: str
    client_id: str
    manager_id: str
    recommendation_id: Optional[str] = None
    conversation_id: Optional[str] = None
    case_id: Optional[str] = None
    source_interaction_id: Optional[str] = None
    selected_option_title: Optional[str] = None
    selected_response: Optional[str] = None
    draft: ObjectionWorkflowDraft
    created_at: datetime
    selected_at: Optional[datetime] = None


class CRMDraftRevision(BaseModel):
    id: str
    client_id: str
    manager_id: str
    recommendation_id: Optional[str] = None
    conversation_id: Optional[str] = None
    case_id: Optional[str] = None
    source_interaction_id: Optional[str] = None
    stage: str
    changed_fields: List[str] = Field(default_factory=list)
    draft: AISummaryDraft
    final_note_text: Optional[str] = None
    created_at: datetime


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
    scope_kind: AssistantScopeKind = AssistantScopeKind.global_scope
    client_id: Optional[str] = None
    work_item_id: Optional[str] = None
    interaction_id: Optional[str] = None
    task_kind: Optional[AssistantTaskKind] = None
    last_selected_client_id: Optional[str] = None
    memory_summary: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AssistantMessageActionPayload(BaseModel):
    action_type: str
    summary_draft: Optional[AISummaryDraft] = None
    sales_script_draft: Optional[SalesScriptDraft] = None
    objection_workflow_draft: Optional[ObjectionWorkflowDraft] = None
    reply_draft_text: Optional[str] = None


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
    task_kind: Optional[AssistantTaskKind] = None
    client_id: Optional[str] = None
    conversation_id: Optional[str] = None
    case_id: Optional[str] = None
    source_interaction_id: Optional[str] = None
    draft: Optional[AISummaryDraft] = None
    sales_script_draft: Optional[SalesScriptDraft] = None
    objection_workflow_draft: Optional[ObjectionWorkflowDraft] = None
    reply_draft_text: Optional[str] = None
    note: Optional[str] = None


class AssistantThreadCreateRequest(BaseModel):
    manager_id: str = "m1"
    scope_kind: AssistantScopeKind = AssistantScopeKind.global_scope
    client_id: Optional[str] = None
    work_item_id: Optional[str] = None
    interaction_id: Optional[str] = None
    task_kind: Optional[AssistantTaskKind] = None
    selected_client_id: Optional[str] = None
    title: Optional[str] = None


class AssistantThreadDetail(BaseModel):
    thread: AssistantThread
    messages: List[AssistantMessageRecord] = Field(default_factory=list)


class AssistantChatRequest(BaseModel):
    manager_id: str = "m1"
    thread_id: str
    task_kind: AssistantTaskKind = AssistantTaskKind.general_qa
    message: str
    selected_client_id: Optional[str] = None
    selected_work_item_id: Optional[str] = None
    selected_interaction_id: Optional[str] = None
    task_input: Optional[str] = None


class AssistantPreviewChoice(BaseModel):
    id: str
    title: str
    text: str
    helper_text: Optional[str] = None


class AssistantPreview(BaseModel):
    task_kind: AssistantTaskKind
    title: str
    summary: str
    target_tab: Optional[str] = None
    can_apply: bool = False
    requires_choice: bool = False
    choices: List[AssistantPreviewChoice] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)


class AssistantChatResponse(BaseModel):
    session: AssistantThread
    assistant_message: AssistantMessageRecord
    citations: List[AssistantCitation] = Field(default_factory=list)
    used_context: List[AssistantCitation] = Field(default_factory=list)
    preview: Optional[AssistantPreview] = None
    action_result: Optional[AssistantActionResult] = None


class AssistantApplyRequest(BaseModel):
    manager_id: str = "m1"
    thread_id: str
    task_kind: AssistantTaskKind
    selected_client_id: Optional[str] = None
    selected_work_item_id: Optional[str] = None
    selected_interaction_id: Optional[str] = None
    selected_choice: Optional[str] = None


class AssistantApplyResponse(BaseModel):
    session: AssistantThread
    applied: bool
    task_kind: AssistantTaskKind
    target_tab: Optional[str] = None
    message: str
    action_result: Optional[AssistantActionResult] = None


class CRMNote(BaseModel):
    id: str
    client_id: str
    manager_id: str
    task_id: Optional[str] = None
    recommendation_id: Optional[str] = None
    recommendation_decision: Optional[FeedbackDecision] = None
    decision_comment: Optional[str] = None
    note_text: str
    outcome: str
    channel: Optional[ChannelType] = None
    follow_up_date: Optional[datetime] = None
    follow_up_reason: Optional[str] = None
    summary_text: Optional[str] = None
    source_conversation_id: Optional[str] = None
    case_id: Optional[str] = None
    source_interaction_id: Optional[str] = None
    ai_generated: bool = False
    ai_draft_payload: Optional[AISummaryDraft] = None
    note_type: CRMNoteType = CRMNoteType.crm_summary
    outbound_message_text: Optional[str] = None
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
    client_id: Optional[str] = None
    conversation_id: Optional[str] = None
    case_id: Optional[str] = None
    source_interaction_id: Optional[str] = None
    decision: FeedbackDecision
    comment: Optional[str] = None
    selected_variant: Optional[str] = None
    created_at: datetime


class ActivityLogEntry(BaseModel):
    id: str
    recommendation_type: str
    client_id: str
    recommendation_id: Optional[str] = None
    conversation_id: Optional[str] = None
    case_id: Optional[str] = None
    source_interaction_id: Optional[str] = None
    manager_id: str
    action: str
    decision: Optional[str] = None
    payload_excerpt: Optional[str] = None
    context_snapshot: Optional[str] = None
    created_at: datetime


class CreateCRMNoteRequest(BaseModel):
    client_id: Optional[str] = None
    case_id: Optional[str] = None
    manager_id: str = "m1"
    task_id: Optional[str] = None
    recommendation_id: Optional[str] = None
    recommendation_decision: Optional[FeedbackDecision] = None
    decision_comment: Optional[str] = None
    note_text: str
    outcome: str
    channel: Optional[ChannelType] = None
    follow_up_date: Optional[datetime] = None
    follow_up_reason: Optional[str] = None
    summary_text: Optional[str] = None
    source_conversation_id: Optional[str] = None
    source_interaction_id: Optional[str] = None
    ai_generated: bool = False
    ai_draft_payload: Optional[AISummaryDraft] = None
    note_type: CRMNoteType = CRMNoteType.crm_summary
    outbound_message_text: Optional[str] = None


class ClientReplyRequest(BaseModel):
    client_id: Optional[str] = None
    case_id: Optional[str] = None
    conversation_id: Optional[str] = None
    source_interaction_id: Optional[str] = None
    manager_id: str = "m1"
    text: str
    recommendation_id: Optional[str] = None
    source: ReplySource = ReplySource.manual


class ClientReplyResponse(BaseModel):
    message: Message
    crm_note: CRMNote
    activity_log_entry: ActivityLogEntry


class FeedbackRequest(BaseModel):
    recommendation_id: str
    manager_id: str
    recommendation_type: str = "manual_review"
    client_id: Optional[str] = None
    conversation_id: Optional[str] = None
    case_id: Optional[str] = None
    source_interaction_id: Optional[str] = None
    decision: FeedbackDecision
    comment: Optional[str] = None
    selected_variant: Optional[str] = None


class CreateInteractionLogRequest(BaseModel):
    manager_id: str = "m1"
    case_id: Optional[str] = None
    client_id: Optional[str] = None
    source_interaction_id: Optional[str] = None
    channel: ChannelType
    title: str
    summary: str
    outcome: Optional[str] = None
    next_step: Optional[str] = None
    recommendation_id: Optional[str] = None


class CaseDetailResponse(BaseModel):
    client: Client
    case_id: str
    tasks: List[Task] = Field(default_factory=list)
    interactions: List[CaseInteraction] = Field(default_factory=list)
    timeline: List[CaseTimelineEvent] = Field(default_factory=list)
    selected_work_item_id: Optional[str] = None
    selected_interaction_id: Optional[str] = None
    work_items: List[WorkItem] = Field(default_factory=list)
    product_propensity: Optional[ProductPropensityResponse] = None
    objection_workflow: Optional[ObjectionWorkflowResponse] = None
    crm_notes: List[CRMNote] = Field(default_factory=list)
    follow_ups: List[FollowUp] = Field(default_factory=list)
    recommendation_feedback: List[RecommendationFeedback] = Field(default_factory=list)
    activity_log: List[ActivityLogEntry] = Field(default_factory=list)
    generated_artifacts: List[GeneratedArtifact] = Field(default_factory=list)
    saved_ai_draft: Optional[AISummaryDraft] = None
    script_history: List[ScriptGenerationRecord] = Field(default_factory=list)
    objection_history: List[ObjectionWorkflowRecord] = Field(default_factory=list)
    crm_draft_history: List[CRMDraftRevision] = Field(default_factory=list)


class SupervisorMetricCard(BaseModel):
    id: str
    label: str
    value: str
    helper_text: Optional[str] = None


class SupervisorDecisionBreakdown(BaseModel):
    recommendation_type: str
    total: int
    accepted: int
    edited: int
    rejected: int
    usage_rate: float


class SupervisorProductDistribution(BaseModel):
    product_code: str
    product_name: Optional[str] = None
    count: int


class SupervisorFunnelStage(BaseModel):
    id: str
    label: str
    count: int
    helper_text: Optional[str] = None


class SupervisorRecentDecision(BaseModel):
    recommendation_id: str
    recommendation_type: str
    manager_id: str
    client_id: Optional[str] = None
    conversation_id: Optional[str] = None
    decision: FeedbackDecision
    comment: Optional[str] = None
    selected_variant: Optional[str] = None
    created_at: datetime


class SupervisorDashboardResponse(BaseModel):
    manager_id: str
    generated_at: datetime
    cards: List[SupervisorMetricCard] = Field(default_factory=list)
    decision_breakdown: List[SupervisorDecisionBreakdown] = Field(default_factory=list)
    product_distribution: List[SupervisorProductDistribution] = Field(default_factory=list)
    recent_decisions: List[SupervisorRecentDecision] = Field(default_factory=list)
    completion_funnel: List[SupervisorFunnelStage] = Field(default_factory=list)
