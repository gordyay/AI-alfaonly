export interface Manager {
  id: string;
  fullName: string;
  role: string;
}

export const MANAGERS: Manager[] = [
  { id: "m1", fullName: "Екатерина Лаврова", role: "Персональный менеджер Alfa Only" },
  { id: "m2", fullName: "Михаил Дорохов", role: "Персональный менеджер Alfa Only" },
];
