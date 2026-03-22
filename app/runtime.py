from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from .ai import GroqProvider
from .ai.base import AIProvider
from .config import AppSettings
from .db import SQLiteStorage
from .services import (
    AIScriptService,
    AISummaryService,
    AssistantKnowledgeService,
    AssistantService,
    DialogPriorityService,
    ManagerCockpitService,
    ObjectionWorkflowService,
    ProductPropensityService,
    SupervisorDashboardService,
)

LOGGER = logging.getLogger(__name__)
STATIC_DIR = Path(__file__).resolve().parent / "static"


@dataclass(frozen=True, slots=True)
class FrontendStatus:
    available: bool
    static_mounted: bool
    index_present: bool
    warning: str | None = None

    def as_dict(self) -> dict[str, bool | str | None]:
        return {
            "available": self.available,
            "static_mounted": self.static_mounted,
            "index_present": self.index_present,
            "warning": self.warning,
        }


@dataclass(slots=True)
class AppRuntime:
    settings: AppSettings
    frontend_status: FrontendStatus
    storage: SQLiteStorage
    dialog_service: DialogPriorityService
    cockpit_service: ManagerCockpitService
    propensity_service: ProductPropensityService
    objection_service: ObjectionWorkflowService
    supervisor_service: SupervisorDashboardService
    ai_summary_service: AISummaryService
    ai_script_service: AIScriptService
    assistant_kb_service: AssistantKnowledgeService
    assistant_service: AssistantService
    ai_provider: AIProvider


def evaluate_frontend_status(static_dir: Path) -> FrontendStatus:
    if not static_dir.is_dir():
        return FrontendStatus(
            available=False,
            static_mounted=False,
            index_present=False,
            warning=(
                f"Frontend bundle not found in {static_dir}. "
                "API started without /static mount. Run `make frontend-build` to enable the UI."
            ),
        )

    index_present = (static_dir / "index.html").is_file()
    if not index_present:
        return FrontendStatus(
            available=False,
            static_mounted=True,
            index_present=False,
            warning=(
                f"Frontend bundle is incomplete in {static_dir}: missing index.html. "
                "API is available, but the UI entrypoint is disabled."
            ),
        )

    return FrontendStatus(
        available=True,
        static_mounted=True,
        index_present=True,
    )


def build_runtime(
    *,
    db_path: str | None = None,
    ai_provider: AIProvider | None = None,
    settings: AppSettings | None = None,
) -> AppRuntime:
    app_settings = settings or AppSettings.from_env(db_path=db_path, static_dir=STATIC_DIR)
    storage = SQLiteStorage(db_path=app_settings.db_path)
    dialog_service = DialogPriorityService()
    cockpit_service = ManagerCockpitService(dialog_service=dialog_service)
    propensity_service = ProductPropensityService()
    objection_service = ObjectionWorkflowService()
    supervisor_service = SupervisorDashboardService(cockpit_service=cockpit_service)
    ai_summary_service = AISummaryService()
    ai_script_service = AIScriptService()
    assistant_kb_service = AssistantKnowledgeService()
    assistant_service = AssistantService()
    provider = ai_provider or GroqProvider.from_env()
    frontend_status = evaluate_frontend_status(app_settings.static_dir)

    assistant_kb_service.ensure_snapshots(storage, dialog_service)
    if frontend_status.warning:
        LOGGER.warning(frontend_status.warning)

    return AppRuntime(
        settings=app_settings,
        frontend_status=frontend_status,
        storage=storage,
        dialog_service=dialog_service,
        cockpit_service=cockpit_service,
        propensity_service=propensity_service,
        objection_service=objection_service,
        supervisor_service=supervisor_service,
        ai_summary_service=ai_summary_service,
        ai_script_service=ai_script_service,
        assistant_kb_service=assistant_kb_service,
        assistant_service=assistant_service,
        ai_provider=provider,
    )


def build_ai_health(runtime: AppRuntime) -> dict[str, str | bool | None]:
    settings = getattr(runtime.ai_provider, "settings", None)
    api_key = getattr(settings, "api_key", None)
    available = bool(api_key)
    return {
        "available": available,
        "provider": runtime.ai_provider.__class__.__name__,
        "reason": None if available else "AI-функции отключены: не настроен GROQ_API_KEY.",
    }
