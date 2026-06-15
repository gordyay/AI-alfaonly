// Детерминированный экспорт seed-данных фронтенда в JSON — источник истины для
// наполнения SQLite в бэкенде (отчёт §6.4.2). Лежит вне src/, поэтому не входит
// в типизацию приложения (tsconfig include = ["src"]).
//
// Регенерация seed.json:
//   node_modules/.bin/esbuild scripts/export-seed.ts --bundle --format=esm \
//     --platform=node --log-level=error | node --input-type=module \
//     > backend/app/seed/seed.json

import { dataset } from "../src/data/index";
import { DEMO_NOW } from "../src/data/clock";

const out = {
  demoNow: DEMO_NOW.toISOString(),
  clients: dataset.clients,
  products: dataset.products,
  clientProducts: dataset.clientProducts,
  conversations: dataset.conversations,
  messages: dataset.messages,
  insights: dataset.insights,
  tasks: dataset.tasks,
  crmNotes: dataset.crmNotes,
  followUps: dataset.followUps,
  feedback: dataset.seedFeedback,
  managers: dataset.managers,
};

process.stdout.write(JSON.stringify(out, null, 2));
