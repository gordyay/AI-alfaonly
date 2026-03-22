import { useState } from "react";
import type { SupervisorDashboardResponse } from "../types";
import {
  formatDateTime,
  formatProductCode,
  getRecommendationStatusLabel,
  getRecommendationTypeLabel,
} from "../lib/utils";

interface SupervisorPanelProps {
  dashboard?: SupervisorDashboardResponse | null;
}

function getMetricLabel(id: string, fallback: string): string {
  const labels: Record<string, string> = {
    "adoption-rate": "Взято в работу",
    "acceptance-rate": "Принято без правок",
    "edited-rate": "Доработано",
    "rejected-rate": "Отклонено",
    "coverage-rate": "Покрытие срочных кейсов",
    "latency-hours": "Среднее время реакции",
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
  const [expanded, setExpanded] = useState(false);

  if (!dashboard) {
    return null;
  }

  return (
    <section className="panel supervisor-panel" data-tour="supervisor">
      <header className="panel__header">
        <h2>Метрики использования</h2>
        <div className="button-row">
          <button className="ghost-button" type="button" onClick={() => setExpanded((current) => !current)}>
            {expanded ? "Свернуть аналитику" : "Показать аналитику"}
          </button>
          <small>{formatDateTime(dashboard.generated_at)}</small>
        </div>
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

      {expanded ? <div className="supervisor-grid">
        <section className="content-card">
          <h3>Путь по кейсам</h3>
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
              <p className="insight">Сводка по шагам появится после первых действий по кейсам.</p>
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
                  <p>{item.comment || "Менеджер сохранил решение без комментария."}</p>
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
                  <strong>{item.product_name || formatProductCode(item.product_code)}</strong>
                  <p>{item.count} использованных рекомендаций</p>
                  {item.product_name ? <small>{formatProductCode(item.product_code)}</small> : null}
                </article>
              ))
            ) : (
              <p className="insight">Срез появится после фиксации решений по задачам и возможностям.</p>
            )}
          </div>
        </section>
      </div> : null}
    </section>
  );
}
