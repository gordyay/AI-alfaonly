import type { SupervisorDashboardResponse } from "../types";
import { formatDateTime, getRecommendationStatusLabel, getRecommendationTypeLabel } from "../lib/utils";

interface SupervisorPanelProps {
  dashboard?: SupervisorDashboardResponse | null;
}

function getMetricLabel(id: string, fallback: string): string {
  const labels: Record<string, string> = {
    "adoption-rate": "Adoption",
    "acceptance-rate": "Acceptance",
    "edited-rate": "Edited",
    "rejected-rate": "Rejected",
    "coverage-rate": "Coverage",
    "latency-hours": "Latency",
  };

  return labels[id] ?? fallback;
}

function getMetricHelperText(id: string, fallback?: string | null): string | null {
  if (!fallback) {
    return null;
  }

  const labels: Record<string, string> = {
    "adoption-rate": fallback,
    "acceptance-rate": fallback,
    "edited-rate": fallback,
    "rejected-rate": fallback,
    "coverage-rate": fallback.replaceAll("high-priority", "срочных"),
    "latency-hours": fallback,
  };

  return labels[id] ?? fallback;
}

export function SupervisorPanel({ dashboard }: SupervisorPanelProps) {
  if (!dashboard) {
    return null;
  }

  return (
    <section className="panel supervisor-panel">
      <header className="panel__header">
        <div>
          <p className="panel__eyebrow">Контроль и эффект</p>
          <h2>Как используется помощник</h2>
        </div>
        <small>{formatDateTime(dashboard.generated_at)}</small>
      </header>

      <div className="supervisor-cards">
        {dashboard.cards.map((card) => (
          <article className="summary-card" key={card.id}>
            <span>{getMetricLabel(card.id, card.label)}</span>
            <strong>{card.value}</strong>
            <small>{getMetricHelperText(card.id, card.helper_text)}</small>
          </article>
        ))}
      </div>

      <div className="supervisor-grid">
        <section className="content-card">
          <h3>Completion funnel</h3>
          <div className="stack-list">
            {dashboard.completion_funnel.length ? (
              dashboard.completion_funnel.map((stage) => (
                <article className="stack-card" key={stage.id}>
                  <strong>
                    {stage.label} · {stage.count}
                  </strong>
                  <p>{stage.helper_text || "Подробность не указана."}</p>
                </article>
              ))
            ) : (
              <p className="insight">Funnel появится после первых действий по кейсам.</p>
            )}
          </div>
        </section>

        <section className="content-card">
          <h3>Разбор решений</h3>
          <div className="stack-list">
            {dashboard.decision_breakdown.length ? (
              dashboard.decision_breakdown.map((item) => (
                <article className="stack-card" key={item.recommendation_type}>
                  <strong>{getRecommendationTypeLabel(item.recommendation_type)}</strong>
                  <p>
                    принято {item.accepted} · доработано {item.edited} · отклонено {item.rejected}
                  </p>
                  <small>доля использования {Math.round(item.usage_rate * 100)}%</small>
                </article>
              ))
            ) : (
              <p className="insight">Решений пока недостаточно для сводки.</p>
            )}
          </div>
        </section>

        <section className="content-card">
          <h3>Последние решения</h3>
          <div className="stack-list">
            {dashboard.recent_decisions.length ? (
              dashboard.recent_decisions.map((item) => (
                <article className="stack-card" key={`${item.recommendation_id}-${item.created_at}`}>
                  <strong>
                    {getRecommendationTypeLabel(item.recommendation_type)} · {getRecommendationStatusLabel(item.decision)}
                  </strong>
                  <p>{item.comment || "Комментарий не указан."}</p>
                  <small>{formatDateTime(item.created_at)}</small>
                </article>
              ))
            ) : (
              <p className="insight">Список появится после первых зафиксированных решений.</p>
            )}
          </div>
        </section>

        <section className="content-card">
          <h3>Срез по продуктам</h3>
          <div className="stack-list">
            {dashboard.product_distribution.length ? (
              dashboard.product_distribution.map((item) => (
                <article className="stack-card" key={item.product_code}>
                  <strong>{item.product_code}</strong>
                  <p>{item.count} использованных рекомендаций</p>
                </article>
              ))
            ) : (
              <p className="insight">Срез появится после фиксации решений по задачам и возможностям.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
