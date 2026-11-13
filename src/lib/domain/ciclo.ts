/**
 * Ciclo de fechamento da fatura de cada cliente. A mensalidade é por placa/mês; num ciclo menor que o mês
 * ela é proporcional aos dias do período (soma de 1/dias-do-mês de cada dia), então um mês inteiro soma 1.
 */
import { somarDias, type DataISO } from "./dates";

export type Ciclo = "diario" | "semanal" | "quinzenal" | "mensal";
export const CICLOS: Record<Ciclo, string> = {
  diario: "Diário",
  semanal: "Semanal (segunda a domingo)",
  quinzenal: "Quinzenal (dias 1–15 e 16–fim)",
  mensal: "Mensal",
};
export const ehCiclo = (v: string): v is Ciclo => v in CICLOS;

const diasNoMes = (d: DataISO) => {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const fimDoMes = (d: DataISO) => `${d.slice(0, 8)}${String(diasNoMes(d)).padStart(2, "0")}`;

export interface Periodo { inicio: DataISO; fim: DataISO }

/** Período do ciclo que contém o dia `d`. */
export function periodoDe(ciclo: Ciclo, d: DataISO): Periodo {
  if (ciclo === "diario") return { inicio: d, fim: d };
  if (ciclo === "semanal") {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 = domingo
    const inicio = somarDias(d, -((dow + 6) % 7));
    return { inicio, fim: somarDias(inicio, 6) };
  }
  if (ciclo === "quinzenal") {
    const dia = Number(d.slice(8, 10));
    return dia <= 15 ? { inicio: `${d.slice(0, 8)}01`, fim: `${d.slice(0, 8)}15` } : { inicio: `${d.slice(0, 8)}16`, fim: fimDoMes(d) };
  }
  return { inicio: `${d.slice(0, 8)}01`, fim: fimDoMes(d) };
}

/** Fração de uma mensalidade que o período representa. */
export function fracaoMensal(p: Periodo): number {
  let f = 0;
  for (let d = p.inicio; d <= p.fim; d = somarDias(d, 1)) f += 1 / diasNoMes(d);
  return f;
}

/** Períodos que terminam dentro do mês (AAAA-MM), em ordem. */
export function periodosDoMes(ciclo: Ciclo, mes: string): Periodo[] {
  const out: Periodo[] = [];
  const ultimo = fimDoMes(`${mes}-01`);
  let d = `${mes}-01`;
  while (d <= ultimo) {
    const p = periodoDe(ciclo, d);
    if (p.fim.slice(0, 7) === mes && !out.some((x) => x.inicio === p.inicio)) out.push(p);
    d = somarDias(p.fim, 1);
  }
  return out;
}

export const vencimentoDe = (p: Periodo, dias: number) => somarDias(p.fim, dias);

/**
 * Fração de mensalidade que uma placa paga no período, cobrando sempre o período cheio:
 * a placa cadastrada em qualquer dia paga o ciclo inteiro em que entrou (mês cheio no ciclo mensal),
 * e não paga ciclos anteriores ao cadastro.
 */
export function fracaoCobrada(ciclo: Ciclo, p: Periodo, cadastradaEm: DataISO): number {
  if (cadastradaEm > p.fim) return 0;
  const inicioDoCiclo = periodoDe(ciclo, cadastradaEm).inicio;
  return fracaoMensal({ inicio: inicioDoCiclo > p.inicio ? inicioDoCiclo : p.inicio, fim: p.fim });
}
