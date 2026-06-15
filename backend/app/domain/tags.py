"""Человекочитаемые метки слагов-тегов профиля клиента (порт tags.ts).
Слаги — машинные ключи, в текстах показываем русские формулировки."""

from __future__ import annotations

TAG_LABEL: dict[str, str] = {
    "active-chat": "Активный диалог",
    "brokerage": "Брокерские",
    "campaign": "Кампания",
    "churn-risk": "Риск оттока",
    "deal-window": "Окно сделки",
    "deposit": "Депозит",
    "family": "Семья",
    "fx": "Валюта",
    "growth": "Рост капитала",
    "insufficient-data": "Мало данных",
    "insurance": "Страхование",
    "investment-intent": "Интерес к инвестициям",
    "investments": "Инвестиции",
    "liquidity": "Ликвидность",
    "negative-tone": "Негативный тон",
    "new-client": "Новый клиент",
    "premium-card": "Премиальная карта",
    "retention": "Удержание",
    "salary": "Зарплатный проект",
    "service": "Сервис",
    "silent": "Замолчал",
    "silent-client": "Молчаливый клиент",
    "soft-contact": "Мягкий контакт",
    "timing-risk": "Чувствителен к таймингу",
    "travel": "Путешествия",
    "vip": "VIP",
    "wealth": "Крупный капитал",
}


def tag_label(tag: str) -> str:
    """Русская метка тега; для незнакомого слага — гуманизированный fallback."""
    return TAG_LABEL.get(tag, tag.replace("-", " ").replace("_", " "))
