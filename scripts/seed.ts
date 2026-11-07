/** Popula um banco vazio com os dados de demonstração (útil no Supabase: DATABASE_URL=... npm run seed). */
import { driver, sistema } from "../src/lib/db";
import { semearSeVazio } from "../src/lib/db/seed";

(async () => {
  await driver(); // aplica as migrações
  await semearSeVazio((fn) => sistema(fn));
  console.log("Pronto.");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
