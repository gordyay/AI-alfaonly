from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query, Request

from ..models import TaskStatus
from ..router_support import get_runtime

router = APIRouter()


@router.get("/cockpit")
async def get_cockpit(request: Request, manager_id: str = Query(default="m1")):
    runtime = get_runtime(request)
    return runtime.cockpit_service.build_manager_cockpit(storage=runtime.storage, manager_id=manager_id)


@router.get("/propensity/clients")
async def get_product_plan(
    request: Request,
    manager_id: str = Query(default="m1"),
    product_id: str = Query(...),
):
    runtime = get_runtime(request)
    return runtime.propensity_service.build_product_plan(
        storage=runtime.storage,
        manager_id=manager_id,
        product_id=product_id,
    )


@router.get("/tasks")
async def get_tasks(
    request: Request,
    manager_id: str | None = Query(default=None),
    status: TaskStatus | None = Query(default=None),
):
    runtime = get_runtime(request)
    return {"items": runtime.storage.list_tasks(manager_id=manager_id, status=status)}


@router.get("/clients")
async def get_clients(request: Request, manager_id: str | None = Query(default=None)):
    runtime = get_runtime(request)
    return {"items": runtime.storage.list_clients(manager_id=manager_id)}


@router.get("/dialogs")
async def get_dialogs(
    request: Request,
    manager_id: str | None = Query(default=None),
    sort_by: Literal["priority", "last_message"] = Query(default="priority"),
):
    runtime = get_runtime(request)
    return {
        "items": runtime.dialog_service.list_manager_dialogs(
            storage=runtime.storage,
            manager_id=manager_id,
            sort_by=sort_by,
        )
    }
