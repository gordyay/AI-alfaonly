"""Детерминированный «ИИ»-слой — порт src/ai (reply, script, objection, summary,
chat). Без случайности: вариативность достигается переключением по полям
ограниченного контекста (NFR4). Тексты и формулировки сохранены 1:1 с фронтендом.
"""

from __future__ import annotations

import re
from typing import Any, Optional

from ..domain.context import first_name, has_pending_incoming, last_incoming
from ..domain.tags import tag_label
from .base import AIProvider

# Риск-профиль в текстах ИИ (aggressive → «активный», мягче для клиента).
AI_RISK_RU = {"conservative": "консервативный", "moderate": "умеренный", "aggressive": "активный"}

CONSTRAINT_RU = {
    "avoid_pressure": "без давления",
    "no_pressure": "без давления",
    "aggressive_entry": "осторожно с резким входом",
    "complexity": "избегать сложных формулировок",
    "timing_risk": "чувствителен к таймингу",
    "timing": "чувствителен к таймингу",
    "keep_message_short": "короткие сообщения",
    "no_long_messages": "короткие сообщения",
    "avoid_long_presentation": "без длинных презентаций",
    "avoid_long_terms": "без сложных формулировок",
    "mobile_format_only": "формат для мобильного",
    "separate_topics": "не смешивать темы",
    "avoid_topic_mixing": "не смешивать темы",
    "no_call": "предпочитает переписку звонку",
    "no_sales_push": "сначала сервис, без продаж",
    "negative_service": "есть сервисная претензия",
    "show_ownership": "ждёт личной ответственности",
    "trust": "вопрос доверия",
    "risk": "осторожен к риску",
    "liquidity": "важна ликвидность",
    "needs_speed": "важна скорость",
    "needs_precision": "важна точность",
    "silent": "снизил активность",
}


def constraint_ru(c: str) -> str:
    return CONSTRAINT_RU.get(c, c.replace("_", " "))


def _lower_first(s: str) -> str:
    return s[0].lower() + s[1:] if s else s


def _capitalize_first(s: str) -> str:
    return s[0].upper() + s[1:] if s else s


def _lead_product(ctx: dict[str, Any]) -> Optional[dict[str, Any]]:
    rp = ctx["relevantProducts"]
    return rp[0] if rp else None


def _first_sentence(text: str) -> str:
    return re.split(r"(?<=[.!?])\s", text)[0]


def _product_essence(p: dict[str, Any]) -> str:
    return re.sub(r"\.$", "", _first_sentence(p["pitch"]))


# ============================================================================
# ОТВЕТ НА ВХОДЯЩЕЕ (reply.ts)
# ============================================================================

_TOPIC_RU_REPLY = {
    "investments": "инвестиции", "investment": "инвестиции",
    "liquidity": "свободную ликвидность", "capital_preservation": "сохранение капитала",
    "capital_protection": "защиту капитала", "deposit": "вклад",
    "structured_deals": "структурные решения", "fx": "валютные инструменты",
    "brokerage": "брокерский счёт", "portfolio_growth": "рост портфеля",
    "growth": "рост портфеля", "travel": "travel-сервис",
    "premium_card": "премиальную карту", "service": "качество сервиса",
    "insurance": "страховую защиту", "family": "защиту семьи", "cashback": "кэшбэк",
    "retention": "продолжение нашего сотрудничества", "bond_alternative": "альтернативу облигациям",
    "soft_follow_up": "наш диалог",
}


def _topic_ru_reply(t: str) -> str:
    return _TOPIC_RU_REPLY.get(t, t.replace("_", " "))


def _read_constraints_reply(constraints: list[str]) -> dict[str, bool]:
    def has(*keys: str) -> bool:
        return any(k in constraints for k in keys)

    return {
        "noPressure": has("avoid_pressure", "no_pressure", "timing_risk", "timing"),
        "short": has("keep_message_short", "no_long_messages", "avoid_long_presentation", "avoid_long_terms"),
        "oneTopic": has("separate_topics", "avoid_topic_mixing"),
        "noCall": has("no_call"),
        "serviceFirst": has("no_sales_push", "negative_service"),
        "mobile": has("mobile_format_only"),
        "ownership": has("show_ownership"),
    }


def _reply_sources(ctx: dict[str, Any], has_incoming: bool) -> list[str]:
    sources: list[str] = []
    sources.append("Последнее сообщение клиента" if has_incoming else "Контакт без непрочитанного сообщения (проактивный повод)")
    risk_ru = AI_RISK_RU.get(ctx["client"]["riskAppetite"], ctx["client"]["riskAppetite"])
    sources.append(f"Профиль: {risk_ru} риск-профиль")
    insight = ctx.get("insight")
    if insight:
        sources.append("Инсайт диалога")
        if insight["topics"]:
            sources.append("Темы интереса: " + ", ".join(_topic_ru_reply(t) for t in insight["topics"][:3]))
        if insight["constraints"]:
            sources.append("Ограничения: " + ", ".join(constraint_ru(c) for c in insight["constraints"][:3]))
    else:
        sources.append("Анализ диалога недоступен — формулировки нейтральные")
    if ctx["relevantProducts"]:
        sources.append("Релевантные продукты: " + ", ".join(p["name"] for p in ctx["relevantProducts"][:2]))
    return sources


def _reply_proactive(name: str, topic_phrase: Optional[str], lead: Optional[dict], flags: dict) -> str:
    if flags["noPressure"]:
        if topic_phrase:
            return f"{name}, без спешки — если тема «{topic_phrase}» ещё актуальна, я готов помочь, когда вам будет удобно."
        return f"{name}, на связи. Если появится вопрос или что-то станет актуальным — пишите, я рядом."
    if lead and topic_phrase:
        return f"{name}, подготовил кое-что по «{lead['name']}» под вашу тему «{topic_phrase}». Подсказать подробнее или прислать короткое сравнение?"
    return f"{name}, добрый день. Хотел вернуться к нашему разговору — подскажите, актуальна ли ещё тема, и я помогу с конкретикой."


