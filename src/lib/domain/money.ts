/** Valores monetários são sempre inteiros em centavos. */
export type Centavos = number;

const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function brl(c: Centavos): string {
  return fmt.format(c / 100);
}

/** Aplica um fator (ex.: 0,8) arredondando meio centavo para cima, como os órgãos fazem. */
export function aplicarFator(c: Centavos, fator: number): Centavos {
  return Math.round(c * fator + 1e-9);
}

/** Percentual em pontos base: 2000 = 20,00%. Evita ponto flutuante na configuração. */
export function percentual(c: Centavos, bps: number): Centavos {
  return Math.round((c * bps) / 10000 + 1e-9);
}

export function parseReais(s: string): Centavos {
  const limpo = s.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = Number(limpo);
  if (!Number.isFinite(n)) throw new Error(`Valor inválido: ${s}`);
  return Math.round(n * 100);
}
