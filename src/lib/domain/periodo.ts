/** Período dos relatórios: Hoje, Quinzena, Mês, Trimestre, Ano, Tudo ou Personalizado (de/até). Datas no fuso de Brasília. */
import { periodoDe, type Periodo } from "./ciclo";
import type { DataISO } from "./dates";

export const PERIODOS = {
  hoje: "Hoje",
  quinzena: "Quinzena",
  mes: "Mês",
  trimestre: "Trimestre",
  semestre: "Semestre",
  ano: "Ano",
  tudo: "Todo o período",
  personalizado: "Personalizado",
} as const;
export type TipoPeriodo = keyof typeof PERIODOS;
export const ehTipoPeriodo = (v: unknown): v is TipoPeriodo => typeof v === "string" && v in PERIODOS;

const ehData = (v: unknown): v is DataISO => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const fimDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);

/** Intervalo do período (null = sem limite de data). `mes` (AAAA-MM) escolhe um mês específico. */
export function resolverPeriodo(tipo: TipoPeriodo, hoje: DataISO, opts: { de?: string | null; ate?: string | null; mes?: string | null } = {}): Periodo | null {
  const [a, m] = hoje.split("-").map(Number);
  switch (tipo) {
    case "hoje": return { inicio: hoje, fim: hoje };
    case "quinzena": return periodoDe("quinzenal", hoje);
    case "mes": {
      if (opts.mes && /^\d{4}-\d{2}$/.test(opts.mes)) { const [y, mm] = opts.mes.split("-").map(Number); return { inicio: `${opts.mes}-01`, fim: fimDoMes(y, mm) }; }
      return periodoDe("mensal", hoje);
    }
    case "trimestre": { const t0 = Math.floor((m - 1) / 3) * 3 + 1; return { inicio: `${a}-${String(t0).padStart(2, "0")}-01`, fim: fimDoMes(a, t0 + 2) }; }
    case "semestre": return m <= 6 ? { inicio: `${a}-01-01`, fim: `${a}-06-30` } : { inicio: `${a}-07-01`, fim: `${a}-12-31` };
    case "ano": return { inicio: `${a}-01-01`, fim: `${a}-12-31` };
    case "personalizado": {
      const de = ehData(opts.de) ? opts.de : null, ate = ehData(opts.ate) ? opts.ate : null;
      if (!de && !ate) return periodoDe("mensal", hoje);
      const inicio = de ?? "1900-01-01", fim = ate ?? "2999-12-31";
      return inicio <= fim ? { inicio, fim } : { inicio: fim, fim: inicio };
    }
    default: return null;
  }
}

/** Lê o período da URL (periodo, de, ate, mes), com o padrão de cada relatório. */
export function lerPeriodo(q: { get(k: string): string | null }, padrao: TipoPeriodo, hoje: DataISO, aceitaTudo = true) {
  const pedido = q.get("periodo");
  let tipo: TipoPeriodo = ehTipoPeriodo(pedido) ? pedido : q.get("mes") ? "mes" : padrao;
  if (tipo === "tudo" && !aceitaTudo) tipo = "mes";
  const periodo = resolverPeriodo(tipo, hoje, { de: q.get("de"), ate: q.get("ate"), mes: q.get("mes") });
  return { tipo, periodo };
}

const br = (d: string) => d.split("-").reverse().join("/");
export const textoPeriodo = (p: Periodo | null) =>
  !p ? "todo o período" : p.inicio === p.fim ? br(p.inicio) : p.inicio === "1900-01-01" ? `até ${br(p.fim)}` : p.fim === "2999-12-31" ? `desde ${br(p.inicio)}` : `${br(p.inicio)} a ${br(p.fim)}`;