def _reply_main(name: str, style: str, topic_phrase: Optional[str], lead: Optional[dict], flags: dict, risk: str) -> str:
    theme = topic_phrase or "ваш вопрос"
    if style == "short" or flags["short"] or flags["mobile"]:
        if lead:
            return f"{name}, спасибо за сообщение. По «{lead['name']}» под {theme} подобрал вариант — прислать кратко?"
        return f"{name}, спасибо, понял вас. Подготовлю короткий ответ по теме «{theme}» — пришлю в ближайшее время."
    if style == "comparison":
        base = (
            f"{name}, спасибо за вопрос. Соберу для вас сравнение в двух-трёх сценариях вокруг «{lead['name']}», чтобы вы видели логику, а не только итог."
            if lead
            else f"{name}, спасибо за вопрос. Подготовлю сравнение нескольких вариантов по теме «{theme}», чтобы выбор был наглядным."
        )
        tail = " Без спешки — посмотрите, когда будет удобно." if flags["noPressure"] else " Скажите, какой горизонт для вас комфортнее, и я уточню расчёт."
        return base + tail
    if lead:
        lead2 = f"{name}, спасибо, что написали. По теме «{theme}» предлагаю отталкиваться от «{lead['name']}»: {_lower_first(_product_essence(lead))}."
    else:
        lead2 = f"{name}, спасибо, что написали. По теме «{theme}» подготовлю развёрнутый ответ с конкретными вариантами под ваш {AI_RISK_RU.get(risk, risk)} профиль."
    action = (
        " Распишу всё в переписке, чтобы вам было удобно вернуться к деталям."
        if flags["noCall"]
        else " Если будет удобно, можем коротко созвониться и пройтись по деталям вместе."
    )
    return lead2 + action


def _reply_rationale(style: str, flags: dict) -> str:
    parts: list[str] = []
    if flags["short"] or flags["mobile"] or style == "short":
        parts.append("держим ответ коротким")
    if style == "comparison":
        parts.append("даём сравнение вариантов, как предпочитает клиент")
    if style == "detailed":
        parts.append("отвечаем развёрнуто, как ожидает клиент")
    if flags["noPressure"]:
        parts.append("без давления")
    if flags["noCall"]:
        parts.append("остаёмся в переписке")
    if flags["oneTopic"]:
        parts.append("не смешиваем темы")
    tail = ", ".join(parts) if parts else "отвечаем по существу обращения"
    return f"Ответ учитывает последнее сообщение клиента и его предпочтения: {tail}."


def generate_reply_det(ctx: dict[str, Any]) -> dict[str, Any]:
    name = first_name(ctx)
    client = ctx["client"]
    insight = ctx.get("insight")
    last = last_incoming(ctx)
    pending = has_pending_incoming(ctx)
    flags = _read_constraints_reply(insight["constraints"] if insight else [])
    style = insight["responseStyle"] if insight else "short"
    lead = _lead_product(ctx)
    topic_phrase = _topic_ru_reply(insight["topics"][0]) if (insight and insight["topics"]) else None
    sources = _reply_sources(ctx, pending)

    if pending and last:
        cleaned = last["text"].strip()
        no_topic = (not insight) or len(insight["topics"]) == 0
        too_short = sum(1 for c in cleaned if c.isalnum()) < 4
        if (too_short or no_topic) and len(ctx["relevantProducts"]) == 0:
            return {
                "text": f"{name}, спасибо, что написали. Чтобы ответить точно, а не наугад, уточните, пожалуйста, что именно вас интересует — так подберу решение под вашу ситуацию.",
                "rationale": "Смысл сообщения не удалось однозначно определить — вместо догадки задаём уточняющий вопрос (исключение UC-04, принцип «фиксировать пробел, а не домысливать»).",
                "sources": sources,
            }

    if flags["serviceFirst"]:
        if pending:
            text = f"{name}, спасибо, что написали. Беру ваш вопрос под личный контроль и вернусь с решением, а не с отписками. Сейчас для меня это приоритет — никаких предложений, пока всё не уладим."
            rationale = "Клиент в негативе/просил не продавать — отвечаем сервисом и личной ответственностью, без продуктов."
        else:
            text = f"{name}, на связи. Хочу убедиться, что у вас всё в порядке по последнему вопросу — держу его на личном контроле. Если что-то ещё беспокоит, напишите, разберусь."
            rationale = "Непрочитанного обращения нет; проактивно закрываем сервисный вопрос без продуктовой темы, как требуют ограничения."
        return {"text": text, "rationale": rationale, "sources": sources}

    if not pending:
        return {
            "text": _reply_proactive(name, topic_phrase, lead, flags),
            "rationale": "Непрочитанного сообщения нет — это аккуратный проактивный повод вернуться к теме клиента без давления.",
            "sources": sources,
        }

    return {
        "text": _reply_main(name, style, topic_phrase, lead, flags, client["riskAppetite"]),
        "rationale": _reply_rationale(style, flags),
        "sources": sources,
    }


# ============================================================================
# СЦЕНАРИЙ ПРОДАЖ (script.ts)
# ============================================================================

_TOPIC_RU_SCRIPT = {
    "investments": "инвестиции", "investment": "инвестиции",
    "liquidity": "свободную ликвидность", "capital_preservation": "сохранение капитала",
    "capital_protection": "защиту капитала", "deposit": "вклад",
    "structured_deals": "структурные решения", "fx": "валютные инструменты",
    "brokerage": "брокерский счёт", "portfolio_growth": "рост портфеля",
    "growth": "рост портфеля", "travel": "поездки и travel-сервис",
    "premium_card": "премиальную карту", "service": "качество сервиса",
    "insurance": "страховую защиту", "family": "защиту семьи", "cashback": "кэшбэк",
    "retention": "сохранение отношений", "bond_alternative": "альтернативу облигациям",
    "soft_follow_up": "мягкое продолжение диалога",
}


def _topic_ru_script(t: str) -> str:
    return _TOPIC_RU_SCRIPT.get(t, t.replace("_", " "))


def _read_constraints_script(constraints: list[str]) -> dict[str, bool]:
    def has(*keys: str) -> bool:
        return any(k in constraints for k in keys)

    return {
        "noPressure": has("avoid_pressure", "no_pressure", "timing_risk", "timing"),
        "short": has("keep_message_short", "no_long_messages", "avoid_long_messages", "avoid_long_presentation", "avoid_long_terms"),
        "oneTopic": has("separate_topics", "avoid_topic_mixing"),
        "noCall": has("no_call"),
        "serviceFirst": has("no_sales_push", "negative_service"),
        "mobile": has("mobile_format_only"),
        "ownership": has("show_ownership"),
    }


