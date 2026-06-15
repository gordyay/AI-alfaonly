// Экран «Аналитика» — панель руководителя (UC-07, FR10): использование и
// принятие рекомендаций, покрытие приоритетных кейсов, последние решения.
// Метрики считает бэкенд по логу обратной связи.

import { useEffect, useState } from "react";
import { api, type SupervisorMetrics } from "../api/client";
import { useReference } from "../api/reference";
import { useStore } from "../store/store";
import { timeAgo } from "../domain/format";
import { Icon, type IconName } from "../components/Icon";

const DECISION_META = {
  accepted: { label: "Принято", color: "var(--success)", textColor: "var(--success)" },
  edited: { label: "Изменено", color: "var(--signal-medium)", textColor: "var(--signal-medium-text)" },
  rejected: { label: "Отклонено", color: "var(--alfa-red)", textColor: "var(--alfa-red)" },
} as const;

function KpiCard({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: IconName }) {
  return (
    <div className="kpi-card panel">
      <div className="kpi-card__icon">
        <Icon name={icon} size={18} />
      </div>
      <span className="kpi-card__value u-num">{value}</span>
      <span className="kpi-card__label">{label}</span>
      <span className="kpi-card__hint">{hint}</span>
    </div>
  );
}

export function SupervisorScreen() {
  const store = useStore();
  const { clientById } = useReference();
  const [metrics, setMetrics] = useState<SupervisorMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getSupervisor()
      .then(setMetrics)
      .catch(() => store.toast("Не удалось загрузить аналитику", "info"))
      .finally(() => setLoading(false));
  }, [store]);

  if (loading || !metrics) {
    return (
      <div className="screen-scroll">
        <div className="screen-pad">
          <div className="empty-state">
            <span className="empty-state__icon">
              <Icon name="chart" size={22} />
            </span>
            <span className="empty-state__title">Загрузка аналитики…</span>
          </div>
        </div>
      </div>
    );
  }

  const totalDecisions = metrics.decided || 1;

  return (
    <div className="screen-scroll">
      <div className="screen-pad">
        <header className="page-head">
          <div>
            <span className="u-eyebrow">Аналитика руководителя · UC-07</span>
            <h1 className="page-head__title">Использование рекомендаций</h1>
            <p className="page-head__sub">
              Как менеджеры применяют рекомендации ассистента — основа для оценки эффекта внедрения.
            </p>
          </div>
          {metrics.preliminary && (
            <span className="badge badge--neutral">
              <Icon name="alert" size={13} /> Предварительные данные
            </span>
          )}
        </header>

        <div className="kpi-grid">
          <KpiCard
            label="Использование"
            value={`${metrics.usageRate}%`}
            hint={`${metrics.decided} из ${metrics.totalRecommendations} рекомендаций`}
            icon="layers"
          />
          <KpiCard
            label="Принятие"
            value={`${metrics.acceptanceRate}%`}
            hint={`${metrics.decisionCounts.accepted} приняты без правок`}
            icon="thumbsUp"
          />
          <KpiCard label="Качество использования" value={`${metrics.qualityRate}%`} hint="принято или доработано менеджером" icon="checkCircle" />
          <KpiCard
            label="Покрытие приоритетных"
            value={`${metrics.coverageRate}%`}
            hint={`${metrics.highPriorityCovered} из ${metrics.highPriorityTotal} высокого приоритета`}
            icon="target"
          />
        </div>

        <div className="supervisor-grid">
          <section className="panel work-card">
            <div className="section-head">
              <span className="section-head__icon">
                <Icon name="chart" size={17} />
              </span>
              <span className="section-head__text">
                <span className="section-head__title">Решения по рекомендациям</span>
                <span className="section-head__sub">Распределение последних решений менеджеров</span>
              </span>
            </div>

            <div className="decision-bar">
              {(["accepted", "edited", "rejected"] as const).map((key) => {
                const count = metrics.decisionCounts[key];
                const pct = Math.round((count / totalDecisions) * 100);
                return (
                  <div
                    key={key}
                    className="decision-bar__seg"
                    style={{ width: `${pct}%`, background: DECISION_META[key].color }}
                    title={`${DECISION_META[key].label}: ${count}`}
                  />
                );
              })}
            </div>
            <div className="decision-legend">
              {(["accepted", "edited", "rejected"] as const).map((key) => (
                <span key={key} className="decision-legend__item">
                  <span className="decision-legend__dot" style={{ background: DECISION_META[key].color }} />
                  {DECISION_META[key].label}
                  <span className="decision-legend__num u-num">{metrics.decisionCounts[key]}</span>
                </span>
              ))}
            </div>

            <div className="manager-table">
              <div className="manager-table__head">
                <span>Менеджер</span>
                <span>Кейсы</span>
                <span>Использование</span>
                <span>Принятие</span>
              </div>
              {metrics.byManager.map((m) => (
                <div className="manager-table__row" key={m.managerId}>
                  <span className="manager-table__name">{m.managerName}</span>
                  <span className="u-num">{m.total}</span>
                  <span className="u-num">{m.usageRate}%</span>
                  <span className="u-num">{m.acceptanceRate}%</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel work-card">
            <div className="section-head">
              <span className="section-head__icon">
                <Icon name="history" size={17} />
              </span>
              <span className="section-head__text">
                <span className="section-head__title">Последние решения</span>
                <span className="section-head__sub">Свежая обратная связь от менеджеров</span>
              </span>
            </div>

            {metrics.recentDecisions.length === 0 ? (
              <p className="u-faint">Свежих решений пока нет.</p>
            ) : (
              <ul className="decision-feed">
                {metrics.recentDecisions.map((d) => {
                  const client = d.clientId ? clientById.get(d.clientId) : null;
                  const meta = DECISION_META[d.decision];
                  return (
                    <li key={d.id} className="decision-feed__item">
                      <span className="decision-feed__dot" style={{ background: meta.color }} />
                      <div className="decision-feed__body">
                        <p className="decision-feed__top">
                          <span className="decision-feed__decision" style={{ color: meta.textColor }}>
                            {meta.label}
                          </span>
                          {client && <span className="decision-feed__client"> · {client.fullName}</span>}
                        </p>
                        {d.comment && <p className="decision-feed__comment">«{d.comment}»</p>}
                        <span className="decision-feed__time">
                          {d.id.startsWith("rt-") ? "только что" : timeAgo(d.createdAtIso)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
