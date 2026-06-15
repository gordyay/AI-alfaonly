// Вкладка «Клиент»: профиль, портфель продуктов и оценка склонности к покупке
// по каждому продукту (FR7) с разбором по факторам. Склонность считает бэкенд.

import { useState } from "react";
import type { Client, PropensityScore } from "../../domain/types";
import type { AIContext } from "../../ai/context";
import { useReference } from "../../api/reference";
import { formatMoney, formatMoneyExact, CHANNEL_LABEL, timeAgo } from "../../domain/format";
import { Icon } from "../Icon";
import { FactorList, ScoreRing } from "../Primitives";
import { LEVEL_LABEL, scoreTextColor } from "../visual";

const RISK_LABEL: Record<Client["riskAppetite"], string> = {
  conservative: "Консервативный",
  moderate: "Умеренный",
  aggressive: "Агрессивный",
};

export function ClientTab({ ctx, propensities }: { ctx: AIContext; propensities: PropensityScore[] }) {
  const { productById } = useReference();
  const { client, ownedProducts } = ctx;
  const ownedIds = new Set(ownedProducts.map((o) => o.product.id));
  const [expanded, setExpanded] = useState<string | null>(
    propensities.find((p) => !ownedIds.has(p.productId))?.productId ?? null,
  );

  return (
    <div className="client-tab">
      <section className="panel work-card">
        <div className="section-head">
          <span className="section-head__icon">
            <Icon name="user" size={17} />
          </span>
          <span className="section-head__text">
            <span className="section-head__title">Профиль клиента</span>
            <span className="section-head__sub">Данные из систем банка (MDM, EQ/АБС)</span>
          </span>
        </div>

        <div className="profile-grid">
          <ProfileRow label="Должность" value={client.occupation} />
          <ProfileRow label="Город" value={client.city} />
          <ProfileRow label="Возраст" value={`${client.age} лет`} />
          <ProfileRow label="Семейное положение" value={client.maritalStatus === "married" ? "В браке" : "Не в браке"} />
          <ProfileRow label="Риск-профиль" value={RISK_LABEL[client.riskAppetite]} />
          <ProfileRow label="Предпочитаемый канал" value={CHANNEL_LABEL[client.preferredChannel]} />
          <ProfileRow label="Активы под управлением" value={formatMoneyExact(client.aum)} />
          <ProfileRow label="Свободная ликвидность" value={formatMoneyExact(client.liquidBalance)} />
          <ProfileRow label="Последний контакт" value={timeAgo(client.lastContactIso)} />
        </div>

        {client.note ? (
          <div className="profile-note">
            <Icon name="pin" size={15} />
            <p>{client.note}</p>
          </div>
        ) : (
          <div className="inline-gap">
            <Icon name="alert" size={15} />
            <span>Заметка о клиенте не заполнена — профиль неполный. Стоит уточнить горизонт и цели.</span>
          </div>
        )}
      </section>

      <section className="panel work-card">
        <div className="section-head">
          <span className="section-head__icon">
            <Icon name="layers" size={17} />
          </span>
          <span className="section-head__text">
            <span className="section-head__title">Портфель продуктов</span>
            <span className="section-head__sub">
              {ownedProducts.length} активных {plural(ownedProducts.length, ["продукт", "продукта", "продуктов"])}
            </span>
          </span>
        </div>
        <div className="portfolio">
          {ownedProducts.map((o) => (
            <div key={o.product.id} className="portfolio-item">
              <div className="portfolio-item__main">
                <span className="portfolio-item__name">{o.product.name}</span>
                <span className="portfolio-item__cat">{categoryLabel(o.product.category)}</span>
              </div>
              <span className="portfolio-item__bal u-num">{formatMoney(o.balance, o.product.currency)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel work-card">
        <div className="section-head">
          <span className="section-head__icon section-head__icon--ai">
            <Icon name="target" size={17} />
          </span>
          <span className="section-head__text">
            <span className="section-head__title">Склонность к покупке</span>
            <span className="section-head__sub">Вероятностное ранжирование продуктов по 5 факторам</span>
          </span>
        </div>

        {propensities.some((p) => p.retentionFirst) && (
          <div className="inline-gap">
            <Icon name="shield" size={15} />
            <span>
              Высокий риск оттока — приоритет удержания. Оценки склонности показаны справочно, активное
              предложение продукта сейчас неуместно.
            </span>
          </div>
        )}

        <div className="propensity-list">
          {propensities.map((p) => {
            const product = productById.get(p.productId);
            if (!product) return null;
            const owned = ownedIds.has(p.productId);
            const isOpen = expanded === p.productId;
            return (
              <div key={p.productId} className={`propensity-item${owned ? " propensity-item--owned" : ""}`}>
                <button className="propensity-item__head" onClick={() => setExpanded(isOpen ? null : p.productId)}>
                  <ScoreRing value={p.total} size={44} stroke={5} />
                  <span className="propensity-item__info">
                    <span className="propensity-item__name">
                      {product.name}
                      {owned && <span className="tag">в портфеле</span>}
                    </span>
                    <span className="propensity-item__reason">{p.reasons[0]}</span>
                  </span>
                  <span className="propensity-item__level" style={{ color: scoreTextColor(p.total) }}>
                    {LEVEL_LABEL[p.level]}
                    <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={15} />
                  </span>
                </button>
                {isOpen && (
                  <div className="propensity-item__detail">
                    <p className="propensity-item__pitch">{product.pitch}</p>
                    <FactorList factors={p.factors} showReasons />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-row">
      <span className="profile-row__label">{label}</span>
      <span className="profile-row__value">{value}</span>
    </div>
  );
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    cards: "Карты",
    investment: "Инвестиции",
    deposits: "Депозиты",
    insurance: "Страхование",
    brokerage: "Брокерские",
  };
  return map[cat] ?? cat;
}

function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}