def _soft_call(flags: dict) -> str:
    if flags["noCall"]:
        return "Если удобно, продолжим в переписке"
    if flags["noPressure"]:
        return "Если будет интересно, подскажите — без спешки"
    return "Скажите, когда удобно обсудить детали"


def _script_structural(name, goal_clause, lead, topic_phrase, flags, risk_ru) -> str:
    if flags["serviceFirst"]:
        return " ".join([
            f"{name}, спасибо, что обозначили ситуацию.",
            "Беру вопрос под личный контроль и в первую очередь хочу убедиться, что сервисная часть закрыта.",
            f"Как только всё будет в порядке, вернёмся к {topic_phrase} — без спешки и в удобном вам формате.",
        ])
    sentences = [f"{name}, по вашему запросу подготовил короткий план: {goal_clause}."]
    if lead:
        sentences.append(f"Предлагаю отталкиваться от «{lead['name']}» — {_lower_first(_product_essence(lead))}, что хорошо ложится на ваш {risk_ru} профиль.")
        if not flags["short"]:
            sentences.append("Соберу сравнение в двух-трёх сценариях, чтобы вы видели логику, а не только итог.")
    else:
        sentences.append(f"Сначала зафиксируем приоритеты по теме «{topic_phrase}», затем подберу конкретные варианты под них.")
    sentences.append(f"{_soft_call(flags)}.")
    return " ".join(sentences)


def _script_soft(name, topic_phrase, lead, flags) -> str:
    sentences = [f"{name}, без какой-либо спешки — хотел вернуться к теме «{topic_phrase}», когда вам будет комфортно."]
    if flags["serviceFirst"]:
        sentences.append("Сейчас для меня важнее, чтобы вы остались довольны сервисом; всё остальное обсудим позже, как вам удобно.")
    elif lead:
        sentences.append(f"Если будет интересно, могу спокойно показать, чем «{lead['name']}» может быть полезен именно вам — без обязательств.")
    else:
        sentences.append("Я рядом и готов помочь, как только тема станет для вас актуальной.")
    if not flags["noCall"] and not flags["serviceFirst"]:
        sentences.append("Можем созвониться или остаться в переписке — как удобнее.")
    return " ".join(sentences)


def _script_short(name, topic_phrase, lead, flags) -> str:
    if flags["serviceFirst"]:
        return f"{name}, держу ваш вопрос на личном контроле — отпишусь, как только всё решим."
    if lead:
        return f"{name}, подобрал вариант по «{lead['name']}» под {topic_phrase}. Прислать короткое сравнение?"
    return f"{name}, есть пара идей по теме «{topic_phrase}». Подскажите, когда удобно — пришлю кратко."


def generate_script_det(ctx: dict[str, Any], goal: str, instruction: Optional[str] = None) -> dict[str, Any]:
    name = first_name(ctx)
    client = ctx["client"]
    insight = ctx.get("insight")
    relevant = ctx["relevantProducts"]
    owned = ctx["ownedProducts"]
    flags = _read_constraints_script(insight["constraints"] if insight else [])
    topics = insight["topics"] if insight else []
    risk_ru = AI_RISK_RU.get(client["riskAppetite"], client["riskAppetite"])

    talking_points: list[str] = [f"Цель контакта: {re.sub(r'\.$', '', goal.strip())}."]
    if topics:
        t = " и ".join(_topic_ru_script(x) for x in topics[:2])
        talking_points.append(f"Клиент уже проявлял интерес к теме: {t} — опираемся на это, а не начинаем с нуля.")
    elif client["tags"]:
        talking_points.append(f"По профилю клиент тяготеет к темам: {', '.join(tag_label(x) for x in client['tags'][:2])}.")
    talking_points.append(f"Риск-профиль {risk_ru}: подбираем формулировки и продукты под этот уровень риска.")
    if not flags["serviceFirst"] and relevant:
        p = relevant[0]
        talking_points.append(f"Ключевой продукт — «{p['name']}»: {_product_essence(p)}.")
    elif flags["serviceFirst"]:
        talking_points.append("Сначала сервис: снимаем напряжение и берём ответственность, продукт — только после восстановления доверия.")
    if owned:
        owned_str = ", ".join(f"«{o['product']['name']}»" for o in owned[:2])
        talking_points.append(f"У клиента уже есть {owned_str} — связываем предложение с тем, чем он пользуется.")

    trimmed_points = talking_points[:5]

    lead = relevant[0] if relevant else None
    topic_phrase = _topic_ru_script(topics[0]) if topics else "ваш вопрос"
    goal_clause = re.sub(r"\.$", "", goal.strip()).lower()

    variants = [
        {"label": "Структурный", "tone": "деловой, по существу", "text": _script_structural(name, goal_clause, lead, topic_phrase, flags, risk_ru)},
        {"label": "Мягкий", "tone": "тёплый, без давления", "text": _script_soft(name, topic_phrase, lead, flags)},
        {"label": "Короткий", "tone": "лаконичный, для мобильного", "text": _script_short(name, topic_phrase, lead, flags)},
    ]

    instr = (instruction or "").strip()
    if instr:
        wants_softer = bool(re.search(r"мягч|деликат|без давлен", instr, re.IGNORECASE))
        wants_short = bool(re.search(r"короч|кратк|сжат", instr, re.IGNORECASE))
        omit_product = bool(re.search(r"без цен|не упомин.*цен|без продукт", instr, re.IGNORECASE))
        overridden = {**flags, "noPressure": flags["noPressure"] or wants_softer, "short": flags["short"] or wants_short}
        overridden_lead = None if omit_product else lead
        if wants_short:
            custom = _script_short(name, topic_phrase, overridden_lead, overridden)
        elif wants_softer:
            custom = _script_soft(name, topic_phrase, overridden_lead, overridden)
        else:
            custom = _script_structural(name, goal_clause, overridden_lead, topic_phrase, overridden, risk_ru)
        variants.append({"label": "По вашей правке", "tone": "по инструкции менеджера", "text": custom})

    data_gaps: list[str] = []
    if not insight:
        data_gaps.append("Нет анализа последнего диалога — темы и ограничения берём из профиля, формулировки нейтральные.")
    if not client.get("note"):
        data_gaps.append("Заметка о клиенте не заполнена — стоит уточнить приоритеты лично, прежде чем углубляться в продукт.")

    return {"goal": goal, "talkingPoints": trimmed_points, "variants": variants, "dataGaps": data_gaps}


