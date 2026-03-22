export type SortMode = "priority" | "due_at";
export type AppMode = "inbox" | "case" | "analytics";
export type ViewTab = "overview" | "actions" | "crm" | "client";
export type WorkItemType = "task" | "communication" | "opportunity";
export type RecommendationStatus = "pending" | "accepted" | "rejected" | "edited";
export type AssistantRole = "user" | "assistant" | "tool";
export type ReplySource = "manual" | "script" | "objection" | "assistant";
export type AssistantMode = "case" | "global";
export type AssistantTaskKind =
  | "summary_crm"
  | "sales_script"
  | "objection_workflow"
  | "reply_draft"
  | "client_qa"
  | "general_qa";
export type AssistantStage = "launcher" | "preview" | "applied";

export interface WorkItemFactorBreakdown {
  urgency: number;
  client_value: number;
  engagement: number;
  commercial_potential: number;
  churn_risk: number;
  ai_context: number;
}

export interface WorkItem {
  id: string;
  item_type: WorkItemType;
  client_id: string;
  client_name: string;
  title: string;
  summary: string;
  priority_score: number;
  priority_label: string;
  why: string[];
  next_best_action: string;
  expected_benefit: string;
  factor_breakdown: WorkItemFactorBreakdown;
  recommendation_id: string;
  recommendation_status: RecommendationStatus;
  recommendation_type: string;
  ai_context_note?: string | null;
  due_at?: string | null;
  created_at?: string | null;
  channel?: string | null;
  task_id?: string | null;
  task_status?: string | null;
  task_type?: string | null;
  business_goal?: string | null;
  conversation_id?: string | null;
  source_system?: string | null;
  product_code?: string | null;
  product_name?: string | null;
  client_churn_risk?: string | null;
  case_id?: string | null;
  source_interaction_id?: string | null;
}

export interface CockpitSection {
  id: string;
  title: string;
  subtitle: string;
  item_type: WorkItemType;
  items: WorkItem[];
}

export interface CockpitStats {
  actionable_items: number;
  urgent_items: number;
  due_today_items: number;
  opportunity_items: number;
  clients_in_focus: number;
}

export interface ManagerCockpit {
  manager_id: string;
  generated_at: string;
  stats: CockpitStats;
  focus_item?: WorkItem | null;
  sections: CockpitSection[];
  work_queue: WorkItem[];
}

export interface ProductHolding {
  product_id: string;
  name: string;
  category: string;
  status: string;
  balance: number;
  opened_at: string;
  risk_level: string;
  margin_level: string;
  currency: string;
}

export interface Client {
  id: string;
  full_name: string;
  segment: string;
  risk_profile: string;
  manager_id: string;
  age: number;
  city: string;
  preferred_channel: string;
  family_status: string;
  occupation: string;
  income_band: string;
  portfolio_value: number;
  cash_balance: number;
  churn_risk: string;
  last_contact_at?: string | null;
  next_contact_due_at?: string | null;
  notes_summary?: string | null;
  ai_summary_text?: string | null;
  ai_summary_generated_at?: string | null;
  tags: string[];
  products: ProductHolding[];
}

export interface Message {
  id: string;
  conversation_id: string;
  sender: string;
  text: string;
  created_at: string;
}

export interface ConversationInsights {
  next_contact_due_at?: string | null;
  next_contact_reason?: string | null;
  preferred_follow_up_channel?: string | null;
  objection_tags: string[];
}

export interface Conversation {
  id: string;
  client_id: string;
  channel: string;
  topic: string;
  started_at: string;
  messages: Message[];
  insights?: ConversationInsights | null;
}

export interface CaseInteraction {
  id: string;
  case_id: string;
  client_id: string;
  channel: string;
  title: string;
  started_at: string;
  summary: string;
  outcome?: string | null;
  next_step?: string | null;
  is_text_based: boolean;
  message_count: number;
  last_activity_at?: string | null;
  messages: Message[];
  insights?: ConversationInsights | null;
}

export interface CaseTimelineEvent {
  id: string;
  case_id: string;
  interaction_id: string;
  channel: string;
  event_type: string;
  created_at: string;
  title: string;
  text: string;
  sender?: string | null;
  is_outbound: boolean;
}

export interface ProductPropensityFactors {
  product_fit: number;
  affordability: number;
  behavioral_signal: number;
  relationship_depth: number;
  portfolio_gap: number;
}

export interface ProductPropensityItem {
  product_id: string;
  product_name: string;
  category: string;
  score: number;
  fit_label: string;
  reasons: string[];
  data_gaps: string[];
  next_best_action: string;
  factors: ProductPropensityFactors;
  already_holds: boolean;
}

export interface ProductPropensityResponse {
  client_id: string;
  generated_at: string;
  items: ProductPropensityItem[];
}

export interface ObjectionAnalysis {
  objection_type: string;
  objection_label: string;
  confidence: number;
  evidence: string[];
  customer_intent?: string | null;
}

export interface ObjectionHandlingOption {
  title: string;
  response: string;
  rationale: string;
  style?: string | null;
  tactic?: string | null;
}

