from __future__ import annotations

from html import escape

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from ..router_support import get_runtime
from ..runtime import build_ai_health

router = APIRouter()


@router.get("/", include_in_schema=False)
async def index(request: Request):
    runtime = get_runtime(request)
    index_path = runtime.settings.static_dir / "index.html"
    if runtime.frontend_status.available and index_path.is_file():
        return HTMLResponse(index_path.read_text(encoding="utf-8"))

    message = escape(runtime.frontend_status.warning or "Frontend bundle is unavailable.")
    return HTMLResponse(
        f"<html><body><h1>Frontend unavailable</h1><p>{message}</p></body></html>",
        status_code=503,
    )


@router.get("/health")
async def health(request: Request) -> dict[str, object]:
    runtime = get_runtime(request)
    return {
        "status": "ok",
        "stage": runtime.settings.stage_label,
        "storage": "sqlite",
        "version": runtime.settings.version,
        "feature_flags": runtime.settings.features.as_dict(),
        "ai": build_ai_health(runtime),
        "frontend": runtime.frontend_status.as_dict(),
    }