# ============================================================================
# ОТРАБОТКА ВОЗРАЖЕНИЯ (objection.ts)
# ============================================================================

_OBJ_PATTERNS = [
    ("риск", re.compile(r"риск|нервно|пик|опаса|страшно|боюсь|просед|волатил", re.IGNORECASE)),
    ("цена/комиссии", re.compile(r"дорого|комисс|ставк|переплач|цена|стоит дорого", re.IGNORECASE)),
    ("тайминг", re.compile(r"позже|не сейчас|подожд|тайминг|время не|не время|потом", re.IGNORECASE)),
    ("сервис/доверие", re.compile(r"сервис|задержк|недовол|раздража|подвел|ошибк|сбой|доверие|обман", re.IGNORECASE)),
    ("сложность", re.compile(r"сложно|длинн|перегруж|запутан|непонятн|много букв|разобрат", re.IGNORECASE)),
    ("конкурент", re.compile(r"другой банк|условия лучше|у них|в другом|конкурент|предлагают лучше", re.IGNORECASE)),
]
_OBJ_FORCE_MAJEURE = re.compile(r"блокиров|мошенн|форс-?мажор|украл|взлом|списа.*без|двойн.*списа", re.IGNORECASE)


def _detect_objection_type(text: str) -> str:
    for typ, rgx in _OBJ_PATTERNS:
        if rgx.search(text):
            return typ
    return "общее сомнение"


def _read_constraints_obj(constraints: list[str]) -> dict[str, bool]:
    def has(*keys: str) -> bool:
        return any(k in constraints for k in keys)

    return {
        "noPressure": has("avoid_pressure", "no_pressure", "timing_risk", "timing"),
        "short": has("keep_message_short", "no_long_messages", "avoid_long_presentation", "avoid_long_terms", "mobile_format_only"),
        "oneTopic": has("separate_topics", "avoid_topic_mixing"),
        "noCall": has("no_call"),
        "serviceFirst": has("no_sales_push", "negative_service"),
        "ownership": has("show_ownership"),
    }


def _objection_options(name: str, typ: str, lead: Optional[dict], flags: dict) -> list[dict]:
    prod = f"«{lead['name']}»" if (lead and not flags["serviceFirst"]) else "подходящее решение"
    if typ == "риск":
        return [
            {"title": "Признать опасение и снизить шаг входа", "response": f"{name}, понимаю, что сейчас входить на всю сумму некомфортно. Можно начать с небольшой части и поэтапно — так вы контролируете риск и видите результат, прежде чем двигаться дальше.", "rationale": "Не спорим с эмоцией, а снижаем цену ошибки: поэтапный вход снимает страх необратимого решения."},
            {"title": "Сместить акцент на защиту капитала", "response": f"{name}, для вашей задачи важнее не максимальная доходность, а спокойствие. Давайте посмотрим консервативную часть, где капитал защищён, а доходность всё равно выше базовой.", "rationale": "Переводим разговор с «риска» на «контроль», что соответствует осторожному настрою клиента."},
            {"title": "Дать ориентир по сценариям", "response": f"{name}, чтобы решение было осознанным, покажу два-три сценария с разным уровнем риска — без давления, просто чтобы вы видели логику.", "rationale": "Прозрачность сценариев возвращает клиенту чувство контроля и снижает тревогу."},
        ]
    if typ == "цена/комиссии":
        return [
            {"title": "Перевести на ценность, а не на цену", "response": f"{name}, давайте посмотрим не на комиссию отдельно, а на итог в ваших деньгах. По {prod} чистый результат обычно перекрывает расходы — посчитаю на ваших цифрах.", "rationale": "Сравнение «нетто-результата» обезоруживает возражение о цене конкретикой, а не оправданиями."},
            {"title": "Показать прозрачность условий", "response": f"{name}, у нас нет скрытых платежей — разложу все условия по пунктам, чтобы вы видели, за что именно платите.", "rationale": "Прозрачность снимает подозрение о переплате и укрепляет доверие."},
            {"title": "Предложить подходящий по бюджету формат", "response": f"{name}, если хочется аккуратнее по затратам, подберу вариант с меньшим порогом входа — ценность сохраним, расходы уменьшим.", "rationale": "Даём выбор вместо торга: клиент сам выбирает комфортный уровень, не теряя ценности."},
        ]
    if typ == "тайминг":
        return [
            {"title": "Согласиться и зафиксировать удобное окно", "response": f"{name}, абсолютно нормально не торопиться. Давайте я просто вернусь в удобное вам время — подскажите, когда комфортно, и до тех пор не беспокою.", "rationale": "Не давим на «сейчас»: уважение к таймингу клиента сохраняет отношения и право на следующий контакт."},
            {"title": "Оставить короткий ориентир на будущее", "response": f"{name}, чтобы не терять время, когда тема станет актуальной, пришлю одно короткое резюме — вернётесь к нему, когда будете готовы.", "rationale": "Лёгкий «якорь» без обязательств держит тему живой и не выглядит навязчивым."},
        ]
    if typ == "сервис/доверие":
        return [
            {"title": "Взять ответственность и извиниться", "response": f"{name}, мне жаль, что так вышло — это моя зона ответственности. Разберусь лично и вернусь к вам с решением, а не с отписками.", "rationale": "Признание ответственности — единственный способ восстановить доверие; оправдания его разрушают."},
            {"title": "Сначала решить, потом всё остальное", "response": f"{name}, сейчас для меня в приоритете закрыть именно этот вопрос. Никаких продуктов и предложений — давайте сначала уберём проблему.", "rationale": "Сервис вперёд продаж: смешивать тему с продажей в момент негатива недопустимо."},
            {"title": "Дать конкретику по срокам", "response": f"{name}, чтобы это не повисло: назову конкретный срок, к которому вернусь с результатом, и проконтролирую сам.", "rationale": "Конкретный срок и личный контроль возвращают клиенту ощущение, что его слышат."},
        ]
    if typ == "сложность":
        return [
            {"title": "Свернуть до сути в одном сообщении", "response": f"{name}, упрощаю: суть в одном предложении и один следующий шаг. Если зайдёт — раскрою детали, если нет — на этом остановимся.", "rationale": "Сокращение когнитивной нагрузки снимает возражение «слишком сложно» лучше любых пояснений."},
            {"title": "Предложить формат «по шагам»", "response": f"{name}, давайте не всё сразу. Разберём по одному шагу за раз, в удобном вам темпе — без перегруза.", "rationale": "Дробление на шаги делает решение посильным и снимает ощущение «много всего»."},
        ]
    if typ == "конкурент":
        return [
            {"title": "Сравнить честно, по фактам", "response": f"{name}, давайте сравним по пунктам — без маркетинга. Если у коллег где-то лучше, прямо скажу; зато покажу, где вы выигрываете у нас.", "rationale": "Честное сравнение вызывает доверие сильнее, чем огульная критика конкурента."},
            {"title": "Подсветить персональный сервис", "response": f"{name}, ставка — это половина истории. Вторая половина — что у вас есть персональный менеджер, который ведёт вопрос лично; это и есть разница.", "rationale": "Переводим разговор со «ставки» на сервис и отношения — то, что конкурент не скопирует."},
        ]
    return [
        {"title": "Уточнить настоящую причину сомнения", "response": f"{name}, чтобы быть полезным, а не просто настойчивым: подскажите, что именно вызывает сомнение? Так подберу вариант точно под вашу ситуацию.", "rationale": "За общим сомнением обычно стоит конкретная причина — вопрос вскрывает её без давления."},
        {"title": "Снять давление и оставить выбор", "response": f"{name}, никакой спешки. Я просто оставлю короткое резюме, а решение полностью за вами — вернёмся к нему, когда будет удобно.", "rationale": "Снятие давления сохраняет отношения и оставляет дверь открытой для следующего шага."},
    ]