export interface ObjectionWorkflowDraft {
  analysis: ObjectionAnalysis;
  handling_options: ObjectionHandlingOption[];
  what_not_to_say: string[];
  next_step: string;
  grounding_facts: string[];
  data_gaps: string[];
}

export interface ObjectionWorkflowResponse {
  draft: ObjectionWorkflowDraft;
  model_name: string;
  generated_at: string;
  artifact_id?: string | null;
}

export type AISummaryOutcome =
  | "follow_up"
  | "info_sent"
  | "meeting_scheduled"
  | "not_now"
  | "closed_no_action";

export interface AISummaryDraft {
  contact_summary: string;
  key_points: string[];
  outcome: AISummaryOutcome;
  crm_note_draft: string;
  follow_up_required: boolean;
  follow_up_date?: string | null;
  follow_up_reason?: string | null;
  grounding_facts: string[];
  data_gaps: string[];
}

export interface SummarizeDialogResponse {
  draft: AISummaryDraft;
  model_name: string;
  generated_at: string;
}

export interface SalesScriptVariant {
  label: string;
  manager_talking_points: string[];
  ready_script: string;
  style?: string | null;
  tactic?: string | null;
}

export interface SalesScriptDraft {
  manager_talking_points: string[];
  ready_script: string;
  channel: string;
  contact_goal?: string | null;
  product_name?: string | null;
  tone?: string | null;
  follow_up_message?: string | null;
  next_step?: string | null;
  grounding_facts: string[];
  data_gaps: string[];
  alternatives: SalesScriptVariant[];
}

export interface GenerateScriptResponse {
  draft: SalesScriptDraft;
  model_name: string;
  generated_at: string;
  artifact_id?: string | null;
}

export interface ScriptGenerationRecord {
  id: string;
  client_id: string;
  manager_id: string;
  recommendation_id?: string | null;
  conversation_id?: string | null;
  case_id?: string | null;
  source_interaction_id?: string | null;
  contact_goal?: string | null;
  selected_variant_label?: string | null;
  selected_text?: string | null;
  draft: SalesScriptDraft;
  created_at: string;
  selected_at?: string | null;
}

export interface ObjectionWorkflowRecord {
  id: string;
  client_id: string;
  manager_id: string;
  recommendation_id?: string | null;
  conversation_id?: string | null;
  case_id?: string | null;
  source_interaction_id?: string | null;
  selected_option_title?: string | null;
  selected_response?: string | null;
  draft: ObjectionWorkflowDraft;
  created_at: string;
  selected_at?: string | null;
}

export interface CRMDraftRevision {
  id: string;
  client_id: string;
  manager_id: string;
  recommendation_id?: string | null;
  conversation_id?: string | null;
  case_id?: string | null;
  source_interaction_id?: string | null;
  stage: string;
  changed_fields: string[];
  draft: AISummaryDraft;
  final_note_text?: string | null;
  created_at: string;
}

export interface AssistantCitation {
  snapshot_id: string;
  title: string;
  snapshot_type: string;
  client_id?: string | null;
  excerpt?: string | null;
}

export interface AssistantMessageActionPayload {
  action_type: string;
  summary_draft?: AISummaryDraft | null;
  sales_script_draft?: SalesScriptDraft | null;
  objection_workflow_draft?: ObjectionWorkflowDraft | null;
  reply_draft_text?: string | null;
}

export interface AssistantMessageRecord {
  id: string;
  thread_id: string;
  role: AssistantRole;
  content: string;
  citations: AssistantCitation[];
  used_context: AssistantCitation[];
  action_payload?: AssistantMessageActionPayload | null;
  created_at: string;
}

