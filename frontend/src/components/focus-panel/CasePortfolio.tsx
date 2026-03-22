import { formatMoney, formatDateTime } from "../../lib/utils";
import type { CasePortfolioProps } from "./types";

export function CasePortfolio({ detail, propensityEnabled = true }: CasePortfolioProps) {
  const { client } = detail;
  const topPropensity = propensityEnabled ? detail.product_propensity?.items?.[0] : null;

  return (
    <section className="focus-layout">
      <section className="content-card">
        <h3>Портфель клиента</h3>
        <div className="stack-list">
          {client.products.length ? (
            client.products.map((product) => (
              <article className="stack-card" key={product.product_id}>
                <strong>
                  {product.name} · {product.status}
                </strong>
                <p>
                  {product.category} · {product.margin_level} · {product.risk_level}
                </p>
                <small>
                  Баланс: {formatMoney(product.balance, product.currency)} · Открыт: {formatDateTime(product.opened_at)}
                </small>
              </article>
            ))
          ) : (
            <p className="insight">Портфель пока пуст.</p>
          )}
        </div>
      </section>

      <aside className="content-stack">
        {propensityEnabled ? (
          <section className="content-card">
            <h3>Лучший следующий продукт</h3>
            {topPropensity ? (
              <article className="stack-card">
                <strong>
                  {topPropensity.product_name} · {topPropensity.score}
                </strong>
                <p>{topPropensity.reasons.join(" · ")}</p>
                <small>{topPropensity.next_best_action}</small>
              </article>
            ) : (
              <p className="insight">Нужны дополнительные сигналы для продуктового ранжирования.</p>
            )}
          </section>
        ) : null}
      </aside>
    </section>
  );
}
