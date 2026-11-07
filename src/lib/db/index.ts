/**
 * Acesso ao Postgres. Sem DATABASE_URL usa PGlite (Postgres embutido em ./data/pglite);
 * com DATABASE_URL usa o Supabase/Postgres via driver `postgres`.
 *
 * - `sistema(fn)`: tarefas internas (login, webhooks, varredura). Ignora o RLS.
 * - `comEscopo(sessao, fn)`: tudo o que o usuário vê. Roda como `vigia_app`, com RLS.
 */
import fs from "node:fs";
import path from "node:path";

export type Params = unknown[];
export interface Db {
  q<T = Record<string, any>>(sql: string, params?: Params): Promise<T[]>;
  one<T = Record<string, any>>(sql: string, params?: Params): Promise<T | null>;
}
export interface Escopo {
  nivel: "franqueadora" | "franqueado" | "cliente";
  franqueadoId: string | null;
  clienteId: string | null;
}

type RawExec = (sql: string, params: Params) => Promise<any[]>;
interface Driver {
  transaction<T>(fn: (exec: RawExec) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
}

const g = globalThis as unknown as { __vigiaDriver?: Promise<Driver> };

async function criarDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(url, {
      max: 10,
      prepare: false, // compatível com o pooler do Supabase
      types: {
        date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
        bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
        numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      } as any,
    });
    return {
      async transaction(fn) {
        return (await sql.begin((tx) => fn((s, p) => tx.unsafe(s, p as any[]) as any))) as any;
      },
      async exec(s) {
        await sql.unsafe(s);
      },
    };
  }
  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL não configurada: na Vercel o banco precisa ser o Supabase (Settings › Environment Variables).");
  }
  const { PGlite, types } = await import("@electric-sql/pglite");
  const dir = path.join(process.cwd(), "data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir, {
    parsers: {
      [types.DATE]: (x: string) => x,
      [types.INT8]: (x: string) => Number(x),
      [types.NUMERIC]: (x: string) => Number(x),
    },
  });
  await db.waitReady;
  // PGlite é de conexão única: serializa as transações.
  let fila: Promise<unknown> = Promise.resolve();
  return {
    transaction(fn) {
      const run = fila.then(() => db.transaction(async (tx) => fn(async (s, p) => (await tx.query(s, p)).rows as any[])));
      fila = run.catch(() => undefined);
      return run;
    },
    async exec(s) {
      const run = fila.then(() => db.exec(s));
      fila = run.catch(() => undefined);
      await run;
    },
  };
}

async function migrar(d: Driver) {
  // Só cria se faltar: em produção o usuário do app não tem permissão de CREATE no schema.
  const existe = await d.transaction((x) => x("select to_regclass('public.schema_migrations') is not null as ok", []));
  if (!existe[0]?.ok) await d.exec("create table schema_migrations (nome text primary key, aplicada_em timestamptz not null default now())");
  const dir = path.join(process.cwd(), "db", "migrations");
  const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const feitas = new Set(
    (await d.transaction((x) => x("select nome from schema_migrations", []))).map((r: any) => r.nome),
  );
  for (const f of arquivos) {
    if (feitas.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await d.exec(`begin;\n${sql}\ninsert into schema_migrations (nome) values ('${f}');\ncommit;`);
  }
}

export function driver(): Promise<Driver> {
  if (!g.__vigiaDriver) {
    g.__vigiaDriver = (async () => {
      const d = await criarDriver();
      await migrar(d);
      if (!process.env.DATABASE_URL && process.env.VIGIA_SEM_DEMO !== "1") {
        const { semearSeVazio } = await import("./seed");
        await semearSeVazio(wrap(d));
      }
      return d;
    })();
    g.__vigiaDriver.catch(() => (g.__vigiaDriver = undefined));
  }
  return g.__vigiaDriver;
}

function dbDe(exec: RawExec): Db {
  return {
    q: (s, p = []) => exec(s, p),
    one: async (s, p = []) => (await exec(s, p))[0] ?? null,
  };
}

/** Executor de sistema sobre um driver já criado (usado pelo seed na inicialização). */
function wrap(d: Driver) {
  return <T>(fn: (db: Db) => Promise<T>) => d.transaction((exec) => fn(dbDe(exec)));
}

export async function sistema<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return wrap(await driver())(fn);
}

export async function comEscopo<T>(e: Escopo, fn: (db: Db) => Promise<T>): Promise<T> {
  const d = await driver();
  return d.transaction(async (exec) => {
    await exec("set local role vigia_app", []);
    await exec(
      "select set_config('app.nivel', $1, true), set_config('app.franqueado_id', $2, true), set_config('app.cliente_id', $3, true)",
      [e.nivel, e.franqueadoId ?? "", e.clienteId ?? ""],
    );
    return fn(dbDe(exec));
  });
}

export type SistemaFn = ReturnType<typeof wrap>;
