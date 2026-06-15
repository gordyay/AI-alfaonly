"""Метрики использования рекомендаций для панели руководителя (FR10, UC-07) —
порт metrics.ts. Считаются по логу обратной связи (FR8) и составу рекомендаций."""

from __future__ import annotations

from typing import Any

from .clock import js_round, parse_ms


def _rate(part: int, whole: int) -> int:
    if whole == 0:
        return 0
    return js_round((part / whole) * 100)


def compute_supervisor_metrics(
    recommendations: list[dict[str, Any]],
    feedback: list[dict[str, Any]],
    managers: list[dict[str, Any]],
) -> dict[str, Any]:
    # Отклонение черновика CRM — не решение по рекомендации, в метрики не входит.
    feedback = [e for e in feedback if e.get("kind") != "crm_draft"]

    # Последнее решение по каждой рекомендации.
    latest: dict[str, dict[str, Any]] = {}
    for event in feedback:
        prev = latest.get(event["recommendationId"])
        if not prev or parse_ms(event["createdAtIso"]) > parse_ms(prev["createdAtIso"]):
            latest[event["recommendationId"]] = event

    decisions = list(latest.values())
    decision_counts = {
        "accepted": sum(1 for d in decisions if d["decision"] == "accepted"),
        "edited": sum(1 for d in decisions if d["decision"] == "edited"),
        "rejected": sum(1 for d in decisions if d["decision"] == "rejected"),
    }

    total = len(recommendations)
    decided = len(decisions)
    accepted = decision_counts["accepted"]
    quality_count = decision_counts["accepted"] + decision_counts["edited"]

    high_recs = [r for r in recommendations if r["level"] == "high"]
    high_covered = sum(1 for r in high_recs if r["recommendationId"] in latest)

    recent = sorted(feedback, key=lambda e: parse_ms(e["createdAtIso"]), reverse=True)[:6]

    by_manager: list[dict[str, Any]] = []
    for m in managers:
        rec_ids = {r["recommendationId"] for r in recommendations if r["managerId"] == m["id"]}
        recs_total = len(rec_ids)
        mgr_decisions = [d for d in decisions if d["recommendationId"] in rec_ids]
        acc = sum(1 for d in mgr_decisions if d["decision"] == "accepted")
        edt = sum(1 for d in mgr_decisions if d["decision"] == "edited")
        rej = sum(1 for d in mgr_decisions if d["decision"] == "rejected")
        dec = len(mgr_decisions)
        by_manager.append(
            {
                "managerId": m["id"],
                "managerName": m["fullName"],
                "total": recs_total,
                "decided": dec,
                "accepted": acc,
                "edited": edt,
                "rejected": rej,
                "usageRate": _rate(dec, recs_total),
                "acceptanceRate": _rate(acc, dec),
            }
        )

    return {
        "totalRecommendations": total,
        "decided": decided,
        "usageRate": _rate(decided, total),
        "acceptanceRate": _rate(accepted, decided),
        "qualityRate": _rate(quality_count, decided),
        "decisionCounts": decision_counts,
        "highPriorityTotal": len(high_recs),
        "highPriorityCovered": high_covered,
        "coverageRate": _rate(high_covered, len(high_recs)),
        "recentDecisions": recent,
        "byManager": by_manager,
        "preliminary": decided < 8,
    }
