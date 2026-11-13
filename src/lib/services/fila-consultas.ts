/**
 * Consultas em execuções separadas: cada placa vai para a sua própria função (/api/interno/consultar),
 * com os 300s só para ela. Em sequência, numa função só, um lote estourava o limite e as placas do fim
 * nunca eram consultadas. Sem CRON_SECRET (ambiente local), consulta aqui mesmo, uma a uma.
 */
import { sistema } from "../db";
import { urlApp } from "../url";
import { consultarPlaca } from "./monitoramento";
import { despacharOutbox } from "./despacho";
import { consultarAnttCliente } from "./antt";

export const ROTA_CONSULTA = "/api/interno/consultar";
const INTERVALO_MS = 100; // espaça os disparos para não abrir centenas de chamadas às fontes no mesmo instante

export const filaSeparada = () => !!process.env.CRON_SECRET && process.env.NODE_ENV === "production";

/** Consulta as placas e despacha os avisos. Usado pela rota interna e como plano B sem fila. */
export async function consultarAgora(ids: string[]) {
  let ok = 0, erros = 0, novas = 0;
  for (const id of ids) {
    try {
      const r = await sistema((db) => consultarPlaca(db, id));
      r.ok ? ok++ : erros++;
      novas += r.novas;
    } catch (e: any) {
      erros++;
      console.error("consulta falhou", id, e?.message ?? e);
    }
  }
  await sistema((db) => despacharOutbox(db)).catch(() => undefined);
  return { ok, erros, novas };
}

/** ANTT/SIFAMA de cada cliente (consulta por CNPJ, não por placa). */
export async function consultarAnttAgora(clientes: string[]) {
  for (const id of clientes) await sistema((db) => consultarAnttCliente(db, id)).catch((e) => console.error("ANTT falhou", id, e?.message ?? e));
  await sistema((db) => despacharOutbox(db)).catch(() => undefined);
}

async function disparar(corpo: Record<string, string[]>) {
  const r = await fetch(`${urlApp()}${ROTA_CONSULTA}`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  return r?.status === 202;
}

/** Uma execução por cliente com ANTT ativa. Sem fila (local), consulta aqui mesmo. */
export async function enfileirarAntt(clientes: string[]) {
  if (!clientes.length) return { enviadas: 0 };
  if (!filaSeparada()) { await consultarAnttAgora(clientes); return { enviadas: clientes.length }; }
  let enviadas = 0;
  for (const id of clientes) { if (await disparar({ antt: [id] })) enviadas++; await new Promise((r) => setTimeout(r, INTERVALO_MS)); }
  return { enviadas };
}

/** Dispara uma execução por placa. Espera só o "recebido" (202) de cada uma, não a consulta. */
export async function enfileirarConsultas(ids: string[]): Promise<{ enviadas: number; falharam: string[] }> {
  if (!ids.length) return { enviadas: 0, falharam: [] };
  if (!filaSeparada()) {
    await consultarAgora(ids);
    return { enviadas: ids.length, falharam: [] };
  }
  const falharam: string[] = [];
  const envios: Promise<void>[] = [];
  for (const id of ids) {
    envios.push(
      fetch(`${urlApp()}${ROTA_CONSULTA}`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, "content-type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
        signal: AbortSignal.timeout(30_000),
      }).then((r) => { if (r.status !== 202) falharam.push(id); }, () => { falharam.push(id); }),
    );
    await new Promise((r) => setTimeout(r, INTERVALO_MS));
  }
  await Promise.all(envios);
  if (falharam.length) console.error("não foi possível enfileirar", falharam.length, "consulta(s); ficam para a próxima varredura");
  return { enviadas: ids.length - falharam.length, falharam };
}
