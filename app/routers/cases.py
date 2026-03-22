from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from ..cases import build_case_queue, build_case_view
from ..router_support import get_runtime

router = APIRouter()


@router.get("/cases")
async def get_cases(request: Request, manager_id: str = Query(default="m1")):
    runtime = get_runtime(request)
    return build_case_queue(runtime, manager_id)


@router.get("/cases/{case_id}")
async def get_case_detail(
    request: Request,
    case_id: str,
    work_item_id: str | None = Query(default=None),
):
    runtime = get_runtime(request)
    client = runtime.storage.get_client(case_id)
    if not client:
        raise HTTPException(status_code=404, detail="Case not found")
    return build_case_view(runtime, case_id, client.manager_id, work_item_id=work_item_id)
