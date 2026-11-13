/**
 * Regras do Código de Trânsito Brasileiro (Lei 9.503/1997) automatizadas pelo Vigia Placa.
 * Revisar com advogado de trânsito e conferir no texto oficial (planalto.gov.br).
 */
import { aplicarFator, brl, type Centavos } from "./money";
import { diasEntre, somarDias, type DataISO } from "./dates";

export type Gravidade = "leve" | "media" | "grave" | "gravissima";

/** Art. 258: valores base e pontos (art. 259). */
export const GRAVIDADES: Record<Gravidade, { rotulo: string; valor: Centavos; pontos: number }> = {
  leve: { rotulo: "Leve", valor: 8838, pontos: 3 },
  media: { rotulo: "Média", valor: 13016, pontos: 4 },
  grave: { rotulo: "Grave", valor: 19523, pontos: 5 },
  gravissima: { rotulo: "Gravíssima", valor: 29347, pontos: 7 },
};

/** Art. 257, § 7º: prazo para identificar o condutor, contado da notificação da autuação. */
export const PRAZO_INDICACAO_DIAS = 30;
/** Art. 281, par. único, II: prazo para expedir a notificação da autuação. */
export const PRAZO_EXPEDICAO_DIAS = 30;
/** Art. 257, § 8º: multa NIC = 2 vezes o valor da multa originária. */
export const FATOR_NIC = 2;

export type EstadoMulta =
  | "detectada"
  | "notificada"
  | "condutor_indicado"
  | "reconhecida_sne"
  | "em_defesa"
  | "penalidade"
  | "paga"
  | "vencida"
  | "cancelada";

export const ESTADOS: Record<EstadoMulta, { rotulo: string; aberta: boolean }> = {
  detectada: { rotulo: "Detectada", aberta: true },
  notificada: { rotulo: "Autuação notificada", aberta: true },
  condutor_indicado: { rotulo: "Condutor indicado", aberta: true },
  reconhecida_sne: { rotulo: "Reconhecida (SNE)", aberta: true },
  em_defesa: { rotulo: "Em defesa", aberta: true },
  penalidade: { rotulo: "Penalidade imposta", aberta: true },
  paga: { rotulo: "Paga", aberta: false },
  vencida: { rotulo: "Vencida", aberta: true },
  cancelada: { rotulo: "Cancelada", aberta: false },
};

export interface MultaRegra {
  valor: Centavos;
  estado: EstadoMulta;
  dataInfracao: DataISO;
  notificadaEm: DataISO | null;
  vencimento: DataISO | null;
  /** Data de adesão da placa ao SNE (null = não aderida). */
  sneAdesaoEm: DataISO | null;
  orgaoAderenteSne: boolean;
  tipoProprietario: "PF" | "PJ";
  condutorIndicado: boolean;
}

/**
 * Art. 284, § 1º: 40% de desconto para quem optou pelo SNE e não apresenta defesa nem recurso.
 * Exige adesão ANTES da data da infração e órgão autuador aderente.
 */
export function elegivel40(m: Pick<MultaRegra, "sneAdesaoEm" | "dataInfracao" | "orgaoAderenteSne">): boolean {
  return !!m.sneAdesaoEm && m.orgaoAderenteSne && m.sneAdesaoEm <= m.dataInfracao;
}

export interface Valores {
  cheio: Centavos;
  com20: Centavos;
  com40: Centavos | null;
  nic: Centavos;
}

export function valoresMulta(m: Pick<MultaRegra, "valor" | "sneAdesaoEm" | "dataInfracao" | "orgaoAderenteSne">): Valores {
  return {
    cheio: m.valor,
    com20: aplicarFator(m.valor, 0.8), // art. 284, caput
    com40: elegivel40(m) ? aplicarFator(m.valor, 0.6) : null,
    nic: m.valor * FATOR_NIC,
  };
}

export function prazoIndicacao(notificadaEm: DataISO | null): DataISO | null {
  return notificadaEm ? somarDias(notificadaEm, PRAZO_INDICACAO_DIAS) : null;
}

/** Art. 281: notificação expedida depois de 30 dias da infração → auto pode ser arquivado. */
export function notificacaoForaDoPrazo(dataInfracao: DataISO, notificadaEm: DataISO | null): boolean {
  return !!notificadaEm && diasEntre(dataInfracao, notificadaEm) > PRAZO_EXPEDICAO_DIAS;
}

/** Melhor valor que o cliente ainda consegue pagar hoje. */
export function melhorValorHoje(m: MultaRegra, hoje: DataISO): { valor: Centavos; desconto: "40" | "20" | null } {
  const v = valoresMulta(m);
  const noPrazo = !m.vencimento || hoje <= m.vencimento;
  if (!noPrazo) return { valor: v.cheio, desconto: null };
  if (v.com40 !== null && m.estado !== "em_defesa") return { valor: v.com40, desconto: "40" };
  return { valor: v.com20, desconto: "20" };
}

/**
 * Selo de desconto da multa: qual faixa vale hoje (40% SNE, 20% padrão ou nenhuma) e por quê, para a dica ao passar o mouse.
 * 40%: proprietário no SNE antes da infração, órgão aderente, sem recurso e pagando até o vencimento (art. 284, § 1º).
 * 20%: pagando até o vencimento (art. 284, caput).
 */
export function seloDesconto(m: MultaRegra, hoje: DataISO): { faixa: "40" | "20" | null; texto: string } {
  const v = valoresMulta(m);
  const br = (d: string) => d.split("-").reverse().join("/");
  if (m.estado === "paga" || m.estado === "cancelada") return { faixa: null, texto: m.estado === "paga" ? "Multa já paga." : "Multa cancelada." };
  if (m.vencimento && hoje > m.vencimento) return { faixa: null, texto: `Sem desconto: o vencimento foi em ${br(m.vencimento)}. O valor agora é o cheio (${brl(v.cheio)}).` };
  const ate = m.vencimento ? ` até ${br(m.vencimento)}` : " até o vencimento";
  if (v.com40 !== null && m.estado !== "em_defesa")
    return { faixa: "40", texto: `Elegível a 40% (SNE): pague ${brl(v.com40)}${ate} sem recorrer. O proprietário está no SNE desde antes da infração e o órgão é aderente.` };
  const motivo = m.estado === "em_defesa" ? "a multa está em recurso (os 40% exigem não recorrer)"
    : !m.sneAdesaoEm ? "o cliente não está registrado no SNE"
    : !m.orgaoAderenteSne ? "o órgão autuador não aderiu ao SNE"
    : "a adesão ao SNE foi depois da infração";
  return { faixa: "20", texto: `Elegível a 20%: pague ${brl(v.com20)}${ate}. Sem 40% porque ${motivo}. Dá para recorrer mesmo pagando com 20%.` };
}

/** Art. 261, I: limite de pontos em 12 meses conforme o número de gravíssimas. */
export function limitePontos(gravissimas: number): number {
  if (gravissimas >= 2) return 20;
  if (gravissimas === 1) return 30;
  return 40;
}

export function pagavel(estado: EstadoMulta): boolean {
  return ["notificada", "condutor_indicado", "reconhecida_sne", "penalidade", "vencida"].includes(estado);
}
