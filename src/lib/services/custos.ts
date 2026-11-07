/** Estimativa de custo de dados pela regra de consulta (usada no backoffice). */
import { FONTES, fontesParaUf, modoSimulado } from "../integrations/infosimples";
import { directDataAtiva } from "../integrations/directdata";
import { consultasPorMes, custoPorConsulta, escolherFontes, type EstrategiaFontes, type FonteDados } from "../domain/monitoramento";

export function custosPorFonte(uf: string): Record<FonteDados, number> {
  return {
    directdata: 36,
    infosimples: fontesParaUf(uf).reduce((a, f) => a + Math.round((0.2 + f.extra) * 100), 0),
  };
}

export function fontesDisponiveis(): FonteDados[] {
  return [...(directDataAtiva() ? (["directdata"] as const) : []), ...(!modoSimulado() ? (["infosimples"] as const) : [])];
}

export function custoConsultaPlaca(uf: string, estrategia: EstrategiaFontes, principal: FonteDados, disponiveis = fontesDisponiveis()) {
  const escolha = escolherFontes({ estrategia, principal, disponiveis, infosimplesCobreUf: fontesParaUf(uf).length > 1, ultimaFonte: null });
  return { escolha, custo: custoPorConsulta(escolha, custosPorFonte(uf)) };
}

export function custoMensalPlaca(uf: string, frequencia: string, estrategia: EstrategiaFontes, principal: FonteDados) {
  return Math.round(consultasPorMes(frequencia) * custoConsultaPlaca(uf, estrategia, principal).custo);
}

export const UFS_EXEMPLO = ["MG", "SP", "RJ", "PA"];
export { FONTES };
