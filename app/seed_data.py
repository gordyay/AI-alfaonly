from __future__ import annotations

from datetime import timedelta

from .db import SQLiteStorage, utc_now
from .models import ChannelType


def _message_rows(conversation_id: str, items: list[tuple[str, str, timedelta]]) -> list[tuple[str, str, str, str, str]]:
    rows: list[tuple[str, str, str, str, str]] = []
    for index, (sender, text, offset) in enumerate(items, start=1):
        rows.append((f"{conversation_id}-msg-{index}", conversation_id, sender, text, offset.isoformat()))
    return rows


def seed_mvp_data(storage: SQLiteStorage) -> None:
    now = utc_now()

    storage.reset_all_data()
    storage.insert_products(
        [
            ("p1", "Премиальная карта", "cards", "low", "medium", "RUB"),
            ("p2", "Инвест-счет", "investment", "high", "high", "RUB"),
            ("p3", "Премиальный вклад", "deposits", "low", "medium", "RUB"),
            ("p4", "Страхование путешествий", "insurance", "low", "high", "RUB"),
            ("p5", "Брокерский счет", "brokerage", "high", "high", "USD"),
        ]
    )
    storage.insert_clients(
        [
            (
                "c1",
                "Иван Петров",
                "Alfa Only",
                "moderate",
                "m1",
                42,
                "Москва",
                "chat",
                "married",
                "IT-предприниматель",
                "high",
                12500000.0,
                950000.0,
                "medium",
                (now - timedelta(days=7)).isoformat(),
                (now + timedelta(days=2)).isoformat(),
                "Интерес к инвестициям, ценит быстрые ответы и персональные предложения.",
                None,
                None,
                "investments|premium-card|family",
            ),
            (
                "c2",
                "Ольга Смирнова",
                "Alfa Only",
                "conservative",
                "m1",
                51,
                "Санкт-Петербург",
                "call",
                "married",
                "Финансовый директор",
                "very_high",
                28700000.0,
                2100000.0,
                "low",
                (now - timedelta(days=2)).isoformat(),
                (now + timedelta(hours=5)).isoformat(),
                "Ожидает проактивного сервиса, интересуется сохранением капитала и structured deals.",
                None,
                None,
                "retention|deposit|vip",
            ),
            (
                "c3",
                "Алексей Орлов",
                "Alfa Only",
                "aggressive",
                "m2",
                36,
                "Казань",
                "meeting",
                "single",
                "Основатель e-commerce бизнеса",
                "high",
                9400000.0,
                430000.0,
                "medium",
                (now - timedelta(days=10)).isoformat(),
                (now + timedelta(days=1)).isoformat(),
                "Открыт к риску, интересуется валютными инструментами и идеями для роста капитала.",
                None,
                None,
                "fx|growth|brokerage",
            ),
            (
                "c4",
                "Мария Кузнецова",
                "Alfa Only",
                "moderate",
                "m2",
                45,
                "Екатеринбург",
                "chat",
                "married",
                "Юрист",
                "medium",
                6200000.0,
                380000.0,
                "high",
                (now - timedelta(days=20)).isoformat(),
                (now + timedelta(hours=10)).isoformat(),
                "Реже отвечает, нужно мягкое удержание и короткие follow-up сообщения.",
                None,
                None,
                "churn-risk|soft-contact|insurance",
            ),
            (
                "c5",
                "Дмитрий Волков",
                "Alfa Only",
                "conservative",
                "m1",
                58,
                "Москва",
                "call",
                "married",
                "Собственник производства",
                "very_high",
                41300000.0,
                5100000.0,
                "low",
                (now - timedelta(days=3)).isoformat(),
                (now + timedelta(days=4)).isoformat(),
                "Большой остаток на счете, готов обсуждать размещение ликвидности и премиальные сервисы.",
                None,
                None,
                "liquidity|deposit|wealth",
            ),
            (
                "c6",
                "Елена Федорова",
                "Alfa Only",
                "moderate",
                "m2",
                33,
                "Новосибирск",
                "chat",
                "single",
                "Топ-менеджер в IT",
                "high",
                7700000.0,
                620000.0,
                "medium",
                (now - timedelta(days=1)).isoformat(),
                (now + timedelta(days=3)).isoformat(),
                "Быстро реагирует в чате, интересуется travel-benefits и инвестиционными подборками.",
                None,
                None,
                "travel|premium-card|active-chat",
            ),
        ]
    )
    storage.insert_client_products(
        [
            ("c1", "p1", "active", 240000.0, (now - timedelta(days=800)).isoformat()),
            ("c1", "p2", "active", 3100000.0, (now - timedelta(days=380)).isoformat()),
            ("c2", "p1", "active", 520000.0, (now - timedelta(days=1200)).isoformat()),
            ("c2", "p3", "active", 12500000.0, (now - timedelta(days=160)).isoformat()),
            ("c3", "p2", "active", 1850000.0, (now - timedelta(days=220)).isoformat()),
            ("c3", "p5", "active", 720000.0, (now - timedelta(days=140)).isoformat()),
            ("c4", "p4", "active", 35000.0, (now - timedelta(days=95)).isoformat()),
            ("c5", "p1", "active", 610000.0, (now - timedelta(days=900)).isoformat()),
            ("c5", "p3", "active", 18900000.0, (now - timedelta(days=60)).isoformat()),
            ("c6", "p1", "active", 180000.0, (now - timedelta(days=300)).isoformat()),
            ("c6", "p2", "active", 960000.0, (now - timedelta(days=200)).isoformat()),
            ("c6", "p4", "active", 42000.0, (now - timedelta(days=25)).isoformat()),
        ]
    )
    storage.insert_tasks(
        [
            (
                "task-1",
                "c2",
                "Подготовить рамку к звонку по портфелю",
                "Собрать короткое сравнение по вкладу, защитной облигационной части и structured idea до звонка.",
                "in_progress",
                (now + timedelta(hours=2)).isoformat(),
                (now - timedelta(hours=1)).isoformat(),
                ChannelType.call.value,
                "high",
                "portfolio_review",
                "Подвести клиента к согласованному обновлению портфеля без избыточного риска",
                "sfa",
                "conv2",
                "p3",
            ),
            (
                "task-2",
                "c1",
                "Отправить клиенту компактное сравнение сценариев",
                "Закрыть обещанный follow-up по 3 вариантам размещения и показать ликвидность в одном сообщении.",
                "new",
                (now + timedelta(hours=18)).isoformat(),
                (now - timedelta(hours=3)).isoformat(),
                ChannelType.chat.value,
                "high",
                "offer_follow_up",
                "Перевести интерес клиента к инвестициям в следующий осмысленный шаг",
                "crm",
                "conv1",
                "p3",
            ),
            (
                "task-3",
                "c5",
                "Подготовить вариант размещения ликвидности",
                "Собрать короткий оффер по размещению свободного остатка и выделить быстрый выход в кэш.",
                "new",
                (now + timedelta(hours=8)).isoformat(),
                (now - timedelta(hours=4)).isoformat(),
                ChannelType.chat.value,
                "high",
                "product_pitch",
                "Сконвертировать свободную ликвидность клиента в продуктовый follow-up",
                "sfa",
                "conv6",
                "p3",
            ),
            (
                "task-4",
                "c4",
                "Мягкий follow-up перед поездкой",
                "Вернуться коротким сообщением без давления и подтвердить комфортный формат общения только в чате.",
                "new",
                (now + timedelta(hours=6)).isoformat(),
                (now - timedelta(days=1)).isoformat(),
                ChannelType.chat.value,
                "medium",
                "retention_follow_up",
                "Удержать клиента в коммуникации и не допустить выпадения из поля внимания",
                "crm",
                "conv3",
                "p4",
            ),
            (
                "task-5",
                "c3",
                "Назначить встречу по валютным идеям",
                "После отправки базового плана предложить 2 слота на следующую неделю и зафиксировать очную встречу.",
                "in_progress",
                (now + timedelta(days=1, hours=3)).isoformat(),
                (now - timedelta(hours=5)).isoformat(),
                ChannelType.meeting.value,
                "medium",
                "meeting_conversion",
                "Перевести интерес к валютным идеям в очную консультацию",
                "crm",
                "conv5",
                "p5",
            ),
            (
                "task-6",
                "c6",
                "Сделать короткий travel-benefits follow-up",
                "Подобрать лаконичный follow-up с акцентом на travel-пакет и инвестиционные подборки.",
                "new",
                (now + timedelta(hours=26)).isoformat(),
                (now - timedelta(hours=2)).isoformat(),
                ChannelType.chat.value,
                "medium",
                "offer_follow_up",
                "Поддержать высокий темп коммуникации и расширить интерес клиента",
                "sfa",
                "conv4",
                "p1",
            ),
        ]
    )
    storage.insert_conversations(
        [
            ("conv1", "c1", ChannelType.chat.value, "Инвестиционные идеи", (now - timedelta(days=1)).isoformat()),
            ("conv2", "c2", ChannelType.call.value, "Обновление портфеля", (now - timedelta(hours=6)).isoformat()),
            ("conv5", "c3", ChannelType.chat.value, "Валютные идеи и брокерский счет", (now - timedelta(days=2)).isoformat()),
            ("conv3", "c4", ChannelType.chat.value, "Возврат в коммуникацию", (now - timedelta(days=6)).isoformat()),
            ("conv6", "c5", ChannelType.chat.value, "Размещение свободной ликвидности", (now - timedelta(days=1, hours=4)).isoformat()),
            ("conv4", "c6", ChannelType.chat.value, "Премиальные travel-benefits", (now - timedelta(hours=18)).isoformat()),
        ]
    )
    messages: list[tuple[str, str, str, str, str]] = []
    messages.extend(
        _message_rows(
            "conv1",
            [
                ("client", "Добрый день. Хочу спокойно обсудить, куда разместить часть свободных средств.", now - timedelta(days=1, hours=2, minutes=25)),
                ("manager", "Добрый день, Иван. Могу собрать 3 сценария: вклад, консервативная облигационная часть и смешанный вариант.", now - timedelta(days=1, hours=2, minutes=18)),
                ("client", "Интересно, но важно не заходить в слишком высокий риск.", now - timedelta(days=1, hours=2, minutes=7)),
                ("manager", "Понял. Тогда акцент сделаю на сохранении ликвидности и доходности выше обычного вклада.", now - timedelta(days=1, hours=1, minutes=59)),
                ("client", "Да, и отдельно хочу увидеть, где можно быстро выйти в кэш без больших потерь.", now - timedelta(days=1, hours=1, minutes=46)),
                ("manager", "Сделаю это отдельной колонкой в сравнении. Также добавлю пример распределения на 6 и 12 месяцев.", now - timedelta(days=1, hours=1, minutes=39)),
                ("client", "Хорошо. И давайте без длинной презентации, лучше коротко и по цифрам.", now - timedelta(days=1, hours=1, minutes=27)),
                ("manager", "Принято. Завтра после 12:00 пришлю компактную таблицу и короткий вывод по каждому сценарию.", now - timedelta(days=1, hours=1, minutes=20)),
            ],
        )
    )
    messages.extend(
        _message_rows(
            "conv2",
            [
                ("manager", "Ольга, добрый день. Подтвержу, что сегодня готов обсудить обновление портфеля.", now - timedelta(hours=6, minutes=35)),
                ("client", "Да, после 16:00 будет удобно.", now - timedelta(hours=6, minutes=31)),
                ("manager", "Отлично. Подготовлю сравнение по премиальному вкладу, защитной облигационной части и структурной идее.", now - timedelta(hours=6, minutes=25)),
                ("client", "Прошу без избыточного риска. Для меня важнее сохранность капитала, чем агрессивная доходность.", now - timedelta(hours=6, minutes=18)),
                ("manager", "Понял. Вынесу в начало только консервативные варианты и отдельно отмечу возможную доходность по каждому.", now - timedelta(hours=6, minutes=12)),
                ("client", "Хорошо. И если возможно, до звонка пришлите короткую рамку, чтобы я посмотрела между встречами.", now - timedelta(hours=6, minutes=5)),
                ("manager", "Да, отправлю краткое сравнение до 15:30 и в 16:00 созвонимся, чтобы пройтись по деталям.", now - timedelta(hours=5, minutes=57)),
                ("client", "Подходит. На звонке хочу отдельно обсудить, стоит ли держать часть ликвидности на коротком сроке.", now - timedelta(hours=5, minutes=51)),
            ],
        )
    )
    messages.extend(
        _message_rows(
            "conv5",
            [
                ("client", "Добрый вечер. Смотрю на валютные идеи, но не хочу заходить слишком резко.", now - timedelta(days=2, hours=1, minutes=12)),
                ("manager", "Понял вас. Можем зайти постепенно через брокерский счет и заранее ограничить долю валютной части.", now - timedelta(days=2, hours=1, minutes=2)),
                ("client", "Мне нужен понятный план: стартовая сумма, распределение и когда пересматривать позицию.", now - timedelta(days=2, minutes=51)),
                ("manager", "Соберу пошаговый сценарий на 3 шага и добавлю ориентиры для пересмотра через 30 и 90 дней.", now - timedelta(days=2, minutes=42)),
                ("client", "Хорошо. Важно, чтобы не было ощущения, что я покупаю на пике.", now - timedelta(days=2, minutes=34)),
                ("manager", "Тогда предложу поэтапный вход частями и отмечу, какие инструменты подойдут для умеренного риска.", now - timedelta(days=2, minutes=27)),
                ("client", "Отлично. И если будет удобно, давайте после вашего сообщения назначим короткую встречу на следующей неделе.", now - timedelta(days=2, minutes=18)),
                ("manager", "Сделаю. Завтра пришлю базовый план в чат, а затем предложу слоты на очную встречу.", now - timedelta(days=2, minutes=11)),
            ],
        )
    )
    messages.extend(
        _message_rows(
            "conv3",
            [
                ("manager", "Мария, добрый день. Хотел аккуратно вернуться к вопросу страховой защиты перед поездками.", now - timedelta(days=6, hours=3)),
                ("client", "Сейчас в плотном графике, не хочу вникать в длинные описания.", now - timedelta(days=6, hours=2, minutes=12)),
                ("manager", "Понял. Тогда не перегружаю: могу позже прислать совсем короткий вариант на 3 пункта.", now - timedelta(days=6, hours=2)),
                ("client", "Так будет лучше, спасибо.", now - timedelta(days=6, hours=1, minutes=46)),
                ("manager", "Верно ли понимаю, что актуально вернуться к теме уже ближе к поездке?", now - timedelta(days=5, hours=22, minutes=10)),
                ("client", "Да, лучше через несколько дней. И только в сообщении, без звонка.", now - timedelta(days=5, hours=14, minutes=30)),
                ("manager", "Принято. Напишу коротко в чат и без давления, когда срок будет ближе.", now - timedelta(days=5, hours=14, minutes=12)),
                ("client", "Спасибо, такой формат мне комфортен.", now - timedelta(days=5, hours=13, minutes=58)),
            ],
        )
    )
    messages.extend(
        _message_rows(
            "conv6",
            [
                ("manager", "Дмитрий, добрый день. Вижу крупный свободный остаток и хотел предложить варианты размещения ликвидности.", now - timedelta(days=1, hours=4, minutes=40)),
                ("client", "Добрый. Да, можно, но без длинной презентации. Нужен быстрый вывод по сути.", now - timedelta(days=1, hours=4, minutes=35)),
                ("manager", "Понял. Подготовлю один короткий блок: срок, ликвидность и ожидаемая доходность по трем вариантам.", now - timedelta(days=1, hours=4, minutes=29)),
                ("client", "Важно, чтобы можно было быстро сравнить вклад и облигационную альтернативу.", now - timedelta(days=1, hours=4, minutes=24)),
                ("manager", "Сделаю это в одном сообщении и отдельно отмечу, где есть быстрый выход.", now - timedelta(days=1, hours=4, minutes=18)),
                ("client", "Хорошо. Если задержитесь, напомните, во сколько ждать. Я буду между встречами.", now - timedelta(days=1, hours=4, minutes=13)),
                ("manager", "Отправлю до 14:30 и, если удобно, потом коротко созвонимся на 10 минут.", now - timedelta(days=1, hours=4, minutes=9)),
                ("client", "Созвон возможен, но только если будет совсем предметно и быстро.", now - timedelta(days=1, hours=4, minutes=6)),
            ],
        )
    )
    messages.extend(
        _message_rows(
            "conv4",
            [
                ("manager", "Елена, вижу, что у вас скоро поездка. Могу подобрать benefits по премиальной карте.", now - timedelta(hours=18, minutes=42)),
                ("client", "Да, это актуально. Особенно интересуют lounge, страховка и быстрый проход в поездках.", now - timedelta(hours=18, minutes=38)),
                ("manager", "Хорошо. Подберу пакет, где будут lounge, travel-страховка и приоритетный сервис.", now - timedelta(hours=18, minutes=32)),
                ("client", "Если можно, пришлите в коротком формате, чтобы я посмотрела с телефона.", now - timedelta(hours=18, minutes=28)),
                ("manager", "Сделаю компактный формат: 3 преимущества, условия и что включено по страховке.", now - timedelta(hours=18, minutes=24)),
                ("client", "Отлично. Еще интересно, есть ли что-то по повышенному кэшбэку в поездках.", now - timedelta(hours=18, minutes=19)),
                ("manager", "Да, добавлю отдельным пунктом travel-расходы и где будут максимальные бонусы.", now - timedelta(hours=18, minutes=15)),
                ("client", "Супер, спасибо. Если пришлете сегодня, я смогу быстро посмотреть вечером.", now - timedelta(hours=18, minutes=12)),
            ],
        )
    )
    storage.insert_messages(messages)
    storage.insert_conversation_insights(
        [
            (
                "conv1",
                "interested",
                "normal",
                "medium",
                12,
                8,
                (now + timedelta(days=1, hours=12)).isoformat(),
                "Отправить компактное сравнение трех сценариев после 12:00",
                ChannelType.chat.value,
                "comparison",
                "investments|liquidity|capital_preservation",
                "risk|liquidity|avoid_long_presentation",
                "p2|p3",
                "send_comparison|emphasize_liquidity|keep_message_short",
            ),
            (
                "conv2",
                "neutral",
                "high",
                "high",
                6,
                5,
                (now.replace(hour=16, minute=0, second=0, microsecond=0)).isoformat(),
                "Созвон по обновлению портфеля и сравнению консервативных вариантов",
                ChannelType.call.value,
                "comparison",
                "capital_protection|deposit|structured_deals",
                "risk",
                "p3",
                "prepare_call|highlight_capital_protection|send_comparison",
            ),
            (
                "conv5",
                "interested",
                "normal",
                "medium",
                12,
                9,
                (now + timedelta(days=1)).isoformat(),
                "Отправить пошаговый FX-план и после этого предложить слоты встречи",
                ChannelType.chat.value,
                "detailed",
                "fx|brokerage|portfolio_growth",
                "timing_risk|aggressive_entry",
                "p2|p5",
                "send_comparison|prepare_call",
            ),
            (
                "conv3",
                "neutral",
                "low",
                "low",
                705,
                28,
                (now + timedelta(days=4)).isoformat(),
                "Вернуться позже коротким сообщением без давления",
                ChannelType.chat.value,
                "short",
                "insurance|soft_follow_up",
                "no_long_messages|avoid_pressure|no_call",
                "p4",
                "avoid_pressure|keep_message_short",
            ),
            (
                "conv6",
                "tense",
                "high",
                "speed_sensitive",
                5,
                4,
                (now.replace(hour=14, minute=30, second=0, microsecond=0)).isoformat(),
                "До 14:30 отправить одно короткое сравнение и при необходимости созвониться",
                ChannelType.chat.value,
                "comparison",
                "liquidity|deposit|bond_alternative",
                "avoid_long_presentation|needs_speed|liquidity",
                "p3|p2",
                "send_comparison|emphasize_liquidity|keep_message_short|prepare_call",
            ),
            (
                "conv4",
                "interested",
                "normal",
                "high",
                4,
                4,
                (now.replace(hour=20, minute=0, second=0, microsecond=0)).isoformat(),
                "Отправить сегодня вечером короткую подборку travel-benefits",
                ChannelType.chat.value,
                "short",
                "travel|premium_card|insurance|cashback",
                "mobile_format_only",
                "p1|p4",
                "keep_message_short|send_comparison",
            ),
        ]
    )
    storage.insert_crm_notes(
        [
            (
                "n1",
                "c2",
                "m1",
                "t7",
                "Созвон состоялся. Клиент подтвердил интерес к продлению вклада и попросил сравнение с инвестиционным мандатом.",
                "follow_up",
                ChannelType.call.value,
                (now + timedelta(days=2)).isoformat(),
                (now - timedelta(hours=2)).isoformat(),
            ),
            (
                "n2",
                "c4",
                "m2",
                None,
                "Клиент ответил сдержанно, просит не перегружать сообщениями. Нужен мягкий follow-up через несколько дней.",
                "pending",
                ChannelType.chat.value,
                (now + timedelta(days=4)).isoformat(),
                (now - timedelta(days=1)).isoformat(),
            ),
        ]
    )
    storage.insert_follow_ups(
        [
            (
                "f1",
                "c2",
                "n1",
                (now + timedelta(days=2)).isoformat(),
                "Подготовить сравнение вклада и инвест-мандата",
                0,
            ),
            (
                "f2",
                "c4",
                "n2",
                (now + timedelta(days=4)).isoformat(),
                "Вернуться с мягким сообщением про страховую защиту",
                0,
            ),
        ]
    )
    storage.insert_feedback(
        [
            (
                "fb1",
                "rec-portfolio-1",
                "m1",
                "priority_recommendation",
                "accepted",
                "Логика понятна, беру в работу.",
                (now - timedelta(hours=3)).isoformat(),
            ),
            (
                "fb2",
                "rec-retention-4",
                "m2",
                "next_best_action",
                "edited",
                "Сделаю более мягкий контакт, чем предлагалось.",
                (now - timedelta(hours=8)).isoformat(),
            ),
        ]
    )