def _objection_avoid(typ: str, flags: dict) -> list[str]:
    avoid: list[str] = []
    base = {
        "риск": ["Не обесценивайте опасение («да тут вообще нет риска»).", "Не давите на упущенную выгоду и не торопите с решением."],
        "цена/комиссии": ["Не спорьте о цене в лоб и не оправдывайтесь за комиссию.", "Не обещайте «эксклюзивных скидок», которых нет."],
        "тайминг": ["Не создавайте искусственную срочность («предложение только сегодня»).", "Не напоминайте о себе слишком часто."],
        "сервис/доверие": ["Не перекладывайте вину на клиента, систему или коллег.", "Не переходите к продаже, пока проблема не решена."],
        "сложность": ["Не заваливайте деталями и терминами.", "Не отправляйте длинные сообщения и таблицы."],
        "конкурент": ["Не критикуйте другой банк эмоционально и голословно.", "Не обещайте «перебить любые условия» без расчёта."],
    }.get(typ, ["Не настаивайте, не выяснив реальную причину сомнения.", "Не предлагайте всё подряд в надежде угадать."])
    avoid.extend(base)
    if flags["noPressure"]:
        avoid.append("Никакого давления и срочности — клиент это плохо переносит.")
    if flags["short"]:
        avoid.append("Без длинных сообщений — держите ответ коротким.")
    if flags["oneTopic"]:
        avoid.append("Не смешивайте темы — обсуждаем строго один вопрос.")
    if flags["noCall"]:
        avoid.append("Не предлагайте звонок — клиент предпочитает переписку.")
    if flags["serviceFirst"]:
        avoid.append("Никаких продуктовых предложений сейчас — только сервис.")
    # dedup, сохраняя порядок, и максимум 4
    seen: list[str] = []
    for a in avoid:
        if a not in seen:
            seen.append(a)
    return seen[:4]


def _objection_escalation(typ: str, sentiment: Optional[str], objection_text: str) -> Optional[str]:
    if _OBJ_FORCE_MAJEURE.search(objection_text):
        return "Передать профильному специалисту: возможный инцидент безопасности или форс-мажор — требует немедленной проверки и не решается в рамках обычного диалога."
    if typ == "сервис/доверие" and sentiment in ("negative", "tense"):
        return "Передать профильному специалисту: жалоба на сервис с негативным настроем — подключить сервис-команду и держать вопрос на личном контроле до решения."
    return None


def generate_objection_det(ctx: dict[str, Any], objection_text: str) -> dict[str, Any]:
    name = first_name(ctx)
    typ = _detect_objection_type(objection_text)
    insight = ctx.get("insight")
    flags = _read_constraints_obj(insight["constraints"] if insight else [])
    lead = _lead_product(ctx)
    sentiment = insight["sentiment"] if insight else None
    return {
        "objectionText": objection_text,
        "objectionType": typ,
        "options": _objection_options(name, typ, lead, flags),
        "avoid": _objection_avoid(typ, flags),
        "escalate": _objection_escalation(typ, sentiment, objection_text),
    }


# ============================================================================
# СВОДКА + ЧЕРНОВИК CRM (summary.ts)
# ============================================================================

_TOPIC_RU_SUMMARY = {
    "investments": "инвестиции", "investment": "инвестиции",
    "liquidity": "размещение свободной ликвидности", "capital_preservation": "сохранение капитала",
    "capital_protection": "защиту капитала", "deposit": "вклад",
    "structured_deals": "структурные решения", "fx": "валютные инструменты",
    "brokerage": "брокерский счёт", "portfolio_growth": "рост портфеля",
    "growth": "рост портфеля", "travel": "travel-сервис и поездки",
    "premium_card": "премиальную карту", "service": "качество сервиса",
    "insurance": "страховую защиту", "family": "защиту семьи", "cashback": "кэшбэк",
    "retention": "удержание и отношения", "bond_alternative": "альтернативу облигациям",
    "soft_follow_up": "продолжение диалога",
}
_SENTIMENT_RU = {"interested": "есть интерес к теме", "neutral": "настрой нейтральный", "tense": "настрой настороженный", "negative": "есть недовольство"}
_BUYING_RU = {"low": "слабый", "medium": "умеренный", "high": "выраженный", "speed_sensitive": "чувствителен к скорости"}


