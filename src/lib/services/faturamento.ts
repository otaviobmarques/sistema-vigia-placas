import type { Db } from "../db";
import { calcularSaving } from "../domain/financeiro";
import { percentual } from "../domain/money";

/** Fecha o mês de um cliente: mensalidades + saving (sobre economia comprovada) + conveniência + defesa. */
export async function calcularFatura(db: Db, clienteId: string, mes: string) {
  const c = await db.one(
    `select c.*, pl.preco_placa, f.repasse_mensalidade_bps, f.repasse_saving_bps, f.repasse_conveniencia_bps, f.comissao_defesa_bps
     from clientes c join planos pl on pl.id = c.plano_id left join franqueados f on f.id = c.franqueado_id where c.id = $1`,
    [clienteId],
  );
  if (!c) throw new Error("Cliente não encontrado");
  const cfg = await db.one("select * from configuracao");
  const placas = Number((await db.one("select count(*) as n from placas where cliente_id = $1 and status <> 'pausada'", [clienteId]))!.n);
  const linhas = await db.q("select tipo, valor, comprovada from economias where cliente_id = $1 and mes = $2", [clienteId, mes]);
  const s = calcularSaving(linhas as any, cfg!.saving_bps, c.repasse_saving_bps ?? 0, c.saving_teto);
  const conv = await db.one(
    "select coalesce(sum(taxa),0) as taxa, coalesce(sum(split_franqueado),0) as split from pagamentos where cliente_id = $1 and to_char(pago_em, 'YYYY-MM') = $2",
    [clienteId, mes],
  );
  const defesa = Number((await db.one("select coalesce(sum(preco),0) as v from pedidos_defesa where cliente_id = $1 and to_char(criado_em, 'YYYY-MM') = $2", [clienteId, mes]))!.v);
  const mensalidades = placas * (c.preco_placa ?? 0);
  const splitFranqueado =
    percentual(mensalidades, c.repasse_mensalidade_bps ?? 0) + s.parteFranqueado + Number(conv!.split) + percentual(defesa, c.comissao_defesa_bps ?? 0);
  return {
    cliente: c,
    placas,
    mensalidades,
    saving: s.saving,
    baseSaving: s.baseComprovada,
    estimada: s.estimada,
    tetoAplicado: s.tetoAplicado,
    // A conveniência já foi cobrada no próprio Pix; entra na fatura só como informação/conciliação.
    conveniencia: Number(conv!.taxa),
    defesa,
    splitFranqueado,
    total: mensalidades + s.saving + defesa,
  };
}

export async function fecharMes(db: Db, mes: string) {
  const clientes = await db.q<{ id: string }>("select id from clientes where ativo");
  let n = 0;
  for (const { id } of clientes) {
    const f = await calcularFatura(db, id, mes);
    await db.q(
      `insert into faturas (cliente_id, franqueado_id, mes, placas, mensalidades, saving, base_saving, conveniencia, defesa, split_franqueado, total)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (cliente_id, mes) do update set placas = excluded.placas, mensalidades = excluded.mensalidades, saving = excluded.saving,
         base_saving = excluded.base_saving, conveniencia = excluded.conveniencia, defesa = excluded.defesa,
         split_franqueado = excluded.split_franqueado, total = excluded.total
       where faturas.status = 'aberta'`,
      [id, f.cliente.franqueado_id, mes, f.placas, f.mensalidades, f.saving, f.baseSaving, f.conveniencia, f.defesa, f.splitFranqueado, f.total],
    );
    n++;
  }
  return n;
}
