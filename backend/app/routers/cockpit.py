"""Очередь кейсов, менеджеры, продукты, ранжирование склонности, панель
руководителя (UC-01, UC-02, UC-07)."""

from __future__ import annotations

from fastapi import APIRouter, Query

from .. import db
from ..domain.context import rank_clients_for_product
from ..domain.metrics import compute_supervisor_metrics
from ..domain.workqueue import build_all_recommendations, build_work_queue, is_work_item_handled

router = APIRouter(tags=["cockpit"])


@router.get("/managers")
def managers() -> dict:
    return {"managers": db.get_managers()}


@router.get("/queue")
def queue(manager_id: str = Query("m1", alias="managerId")) -> dict:
    items = build_work_queue(manager_id)
    for it in items:
        it["handled"] = is_work_item_handled(it, manager_id)
    return {"managerId": manager_id, "items": items}


@router.get("/clients")
def clients() -> dict:
    return {"clients": db.get_clients()}


@router.get("/products")
def products() -> dict:
    return {"products": db.get_products()}


@router.get("/products/{product_id}/ranking")
def ranking(product_id: str, manager_id: str = Query("m1", alias="managerId")) -> dict:
    return {
        "productId": product_id,
        "managerId": manager_id,
        "ranked": rank_clients_for_product(product_id, manager_id),
    }


@router.get("/supervisor")
def supervisor() -> dict:
    return compute_supervisor_metrics(
        recommendations=build_all_recommendations(),
        feedback=db.get_feedback(),
        managers=db.get_managers(),
    )
