from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class FeatureFlags:
    supervisor_dashboard: bool = True
    assistant_panel: bool = True
    feedback_loop: bool = True
    propensity_module: bool = True

    @classmethod
    def from_env(cls) -> "FeatureFlags":
        return cls(
            supervisor_dashboard=_env_flag("FEATURE_SUPERVISOR_DASHBOARD", True),
            assistant_panel=_env_flag("FEATURE_ASSISTANT_PANEL", True),
            feedback_loop=_env_flag("FEATURE_FEEDBACK_LOOP", True),
            propensity_module=_env_flag("FEATURE_PROPENSITY_MODULE", True),
        )

    def as_dict(self) -> dict[str, bool]:
        return {
            "supervisor_dashboard": self.supervisor_dashboard,
            "assistant_panel": self.assistant_panel,
            "feedback_loop": self.feedback_loop,
            "propensity_module": self.propensity_module,
        }


@dataclass(frozen=True)
class AppSettings:
    title: str
    version: str
    db_path: str | None
    static_dir: Path
    stage_label: str
    features: FeatureFlags

    @classmethod
    def from_env(cls, *, db_path: str | None = None, static_dir: Path | None = None) -> "AppSettings":
        return cls(
            title=os.getenv("APP_TITLE", "Alfa Only Assistant MVP - Manager Cockpit"),
            version=os.getenv("APP_VERSION", "0.10.0"),
            db_path=db_path or os.getenv("APP_DB_PATH"),
            static_dir=static_dir or Path(__file__).resolve().parent / "static",
            stage_label=os.getenv("APP_STAGE_LABEL", "stage-14-production-like-mvp"),
            features=FeatureFlags.from_env(),
        )
