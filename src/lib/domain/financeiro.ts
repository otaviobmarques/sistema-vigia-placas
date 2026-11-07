/** Carrinho com Pix único, split da taxa de conveniência e cálculo do saving. */
import { percentual, type Centavos } from "./money";

export interface ItemCarrinho {
  multaId: string;
  valorCheio: Centavos;
  aPagar: Centavos;
}

export interface TaxaConveniencia {
  tipo: "fixa" | "percentual";
  /** fixa: centavos; percentual: pontos base (100 = 1%). */
  valor: number;
}

export interface ResumoCarrinho {
  multas: Centavos;
  economia: Centavos;
  taxa: Centavos;
  total: Centavos;
  splitFranqueado: Centavos;
}

export function resumoCarrinho(itens: ItemCarrinho[], taxa: TaxaConveniencia, repasseConvenienciaBps: number): ResumoCarrinho {
  const multas = itens.reduce((s, i) => s + i.aPagar, 0);
  const economia = itens.reduce((s, i) => s + (i.valorCheio - i.aPagar), 0);
  const t = itens.length === 0 ? 0 : taxa.tipo === "fixa" ? taxa.valor : percentual(multas, taxa.valor);
  return { multas, economia, taxa: t, total: multas + t, splitFranqueado: percentual(t, repasseConvenienciaBps) };
}

export type TipoEconomia = "desconto" | "nic_evitada" | "cancelamento";

export interface LinhaEconomia {
  tipo: TipoEconomia;
  valor: Centavos;
  comprovada: boolean;
}

export interface CalculoSaving {
  baseComprovada: Centavos;
  estimada: Centavos;
  saving: Centavos;
  tetoAplicado: boolean;
  parteFranqueado: Centavos;
  parteFranqueadora: Centavos;
}

/**
 * Regras do saving (seção 12.2): só a economia comprovada entra; teto opcional;
 * a parte do franqueado é um percentual do saving.
 */
export function calcularSaving(linhas: LinhaEconomia[], savingBps: number, repasseBps: number, tetoCentavos: Centavos | null): CalculoSaving {
  const baseComprovada = linhas.filter((l) => l.comprovada).reduce((s, l) => s + l.valor, 0);
  const estimada = linhas.filter((l) => !l.comprovada).reduce((s, l) => s + l.valor, 0);
  let saving = percentual(baseComprovada, savingBps);
  let tetoAplicado = false;
  if (tetoCentavos !== null && saving > tetoCentavos) {
    saving = tetoCentavos;
    tetoAplicado = true;
  }
  const parteFranqueado = percentual(saving, repasseBps);
  return { baseComprovada, estimada, saving, tetoAplicado, parteFranqueado, parteFranqueadora: saving - parteFranqueado };
}