def _topic_ru_summary(t: str) -> str:
    return _TOPIC_RU_SUMMARY.get(t, t.replace("_", " "))


def _plural_msg(n: int) -> str:
    m10, m100 = n % 10, n % 100
    if m10 == 1 and m100 != 11:
        return "сообщение"
    if 2 <= m10 <= 4 and (m100 < 10 or m100 >= 20):
        return "сообщения"
    return "сообщений"


def _buying_signal_ru(s: str) -> str:
    return _BUYING_RU.get(s, s)


def _summary_outcome(insight: Optional[dict], has_incoming: bool) -> str:
    if not insight:
        return "Диалог открыт, ждёт ответа менеджера" if has_incoming else "Контакт зафиксирован, требуется уточнение"
    s = insight["sentiment"]
    if s == "negative":
        return "Есть сервисная претензия — на контроле, до продаж не дошли"
    if s == "tense":
        return "Клиент насторожен — нужен аккуратный следующий шаг"
    if s == "interested":
        return "Клиент подтвердил интерес, ждёт следующий шаг" if insight["buyingSignal"] == "high" else "Интерес есть, прогреваем дальше"
    return "Тема актуальна, важна скорость ответа" if insight["buyingSignal"] == "speed_sensitive" else "Диалог в работе, договорённость зафиксирована"


def _summary_crm_draft(name, topic_list, insight, next_step, has_incoming, no_dialog) -> str:
    sentences: list[str] = []
    themes = ", ".join(topic_list) if topic_list else "общие вопросы по обслуживанию"
    sentences.append(
        f"Клиент: {name}. Переписки по кейсу пока нет — проактивный контакт по теме: {themes}."
        if no_dialog else f"Клиент: {name}. Обсуждали {themes}."
    )
    if insight:
        sent = _SENTIMENT_RU.get(insight["sentiment"], "настрой нейтральный")
        sentences.append(
            f"По профилю клиента {sent}; сигнал к покупке — {_buying_signal_ru(insight['buyingSignal'])}."
            if no_dialog else f"По итогам диалога {sent}; сигнал к покупке — {_buying_signal_ru(insight['buyingSignal'])}."
        )
        if insight["constraints"]:
            sentences.append("Учитывать: " + ", ".join(constraint_ru(c) for c in insight["constraints"][:3]) + ".")
    else:
        sentences.append("Аналитики по диалогу нет — детали профиля стоит уточнить при следующем контакте.")
    if has_incoming:
        sentences.append("Есть непрочитанное обращение клиента — ответ в приоритете.")
    sentences.append(f"Следующий шаг: {_lower_first(next_step)}.")
    return " ".join(sentences)


def generate_summary_det(ctx: dict[str, Any]) -> dict[str, Any]:
    name = first_name(ctx)
    client = ctx["client"]
    insight = ctx.get("insight")
    messages = ctx["messages"]
    conversation = ctx.get("conversation")
    task = ctx.get("task")

    client_msgs = sum(1 for m in messages if m["sender"] == "client")
    total = len(messages)
    no_dialog = total == 0
    topics = insight["topics"] if insight else []
    topic_list = [_topic_ru_summary(t) for t in topics[:3]]
    last = last_incoming(ctx)
    pending = has_pending_incoming(ctx)

    sentiment_phrase = (_SENTIMENT_RU.get(insight["sentiment"], "в диалоге") if insight else None)
    channel_topic = (conversation["topic"] if conversation else None) or (task["title"] if task else None)

    if topic_list and not no_dialog:
        themes = ", ".join(topic_list)
        summary = f"{name}: в диалоге обсуждали {themes}" + (f"; {sentiment_phrase}" if sentiment_phrase else "") + "."
        summary += f" Всего {total} {_plural_msg(total)}" + (", активность с обеих сторон" if client_msgs > 0 else "") + "."
    elif topic_list:
        summary = f"{name}: переписки по кейсу ещё не было — проактивный повод по теме {', '.join(topic_list)}" + (f"; {sentiment_phrase}" if sentiment_phrase else "") + "."
    elif channel_topic:
        summary = f"Контакт с {name} по теме «{channel_topic}»" + (f"; {sentiment_phrase}" if sentiment_phrase else "") + "."
    else:
        summary = f"Контакт с {name}; тема диалога не зафиксирована — требуется уточнение."

    key_points: list[str] = []
    if topic_list:
        key_points.append((f"Темы для проактивного контакта: {', '.join(topic_list)}." if no_dialog else f"Обсуждали {', '.join(topic_list)}."))
    elif client["tags"]:
        key_points.append("Профильные темы: " + ", ".join(tag_label(t) for t in client["tags"][:3]) + ".")
    if insight and insight["constraints"]:
        key_points.append("Ограничения и пожелания: " + ", ".join(constraint_ru(c) for c in insight["constraints"][:3]) + ".")
    if last:
        snippet = (last["text"][:87].strip() + "…") if len(last["text"]) > 90 else last["text"]
        key_points.append(f"Последняя реплика клиента: «{snippet}».")

    next_step = (insight["recommendedAction"] if insight else None) or ctx.get("nextBestAction") or "Согласовать следующий шаг при следующем контакте."
    key_points.append(f"Договорённость / следующий шаг: {_lower_first(next_step)}.")
    trimmed = key_points[:4]

    return {
        "summary": summary,
        "keyPoints": trimmed,
        "outcome": _summary_outcome(insight, pending),
        "nextStep": next_step,
        "crmDraft": _summary_crm_draft(name, topic_list, insight, next_step, pending, no_dialog),
        "nextContactIso": (insight["nextTouchIso"] if insight else None) or (task["dueAtIso"] if task else None) or client["nextContactIso"],
    }


# ============================================================================
# АССИСТЕНТ Q&A (chat.ts)
# ============================================================================

