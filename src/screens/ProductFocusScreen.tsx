// Экран «Подбор под продукт» (UC-02, FR2/FR7): менеджер выбирает продукт,
// бэкенд ранжирует клиентов по склонности к покупке с объяснением.

import { useEffect, useMemo, useState } from "react";
import { api, type QueuedItem, type RankedClient } from "../api/client";
import { useReference } from "../api/reference";
import { useStore } from "../store/store";
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

export function ProductFocusScreen({ managerId }: { managerId: string }) {
  const store = useStore();
  const { products } = useReference();
  const [productId, setProductId] = useState(() => products[0]?.id ?? "");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [ranked, setRanked] = useState<RankedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<QueuedItem[]>([]);

  const product = products.find((p) => p.id === productId) ?? products[0];

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    setExpanded(null);
    api
      .getRanking(productId, managerId)
      .then(setRanked)
      .catch(() => store.toast("Не удалось загрузить ранжирование", "info"))
      .finally(() => setLoading(false));
  }, [productId, managerId, store]);

  // Карта «клиент → верхний кейс» для перехода «К клиенту».
  useEffect(() => {
    api.getQueue(managerId).then(setQueue).catch(() => undefined);
  }, [managerId]);

  const topWorkItemByClient = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of queue) if (!map.has(item.clientId)) map.set(item.clientId, item.id);
    return map;
  }, [queue]);

  function openClientCase(clientId: string) {
    const wiId = topWorkItemByClient.get(clientId);
    if (wiId) {
      store.selectWorkItem(wiId);
      store.setView("cases");
    } else {
      store.toast("По клиенту нет активного кейса в очереди", "info");
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
          {products.map((p) => (
            <button
              key={p.id}
              className={`product-chip${p.id === productId ? " product-chip--active" : ""}`}
              onClick={() => setProductId(p.id)}
            >
              <span className="product-chip__name">{p.name}</span>
              <span className="product-chip__cat">{CATEGORY_LABEL[p.category]}</span>
            </button>
          ))}
        </div>

        {product && (
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
        )}

        {!loading && goodFit === 0 && ranked.length > 0 && (
          <div className="product-notice">
            <Icon name="bulb" size={16} />
            <span>
              Нет клиентов с заметной склонностью к этому продукту. Показан базовый отбор по правилам —
              клиенты отсортированы по общей оценке.
            </span>
          </div>
        )}

        {loading ? (
          <div className="empty-state">
            <span className="empty-state__icon">
              <Icon name="target" size={22} />
            </span>
            <span className="empty-state__title">Считаю склонность…</span>
          </div>
        ) : (
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
                      <button className="btn btn--ghost btn--sm" onClick={() => setExpanded(isOpen ? null : r.client.id)}>
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
        )}
      </div>
    </div>
  );
}
