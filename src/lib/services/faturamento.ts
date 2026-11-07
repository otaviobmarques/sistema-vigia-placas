import type { Db } from "../db";
import { calcularSaving } from "../domain/financeiro";
import { percentual } from "../domain/money";
import { ehCiclo, fracaoMensal, periodoDe, periodosDoMes, vencimentoDe, type Periodo } from "../domain/ciclo";
import { hojeISO, somarDias } from "../domain/dates";

const periodoDoMes = (mes: string): Periodo => periodoDe("mensal", `${mes}-01`);

/**
 * Fatura de um cliente num período (ou num mês inteiro, AAAA-MM): mensalidades proporcionais aos dias,
 * saving sobre a economia comprovada no período, conveniência e defesa.
 */
export async function calcularFatura(db: Db, clienteId: string, ref: string | Periodo) {
  const periodo = typeof ref === "string" ? periodoDoMes(ref) : ref;
  const mes = periodo.fim.slice(0, 7);
  const mesInteiro = periodo.inicio === periodoDoMes(mes).inicio && periodo.fim === periodoDoMes(mes).fim;
  const fracao = fracaoMensal(periodo);
  const c = await db.one(
    `select c.*, coalesce(c.preco_placa_personalizado, pl.preco_placa) as preco_placa, pl.saving_bps as plano_saving_bps, f.repasse_mensalidade_bps, f.repasse_saving_bps, f.repasse_conveniencia_bps, f.comissao_defesa_bps
     from clientes c join planos pl on pl.id = c.plano_id left join franqueados f on f.id = c.franqueado_id where c.id = $1`,
    [clienteId],
  );
  if (!c) throw new Error("Cliente não encontrado");
  const cfg = await db.one("select * from configuracao");
  // Cada placa ativa paga só os dias do período em que já estava cadastrada (cliente novo não paga período anterior).
  const ativas = await db.q<{ desde: string }>("select to_char(criado_em::date, 'YYYY-MM-DD') as desde from placas where cliente_id = $1 and status <> 'pausada' and criado_em::date <= $2", [clienteId, periodo.fim]);
  const placas = ativas.length;
  const fracaoPlacas = ativas.reduce((a, p) => a + fracaoMensal({ inicio: p.desde > periodo.inicio ? p.desde : periodo.inicio, fim: periodo.fim }), 0);
  // Mês inteiro: pela competência (mes). Período menor: pela data de registro dentro do período.
  const linhas = mesInteiro
    ? await db.q("select tipo, valor, comprovada from economias where cliente_id = $1 and mes = $2", [clienteId, mes])
    : await db.q("select tipo, valor, comprovada from economias where cliente_id = $1 and criado_em::date between $2 and $3", [clienteId, periodo.inicio, periodo.fim]);
  const savingBps: number = c.saving_bps_personalizado ?? c.plano_saving_bps ?? cfg!.saving_bps;
  const s = calcularSaving(linhas as any, savingBps, c.repasse_saving_bps ?? 0, c.saving_teto === null || c.saving_teto === undefined ? null : Math.round(c.saving_teto * fracao));
  const conv = await db.one(
    "select coalesce(sum(taxa),0) as taxa, coalesce(sum(split_franqueado),0) as split from pagamentos where cliente_id = $1 and pago_em::date between $2 and $3",
    [clienteId, periodo.inicio, periodo.fim],
  );
  const defesa = Number((await db.one("select coalesce(sum(preco),0) as v from pedidos_defesa where cliente_id = $1 and criado_em::date between $2 and $3", [clienteId, periodo.inicio, periodo.fim]))!.v);
  const mensalidades = Math.round((c.preco_placa ?? 0) * fracaoPlacas);
  const splitFranqueado =
    percentual(mensalidades, c.repasse_mensalidade_bps ?? 0) + s.parteFranqueado + Number(conv!.split) + percentual(defesa, c.comissao_defesa_bps ?? 0);
  return {
    cliente: c,
    periodo,
    placas,
    mensalidades,
    saving: s.saving,
    savingBps,
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

async function gravarFatura(db: Db, cliente: { id: string; ciclo_fechamento: string; vencimento_dias: number; forma_cobranca: string }, p: Periodo) {
  const f = await calcularFatura(db, cliente.id, p);
  await db.q(
    `insert into faturas (cliente_id, franqueado_id, mes, periodo_inicio, periodo_fim, vencimento, forma, placas, mensalidades, saving, base_saving, conveniencia, defesa, split_franqueado, total)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     on conflict (cliente_id, periodo_inicio) do update set periodo_fim = excluded.periodo_fim, vencimento = excluded.vencimento, forma = excluded.forma,
       placas = excluded.placas, mensalidades = excluded.mensalidades, saving = excluded.saving, base_saving = excluded.base_saving,
       conveniencia = excluded.conveniencia, defesa = excluded.defesa, split_franqueado = excluded.split_franqueado, total = excluded.total
     where faturas.status = 'aberta'`,
    [cliente.id, f.cliente.franqueado_id, p.fim.slice(0, 7), p.inicio, p.fim, vencimentoDe(p, cliente.vencimento_dias ?? 5), cliente.forma_cobranca,
     f.placas, f.mensalidades, f.saving, f.baseSaving, f.conveniencia, f.defesa, f.splitFranqueado, f.total],
  );
}

const clientesFaturaveis = (db: Db) =>
  db.q<{ id: string; ciclo_fechamento: string; vencimento_dias: number; forma_cobranca: string; desde: string }>(
    "select id, ciclo_fechamento, vencimento_dias, forma_cobranca, to_char(criado_em::date, 'YYYY-MM-DD') as desde from clientes where ativo and excluido_em is null",
  );

/** Fecha (ou recalcula, se ainda aberta) cada fatura de cada cliente cujo período termina no mês, conforme o ciclo dele. */
export async function fecharMes(db: Db, mes: string) {
  const hoje = hojeISO();
  let n = 0;
  for (const c of await clientesFaturaveis(db)) {
    for (const p of periodosDoMes(ehCiclo(c.ciclo_fechamento) ? c.ciclo_fechamento : "mensal", mes).filter((x) => x.inicio <= hoje && x.fim >= c.desde)) {
      await gravarFatura(db, c, p);
      n++;
    }
  }
  return n;
}

/** Rotina diária: fecha os períodos que terminaram ontem (cada cliente no seu ciclo). */
export async function fecharPeriodosEncerrados(db: Db, hoje = hojeISO()) {
  const ontem = somarDias(hoje, -1);
  let n = 0;
  for (const c of await clientesFaturaveis(db)) {
    const p = periodoDe(ehCiclo(c.ciclo_fechamento) ? c.ciclo_fechamento : "mensal", ontem);
    if (p.fim !== ontem || p.fim < c.desde) continue;
    await gravarFatura(db, c, p);
    n++;
  }
  return n;
}
