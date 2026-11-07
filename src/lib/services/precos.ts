import type { Db } from "../db";

/** Preços vigentes de um cliente: os negociados (personalizados) ou, na falta deles, os globais. */
export async function precosDoCliente(db: Db, clienteId: string) {
  const r = await db.one<{ defesa: number; taxa_tipo: "fixa" | "percentual"; taxa_valor: number; defesa_propria: boolean; taxa_propria: boolean }>(
    `select coalesce(c.preco_defesa_personalizado, cfg.preco_defesa) as defesa,
            case when c.taxa_conv_valor_personalizado is not null then coalesce(c.taxa_conv_tipo_personalizado, cfg.taxa_conv_tipo) else cfg.taxa_conv_tipo end as taxa_tipo,
            coalesce(c.taxa_conv_valor_personalizado, cfg.taxa_conv_valor) as taxa_valor,
            c.preco_defesa_personalizado is not null as defesa_propria, c.taxa_conv_valor_personalizado is not null as taxa_propria
     from clientes c cross join configuracao cfg where c.id = $1`,
    [clienteId],
  );
  if (!r) throw new Error("Cliente não encontrado");
  return { defesa: Number(r.defesa), taxa: { tipo: r.taxa_tipo, valor: Number(r.taxa_valor) }, defesaPropria: r.defesa_propria, taxaPropria: r.taxa_propria };
}
