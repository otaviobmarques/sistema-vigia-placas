/** Agenda de consultas por placa (M3). */
import { diasEntre, somarDias, type DataISO } from "./dates";

/**
 * Frequência: "adaptativa" ou um intervalo em dias ("1" a "60").
 * Valores antigos (diaria, semanal, quinzenal, mensal) continuam aceitos.
 */
export type Frequencia = string;

const LEGADO: Record<string, string> = { diaria: "1", semanal: "7", quinzenal: "15", mensal: "30" };
export const DIAS_MIN = 1;
export const DIAS_MAX = 60;

export function normalizarFrequencia(v: string | null | undefined): string {
  const t = String(v ?? "").trim().toLowerCase();
  if (t === "adaptativa") return "adaptativa";
  const n = Number(LEGADO[t] ?? t);
  if (Number.isInteger(n) && n >= DIAS_MIN && n <= DIAS_MAX) return String(n);
  return "adaptativa";
}

export function rotuloFrequencia(v: string | null | undefined): string {
  const f = normalizarFrequencia(v);
  if (f === "adaptativa") return "Adaptativa (semanal; diária em período de risco)";
  const n = Number(f);
  return n === 1 ? "Diária" : n === 7 ? "Semanal" : n === 15 ? "Quinzenal" : n === 30 ? "Mensal" : `A cada ${n} dias`;
}

/** Opções sugeridas na tela (qualquer valor de 1 a 60 também é aceito). */
export const OPCOES_FREQUENCIA = ["adaptativa", "1", "2", "3", "5", "7", "10", "15", "20", "30", "45", "60"];

export interface SituacaoPlaca {
  /** Data da multa detectada mais recente (null se nunca). */
  ultimaMultaEm: DataISO | null;
  /** Menor prazo aberto (indicação ou vencimento) entre as multas da placa. */
  proximoPrazo: DataISO | null;
}

/** Período de risco: multa nos últimos 30 dias ou prazo nos próximos 10. */
export function emRisco(s: SituacaoPlaca, hoje: DataISO): boolean {
  const recente = !!s.ultimaMultaEm && diasEntre(s.ultimaMultaEm, hoje) <= 30;
  const prazoPerto = !!s.proximoPrazo && diasEntre(hoje, s.proximoPrazo) <= 10;
  return recente || prazoPerto;
}

/** Adaptativa: diária em período de risco, semanal no resto. */
export function intervaloDias(freq: Frequencia, s: SituacaoPlaca, hoje: DataISO): number {
  const f = normalizarFrequencia(freq);
  if (f !== "adaptativa") return Number(f);
  return emRisco(s, hoje) ? 1 : 7;
}

export function proximaConsulta(freq: Frequencia, ultima: DataISO | null, s: SituacaoPlaca, hoje: DataISO): DataISO {
  if (!ultima) return hoje;
  return somarDias(ultima, intervaloDias(freq, s, hoje));
}

/** Consultas por mês de uma frequência (adaptativa estimada como semanal). */
export function consultasPorMes(freq: Frequencia): number {
  const f = normalizarFrequencia(freq);
  return 30 / (f === "adaptativa" ? 7 : Number(f));
}

// ---------------- Regra de fontes ----------------

export type FonteDados = "directdata" | "infosimples";
export type EstrategiaFontes = "principal_reserva" | "por_uf" | "alternar" | "ambas";

export const ESTRATEGIAS: Record<EstrategiaFontes, { rotulo: string; descricao: string }> = {
  principal_reserva: { rotulo: "Principal com reserva", descricao: "Consulta só a fonte principal; a outra entra apenas se a principal falhar." },
  por_uf: { rotulo: "Por estado", descricao: "Infosimples nos estados em que ela tem Detran sem login; Direct Data nos demais (ex.: SP). Reserva na falha." },
  alternar: { rotulo: "Alternar", descricao: "Uma fonte em cada consulta da placa, revezando. Reserva na falha." },
  ambas: { rotulo: "As duas sempre", descricao: "Cobertura máxima: consulta as duas fontes toda vez (custo dobrado)." },
};

export interface EscolhaFontes {
  /** Fontes a consultar agora. */
  primeiras: FonteDados[];
  /** Fonte a tentar se todas as primeiras falharem. */
  reserva: FonteDados | null;
}

export function escolherFontes(r: {
  estrategia: EstrategiaFontes;
  principal: FonteDados;
  disponiveis: FonteDados[];
  /** A Infosimples tem fonte estadual sem login para a UF desta placa. */
  infosimplesCobreUf: boolean;
  ultimaFonte: FonteDados | null;
}): EscolhaFontes {
  const tem = (f: FonteDados) => r.disponiveis.includes(f);
  const outra = (f: FonteDados): FonteDados => (f === "directdata" ? "infosimples" : "directdata");
  if (!r.disponiveis.length) return { primeiras: [], reserva: null };
  if (r.disponiveis.length === 1) return { primeiras: [...r.disponiveis], reserva: null };
  if (r.estrategia === "ambas") return { primeiras: ["directdata", "infosimples"], reserva: null };
  let escolhida: FonteDados = r.principal;
  if (r.estrategia === "por_uf") escolhida = r.infosimplesCobreUf ? "infosimples" : "directdata";
  if (r.estrategia === "alternar") escolhida = r.ultimaFonte ? outra(r.ultimaFonte) : r.principal;
  if (!tem(escolhida)) escolhida = outra(escolhida);
  return { primeiras: [escolhida], reserva: tem(outra(escolhida)) ? outra(escolhida) : null };
}

/** Custo esperado de uma consulta (centavos), sem contar a reserva (só entra quando a principal falha). */
export function custoPorConsulta(e: EscolhaFontes, custos: Record<FonteDados, number>): number {
  return e.primeiras.reduce((a, f) => a + custos[f], 0);
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
