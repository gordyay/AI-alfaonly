from __future__ import annotations

from typing import Any

from ..ai.base import AIProvider, AIProviderError
from ..models import (
    Client,
    Conversation,
    ObjectionAnalysis,
    ObjectionHandlingOption,
    ObjectionType,
    ObjectionWorkflowDraft,
    ObjectionWorkflowResponse,
)
from ..db import utc_now


class ObjectionWorkflowService:
    def build_context(
        self,
        *,
        client: Client,
        conversation: Conversation,
        objection_text: str | None = None,
    ) -> dict[str, Any]:
        messages = conversation.messages[-8:]
        return {
            "client": {
                "id": client.id,
                "full_name": client.full_name,
                "risk_profile": client.risk_profile,
                "city": client.city,
                "preferred_channel": client.preferred_channel,
                "notes_summary": client.notes_summary,
                "tags": client.tags,
            },
            "conversation": {
                "id": conversation.id,
                "channel": conversation.channel.value,
                "topic": conversation.topic,
                "insights": conversation.insights.model_dump(mode="json") if conversation.insights else None,
                "messages": [
                    {
                        "sender": message.sender,
                        "text": message.text,
                        "created_at": message.created_at.isoformat(),
                    }
                    for message in messages
                ],
            },
            "objection_text": objection_text,
        }

    def build_workflow(
        self,
        *,
        provider: AIProvider,
        client: Client,
        conversation: Conversation,
        objection_text: str | None = None,
    ) -> ObjectionWorkflowResponse:
        context = self.build_context(client=client, conversation=conversation, objection_text=objection_text)
        use_heuristic_only = objection_text is None
        try:
            if use_heuristic_only:
                raise NotImplementedError
            analysis = provider.classify_objection(context)
            if not isinstance(analysis, ObjectionAnalysis):
                analysis = ObjectionAnalysis.model_validate(analysis)
            model_name = "provider_classifier"
        except (NotImplementedError, AIProviderError):
            analysis = self._heuristic_analysis(conversation=conversation, objection_text=objection_text)
            model_name = "heuristic_classifier"

        return ObjectionWorkflowResponse(
            draft=ObjectionWorkflowDraft(
                analysis=analysis,
                handling_options=self._playbook_options(analysis.objection_type),
                what_not_to_say=self._what_not_to_say(analysis.objection_type),
                next_step=self._next_step(analysis.objection_type, conversation),
                grounding_facts=self._grounding_facts(client=client, conversation=conversation, analysis=analysis),
                data_gaps=self._data_gaps(conversation, objection_text),
            ),
            model_name=model_name,
            generated_at=utc_now(),
        )

    def _heuristic_analysis(self, *, conversation: Conversation, objection_text: str | None) -> ObjectionAnalysis:
        mapping = [
            (ObjectionType.price, ["дорого", "ставка", "доходность", "невыгодно", "комис"]),
            (ObjectionType.risk, ["риск", "опасно", "волат", "потер", "сохран"]),
            (ObjectionType.timing, ["не сейчас", "позже", "вернемся", "срок", "потом"]),
            (ObjectionType.trust, ["не уверен", "довер", "гарант", "надеж"]),
            (ObjectionType.complexity, ["сложно", "непонят", "разобраться", "детал"]),
            (ObjectionType.no_need, ["не нужно", "не интересно", "без необходимости"]),
        ]

        objection_only = (objection_text or "").lower()
        full_text = " ".join(
            [objection_text or ""]
            + [message.text for message in conversation.messages[-4:]]
            + (conversation.insights.objection_tags if conversation.insights else [])
        ).lower()

        objection_type = ObjectionType.other
        evidence: list[str] = []
        if objection_only:
            for candidate_type, tokens in mapping:
                if any(token in objection_only for token in tokens):
                    objection_type = candidate_type
                    evidence = [token for token in tokens if token in objection_only][:3]
                    break

        if objection_type == ObjectionType.other:
            for candidate_type, tokens in mapping:
                if any(token in full_text for token in tokens):
                    objection_type = candidate_type
                    evidence = [token for token in tokens if token in full_text][:3]
                    break

        label_map = {
            ObjectionType.price: "Цена / ожидаемая выгода",
            ObjectionType.risk: "Риск и сохранность капитала",
            ObjectionType.timing: "Неудачный тайминг",
            ObjectionType.trust: "Недостаток доверия",
            ObjectionType.complexity: "Слишком сложно объяснено",
            ObjectionType.no_need: "Клиент не видит потребности",
            ObjectionType.other: "Смешанное или неразмеченное возражение",
        }

        return ObjectionAnalysis(
            objection_type=objection_type,
            objection_label=label_map[objection_type],
            confidence=0.62 if objection_type != ObjectionType.other else 0.35,
            evidence=evidence or (conversation.insights.objection_tags[:2] if conversation.insights else []),
            customer_intent="Снизить неопределенность и не принимать решение под давлением.",
        )

    @staticmethod
    def _playbook_options(objection_type: ObjectionType) -> list[ObjectionHandlingOption]:
        options_map = {
            ObjectionType.price: [
                ObjectionHandlingOption(
                    title="Сместить разговор в ценность",
                    response="Понимаю, давайте смотреть не только на ставку, а на связку доходность + ликвидность + понятный следующий шаг.",
                    rationale="Снимает фиксацию на цене и переводит разговор к ценности решения.",
                    style="consultative",
                    tactic="reframe_value",
                ),
                ObjectionHandlingOption(
                    title="Сузить оффер",
                    response="Могу убрать лишние варианты и оставить только один сценарий с самым понятным соотношением выгоды и гибкости.",
                    rationale="Снижает когнитивную нагрузку и ощущение 'мне что-то продают'.",
                    style="minimalist",
                    tactic="narrow_offer",
                ),
            ],
            ObjectionType.risk: [
                ObjectionHandlingOption(
                    title="Начать с ограничений по риску",
                    response="Давайте зафиксируем ваш комфортный уровень риска и рассмотрим только те варианты, где сохранность капитала и ликвидность на первом месте.",
                    rationale="Показывает уважение к рамкам клиента и снижает тревожность.",
                    style="risk_first",
                    tactic="confirm_boundaries",
                ),
                ObjectionHandlingOption(
                    title="Предложить поэтапный вход",
                    response="Если хотите, можем разбить решение на шаги и начать с минимального объема, чтобы не принимать резкое решение.",
                    rationale="Снимает страх перед единовременным действием.",
                    style="step_by_step",
                    tactic="gradual_commitment",
                ),
            ],
            ObjectionType.timing: [
                ObjectionHandlingOption(
                    title="Согласовать удобное окно возврата",
                    response="Понимаю, тогда не давлю: скажите, в какое окно лучше вернуться, и я подготовлю только короткую выжимку к этому моменту.",
                    rationale="Сохраняет контакт без продавливания решения.",
                    style="respectful",
                    tactic="schedule_return",
                ),
                ObjectionHandlingOption(
                    title="Оставить лёгкий follow-up",
                    response="Могу сейчас прислать очень короткую рамку, а к обсуждению вернемся тогда, когда вам будет удобно.",
                    rationale="Позволяет не терять инициативу, но уважать тайминг клиента.",
                    style="light_follow_up",
                    tactic="leave_anchor",
                ),
            ],
            ObjectionType.trust: [
                ObjectionHandlingOption(
                    title="Усилить прозрачность",
                    response="Давайте я разложу предложение максимально прозрачно: что это даёт, где ограничения и на что стоит обратить внимание.",
                    rationale="Снижает ощущение непрозрачности и повышает доверие.",
                    style="transparent",
                    tactic="show_tradeoffs",
                ),
                ObjectionHandlingOption(
                    title="Опора на критерии выбора",
                    response="Предлагаю сравнить варианты по вашим критериям: ликвидность, риск, горизонт и удобство выхода.",
                    rationale="Разговор уходит от давления к совместному выбору по критериям клиента.",
                    style="co_decision",
                    tactic="criteria_alignment",
                ),
            ],
            ObjectionType.complexity: [
                ObjectionHandlingOption(
                    title="Пересобрать в 3 пункта",
                    response="Сделаю проще: один тезис про выгоду, один про риск и один про следующий шаг без деталей.",
                    rationale="Убирает перегрузку и облегчает решение.",
                    style="simplify",
                    tactic="three_points",
                ),
                ObjectionHandlingOption(
                    title="Сравнение вместо длинного описания",
                    response="Могу не уходить в детали, а прислать короткое сравнение по двум-трем параметрам.",
                    rationale="Клиенту проще сравнивать, чем разбирать длинное объяснение.",
                    style="compare",
                    tactic="side_by_side",
                ),
            ],
            ObjectionType.no_need: [
                ObjectionHandlingOption(
                    title="Проверить контекст потребности",
                    response="Понял, тогда уточню только один момент: если смотреть на ближайшие месяцы, есть ли задача, под которую это решение вообще могло бы быть полезно?",
                    rationale="Не спорит с клиентом, а проверяет, есть ли скрытая потребность.",
                    style="diagnostic",
                    tactic="probe_need",
                ),
                ObjectionHandlingOption(
                    title="Закрыть мягко и оставить якорь",
                    response="Ок, тогда не буду продавливать. Если ситуация изменится, могу вернуться с очень коротким и точным вариантом без лишних деталей.",
                    rationale="Сохраняет отношения и возможность вернуться позже.",
                    style="soft_close",
                    tactic="preserve_optionality",
                ),
            ],
            ObjectionType.other: [
                ObjectionHandlingOption(
                    title="Уточнить суть возражения",
                    response="Чтобы не гадать, правильно ли я понял: для вас сейчас главный вопрос в риске, тайминге или в самой логике предложения?",
                    rationale="Позволяет классифицировать смешанное возражение прямо в разговоре.",
                    style="clarifying",
                    tactic="classify_live",
                ),
                ObjectionHandlingOption(
                    title="Сузить обсуждение",
                    response="Могу убрать всё лишнее и оставить только один вариант с кратким объяснением, чтобы было проще оценить.",
                    rationale="Помогает, когда клиент сопротивляется без четкой формулировки причины.",
                    style="narrowing",
                    tactic="reduce_scope",
                ),
            ],
        }
        return options_map[objection_type][:3]

    @staticmethod
    def _what_not_to_say(objection_type: ObjectionType) -> list[str]:
        common = [
            "Не спорить с формулировкой клиента и не обесценивать его опасения.",
            "Не переходить в давление или ложную срочность.",
        ]
        specific = {
            ObjectionType.price: ["Не говорить «это недорого для такого клиента»."],
            ObjectionType.risk: ["Не говорить «риска почти нет», если это не так буквально."],
            ObjectionType.timing: ["Не настаивать на решении здесь и сейчас."],
            ObjectionType.trust: ["Не ссылаться на абстрактные гарантии без фактов."],
            ObjectionType.complexity: ["Не отвечать ещё более длинным и сложным объяснением."],
            ObjectionType.no_need: ["Не пытаться переломить клиента силой аргументов."],
            ObjectionType.other: ["Не делать вид, что причина возражения вам уже полностью ясна."],
        }
        return common + specific[objection_type]

    @staticmethod
    def _next_step(objection_type: ObjectionType, conversation: Conversation) -> str:
        if objection_type == ObjectionType.timing:
            return "Согласовать конкретное окно возврата и сохранить мягкий follow-up."
        if objection_type == ObjectionType.risk:
            return "Вернуться с консервативной рамкой и ограничениями по риску."
        if objection_type == ObjectionType.price:
            return "Показать короткое сравнение ценности без перегруза по деталям."
        if conversation.insights and conversation.insights.preferred_follow_up_channel:
            return f"Продолжить через предпочитаемый канал: {conversation.insights.preferred_follow_up_channel.value}."
        return "Уточнить ключевую причину сомнения и предложить следующий шаг без давления."

    @staticmethod
    def _data_gaps(conversation: Conversation, objection_text: str | None) -> list[str]:
        gaps: list[str] = []
        if objection_text is None and not (conversation.insights and conversation.insights.objection_tags):
            gaps.append("Нет явного objection_text, опираемся только на историю сообщений.")
        if not conversation.insights or not conversation.insights.next_contact_reason:
            gaps.append("Не зафиксирован preferred next contact reason.")
        return gaps

    @staticmethod
    def _grounding_facts(
        *,
        client: Client,
        conversation: Conversation,
        analysis: ObjectionAnalysis,
    ) -> list[str]:
        facts = [
            f"Клиент {client.full_name}, риск-профиль {client.risk_profile}.",
            f"Канал: {conversation.channel.value}, тема: {conversation.topic}.",
        ]
        if analysis.evidence:
            facts.append("Evidence: " + " | ".join(analysis.evidence[:3]))
        if conversation.insights and conversation.insights.objection_tags:
            facts.append("Исторические objection tags: " + " | ".join(conversation.insights.objection_tags[:3]))
        return facts[:4]
