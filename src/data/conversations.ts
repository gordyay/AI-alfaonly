import type { Conversation } from "../domain/types";
import { ago } from "./clock";

export const CONVERSATIONS: Conversation[] = [
  { id: "conv1", clientId: "c1", channel: "chat", topic: "Инвестиционные идеи", startedAtIso: ago({ days: 2 }) },
  { id: "conv1b", clientId: "c1", channel: "chat", topic: "Сервис по премиальной карте", startedAtIso: ago({ hours: 8 }) },
  { id: "conv2", clientId: "c2", channel: "call", topic: "Обновление портфеля", startedAtIso: ago({ hours: 6 }) },
  { id: "conv5", clientId: "c3", channel: "chat", topic: "Валютные идеи и брокерский счет", startedAtIso: ago({ days: 2 }) },
  { id: "conv3", clientId: "c4", channel: "chat", topic: "Возврат в коммуникацию", startedAtIso: ago({ days: 6 }) },
  { id: "conv6", clientId: "c5", channel: "chat", topic: "Размещение свободной ликвидности", startedAtIso: ago({ days: 1, hours: 4 }) },
  { id: "conv4", clientId: "c6", channel: "chat", topic: "Премиальные travel-benefits", startedAtIso: ago({ hours: 18 }) },
  { id: "conv7", clientId: "c7", channel: "chat", topic: "Travel-сервис и benefits", startedAtIso: ago({ hours: 11 }) },
  { id: "conv8", clientId: "c8", channel: "call", topic: "Краткосрочное размещение ликвидности", startedAtIso: ago({ hours: 9, minutes: 30 }) },
  { id: "conv9", clientId: "c2", channel: "chat", topic: "Сервис премиального сопровождения", startedAtIso: ago({ days: 3, hours: 5 }) },
  { id: "conv10", clientId: "c9", channel: "chat", topic: "FX-диверсификация после паузы", startedAtIso: ago({ days: 2, hours: 4 }) },
  { id: "conv11", clientId: "c10", channel: "call", topic: "Негатив по сервису и удержание остатка", startedAtIso: ago({ hours: 14 }) },
  { id: "conv12", clientId: "c11", channel: "chat", topic: "Первичный контакт без полного профиля", startedAtIso: ago({ days: 5, hours: 3 }) },
  { id: "conv13", clientId: "c12", channel: "call", topic: "Парковка ликвидности перед сделкой", startedAtIso: ago({ hours: 10 }) },
  { id: "conv14", clientId: "c13", channel: "call", topic: "Возврат молчащего клиента", startedAtIso: ago({ days: 18 }) },
  { id: "conv15", clientId: "c14", channel: "chat", topic: "Семейная страховка и travel-пакет", startedAtIso: ago({ hours: 22 }) },
  { id: "conv16", clientId: "c15", channel: "chat", topic: "Инвестплан после продажи доли", startedAtIso: ago({ hours: 21 }) },
  { id: "conv17", clientId: "c8", channel: "chat", topic: "Премиальный сервис отдельно от ликвидности", startedAtIso: ago({ days: 4 }) },
  { id: "conv18", clientId: "c5", channel: "chat", topic: "Долгосрочные инвестиционные идеи после предложения по ликвидности", startedAtIso: ago({ days: 3, hours: 6 }) },
  { id: "conv20", clientId: "c10", channel: "chat", topic: "Компенсационный сервисный follow-up после звонка", startedAtIso: ago({ hours: 1, minutes: 40 }) },
];
