/** Estimativa de custo de dados pela regra de consulta (usada no backoffice). */
import { COMPLEMENTARES, FONTES, fontesParaUf, infosimplesCobreUf, modoSimulado } from "../integrations/infosimples";
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
  const escolha = escolherFontes({ estrategia, principal, disponiveis, infosimplesCobreUf: infosimplesCobreUf(uf), ultimaFonte: null });
  // Complementares (DNIT) rodam sempre; quando a Infosimples não é a primeira opção, entram à parte.
  const complemento = disponiveis.includes("infosimples") && !escolha.primeiras.includes("infosimples")
    ? FONTES.filter((f) => COMPLEMENTARES.includes(f.servico)).reduce((a, f) => a + Math.round((0.2 + f.extra) * 100), 0)
    : 0;
  return { escolha, custo: custoPorConsulta(escolha, custosPorFonte(uf)) + complemento };
}

export function custoMensalPlaca(uf: string, frequencia: string, estrategia: EstrategiaFontes, principal: FonteDados) {
  return Math.round(consultasPorMes(frequencia) * custoConsultaPlaca(uf, estrategia, principal).custo);
}

export const UFS_EXEMPLO = ["MG", "SP", "RJ", "PA"];
export { FONTES };
