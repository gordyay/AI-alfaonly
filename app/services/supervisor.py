from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime

from ..db import SQLiteStorage, utc_now
from ..models import (
    FeedbackDecision,
    RecommendationStatus,
    SupervisorDashboardResponse,
    SupervisorDecisionBreakdown,
    SupervisorFunnelStage,
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
        feedback_items = storage.list_feedback(manager_id=manager_id)
        activity_logs = storage.list_manager_activity_logs(manager_id)
        crm_notes = storage.list_manager_crm_notes(manager_id)
        work_items_by_recommendation = {item.recommendation_id: item for item in cockpit.work_queue}
        latest_feedback = self._latest_feedback(feedback_items)

        processed_items = [
            item for item in cockpit.work_queue if item.recommendation_id in latest_feedback
        ]
        accepted_items = [
            item
            for item in cockpit.work_queue
            if latest_feedback.get(item.recommendation_id, None) is not None
            and latest_feedback[item.recommendation_id].decision == FeedbackDecision.accepted
        ]
        edited_items = [
            item
            for item in cockpit.work_queue
            if latest_feedback.get(item.recommendation_id, None) is not None
            and latest_feedback[item.recommendation_id].decision == FeedbackDecision.edited
        ]
        rejected_items = [
            item
            for item in cockpit.work_queue
            if latest_feedback.get(item.recommendation_id, None) is not None
            and latest_feedback[item.recommendation_id].decision == FeedbackDecision.rejected
        ]
        used_items = [*accepted_items, *edited_items]
        high_priority_items = [item for item in cockpit.work_queue if item.priority_score >= 80]
        worked_high_priority_items = [
            item
            for item in high_priority_items
            if latest_feedback.get(item.recommendation_id, None) is not None
            and latest_feedback[item.recommendation_id].decision in {FeedbackDecision.accepted, FeedbackDecision.edited}
        ]

        acceptance_rate = (
            len(accepted_items)
            / len(processed_items)
            if processed_items
            else 0.0
        )
        adoption_rate = len(used_items) / len(cockpit.work_queue) if cockpit.work_queue else 0.0
        edited_rate = len(edited_items) / len(processed_items) if processed_items else 0.0
        rejected_rate = len(rejected_items) / len(processed_items) if processed_items else 0.0
        worked_high_priority_share = (
            len(worked_high_priority_items) / len(high_priority_items) if high_priority_items else 0.0
        )
        average_latency_hours = self._average_latency_hours(
            latest_feedback=latest_feedback,
            work_items_by_recommendation=work_items_by_recommendation,
        )

        grouped_feedback: dict[str, list] = defaultdict(list)
        for item in latest_feedback.values():
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
                id="adoption-rate",
                label="Adoption",
                value=f"{round(adoption_rate * 100)}%",
                helper_text=f"{len(used_items)} из {len(cockpit.work_queue)} кейсов доведены до принятия или доработки.",
            ),
            SupervisorMetricCard(
                id="acceptance-rate",
                label="Acceptance",
                value=f"{round(acceptance_rate * 100)}%",
                helper_text=f"{len(accepted_items)} принятых решений из {len(processed_items)} зафиксированных.",
            ),
            SupervisorMetricCard(
                id="edited-rate",
                label="Edited",
                value=f"{round(edited_rate * 100)}%",
                helper_text=f"{len(edited_items)} кейсов менеджер не принял вслепую, а доработал под себя.",
            ),
            SupervisorMetricCard(
                id="rejected-rate",
                label="Rejected",
                value=f"{round(rejected_rate * 100)}%",
                helper_text=f"{len(rejected_items)} кейсов были отклонены после явной оценки.",
            ),
            SupervisorMetricCard(
                id="coverage-rate",
                label="Coverage",
                value=f"{round(worked_high_priority_share * 100)}%",
                helper_text=f"{len(worked_high_priority_items)} из {len(high_priority_items)} high-priority кейсов получили действие.",
            ),
            SupervisorMetricCard(
                id="latency-hours",
                label="Latency",
                value=f"{average_latency_hours:.1f} ч",
                helper_text="Среднее время от появления рекомендации до последнего зафиксированного решения.",
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
            for item in list(latest_feedback.values())[:8]
        ]

        artifact_generated_ids = {
            entry.recommendation_id
            for entry in activity_logs
            if entry.recommendation_id
            and entry.action in {"script_generated", "objection_generated", "crm_draft_generated"}
        }
        crm_saved_ids = {
            note.recommendation_id
            for note in crm_notes
            if note.recommendation_id
        }
        allowed_recommendation_ids = set(work_items_by_recommendation)
        funnel = [
            SupervisorFunnelStage(
                id="recommended",
                label="В очереди",
                count=len(cockpit.work_queue),
                helper_text="Все активные рекомендации менеджера в текущем cockpit.",
            ),
            SupervisorFunnelStage(
                id="decision-recorded",
                label="Решение сохранено",
                count=len(set(latest_feedback).intersection(allowed_recommendation_ids)),
                helper_text="Менеджер явно сохранил принять, доработать или отклонить.",
            ),
            SupervisorFunnelStage(
                id="artifact-generated",
                label="AI-артефакт подготовлен",
                count=len(artifact_generated_ids.intersection(allowed_recommendation_ids)),
                helper_text="Для кейса был сгенерирован script, objection flow или CRM draft.",
            ),
            SupervisorFunnelStage(
                id="crm-saved",
                label="CRM сохранена",
                count=len(crm_saved_ids.intersection(allowed_recommendation_ids)),
                helper_text="Финальный результат дошёл до CRM-заметки.",
            ),
        ]

        return SupervisorDashboardResponse(
            manager_id=manager_id,
            generated_at=generated_at,
            cards=cards,
            decision_breakdown=breakdown,
            product_distribution=product_distribution,
            recent_decisions=recent_decisions,
            completion_funnel=funnel,
        )

    @staticmethod
    def _latest_feedback(feedback_items: list) -> dict[str, object]:
        latest: dict[str, object] = {}
        for item in feedback_items:
            latest.setdefault(item.recommendation_id, item)
        return latest

    @staticmethod
    def _average_latency_hours(*, latest_feedback: dict, work_items_by_recommendation: dict) -> float:
        latencies: list[float] = []
        for recommendation_id, item in latest_feedback.items():
            work_item = work_items_by_recommendation.get(recommendation_id)
            if work_item is None:
                continue
            started_at = work_item.created_at or work_item.due_at
            if started_at is None:
                continue
            latencies.append(max((item.created_at - started_at).total_seconds() / 3600, 0))
        return round(sum(latencies) / len(latencies), 1) if latencies else 0.0