export interface AssistantThread {
  id: string;
  manager_id: string;
  title: string;
  scope_kind?: AssistantMode;
  client_id?: string | null;
  work_item_id?: string | null;
  interaction_id?: string | null;
  task_kind?: AssistantTaskKind | null;
  last_selected_client_id?: string | null;
  memory_summary?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssistantThreadDetail {
  thread: AssistantThread;
  messages: AssistantMessageRecord[];
}

export interface AssistantActionResult {
  action_type: string;
  task_kind?: AssistantTaskKind | null;
  client_id?: string | null;
  conversation_id?: string | null;
  case_id?: string | null;
  source_interaction_id?: string | null;
  draft?: AISummaryDraft | null;
  sales_script_draft?: SalesScriptDraft | null;
  objection_workflow_draft?: ObjectionWorkflowDraft | null;
  reply_draft_text?: string | null;
  note?: string | null;
}

export interface AssistantPreviewChoice {
  id: string;
  title: string;
  text: string;
  helper_text?: string | null;
}

export interface AssistantPreview {
  task_kind: AssistantTaskKind;
  title: string;
  summary: string;
  target_tab?: ViewTab | null;
  can_apply: boolean;
  requires_choice: boolean;
  choices: AssistantPreviewChoice[];
  payload: Record<string, unknown>;
}

export interface AssistantChatResponse {
  session: AssistantThread;
  assistant_message: AssistantMessageRecord;
  citations: AssistantCitation[];
  used_context: AssistantCitation[];
  preview?: AssistantPreview | null;
  action_result?: AssistantActionResult | null;
}

export interface AssistantApplyResponse {
  session: AssistantThread;
  applied: boolean;
  task_kind: AssistantTaskKind;
  target_tab?: ViewTab | null;
  message: string;
  action_result?: AssistantActionResult | null;
}

export interface CRMNote {
  id: string;
  client_id: string;
  manager_id: string;
  task_id?: string | null;
  recommendation_id?: string | null;
  recommendation_decision?: RecommendationStatus | null;
  decision_comment?: string | null;
  note_text: string;
  outcome: string;
  channel?: string | null;
  follow_up_date?: string | null;
  follow_up_reason?: string | null;
  summary_text?: string | null;
  source_conversation_id?: string | null;
  case_id?: string | null;
  source_interaction_id?: string | null;
  ai_generated: boolean;
  ai_draft_payload?: AISummaryDraft | null;
  note_type?: "crm_summary" | "outbound_reply";
  outbound_message_text?: string | null;
  created_at: string;
}

export interface ClientReplyResponse {
  message: Message;
  crm_note: CRMNote;
  activity_log_entry: ActivityLogEntry;
}

export interface GeneratedArtifact {
  id: string;
  artifact_type: string;
  client_id: string;
  title: string;
  summary: string;
  created_at: string;
  source_conversation_id?: string | null;
  source_task_id?: string | null;
  case_id?: string | null;
  source_interaction_id?: string | null;
}

export interface RecommendationFeedbackRecord {
  id: string;
  recommendation_id: string;
  manager_id: string;
  recommendation_type: string;
  client_id?: string | null;
  conversation_id?: string | null;
  case_id?: string | null;
  source_interaction_id?: string | null;
  decision: RecommendationStatus;
  comment?: string | null;
  selected_variant?: string | null;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  recommendation_type: string;
  client_id: string;
  recommendation_id?: string | null;
  conversation_id?: string | null;
  case_id?: string | null;
  source_interaction_id?: string | null;
  manager_id: string;
  action: string;
  decision?: string | null;
  payload_excerpt?: string | null;
  context_snapshot?: string | null;
  created_at: string;
}

export interface FollowUp {
  id: string;
  client_id: string;
  crm_note_id: string;
  due_at: string;
  reason: string;
  completed: boolean;
}

export interface ClientDetailResponse {
  client: Client;
  case_id: string;
  tasks: Array<Record<string, unknown>>;
  interactions: CaseInteraction[];
  timeline: CaseTimelineEvent[];
  selected_work_item_id?: string | null;
  selected_interaction_id?: string | null;
  work_items: WorkItem[];
  product_propensity?: ProductPropensityResponse | null;
  objection_workflow?: ObjectionWorkflowResponse | null;
  crm_notes: CRMNote[];
  follow_ups: FollowUp[];
  recommendation_feedback: RecommendationFeedbackRecord[];
  activity_log: ActivityLogEntry[];
  generated_artifacts: GeneratedArtifact[];
  saved_ai_draft?: AISummaryDraft | null;
  script_history: ScriptGenerationRecord[];
  objection_history: ObjectionWorkflowRecord[];
  crm_draft_history: CRMDraftRevision[];
}

export interface ThreadListResponse {
  items: AssistantThread[];
}

export interface HealthResponse {
  status: string;
  stage: string;
  storage: string;
  version: string;
  feature_flags: {
    supervisor_dashboard?: boolean;
    assistant_panel?: boolean;
    feedback_loop?: boolean;
    propensity_module?: boolean;
    [key: string]: boolean | undefined;
  };
  ai: {
    available: boolean;
    provider: string;
    reason?: string | null;
  };
}

export interface SupervisorMetricCard {
  id: string;
  label: string;
  value: string;
  helper_text?: string | null;
}

export interface SupervisorDecisionBreakdown {
  recommendation_type: string;
  total: number;
  accepted: number;
  edited: number;
  rejected: number;
  usage_rate: number;
}

export interface SupervisorProductDistribution {
  product_code: string;
  product_name?: string | null;
  count: number;
}

export interface SupervisorRecentDecision {
  recommendation_id: string;
  recommendation_type: string;
  manager_id: string;
  client_id?: string | null;
  conversation_id?: string | null;
  decision: RecommendationStatus;
  comment?: string | null;
  selected_variant?: string | null;
  created_at: string;
}

export interface SupervisorFunnelStage {
  id: string;
  label: string;
  count: number;
  helper_text?: string | null;
}

export interface SupervisorDashboardResponse {
  manager_id: string;
  generated_at: string;
  cards: SupervisorMetricCard[];
  decision_breakdown: SupervisorDecisionBreakdown[];
  product_distribution: SupervisorProductDistribution[];
  recent_decisions: SupervisorRecentDecision[];
  completion_funnel: SupervisorFunnelStage[];
}
