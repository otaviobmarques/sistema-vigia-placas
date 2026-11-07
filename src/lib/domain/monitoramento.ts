/** Agenda de consultas por placa (M3). */
import { diasEntre, somarDias, type DataISO } from "./dates";

export type Frequencia = "diaria" | "semanal" | "quinzenal" | "mensal" | "adaptativa";

export const FREQUENCIAS: Record<Frequencia, { rotulo: string; dias: number }> = {
  diaria: { rotulo: "Diária", dias: 1 },
  semanal: { rotulo: "Semanal", dias: 7 },
  quinzenal: { rotulo: "Quinzenal", dias: 15 },
  mensal: { rotulo: "Mensal", dias: 30 },
  adaptativa: { rotulo: "Adaptativa (semanal + diária em risco)", dias: 7 },
};

export interface SituacaoPlaca {
  /** Data da multa detectada mais recente (null se nunca). */
  ultimaMultaEm: DataISO | null;
  /** Menor prazo aberto (indicação ou vencimento) entre as multas da placa. */
  proximoPrazo: DataISO | null;
}

/**
 * Adaptativa: diária quando a placa está em período de risco — multa nos últimos 30 dias
 * (outras do mesmo trajeto tendem a chegar) ou prazo nos próximos 10 dias; semanal no resto.
 */
export function intervaloDias(freq: Frequencia, s: SituacaoPlaca, hoje: DataISO): number {
  if (freq !== "adaptativa") return FREQUENCIAS[freq].dias;
  const recente = s.ultimaMultaEm && diasEntre(s.ultimaMultaEm, hoje) <= 30;
  const prazoPerto = s.proximoPrazo && diasEntre(hoje, s.proximoPrazo) <= 10;
  return recente || prazoPerto ? 1 : 7;
}

export function proximaConsulta(freq: Frequencia, ultima: DataISO | null, s: SituacaoPlaca, hoje: DataISO): DataISO {
  if (!ultima) return hoje;
  return somarDias(ultima, intervaloDias(freq, s, hoje));
}

/** Dias de antecedência padrão dos avisos de prazo (seção 7). */
export const AVISOS_PADRAO = [15, 7, 3, 1];

/** Retorna a antecedência do aviso a enviar hoje (a menor faixa que já foi atingida), ou null. */
export function avisoDevido(prazo: DataISO, hoje: DataISO, antecedencias: number[], jaEnviados: number[]): number | null {
  const faltam = diasEntre(hoje, prazo);
  if (faltam < 0) return null;
  const atingidas = antecedencias.filter((d) => faltam <= d);
  if (!atingidas.length) return null;
  const alvo = Math.min(...atingidas);
  return jaEnviados.includes(alvo) ? null : alvo;
}
