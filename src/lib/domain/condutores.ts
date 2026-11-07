/** Regras de condutor (M13): pontuação em 12 meses, limite do art. 261 e nota do condutor. */
import { limitePontos } from "./ctb";
import { diasEntre, type DataISO } from "./dates";

export interface SituacaoCondutor {
  pontos: number;
  gravissimas: number;
  limite: number;
  /** Fração do limite já usada (0 a 1+). */
  uso: number;
  nivel: "ok" | "atencao" | "critico" | "suspensao";
  cnhDias: number | null;
  toxicologicoDias: number | null;
  nota: number;
}

export function situacaoCondutor(c: {
  pontosInformados: number;
  gravissimasInformadas: number;
  pontosIndicados: number;
  gravissimasIndicadas: number;
  cnhValidade: DataISO | null;
  toxicologicoValidade: DataISO | null;
}, hoje: DataISO): SituacaoCondutor {
  const pontos = c.pontosInformados + c.pontosIndicados;
  const gravissimas = c.gravissimasInformadas + c.gravissimasIndicadas;
  const limite = limitePontos(gravissimas);
  const uso = pontos / limite;
  const nivel = uso >= 1 ? "suspensao" : uso >= 0.75 ? "critico" : uso >= 0.5 ? "atencao" : "ok";
  const cnhDias = c.cnhValidade ? diasEntre(hoje, c.cnhValidade) : null;
  const toxicologicoDias = c.toxicologicoValidade ? diasEntre(hoje, c.toxicologicoValidade) : null;
  // Nota de 0 a 100: pontos pesam mais perto do limite; gravíssimas e documentos vencidos descontam.
  let nota = 100 - Math.round(Math.min(1, uso) * 60) - gravissimas * 8;
  if (cnhDias !== null && cnhDias < 0) nota -= 20;
  else if (cnhDias !== null && cnhDias <= 30) nota -= 5;
  if (toxicologicoDias !== null && toxicologicoDias < 0) nota -= 15;
  return { pontos, gravissimas, limite, uso, nivel, cnhDias, toxicologicoDias, nota: Math.max(0, Math.min(100, nota)) };
}

/** Pontos e limite depois de assumir uma multa nova (para avisar antes de indicar). */
export function simularIndicacao(s: SituacaoCondutor, pontosMulta: number, gravissima: boolean) {
  const pontos = s.pontos + pontosMulta;
  const limite = limitePontos(s.gravissimas + (gravissima ? 1 : 0));
  return { pontos, limite, atingeLimite: pontos >= limite };
}

export const CATEGORIAS_CNH = ["A", "B", "AB", "C", "D", "E", "AC", "AD", "AE"];
/** Categorias que exigem exame toxicológico periódico (Lei 13.103/2015). */
export const exigeToxicologico = (cat: string | null) => !!cat && /[CDE]/.test(cat);
