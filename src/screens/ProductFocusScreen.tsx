// Экран «Подбор под продукт» (UC-02, FR2/FR7): менеджер выбирает продукт,
// ассистент ранжирует клиентов по склонности к покупке с объяснением.

import { useMemo, useState } from "react";
import { useStore } from "../store/store";
import { rankClientsForProduct } from "../domain/contextBuilders";
import { buildWorkQueue } from "../domain/workqueue";
import { dataset } from "../data/index";
import { formatMoney } from "../domain/format";
import { Icon } from "../components/Icon";
import { Avatar, FactorList, ScoreRing } from "../components/Primitives";
import { LEVEL_LABEL, scoreTextColor } from "../components/visual";

const CATEGORY_LABEL: Record<string, string> = {
  cards: "Карты",
  investment: "Инвестиции",
  deposits: "Депозиты",
  insurance: "Страхование",
  brokerage: "Брокерские",
};

export function ProductFocusScreen() {
  const store = useStore();
  const managerId = store.state.managerId;
  const [productId, setProductId] = useState(dataset.products[0].id);
  const [expanded, setExpanded] = useState<string | null>(null);

  const product = dataset.products.find((p) => p.id === productId)!;
  const ranked = useMemo(() => rankClientsForProduct(productId, managerId), [productId, managerId]);

  const topWorkItemByClient = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of buildWorkQueue(managerId)) {
      if (!map.has(item.clientId)) map.set(item.clientId, item.id);
    }
    return map;
  }, [managerId]);

  function openClientCase(clientId: string) {
    const wiId = topWorkItemByClient.get(clientId);
    if (wiId) {
      store.selectWorkItem(wiId);
      store.setView("cases");
    }
  }

  const goodFit = ranked.filter((r) => !r.score.retentionFirst && r.score.total >= 40).length;

  return (
    <div className="screen-scroll">
      <div className="screen-pad">
        <header className="page-head">
          <div>
            <span className="u-eyebrow">Подбор под продукт · UC-02</span>
            <h1 className="page-head__title">Кому предложить продукт</h1>
            <p className="page-head__sub">
              Выберите продукт — ассистент оценит склонность клиентов к покупке по пяти факторам и объяснит выбор.
            </p>
          </div>
        </header>

        <div className="product-picker">
          {dataset.products.map((p) => (
            <button
              key={p.id}
              className={`product-chip${p.id === productId ? " product-chip--active" : ""}`}
              onClick={() => {
                setProductId(p.id);
                setExpanded(null);
              }}
            >
              <span className="product-chip__name">{p.name}</span>
              <span className="product-chip__cat">{CATEGORY_LABEL[p.category]}</span>
            </button>
          ))}
        </div>

        <div className="product-hero panel">
          <div className="product-hero__icon">
            <Icon name="briefcase" size={22} />
          </div>
          <div className="product-hero__text">
            <h2 className="product-hero__name">{product.name}</h2>
            <p className="product-hero__pitch">{product.pitch}</p>
          </div>
          <div className="product-hero__stat">
            <span className="product-hero__stat-num u-num">{goodFit}</span>
            <span className="product-hero__stat-label">
              из {ranked.length} клиентов
              <br />с заметной склонностью
            </span>
          </div>
        </div>

        {!product.pitch ? (
          <div className="product-notice">
            <Icon name="alert" size={16} />
            <span>
              Данных по продукту недостаточно — показан базовый отбор по правилам соответствия профилю.
            </span>
          </div>
        ) : goodFit === 0 ? (
          <div className="product-notice">
            <Icon name="bulb" size={16} />
            <span>
              Нет клиентов с заметной склонностью к этому продукту. Показан базовый отбор по правилам —
              клиенты отсортированы по общей оценке.
            </span>
          </div>
        ) : null}

        <div className="ranked-list">
          {ranked.map((r, idx) => {
            const isOpen = expanded === r.client.id;
            return (
              <div key={r.client.id} className="ranked-item panel">
                <div className="ranked-item__row">
                  <span className="ranked-item__rank u-num">{idx + 1}</span>
                  <Avatar name={r.client.fullName} size={40} />
                  <div className="ranked-item__id">
                    <span className="ranked-item__name">{r.client.fullName}</span>
                    <span className="ranked-item__meta u-num">
                      {formatMoney(r.client.aum)} · {r.client.city}
                    </span>
                  </div>
                  <div className="ranked-item__reason">
                    {r.score.retentionFirst && (
                      <span className="badge badge--medium ranked-item__flag">
                        <Icon name="shield" size={12} /> Удержание важнее
                      </span>
                    )}
                    {r.score.reasons[0]}
                  </div>
                  <div className="ranked-item__score">
                    <ScoreRing value={r.score.total} size={48} stroke={5} />
                    <span className="ranked-item__level" style={{ color: scoreTextColor(r.score.total) }}>
                      {LEVEL_LABEL[r.score.level]}
                    </span>
                  </div>
                  <div className="ranked-item__actions">
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => setExpanded(isOpen ? null : r.client.id)}
                    >
                      Разбор
                      <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={15} />
                    </button>
                    <button className="btn btn--secondary btn--sm" onClick={() => openClientCase(r.client.id)}>
                      К клиенту
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="ranked-item__detail">
                    <FactorList factors={r.score.factors} showReasons />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
