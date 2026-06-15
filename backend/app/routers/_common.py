"""Общие хелперы роутеров: id рантайм-записей, время, восстановление WorkItem."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from .. import db
from ..domain.prioritization import build_value_scale
from ..domain.workqueue import build_work_item


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    # Префикс 'rt-' помечает рантайм-записи (как sentMessages во фронтенде).
    return f"{prefix}-{uuid4().hex[:8]}"


def resolve_work_item(work_item_id: str) -> Optional[dict[str, Any]]:
    """Восстанавливает WorkItem по его id ('wi:<taskId>') без параметра менеджера:
    задача → клиент → менеджер → шкала ценности портфеля → сборка кейса."""
    if ":" not in work_item_id:
        return None
    task_id = work_item_id.split(":", 1)[1]
    task = db.get_task(task_id)
    if not task:
        return None
    client = db.get_client(task["clientId"])
    if not client:
        return None
    value_scale = build_value_scale(db.get_clients_by_manager(client["managerId"]))
    return build_work_item(task, value_scale)