_INTENT_PATTERNS = [
    ("product", re.compile(r"что предложить|какой продукт|продукт|предложен|подобрать|апсейл|допродаж|кросс", re.IGNORECASE)),
    ("churn", re.compile(r"риск|оттток|отток|удержа|уход|теряем|молчит|молчан|недовол", re.IGNORECASE)),
    ("profile", re.compile(r"о клиенте|профил|кто (он|она|это|такой)|расскажи о|что за клиент|кто клиент", re.IGNORECASE)),
    ("next_step", re.compile(r"следующий шаг|что делать|что дальше|как поступ|какой шаг|план действ|nba|next", re.IGNORECASE)),
    ("summary", re.compile(r"итог|сводк|резюм|кратко|обзор|что было|подытож", re.IGNORECASE)),
]
_CHAT_RISK_RU = {"conservative": "консервативный", "moderate": "умеренный", "aggressive": "активный"}
_CHURN_RU = {"low": "низкий", "medium": "средний", "high": "высокий"}
_TOPIC_RU_CHAT = {
    "investments": "инвестиции", "investment": "инвестиции",
    "liquidity": "свободная ликвидность", "capital_preservation": "сохранение капитала",
    "capital_protection": "защита капитала", "deposit": "вклад",
    "structured_deals": "структурные решения", "fx": "валютные инструменты",
    "brokerage": "брокерский счёт", "portfolio_growth": "рост портфеля",
    "growth": "рост портфеля", "travel": "travel-сервис",
    "premium_card": "премиальная карта", "service": "качество сервиса",
    "insurance": "страховая защита", "family": "защита семьи", "cashback": "кэшбэк",
    "retention": "удержание", "bond_alternative": "альтернатива облигациям", "soft_follow_up": "мягкое продолжение",
}
_CHAT_CHANNEL_RU = {"chat": "чат", "call": "звонок", "meeting": "встреча"}
_NO_DATA = "В доступном контексте этих данных нет — стоит уточнить у клиента."


def _topic_ru_chat(t: str) -> str:
    return _TOPIC_RU_CHAT.get(t, t.replace("_", " "))


def _detect_intent(question: str) -> str:
    for intent, rgx in _INTENT_PATTERNS:
        if rgx.search(question):
            return intent
    return "unknown"


def _turn(text: str, sources: list[str]) -> dict[str, Any]:
    return {"role": "assistant", "text": text, "sources": sources}


def _chat_product(ctx: dict[str, Any]) -> dict[str, Any]:
    sources: list[str] = []
    owned_ids = {o["product"]["id"] for o in ctx["ownedProducts"]}
    candidates = [p for p in ctx["relevantProducts"] if p["id"] not in owned_ids]
    risk = _CHAT_RISK_RU.get(ctx["client"]["riskAppetite"], ctx["client"]["riskAppetite"])
    if not candidates and not ctx["relevantProducts"]:
        sources.append("Релевантные продукты в контексте отсутствуют")
        tags = ctx["client"]["tags"]
        if tags:
            sources.append("Теги профиля: " + ", ".join(tag_label(t) for t in tags))
        tag_hint = (f" По профилю клиент тяготеет к темам: {', '.join(tag_label(t) for t in tags[:3])} — это можно использовать как зацепку." if tags else "")
        return _turn(f"Конкретных релевантных продуктов в контексте кейса нет.{tag_hint} Точечное предложение лучше подобрать после уточнения интереса у клиента.", sources)
    sources.append("Релевантные продукты кейса")
    insight = ctx.get("insight")
    if insight and insight["topics"]:
        sources.append("Темы интереса: " + ", ".join(_topic_ru_chat(t) for t in insight["topics"][:3]))
    sources.append(f"Риск-профиль: {risk}")
    if ctx["ownedProducts"]:
        sources.append("Текущие продукты: " + ", ".join(o["product"]["name"] for o in ctx["ownedProducts"]))
    pick = candidates if candidates else ctx["relevantProducts"]
    lines = [f"«{p['name']}» — {re.sub(r'\.$', '', p['pitch'])}" for p in pick[:3]]
    gap_note = ("Этих продуктов у клиента ещё нет — предложение закрывает пробел в портфеле." if candidates
                else "Эти продукты у клиента уже есть, поэтому речь скорее об апсейле, чем о новом продукте.")
    text = "Под этот кейс уместно предложить:\n• " + "\n• ".join(lines) + f"\n{gap_note} Привязывайте предложение к риск-профилю ({risk}) и тому, что клиент уже поднимал в диалоге."
    return _turn(text, sources)


def _chat_churn(ctx: dict[str, Any]) -> dict[str, Any]:
    client, insight = ctx["client"], ctx.get("insight")
    sources = [f"Профиль: риск оттока — {_CHURN_RU.get(client['churnRisk'], client['churnRisk'])}"]
    signals: list[str] = []
    if insight:
        sources.append("Инсайт диалога")
        if insight["sentiment"] == "negative":
            signals.append("в диалоге выраженный негатив")
        if insight["sentiment"] == "tense":
            signals.append("клиент держится настороженно")
        if "silent" in insight["constraints"]:
            signals.append("снижена активность (молчание)")
        if "trust" in insight["constraints"] or "negative_service" in insight["constraints"]:
            signals.append("есть вопрос доверия / сервисная претензия")
    churn_tags = [t for t in client["tags"] if re.search(r"churn|silent", t)]
    if churn_tags:
        sources.append("Теги: " + ", ".join(tag_label(t) for t in churn_tags))
        signals.append("в профиле отмечены сигналы оттока")
    if client["churnRisk"] == "high" or signals:
        guidance = (
            f"Риск оттока требует внимания{(' (' + '; '.join(signals) + ')') if signals else ''}. "
            "Тактика удержания: сначала закрыть сервисную/эмоциональную часть и взять ответственность на себя, "
            "никакого давления и продаж в моменте. Дальше — короткий аккуратный контакт, проактивная забота, а не оффер."
        )
    elif client["churnRisk"] == "medium":
        guidance = ("Риск оттока средний. Явных тревожных сигналов в диалоге не видно, но стоит поддерживать ритм контактов и реагировать быстро — это снижает вероятность ухода к конкуренту.")
    else:
        guidance = "Риск оттока низкий. Сигналов ухода в контексте нет — достаточно поддерживать привычный уровень сервиса."
    if insight and insight["recommendedAction"]:
        guidance += f" Рекомендованное действие по кейсу: {_lower_first(insight['recommendedAction'])}."
        sources.append("Рекомендованное действие из инсайта")
    return _turn(guidance, sources)


