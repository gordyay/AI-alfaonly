"""Архитектурное качество: чистота слоёв и абстракция ИИ-провайдера (§6.4)."""

import pathlib

APP = pathlib.Path(__file__).resolve().parent.parent / "app"


def test_no_hardcoded_secrets():
    for p in APP.rglob("*.py"):
        text = p.read_text(encoding="utf-8")
        assert "sk-" not in text
        assert "AKIA" not in text


def test_domain_independent_of_web_framework():
    # Доменный слой — чистая логика, не зависит от FastAPI (переносим в пилот без UI).
    for p in (APP / "domain").rglob("*.py"):
        assert "fastapi" not in p.read_text(encoding="utf-8")


def test_ai_provider_has_no_direct_db_import():
    # ИИ-функции работают только на переданном контексте (NFR4), не лезут в БД.
    det = (APP / "ai" / "deterministic.py").read_text(encoding="utf-8")
    assert "from ..db" not in det
    assert "import db" not in det


def test_provider_abstraction_complete():
    from app.ai.base import AIProvider
    from app.ai.deterministic import DeterministicProvider

    assert issubclass(DeterministicProvider, AIProvider)
    for method in ("generate_reply", "generate_script", "generate_objection", "generate_summary", "answer_question"):
        assert hasattr(DeterministicProvider, method)


def test_factory_default_is_deterministic():
    from app.ai import get_provider

    assert get_provider().name == "deterministic"
