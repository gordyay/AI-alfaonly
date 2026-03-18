from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime

from ..db import SQLiteStorage, utc_now
from ..models import (
    FeedbackDecision,
    RecommendationStatus,
    SupervisorDashboardResponse,
    SupervisorDecisionBreakdown,
    SupervisorMetricCard,
    SupervisorProductDistribution,
    SupervisorRecentDecision,
)
from .cockpit import ManagerCockpitService


class SupervisorDashboardService:
    def __init__(self, cockpit_service: ManagerCockpitService | None = None) -> None:
        self.cockpit_service = cockpit_service or ManagerCockpitService()

    def build_dashboard(
        self,
        *,
        storage: SQLiteStorage,
        manager_id: str,
        now: datetime | None = None,
    ) -> SupervisorDashboardResponse:
        generated_at = now or utc_now()
        cockpit = self.cockpit_service.build_manager_cockpit(storage=storage, manager_id=manager_id, now=generated_at)
        feedback_items = storage.list_feedback(manager_id=manager_id, limit=50)
        crm_notes = storage.list_manager_crm_notes(manager_id)

        processed_items = [
            item for item in cockpit.work_queue if item.recommendation_status != RecommendationStatus.pending
        ]
        used_items = [
            item
            for item in cockpit.work_queue
            if item.recommendation_status in {RecommendationStatus.accepted, RecommendationStatus.edited}
        ]
        high_priority_items = [item for item in cockpit.work_queue if item.priority_score >= 80]
        worked_high_priority_items = [
            item
            for item in high_priority_items
            if item.recommendation_status in {RecommendationStatus.accepted, RecommendationStatus.edited}
        ]
        ai_generated_notes = [note for note in crm_notes if note.ai_generated]

        acceptance_rate = (
            sum(1 for item in processed_items if item.recommendation_status == RecommendationStatus.accepted)
            / len(processed_items)
            if processed_items
            else 0.0
        )
        usage_rate = len(used_items) / len(cockpit.work_queue) if cockpit.work_queue else 0.0
        worked_high_priority_share = (
            len(worked_high_priority_items) / len(high_priority_items) if high_priority_items else 0.0
        )
        time_saved_minutes = len(ai_generated_notes) * 6 + sum(
            8 if item.recommendation_status == RecommendationStatus.accepted else 4 for item in used_items
        )

        grouped_feedback: dict[str, list] = defaultdict(list)
        for item in feedback_items:
            grouped_feedback[item.recommendation_type].append(item)

        breakdown = [
            SupervisorDecisionBreakdown(
                recommendation_type=recommendation_type,
                total=len(items),
                accepted=sum(1 for item in items if item.decision == FeedbackDecision.accepted),
                edited=sum(1 for item in items if item.decision == FeedbackDecision.edited),
                rejected=sum(1 for item in items if item.decision == FeedbackDecision.rejected),
                usage_rate=(
                    sum(
                        1
                        for item in items
                        if item.decision in {FeedbackDecision.accepted, FeedbackDecision.edited}
                    )
                    / len(items)
                    if items
                    else 0.0
                ),
            )
            for recommendation_type, items in sorted(grouped_feedback.items(), key=lambda pair: pair[0])
        ]

        product_counter = Counter(
            item.product_code
            for item in used_items
            if item.product_code
        )
        product_distribution = [
            SupervisorProductDistribution(product_code=product_code, count=count)
            for product_code, count in product_counter.most_common(6)
        ]

        cards = [
            SupervisorMetricCard(
                id="usage-rate",
                label="Использование рекомендаций",
                value=f"{round(usage_rate * 100)}%",
                helper_text=f"{len(used_items)} из {len(cockpit.work_queue)} work items уже приняты или доработаны.",
            ),
            SupervisorMetricCard(
                id="acceptance-rate",
                label="Acceptance rate",
                value=f"{round(acceptance_rate * 100)}%",
                helper_text=f"{len(processed_items)} рекомендаций получили явное решение менеджера.",
            ),
            SupervisorMetricCard(
                id="high-priority-coverage",
                label="Покрытие high-priority",
                value=f"{round(worked_high_priority_share * 100)}%",
                helper_text=f"{len(worked_high_priority_items)} из {len(high_priority_items)} high-priority кейсов отработаны.",
            ),
            SupervisorMetricCard(
                id="time-saved",
                label="Proxy time saved",
                value=f"{time_saved_minutes} мин",
                helper_text=f"{len(ai_generated_notes)} AI-generated CRM notes и {len(used_items)} использованных рекомендаций.",
            ),
        ]

        recent_decisions = [
            SupervisorRecentDecision(
                recommendation_id=item.recommendation_id,
                recommendation_type=item.recommendation_type,
                manager_id=item.manager_id,
                client_id=item.client_id,
                conversation_id=item.conversation_id,
                decision=item.decision,
                comment=item.comment,
                selected_variant=item.selected_variant,
                created_at=item.created_at,
            )
            for item in feedback_items[:8]
        ]

        return SupervisorDashboardResponse(
            manager_id=manager_id,
            generated_at=generated_at,
            cards=cards,
            decision_breakdown=breakdown,
            product_distribution=product_distribution,
            recent_decisions=recent_decisions,
        )