def _chat_profile(ctx: dict[str, Any]) -> dict[str, Any]:
    client, insight = ctx["client"], ctx.get("insight")
    sources = ["Профиль клиента"]
    parts = [f"{client['fullName']}, {client['age']} лет, {client['city']}.",
             f"Сегмент {client['segment']}, риск-профиль {_CHAT_RISK_RU.get(client['riskAppetite'], client['riskAppetite'])}."]
    if client.get("occupation"):
        parts.append(f"Род занятий: {client['occupation']}.")
    if ctx["ownedProducts"]:
        sources.append("Продукты клиента")
        parts.append("Активные продукты: " + ", ".join(o["product"]["name"] for o in ctx["ownedProducts"]) + ".")
    if client.get("note"):
        sources.append("Заметка менеджера")
        parts.append(f"Заметка: {client['note']}")
    else:
        parts.append("Заметка менеджера не заполнена — часть профиля стоит уточнить.")
    if insight and insight["topics"]:
        sources.append("Темы интереса из инсайта")
        parts.append("В диалогах поднимал: " + ", ".join(_topic_ru_chat(t) for t in insight["topics"][:3]) + ".")
    if insight and insight["constraints"]:
        parts.append("Что учитывать: " + ", ".join(constraint_ru(c) for c in insight["constraints"][:3]) + ".")
    if not client.get("note") and (not insight or not insight["topics"]):
        parts.append("Подробной аналитики в контексте мало — для точной картины нужен личный разговор.")
    return _turn(" ".join(parts), sources)


def _chat_next_step(ctx: dict[str, Any]) -> dict[str, Any]:
    sources: list[str] = []
    insight = ctx.get("insight")
    action = (insight["recommendedAction"] if insight else None) or ctx.get("nextBestAction")
    if not action:
        sources.append("Рекомендованное действие в контексте отсутствует")
        return _turn(f"Готового следующего шага в контексте нет. {_NO_DATA} Ориентируйтесь на ближайший срок контакта и тему последнего диалога.", sources)
    if insight and insight["recommendedAction"]:
        sources.append("Рекомендованное действие из инсайта")
    else:
        sources.append("Следующее лучшее действие по кейсу (NBA)")
    text = f"Следующий шаг: {action}."
    if insight:
        sources.append(f"Канал: {_CHAT_CHANNEL_RU.get(insight['preferredChannel'], insight['preferredChannel'])}")
        if insight["constraints"]:
            cons = ", ".join(constraint_ru(c) for c in insight["constraints"][:3])
            sources.append(f"Ограничения: {cons}")
            text += f" При этом учитывайте: {cons}."
        text += f" Предпочтительный канал — {_CHAT_CHANNEL_RU.get(insight['preferredChannel'], insight['preferredChannel'])}."
    return _turn(text, sources)


def _chat_summary(ctx: dict[str, Any]) -> dict[str, Any]:
    insight, messages = ctx.get("insight"), ctx["messages"]
    sources: list[str] = []
    topics = insight["topics"] if insight else []
    last = last_incoming(ctx)
    if not topics and not messages and not insight:
        sources.append("Диалог и инсайт в контексте отсутствуют")
        return _turn(f"По этому кейсу пока нечего резюмировать — {_NO_DATA}", sources)
    bits: list[str] = []
    if topics:
        sources.append("Темы из инсайта")
        bits.append("в диалоге обсуждали " + ", ".join(_topic_ru_chat(t) for t in topics[:3]))
    if insight:
        sources.append("Инсайт диалога")
        bits.append(f"{_SENTIMENT_RU.get(insight['sentiment'], insight['sentiment'])}, сигнал к покупке — {_buying_signal_ru(insight['buyingSignal'])}")
    if messages:
        sources.append("Сообщения диалога")
    if last:
        snippet = (last["text"][:77].strip() + "…") if len(last["text"]) > 80 else last["text"]
        bits.append(f"последняя реплика клиента: «{snippet}»")
    if insight and insight["recommendedAction"]:
        sources.append("Рекомендованное действие")
        bits.append(f"следующий шаг — {_lower_first(insight['recommendedAction'])}")
    return _turn(_capitalize_first("; ".join(bits)) + ".", sources)


def _chat_unknown(ctx: dict[str, Any]) -> dict[str, Any]:
    sources = ["Профиль клиента"]
    risk = _CHAT_RISK_RU.get(ctx["client"]["riskAppetite"], ctx["client"]["riskAppetite"])
    bits = [f"по этому кейсу могу подсказать: профиль и риск-профиль ({risk})"]
    if ctx.get("insight"):
        sources.append("Инсайт диалога")
        bits.append("темы интереса и ограничения из диалога")
    if ctx["relevantProducts"]:
        sources.append("Релевантные продукты")
        bits.append("какой продукт предложить")
    bits.append("следующий шаг по кейсу")
    text = ("Не вполне понял вопрос, поэтому отвечу осторожно, чтобы не домысливать. Если коротко, "
            + ", ".join(bits) + f". Если вопрос про что-то за пределами этого — {_lower_first(_NO_DATA)}")
    return _turn(text, sources)


def answer_question_det(ctx: dict[str, Any], question: str) -> dict[str, Any]:
    intent = _detect_intent(question)
    return {
        "product": _chat_product,
        "churn": _chat_churn,
        "profile": _chat_profile,
        "next_step": _chat_next_step,
        "summary": _chat_summary,
    }.get(intent, _chat_unknown)(ctx)


# ============================================================================

class DeterministicProvider(AIProvider):
    name = "deterministic"

    def generate_reply(self, ctx: dict[str, Any]) -> dict[str, Any]:
        return generate_reply_det(ctx)

    def generate_script(self, ctx: dict[str, Any], goal: str, instruction: Optional[str] = None) -> dict[str, Any]:
        return generate_script_det(ctx, goal, instruction)

    def generate_objection(self, ctx: dict[str, Any], objection_text: str) -> dict[str, Any]:
        return generate_objection_det(ctx, objection_text)

    def generate_summary(self, ctx: dict[str, Any]) -> dict[str, Any]:
        return generate_summary_det(ctx)

    def answer_question(self, ctx: dict[str, Any], question: str) -> dict[str, Any]:
        return answer_question_det(ctx, question)
