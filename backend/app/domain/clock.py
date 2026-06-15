"""Демо-часы и арифметика времени. Всё время отсчитывается от фиксированного
DEMO_NOW (как clock.ts во фронтенде) — для воспроизводимости.

JS-совместимое округление: JavaScript Math.round округляет .5 вверх (к +∞),
тогда как встроенный round() в Python использует банковское округление. Чтобы
баллы факторов и итоги совпадали с фронтендом до единицы, используем js_round.
"""

from __future__ import annotations

import math
from datetime import datetime

from ..config import DEMO_NOW_ISO


def _parse(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


DEMO_NOW = _parse(DEMO_NOW_ISO)
DEMO_NOW_MS = DEMO_NOW.timestamp() * 1000.0


def parse_ms(iso: str) -> float:
    return _parse(iso).timestamp() * 1000.0


def js_round(x: float) -> int:
    """Эквивалент JS Math.round (округление половины вверх, к +∞)."""
    return math.floor(x + 0.5)


def minutes_since(iso: str) -> int:
    return max(0, js_round((DEMO_NOW_MS - parse_ms(iso)) / 60000.0))
