/** "Faça hoje" e Radar de Desconto: o que fazer com cada multa, com o impacto em reais. */
import { ESTADOS, melhorValorHoje, notificacaoForaDoPrazo, pagavel, prazoIndicacao, valoresMulta, type MultaRegra } from "./ctb";
import { diasEntre, type DataISO } from "./dates";
import { brl, type Centavos } from "./money";

export type TipoAcao = "indicar" | "pagar40" | "pagar20" | "defesa" | "vencida";

export interface Acao {
  tipo: TipoAcao;
  titulo: string;
  detalhe: string;
  dias: number;
  /** Quanto o cliente economiza (ou deixa de perder) agindo. */
  impacto: Centavos;
  botao: string;
}

export function acoesDaMulta(m: MultaRegra, hoje: DataISO): Acao[] {
  if (!ESTADOS[m.estado].aberta) return [];
  const v = valoresMulta(m);
  const out: Acao[] = [];

  const limiteInd = prazoIndicacao(m.notificadaEm);
  if (m.tipoProprietario === "PJ" && !m.condutorIndicado && limiteInd && ["notificada", "detectada"].includes(m.estado)) {
    const dias = diasEntre(hoje, limiteInd);
    if (dias >= 0) {
      out.push({ tipo: "indicar", titulo: "Indicar condutor", detalhe: `Evita multa NIC de ${brl(v.nic)}`, dias, impacto: v.nic, botao: "Indicar" });
    }
  }

  if (notificacaoForaDoPrazo(m.dataInfracao, m.notificadaEm) && m.estado !== "em_defesa") {
    const dias = m.vencimento ? diasEntre(hoje, m.vencimento) : 30;
    out.push({ tipo: "defesa", titulo: "Avaliar defesa", detalhe: "Notificação pode ter sido expedida fora do prazo", dias, impacto: v.cheio, botao: "Ver opções" });
  }

  if (pagavel(m.estado) && m.vencimento) {
    const dias = diasEntre(hoje, m.vencimento);
    if (dias < 0) {
      out.push({ tipo: "vencida", titulo: "Multa vencida", detalhe: `Pagar ${brl(v.cheio)} com encargos`, dias, impacto: 0, botao: "Pagar" });
    } else {
      const melhor = melhorValorHoje(m, hoje);
      const tipo = melhor.desconto === "40" ? "pagar40" : "pagar20";
      out.push({
        tipo,
        titulo: `Pagar com ${melhor.desconto}%`,
        detalhe: `De ${brl(v.cheio)} por ${brl(melhor.valor)}`,
        dias,
        impacto: v.cheio - melhor.valor,
        botao: "Pagar",
      });
    }
  }
  return out;
}

/** Ordena por urgência (menos dias primeiro) e, no empate, pelo maior impacto. */
export function ordenarAcoes<T extends Acao>(acoes: T[], limite = 10): T[] {
  return [...acoes].sort((a, b) => a.dias - b.dias || b.impacto - a.impacto).slice(0, limite);
}

export interface Recomendacao {
  titulo: string;
  texto: string;
  opcao: "pagar40" | "pagar20" | "indicar" | "contestar" | "nada";
}

/** Copiloto por regras (M5 · MVP): uma recomendação em linguagem simples. */
export function recomendacao(m: MultaRegra, hoje: DataISO): Recomendacao {
  const v = valoresMulta(m);
  if (!ESTADOS[m.estado].aberta) return { titulo: "Nada a fazer", texto: "Esta multa já foi resolvida.", opcao: "nada" };
  if (notificacaoForaDoPrazo(m.dataInfracao, m.notificadaEm)) {
    return {
      titulo: "Vale avaliar a defesa",
      texto: "A notificação parece ter sido expedida mais de 30 dias depois da infração. Nesse caso o auto pode ser arquivado (art. 281). Peça uma análise antes de pagar.",
      opcao: "contestar",
    };
  }
  const limiteInd = prazoIndicacao(m.notificadaEm);
  if (m.tipoProprietario === "PJ" && !m.condutorIndicado && limiteInd && diasEntre(hoje, limiteInd) >= 0) {
    return {
      titulo: "Indique o condutor primeiro",
      texto: `Veículo de empresa sem condutor indicado no prazo gera nova multa de ${brl(v.nic)} (2 vezes o valor). Indique até ${limiteInd.split("-").reverse().join("/")} e depois pague com desconto.`,
      opcao: "indicar",
    };
  }
  if (v.com40 !== null) {
    return {
      titulo: "Reconheça no SNE e pague com 40%",
      texto: `O veículo está no SNE desde antes da infração e o órgão é aderente. Reconhecer e pagar agora sai mais barato: economia de ${brl(v.cheio - v.com40)}.`,
      opcao: "pagar40",
    };
  }
  return {
    titulo: "Pague até o vencimento com 20%",
    texto: `O veículo não estava no SNE na data da infração, então o desconto disponível é de 20% (${brl(v.cheio - v.com20)}). Ative o SNE para ter 40% nas próximas.`,
    opcao: "pagar20",
  };
}
