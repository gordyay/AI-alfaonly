"""Склонность §6.3: веса, паритет ранжирования, приоритет удержания, объяснимость."""

from app.domain.clock import js_round
from app.domain.context import rank_clients_for_product, score_client_products
from app.domain.propensity import PROPENSITY_WEIGHTS


def test_weights_sum_to_one():
    assert round(sum(PROPENSITY_WEIGHTS.values()), 6) == 1.0


def test_ranking_parity_first_product(db):
    products = db.get_products()
    ranked = rank_clients_for_product(products[0]["id"], "m1")
    tops = [r["score"]["total"] for r in ranked[:5]]
    assert tops == [77, 77, 73, 71, 62]


def test_retention_first_sinks_to_bottom(db):
    ranked = rank_clients_for_product(db.get_products()[0]["id"], "m1")
    flags = [r["score"]["retentionFirst"] for r in ranked]
    first_true = next((i for i, f in enumerate(flags) if f), len(flags))
    # после первого retentionFirst все остальные тоже retentionFirst
    assert all(flags[first_true:])


def test_total_is_honest_sum(db):
    for score in score_client_products("c1"):
        assert score["total"] == js_round(sum(f["contribution"] for f in score["factors"]))
        assert len(score["factors"]) == 5


def test_owned_product_low_gap(db):
    # Если продукт уже в портфеле — фактор «пробел» низкий (апсейл, 25).
    scores = score_client_products("c1")
    owned = {cp["productId"] for cp in db.get_client_products("c1") if cp["status"] == "active"}
    for s in scores:
        gap = next(f for f in s["factors"] if f["key"] == "portfolio_gap")
        if s["productId"] in owned:
            assert gap["score"] == 25
