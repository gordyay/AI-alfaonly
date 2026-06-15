import type { Message } from "../domain/types";
import { ago } from "./clock";

export const MESSAGES: Message[] = [
  // conv1
  { id: "conv1-msg-1", conversationId: "conv1", sender: "client", text: "Добрый день. Хочу спокойно обсудить, куда разместить часть свободных средств.", sentAtIso: ago({ days: 1, hours: 2, minutes: 25 }) },
  { id: "conv1-msg-2", conversationId: "conv1", sender: "manager", text: "Добрый день, Иван. Могу собрать 3 сценария: вклад, консервативная облигационная часть и смешанный вариант.", sentAtIso: ago({ days: 1, hours: 2, minutes: 18 }) },
  { id: "conv1-msg-3", conversationId: "conv1", sender: "client", text: "Интересно, но важно не заходить в слишком высокий риск.", sentAtIso: ago({ days: 1, hours: 2, minutes: 7 }) },
  { id: "conv1-msg-4", conversationId: "conv1", sender: "manager", text: "Понял. Тогда акцент сделаю на сохранении ликвидности и доходности выше обычного вклада.", sentAtIso: ago({ days: 1, hours: 1, minutes: 59 }) },
  { id: "conv1-msg-5", conversationId: "conv1", sender: "client", text: "Да, и отдельно хочу увидеть, где можно быстро выйти в кэш без больших потерь.", sentAtIso: ago({ days: 1, hours: 1, minutes: 46 }) },
  { id: "conv1-msg-6", conversationId: "conv1", sender: "manager", text: "Сделаю это отдельной колонкой в сравнении. Также добавлю пример распределения на 6 и 12 месяцев.", sentAtIso: ago({ days: 1, hours: 1, minutes: 39 }) },
  { id: "conv1-msg-7", conversationId: "conv1", sender: "client", text: "Хорошо. И давайте без длинной презентации, лучше коротко и по цифрам.", sentAtIso: ago({ days: 1, hours: 1, minutes: 27 }) },
  { id: "conv1-msg-8", conversationId: "conv1", sender: "manager", text: "Принято. Завтра после 12:00 пришлю компактную таблицу и короткий вывод по каждому сценарию.", sentAtIso: ago({ days: 1, hours: 1, minutes: 20 }) },

  // conv1b
  { id: "conv1b-msg-1", conversationId: "conv1b", sender: "client", text: "Добрый день. Ещё отдельно вопрос по премиальной карте: какие сейчас travel-привилегии реально работают в поездках?", sentAtIso: ago({ hours: 8, minutes: 34 }) },
  { id: "conv1b-msg-2", conversationId: "conv1b", sender: "manager", text: "Добрый день. Могу прислать короткий список: lounge, страховка, быстрый проход и ограничения по пакетам.", sentAtIso: ago({ hours: 8, minutes: 29 }) },
  { id: "conv1b-msg-3", conversationId: "conv1b", sender: "client", text: "Да, только коротко. Не хочу смешивать это с инвестиционным предложением и точно не хочу лишнего риска или сложных условий.", sentAtIso: ago({ hours: 8, minutes: 22 }) },
  { id: "conv1b-msg-4", conversationId: "conv1b", sender: "manager", text: "Согласен, вынесу в отдельное сообщение и без лишних деталей.", sentAtIso: ago({ hours: 8, minutes: 18 }) },
  { id: "conv1b-msg-5", conversationId: "conv1b", sender: "client", text: "Отлично. Если есть 2-3 самых полезных пункта, этого будет достаточно.", sentAtIso: ago({ hours: 8, minutes: 11 }) },
  { id: "conv1b-msg-6", conversationId: "conv1b", sender: "manager", text: "Тогда соберу компактную подборку и пришлю отдельно вечером.", sentAtIso: ago({ hours: 8, minutes: 5 }) },
  { id: "conv1b-msg-7", conversationId: "conv1b", sender: "client", text: "Хорошо, тогда жду отдельный короткий сервисный follow-up сегодня вечером.", sentAtIso: ago({ hours: 7, minutes: 59 }) },

  // conv2
  { id: "conv2-msg-1", conversationId: "conv2", sender: "manager", text: "Ольга, добрый день. Подтвержу, что сегодня готов обсудить обновление портфеля.", sentAtIso: ago({ hours: 6, minutes: 35 }) },
  { id: "conv2-msg-2", conversationId: "conv2", sender: "client", text: "Да, после 16:00 будет удобно.", sentAtIso: ago({ hours: 6, minutes: 31 }) },
  { id: "conv2-msg-3", conversationId: "conv2", sender: "manager", text: "Отлично. Подготовлю сравнение по премиальному вкладу, защитной облигационной части и структурной идее.", sentAtIso: ago({ hours: 6, minutes: 25 }) },
  { id: "conv2-msg-4", conversationId: "conv2", sender: "client", text: "Прошу без избыточного риска. Для меня важнее сохранность капитала, чем агрессивная доходность.", sentAtIso: ago({ hours: 6, minutes: 18 }) },
  { id: "conv2-msg-5", conversationId: "conv2", sender: "manager", text: "Понял. Вынесу в начало только консервативные варианты и отдельно отмечу возможную доходность по каждому.", sentAtIso: ago({ hours: 6, minutes: 12 }) },
  { id: "conv2-msg-6", conversationId: "conv2", sender: "client", text: "Хорошо. И если возможно, до звонка пришлите короткую рамку, чтобы я посмотрела между встречами.", sentAtIso: ago({ hours: 6, minutes: 5 }) },
  { id: "conv2-msg-7", conversationId: "conv2", sender: "manager", text: "Да, отправлю краткое сравнение до 15:30 и в 16:00 созвонимся, чтобы пройтись по деталям.", sentAtIso: ago({ hours: 5, minutes: 57 }) },
  { id: "conv2-msg-8", conversationId: "conv2", sender: "client", text: "Подходит. На звонке хочу отдельно обсудить, стоит ли держать часть ликвидности на коротком сроке.", sentAtIso: ago({ hours: 5, minutes: 51 }) },

  // conv5
  { id: "conv5-msg-1", conversationId: "conv5", sender: "client", text: "Добрый вечер. Смотрю на валютные идеи, но не хочу заходить слишком резко.", sentAtIso: ago({ days: 2, hours: 1, minutes: 12 }) },
  { id: "conv5-msg-2", conversationId: "conv5", sender: "manager", text: "Понял вас. Можем зайти постепенно через брокерский счет и заранее ограничить долю валютной части.", sentAtIso: ago({ days: 2, hours: 1, minutes: 2 }) },
  { id: "conv5-msg-3", conversationId: "conv5", sender: "client", text: "Мне нужен понятный план: стартовая сумма, распределение и когда пересматривать позицию.", sentAtIso: ago({ days: 2, minutes: 51 }) },
  { id: "conv5-msg-4", conversationId: "conv5", sender: "manager", text: "Соберу пошаговый сценарий на 3 шага и добавлю ориентиры для пересмотра через 30 и 90 дней.", sentAtIso: ago({ days: 2, minutes: 42 }) },
  { id: "conv5-msg-5", conversationId: "conv5", sender: "client", text: "Хорошо. Важно, чтобы не было ощущения, что я покупаю на пике.", sentAtIso: ago({ days: 2, minutes: 34 }) },
  { id: "conv5-msg-6", conversationId: "conv5", sender: "manager", text: "Тогда предложу поэтапный вход частями и отмечу, какие инструменты подойдут для умеренного риска.", sentAtIso: ago({ days: 2, minutes: 27 }) },
  { id: "conv5-msg-7", conversationId: "conv5", sender: "client", text: "Отлично. И если будет удобно, давайте после вашего сообщения назначим короткую встречу на следующей неделе.", sentAtIso: ago({ days: 2, minutes: 18 }) },
  { id: "conv5-msg-8", conversationId: "conv5", sender: "manager", text: "Сделаю. Завтра пришлю базовый план в чат, а затем предложу слоты на очную встречу.", sentAtIso: ago({ days: 2, minutes: 11 }) },

  // conv3
  { id: "conv3-msg-1", conversationId: "conv3", sender: "manager", text: "Мария, добрый день. Хотел аккуратно вернуться к вопросу страховой защиты перед поездками.", sentAtIso: ago({ days: 6, hours: 3 }) },
  { id: "conv3-msg-2", conversationId: "conv3", sender: "client", text: "Сейчас в плотном графике, не хочу вникать в длинные описания.", sentAtIso: ago({ days: 6, hours: 2, minutes: 12 }) },
  { id: "conv3-msg-3", conversationId: "conv3", sender: "manager", text: "Понял. Тогда не перегружаю: могу позже прислать совсем короткий вариант на 3 пункта.", sentAtIso: ago({ days: 6, hours: 2 }) },
  { id: "conv3-msg-4", conversationId: "conv3", sender: "client", text: "Так будет лучше, спасибо.", sentAtIso: ago({ days: 6, hours: 1, minutes: 46 }) },
  { id: "conv3-msg-5", conversationId: "conv3", sender: "manager", text: "Верно ли понимаю, что актуально вернуться к теме уже ближе к поездке?", sentAtIso: ago({ days: 5, hours: 22, minutes: 10 }) },
  { id: "conv3-msg-6", conversationId: "conv3", sender: "client", text: "Да, лучше через несколько дней. И только в сообщении, без звонка.", sentAtIso: ago({ days: 5, hours: 14, minutes: 30 }) },
  { id: "conv3-msg-7", conversationId: "conv3", sender: "manager", text: "Принято. Напишу коротко в чат и без давления, когда срок будет ближе.", sentAtIso: ago({ days: 5, hours: 14, minutes: 12 }) },
  { id: "conv3-msg-8", conversationId: "conv3", sender: "client", text: "Спасибо, такой формат мне комфортен.", sentAtIso: ago({ days: 5, hours: 13, minutes: 58 }) },
  { id: "conv3-msg-9", conversationId: "conv3", sender: "manager", text: "Рад, что так удобно. Тогда вернусь коротким сообщением ближе к сроку, без лишнего.", sentAtIso: ago({ days: 5, hours: 13, minutes: 50 }) },

  // conv6
  { id: "conv6-msg-1", conversationId: "conv6", sender: "manager", text: "Дмитрий, добрый день. Вижу крупный свободный остаток и хотел предложить варианты размещения ликвидности.", sentAtIso: ago({ days: 1, hours: 4, minutes: 40 }) },
  { id: "conv6-msg-2", conversationId: "conv6", sender: "client", text: "Добрый. Да, можно, но без длинной презентации. Нужен быстрый вывод по сути.", sentAtIso: ago({ days: 1, hours: 4, minutes: 35 }) },
  { id: "conv6-msg-3", conversationId: "conv6", sender: "manager", text: "Понял. Подготовлю один короткий блок: срок, ликвидность и ожидаемая доходность по трем вариантам.", sentAtIso: ago({ days: 1, hours: 4, minutes: 29 }) },
  { id: "conv6-msg-4", conversationId: "conv6", sender: "client", text: "Важно, чтобы можно было быстро сравнить вклад и облигационную альтернативу.", sentAtIso: ago({ days: 1, hours: 4, minutes: 24 }) },
  { id: "conv6-msg-5", conversationId: "conv6", sender: "manager", text: "Сделаю это в одном сообщении и отдельно отмечу, где есть быстрый выход.", sentAtIso: ago({ days: 1, hours: 4, minutes: 18 }) },
  { id: "conv6-msg-6", conversationId: "conv6", sender: "client", text: "Хорошо. Если задержитесь, напомните, во сколько ждать. Я буду между встречами.", sentAtIso: ago({ days: 1, hours: 4, minutes: 13 }) },
  { id: "conv6-msg-7", conversationId: "conv6", sender: "manager", text: "Отправлю до 14:30 и, если удобно, потом коротко созвонимся на 10 минут.", sentAtIso: ago({ days: 1, hours: 4, minutes: 9 }) },
  { id: "conv6-msg-8", conversationId: "conv6", sender: "client", text: "Созвон возможен, но только если будет совсем предметно и быстро.", sentAtIso: ago({ days: 1, hours: 4, minutes: 6 }) },

  // conv4
  { id: "conv4-msg-1", conversationId: "conv4", sender: "manager", text: "Елена, вижу, что у вас скоро поездка. Могу подобрать benefits по премиальной карте.", sentAtIso: ago({ hours: 18, minutes: 42 }) },
  { id: "conv4-msg-2", conversationId: "conv4", sender: "client", text: "Да, это актуально. Особенно интересуют lounge, страховка и быстрый проход в поездках.", sentAtIso: ago({ hours: 18, minutes: 38 }) },
  { id: "conv4-msg-3", conversationId: "conv4", sender: "manager", text: "Хорошо. Подберу пакет, где будут lounge, travel-страховка и приоритетный сервис.", sentAtIso: ago({ hours: 18, minutes: 32 }) },
  { id: "conv4-msg-4", conversationId: "conv4", sender: "client", text: "Если можно, пришлите в коротком формате, чтобы я посмотрела с телефона.", sentAtIso: ago({ hours: 18, minutes: 28 }) },
  { id: "conv4-msg-5", conversationId: "conv4", sender: "manager", text: "Сделаю компактный формат: 3 преимущества, условия и что включено по страховке.", sentAtIso: ago({ hours: 18, minutes: 24 }) },
  { id: "conv4-msg-6", conversationId: "conv4", sender: "client", text: "Отлично. Еще интересно, есть ли что-то по повышенному кэшбэку в поездках.", sentAtIso: ago({ hours: 18, minutes: 19 }) },
  { id: "conv4-msg-7", conversationId: "conv4", sender: "manager", text: "Да, добавлю отдельным пунктом travel-расходы и где будут максимальные бонусы.", sentAtIso: ago({ hours: 18, minutes: 15 }) },
  { id: "conv4-msg-8", conversationId: "conv4", sender: "client", text: "Супер, спасибо. Если пришлете сегодня, я смогу быстро посмотреть вечером.", sentAtIso: ago({ hours: 18, minutes: 12 }) },

  // conv7
  { id: "conv7-msg-1", conversationId: "conv7", sender: "client", text: "Добрый день. Подскажите, можно ли коротко собрать travel-benefits по карте перед поездкой?", sentAtIso: ago({ hours: 11, minutes: 18 }) },
  { id: "conv7-msg-2", conversationId: "conv7", sender: "manager", text: "Да, подготовлю короткий список с lounge, страховкой и сервисом в поездках.", sentAtIso: ago({ hours: 11, minutes: 12 }) },
  { id: "conv7-msg-3", conversationId: "conv7", sender: "client", text: "Супер. Мне важно, чтобы это было в одном сообщении и без длинных условий.", sentAtIso: ago({ hours: 11, minutes: 7 }) },
  { id: "conv7-msg-4", conversationId: "conv7", sender: "manager", text: "Принял. Сделаю подборку в формате 3 пункта плюс что нужно активировать.", sentAtIso: ago({ hours: 11, minutes: 1 }) },
  { id: "conv7-msg-5", conversationId: "conv7", sender: "client", text: "И отдельно, если можно, отметьте, где есть реальная сервисная ценность, а не просто формальные опции.", sentAtIso: ago({ hours: 10, minutes: 54 }) },
  { id: "conv7-msg-6", conversationId: "conv7", sender: "manager", text: "Да, выделю именно практические benefits и добавлю короткий следующий шаг.", sentAtIso: ago({ hours: 10, minutes: 47 }) },

  // conv8
  { id: "conv8-msg-1", conversationId: "conv8", sender: "manager", text: "Сергей, добрый день. Хотел предложить коротко обсудить размещение части свободной ликвидности на коротком сроке.", sentAtIso: ago({ hours: 9, minutes: 26 }) },
  { id: "conv8-msg-2", conversationId: "conv8", sender: "client", text: "Добрый день. Можно, но только с очень понятным сравнением и без расплывчатых идей.", sentAtIso: ago({ hours: 9, minutes: 20 }) },
  { id: "conv8-msg-3", conversationId: "conv8", sender: "manager", text: "Понял. Подготовлю короткий бриф по вкладу, короткой облигационной альтернативе и срокам выхода.", sentAtIso: ago({ hours: 9, minutes: 14 }) },
  { id: "conv8-msg-4", conversationId: "conv8", sender: "client", text: "Хорошо. И отдельно скажите, что имеет смысл удерживать в банке, а что оставить свободным.", sentAtIso: ago({ hours: 9, minutes: 10 }) },
  { id: "conv8-msg-5", conversationId: "conv8", sender: "manager", text: "Да, это будет отдельным блоком: сколько держать ликвидным, сколько можно разместить без дискомфорта.", sentAtIso: ago({ hours: 9, minutes: 4 }) },
  { id: "conv8-msg-6", conversationId: "conv8", sender: "client", text: "Тогда давайте созвонимся, если успеете прислать короткий ориентир заранее.", sentAtIso: ago({ hours: 8, minutes: 58 }) },

  // conv9
  { id: "conv9-msg-1", conversationId: "conv9", sender: "client", text: "Добрый вечер. По премиальному сопровождению есть ощущение, что сервис стал менее предсказуемым.", sentAtIso: ago({ days: 3, hours: 4, minutes: 32 }) },
  { id: "conv9-msg-2", conversationId: "conv9", sender: "manager", text: "Спасибо, что сказали прямо. Давайте я коротко соберу, где именно были сбои, и вернусь с конкретным решением.", sentAtIso: ago({ days: 3, hours: 4, minutes: 18 }) },
  { id: "conv9-msg-3", conversationId: "conv9", sender: "client", text: "Да, лучше так. Пока не хочу, чтобы это смешивалось с портфелем и инвестиционными темами.", sentAtIso: ago({ days: 3, hours: 4, minutes: 6 }) },
  { id: "conv9-msg-4", conversationId: "conv9", sender: "manager", text: "Понял, разведем в отдельные контуры: сначала сервис, затем уже инвестиционный разговор.", sentAtIso: ago({ days: 3, hours: 3, minutes: 58 }) },

  // conv10
  { id: "conv10-msg-1", conversationId: "conv10", sender: "client", text: "Всё ещё думаю про валютную диверсификацию, но рынок выглядит нервно.", sentAtIso: ago({ days: 2, hours: 3, minutes: 22 }) },
  { id: "conv10-msg-2", conversationId: "conv10", sender: "manager", text: "Понимаю. Можем не заходить резко, а собрать поэтапный сценарий: что сейчас, что позже и где границы по риску.", sentAtIso: ago({ days: 2, hours: 3, minutes: 9 }) },
  { id: "conv10-msg-3", conversationId: "conv10", sender: "client", text: "Это уже ближе. Только не хочу длинное предложение и ощущение, что меня торопят.", sentAtIso: ago({ days: 2, hours: 2, minutes: 55 }) },
  { id: "conv10-msg-4", conversationId: "conv10", sender: "manager", text: "Тогда пришлю очень короткую рамку: 2 варианта, уровень риска и что делать, если решите подождать.", sentAtIso: ago({ days: 2, hours: 2, minutes: 41 }) },
  { id: "conv10-msg-5", conversationId: "conv10", sender: "client", text: "Ок. Вернитесь позже, но коротко и без давления.", sentAtIso: ago({ days: 2, hours: 2, minutes: 26 }) },

  // conv11
  { id: "conv11-msg-1", conversationId: "conv11", sender: "client", text: "Добрый день. Сервис по премиальному пакету снова сработал с задержкой, это уже не первый раз.", sentAtIso: ago({ hours: 13, minutes: 52 }) },
  { id: "conv11-msg-2", conversationId: "conv11", sender: "manager", text: "Понимаю ваше раздражение и беру ситуацию на себя. Давайте сначала разберу сервисный сбой, а уже потом вернемся к финансовой части.", sentAtIso: ago({ hours: 13, minutes: 45 }) },
  { id: "conv11-msg-3", conversationId: "conv11", sender: "client", text: "Именно. Сейчас меня больше волнует не вклад, а почему базовый сервис стал хуже.", sentAtIso: ago({ hours: 13, minutes: 36 }) },
  { id: "conv11-msg-4", conversationId: "conv11", sender: "manager", text: "Справедливо. Я коротко вернусь с конкретным статусом и компенсационным решением.", sentAtIso: ago({ hours: 13, minutes: 28 }) },
  { id: "conv11-msg-5", conversationId: "conv11", sender: "client", text: "Хорошо. Пока любые новые предложения неуместны, пока это не закрыто.", sentAtIso: ago({ hours: 13, minutes: 18 }) },

  // conv12
  { id: "conv12-msg-1", conversationId: "conv12", sender: "client", text: "Добрый день. Хочу понять, какие у вас есть варианты по накоплениям, но пока без конкретики.", sentAtIso: ago({ days: 5, hours: 2, minutes: 22 }) },
  { id: "conv12-msg-2", conversationId: "conv12", sender: "manager", text: "Добрый день. Чтобы не отправлять общее предложение, уточню два вопроса: горизонт и насколько важна ликвидность?", sentAtIso: ago({ days: 5, hours: 2, minutes: 10 }) },
  { id: "conv12-msg-3", conversationId: "conv12", sender: "client", text: "Пока не готов ответить подробно, нужно сначала самому собрать цифры.", sentAtIso: ago({ days: 5, hours: 1, minutes: 57 }) },

  // conv13
  { id: "conv13-msg-1", conversationId: "conv13", sender: "client", text: "Добрый день. Через пару недель будет сделка, и нужно временно припарковать часть денег без жёсткой блокировки.", sentAtIso: ago({ hours: 9, minutes: 42 }) },
  { id: "conv13-msg-2", conversationId: "conv13", sender: "manager", text: "Понял. Тогда сначала смотрим на ликвидность и короткий срок, а уже после сделки отдельно возвращаемся к инвестиционному плану.", sentAtIso: ago({ hours: 9, minutes: 34 }) },
  { id: "conv13-msg-3", conversationId: "conv13", sender: "client", text: "Да, именно так. Не хочу сейчас смешивать парковку ликвидности и долгосрочные идеи.", sentAtIso: ago({ hours: 9, minutes: 26 }) },
  { id: "conv13-msg-4", conversationId: "conv13", sender: "manager", text: "Соберу одно короткое сравнение по двум коротким сценариям и отмечу, когда логично вернуться к инвестиционному разговору.", sentAtIso: ago({ hours: 9, minutes: 18 }) },
  { id: "conv13-msg-5", conversationId: "conv13", sender: "client", text: "Отлично. И покажите, где можно выйти быстро, если сроки сделки сдвинутся.", sentAtIso: ago({ hours: 9, minutes: 9 }) },

  // conv14
  { id: "conv14-msg-1", conversationId: "conv14", sender: "manager", text: "Роман, добрый день. Возвращаюсь аккуратно к теме краткосрочной ликвидности, которую вы поднимали в прошлый раз.", sentAtIso: ago({ days: 18, hours: 1, minutes: 25 }) },
  { id: "conv14-msg-2", conversationId: "conv14", sender: "client", text: "Сейчас не лучший момент, давайте позже.", sentAtIso: ago({ days: 18, hours: 1, minutes: 13 }) },
  { id: "conv14-msg-3", conversationId: "conv14", sender: "manager", text: "Понял. Тогда позже вернусь очень коротко, без деталей и без звонка, если так удобнее.", sentAtIso: ago({ days: 18, hours: 1, minutes: 3 }) },
  { id: "conv14-msg-4", conversationId: "conv14", sender: "client", text: "Да, только коротко и по существу.", sentAtIso: ago({ days: 18, minutes: 52 }) },

  // conv15
  { id: "conv15-msg-1", conversationId: "conv15", sender: "client", text: "Можно коротко по family travel-пакету? Нужны страховка и понятные benefits для поездок.", sentAtIso: ago({ hours: 21, minutes: 46 }) },
  { id: "conv15-msg-2", conversationId: "conv15", sender: "manager", text: "Да, сделаю компактно: что входит по страховке, какие travel-benefits реально полезны и что нужно активировать.", sentAtIso: ago({ hours: 21, minutes: 38 }) },
  { id: "conv15-msg-3", conversationId: "conv15", sender: "client", text: "Отлично. Только без длинных тарифных таблиц, лучше в 3-4 пункта.", sentAtIso: ago({ hours: 21, minutes: 27 }) },
  { id: "conv15-msg-4", conversationId: "conv15", sender: "manager", text: "Принято, соберу мобильный формат и один следующий шаг, если тема откликнется.", sentAtIso: ago({ hours: 21, minutes: 16 }) },

  // conv16
  { id: "conv16-msg-1", conversationId: "conv16", sender: "client", text: "После продажи доли думаю про инвестиционный план, но рынок выглядит слишком нервным для резкого входа.", sentAtIso: ago({ hours: 20, minutes: 42 }) },
  { id: "conv16-msg-2", conversationId: "conv16", sender: "manager", text: "Тогда не делаем резкий вход. Могу разложить план на 3 шага: что можно сделать сейчас, что позже и где точки пересмотра.", sentAtIso: ago({ hours: 20, minutes: 33 }) },
  { id: "conv16-msg-3", conversationId: "conv16", sender: "client", text: "Это хорошо. Мне нужно не предложение, а именно поэтапный подход с контролем тайминга.", sentAtIso: ago({ hours: 20, minutes: 22 }) },
  { id: "conv16-msg-4", conversationId: "conv16", sender: "manager", text: "Понял. Соберу сценарий по частям и отдельно отмечу, где можно остаться в ликвидности до следующего окна.", sentAtIso: ago({ hours: 20, minutes: 12 }) },
  { id: "conv16-msg-5", conversationId: "conv16", sender: "client", text: "Отлично. Если будет коротко и предметно, готов обсудить уже на встрече.", sentAtIso: ago({ hours: 20, minutes: 4 }) },

  // conv17
  { id: "conv17-msg-1", conversationId: "conv17", sender: "client", text: "Ещё отдельно: по премиальному пакету нужны travel benefits, но не хочу смешивать это с разговором по ликвидности.", sentAtIso: ago({ days: 3, hours: 23, minutes: 44 }) },
  { id: "conv17-msg-2", conversationId: "conv17", sender: "manager", text: "Согласен, вынесу сервис в отдельный короткий follow-up и не буду мешать его с основным кейсом по ликвидности.", sentAtIso: ago({ days: 3, hours: 23, minutes: 37 }) },
  { id: "conv17-msg-3", conversationId: "conv17", sender: "client", text: "Отлично. Здесь нужен только короткий список без условий в несколько абзацев.", sentAtIso: ago({ days: 3, hours: 23, minutes: 29 }) },

  // conv18
  { id: "conv18-msg-1", conversationId: "conv18", sender: "client", text: "Кроме парковки ликвидности, думаю о более длинных инвестиционных идеях, но сейчас не хочу всё смешивать.", sentAtIso: ago({ days: 3, hours: 5, minutes: 34 }) },
  { id: "conv18-msg-2", conversationId: "conv18", sender: "manager", text: "Полностью согласен. Тогда разделим: отдельно краткосрочную ликвидность и отдельно долгосрочную инвестиционную рамку.", sentAtIso: ago({ days: 3, hours: 5, minutes: 22 }) },
  { id: "conv18-msg-3", conversationId: "conv18", sender: "client", text: "Да, иначе это звучит как слишком широкое предложение. Лучше два четких шага.", sentAtIso: ago({ days: 3, hours: 5, minutes: 12 }) },
  { id: "conv18-msg-4", conversationId: "conv18", sender: "manager", text: "Так и сделаю: сначала короткий бриф по ликвидности, а инвестиционные идеи вынесу в следующий контакт.", sentAtIso: ago({ days: 3, hours: 5, minutes: 4 }) },
];
