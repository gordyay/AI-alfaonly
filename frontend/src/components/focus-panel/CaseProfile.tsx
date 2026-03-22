import { formatDateTime, formatMoney } from "../../lib/utils";
import type { CaseProfileProps } from "./types";

export function CaseProfile({ detail, propensityEnabled = true }: CaseProfileProps) {
  const { client } = detail;

  return (
    <section className="focus-layout">
      <section className="content-card">
        <h3>Профиль клиента</h3>
        <div className="meta-grid">
          <article className="meta-tile">
            <span>Возраст</span>
            <strong>{client.age}</strong>
          </article>
          <article className="meta-tile">
            <span>Риск-профиль</span>
            <strong>{client.risk_profile}</strong>
          </article>
          <article className="meta-tile">
            <span>Доход</span>
            <strong>{client.income_band}</strong>
          </article>
          <article className="meta-tile">
            <span>Свободный остаток</span>
            <strong>{formatMoney(client.cash_balance)}</strong>
          </article>
          <article className="meta-tile">
            <span>Город</span>
            <strong>{client.city}</strong>
          </article>
          <article className="meta-tile">
            <span>Последний контакт</span>
            <strong>{formatDateTime(client.last_contact_at)}</strong>
          </article>
        </div>
      </section>

      <aside className="content-stack">
        <section className="content-card">
          <h3>О клиенте</h3>
          <p className="insight">{client.notes_summary || "Расширенный контекст клиента пока не заполнен."}</p>
        </section>
        {propensityEnabled ? (
          <section className="content-card">
            <h3>Подходящие продукты</h3>
            <div className="stack-list">
              {detail.product_propensity?.items.length ? (
                detail.product_propensity.items.slice(0, 4).map((item) => (
                  <article className="stack-card" key={item.product_id}>
                    <strong>
                      {item.product_name} · {item.score}
                    </strong>
                    <p>{item.reasons.join(" · ")}</p>
                    <small>{item.next_best_action}</small>
                  </article>
                ))
              ) : (
                <p className="insight">Подходящие продукты пока не рассчитаны.</p>
              )}
            </div>
          </section>
        ) : null}
      </aside>
    </section>
  );
}
