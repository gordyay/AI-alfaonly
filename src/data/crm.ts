import type { CrmNote, FollowUp } from "../domain/types";
import { ago, ahead } from "./clock";

export const CRM_NOTES: CrmNote[] = [
  {
    id: "n1",
    clientId: "c2",
    managerId: "m1",
    taskId: "t7",
    text: "Созвон состоялся. Клиент подтвердил интерес к продлению вклада и попросил сравнение с инвестиционным мандатом.",
    outcome: "follow_up",
    channel: "call",
    nextContactIso: ahead({ days: 2 }),
    createdAtIso: ago({ hours: 2 }),
  },
  {
    id: "n2",
    clientId: "c4",
    managerId: "m2",
    taskId: null,
    text: "Клиент ответил сдержанно, просит не перегружать сообщениями. Нужен мягкий follow-up через несколько дней.",
    outcome: "pending",
    channel: "chat",
    nextContactIso: ahead({ days: 4 }),
    createdAtIso: ago({ days: 1 }),
  },
  {
    id: "n3",
    clientId: "c10",
    managerId: "m2",
    taskId: null,
    text: "Клиент негативно оценивает сервис. До продуктового обсуждения нужно закрыть доверие и вернуться с конкретным решением по сервисному сбою.",
    outcome: "follow_up",
    channel: "call",
    nextContactIso: ahead({ hours: 4 }),
    createdAtIso: ago({ hours: 6 }),
  },
  {
    id: "n4",
    clientId: "c13",
    managerId: "m1",
    taskId: null,
    text: "Клиент замолчал. Следующий контакт должен быть очень коротким и только по теме краткосрочной ликвидности.",
    outcome: "follow_up",
    channel: "call",
    nextContactIso: ahead({ hours: 6 }),
    createdAtIso: ago({ days: 2 }),
  },
];

export const FOLLOW_UPS: FollowUp[] = [
  {
    id: "f1",
    clientId: "c2",
    noteId: "n1",
    dueAtIso: ahead({ days: 2 }),
    title: "Подготовить сравнение вклада и инвест-мандата",
    done: false,
  },
  {
    id: "f2",
    clientId: "c4",
    noteId: "n2",
    dueAtIso: ahead({ days: 4 }),
    title: "Вернуться с мягким сообщением про страховую защиту",
    done: false,
  },
  {
    id: "f3",
    clientId: "c10",
    noteId: "n3",
    dueAtIso: ahead({ hours: 4 }),
    title: "Закрыть сервисный сбой и только затем возвращаться к удержанию остатков",
    done: false,
  },
  {
    id: "f4",
    clientId: "c13",
    noteId: "n4",
    dueAtIso: ahead({ hours: 6 }),
    title: "Отправить очень короткое касание по удержанию ликвидности",
    done: false,
  },
];
