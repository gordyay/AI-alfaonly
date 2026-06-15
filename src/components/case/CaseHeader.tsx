// Шапка кейса: личность клиента, итоговый приоритет, следующее лучшее
// действие и раскрываемый разбор по факторам (объяснимость, NFR2).

import { useState } from "react";
import type { Client, WorkItem } from "../../domain/types";
import { formatMoney } from "../../domain/format";
import { tagLabel } from "../../domain/tags";
import { useStore } from "../../store/store";
import { Avatar, FactorList, ScoreRing } from "../Primitives";
import { Icon } from "../Icon";
import { LEVEL_LABEL, scoreTextColor } from "../visual";

const CHURN_LABEL: Record<Client["churnRisk"], string> = {
  low: "Низкий риск оттока",
  medium: "Средний риск оттока",
  high: "Высокий риск оттока",
};

export function CaseHeader({ client, item }: { client: Client; item: WorkItem }) {
  const [open, setOpen] = useState(false);
  const serviceDown = useStore().state.priorityServiceDown;
  const p = item.priority;

  // Бейдж ценности берём из того же квартильного фактора «Ценность» (§6.2),
  // что и разбор приоритета, — иначе шапка и объяснение могли бы противоречить.
  const valueScore = p.factors.find((f) => f.key === "value")?.score ?? 0;
  const valueLabel =
    valueScore >= 100
      ? "Максимальная ценность"
      : valueScore >= 75
        ? "Высокая ценность"
        : valueScore >= 50
          ? "Средняя ценность"
          : "Базовая ценность";

  return (
    <div className="case-header">
      <div className="case-header__identity">
        <Avatar name={client.fullName} size={52} />
        <div className="case-header__id-text">
          <div className="case-header__name-row">
            <h1 className="case-header__name">{client.fullName}</h1>
            <span className="badge badge--neutral">{client.segment}</span>
          </div>
          <p className="case-header__role">
            {client.occupation} · {client.city} · {client.age} лет
          </p>
          <div className="case-header__facts">
            <span className="case-fact">
              <Icon name="wallet" size={14} />
              <span className="u-num">{formatMoney(client.aum)}</span> активов
            </span>
            <span className="case-fact">
              <Icon name="briefcase" size={14} />
              {valueLabel}
            </span>
            <span className={`case-fact${client.churnRisk === "high" ? " case-fact--danger" : ""}`}>
              <Icon name="shield" size={14} />
              {CHURN_LABEL[client.churnRisk]}
            </span>
          </div>
        </div>

        {serviceDown ? (
          <div className="case-header__score case-header__score--down">
            <Icon name="alert" size={22} />
            <span className="case-header__level">Оценка приоритета временно недоступна</span>
          </div>
        ) : (
          <div className="case-header__score">
            <ScoreRing value={p.total} size={72} stroke={7} />
            <span className="case-header__level" style={{ color: scoreTextColor(p.total) }}>
              {LEVEL_LABEL[p.level]} приоритет
            </span>
          </div>
        )}
      </div>

      {client.tags.length > 0 && (
        <div className="case-header__tags">
          {client.tags.map((t) => (
            <span className="tag" key={t}>
              {tagLabel(t)}
            </span>
          ))}
        </div>
      )}

      <div className="nba">
        <div className="nba__icon">
          <Icon name="bulb" size={18} />
        </div>
        <div className="nba__body">
          <span className="u-eyebrow">Рекомендуемое действие</span>
          <p className="nba__action">{item.nextBestAction}</p>
          <p className="nba__impact">
            <Icon name="trending" size={13} /> {item.expectedImpact}
          </p>
        </div>
        {!serviceDown && (
          <button className="nba__why" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            Почему этот приоритет
            <Icon name={open ? "chevronDown" : "chevronRight"} size={15} />
          </button>
        )}
      </div>

      {open && !serviceDown && (
        <div className="explain">
          <div className="explain__formula">
            Приоритет = 0,25·Ожидание + 0,30·Ценность + 0,20·Срочность + 0,15·Потенциал + 0,10·Риск оттока
          </div>
          <FactorList factors={p.factors} showReasons />
          {p.dataGaps.length > 0 && (
            <div className="explain__gaps">
              <Icon name="alert" size={15} />
              <div>
                <strong>Нужны данные.</strong> {p.dataGaps.join(". ")}. Кейс остаётся в очереди с пометкой.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
