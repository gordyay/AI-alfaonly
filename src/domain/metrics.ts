// ============================================================================
// Метрики использования рекомендаций для панели руководителя (FR10, UC-07).
// Считаются по логу обратной связи (FR8) и составу рекомендаций.
// Все метрики при малом объёме данных помечаются как предварительные.
// ============================================================================

import type { FeedbackDecision, FeedbackEvent, PriorityLevel } from "./types";

export interface RecommendationRef {
  recommendationId: string;
  level: PriorityLevel;
  managerId: string;
}

export interface ManagerBreakdown {
  managerId: string;
  managerName: string;
  total: number;
  decided: number;
  accepted: number;
  edited: number;
  rejected: number;
  usageRate: number;
  acceptanceRate: number;
}

export interface SupervisorMetrics {
  totalRecommendations: number;
  decided: number;
  usageRate: number; // доля рекомендаций с принятым решением
  acceptanceRate: number; // доля «принято» среди решённых
  qualityRate: number; // доля «принято или отредактировано» среди решённых
  decisionCounts: Record<FeedbackDecision, number>;
  highPriorityTotal: number;
  highPriorityCovered: number;
  coverageRate: number;
  recentDecisions: FeedbackEvent[];
  byManager: ManagerBreakdown[];
  preliminary: boolean;
}

function rate(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 100);
}

export function computeSupervisorMetrics(input: {
  recommendations: RecommendationRef[];
  feedback: FeedbackEvent[];
  managers: { id: string; fullName: string }[];
}): SupervisorMetrics {
  const { recommendations, managers } = input;
  // Отклонение черновика CRM — не решение по рекомендации, в метрики не входит.
  const feedback = input.feedback.filter((e) => e.kind !== "crm_draft");

  // Последнее решение по каждой рекомендации.
  const latestByRec = new Map<string, FeedbackEvent>();
  for (const event of feedback) {
    const prev = latestByRec.get(event.recommendationId);
    if (!prev || new Date(event.createdAtIso) > new Date(prev.createdAtIso)) {
      latestByRec.set(event.recommendationId, event);
    }
  }

  const decisions = [...latestByRec.values()];
  const decisionCounts: Record<FeedbackDecision, number> = {
    accepted: decisions.filter((d) => d.decision === "accepted").length,
    edited: decisions.filter((d) => d.decision === "edited").length,
    rejected: decisions.filter((d) => d.decision === "rejected").length,
  };

  const total = recommendations.length;
  const decided = decisions.length;
  const accepted = decisionCounts.accepted;
  const qualityCount = decisionCounts.accepted + decisionCounts.edited;

  // Покрытие приоритетных кейсов: доля high-приоритетных рекомендаций,
  // по которым есть решение менеджера.
  const highRecs = recommendations.filter((r) => r.level === "high");
  const highCovered = highRecs.filter((r) => latestByRec.has(r.recommendationId)).length;

  const recentDecisions = [...feedback]
    .sort((a, b) => new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime())
    .slice(0, 6);

  const byManager: ManagerBreakdown[] = managers.map((m) => {
    const recs = recommendations.filter((r) => r.managerId === m.id);
    const recIds = new Set(recs.map((r) => r.recommendationId));
    const mgrDecisions = decisions.filter((d) => recIds.has(d.recommendationId));
    const acc = mgrDecisions.filter((d) => d.decision === "accepted").length;
    const edt = mgrDecisions.filter((d) => d.decision === "edited").length;
    const rej = mgrDecisions.filter((d) => d.decision === "rejected").length;
    const dec = mgrDecisions.length;
    return {
      managerId: m.id,
      managerName: m.fullName,
      total: recs.length,
      decided: dec,
      accepted: acc,
      edited: edt,
      rejected: rej,
      usageRate: rate(dec, recs.length),
      acceptanceRate: rate(acc, dec),
    };
  });

  return {
    totalRecommendations: total,
    decided,
    usageRate: rate(decided, total),
    acceptanceRate: rate(accepted, decided),
    qualityRate: rate(qualityCount, decided),
    decisionCounts,
    highPriorityTotal: highRecs.length,
    highPriorityCovered: highCovered,
    coverageRate: rate(highCovered, highRecs.length),
    recentDecisions,
    byManager,
    preliminary: decided < 8,
  };
}
