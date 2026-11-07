import { randomUUID } from "node:crypto";
import type { Db } from "../db";
import { melhorValorHoje, pagavel } from "../domain/ctb";
import { hojeISO } from "../domain/dates";
import { brl } from "../domain/money";
import { resumoCarrinho, type ResumoCarrinho } from "../domain/financeiro";
import { cancelarCobranca, criarCobrancaPix, garantirCliente, pagarBoleto } from "../integrations/asaas";
import { pagarBoletoCelcoin } from "../integrations/celcoin";
import { enfileirar } from "../integrations/mensagens";
import { registrarEconomia, registrarEvento, regra, SELECT_MULTA, type MultaRow } from "./multas";

export interface ItemCalc {
  multa: MultaRow;
  valorCheio: number;
  aPagar: number;
  desconto: "40" | "20" | null;
  precisaReconhecer: boolean;
}

export async function carrinho(db: Db, clienteId: string): Promise<{ itens: ItemCalc[]; resumo: ResumoCarrinho }> {
  const hoje = hojeISO();
  const linhas = await db.q<MultaRow>(`${SELECT_MULTA} join carrinho_itens ci2 on ci2.multa_id = m.id where m.cliente_id = $1 order by m.vencimento`, [clienteId]);
  const itens = linhas.filter((m) => pagavel(m.estado)).map((m) => {
    const melhor = melhorValorHoje(regra(m), hoje);
    return { multa: m, valorCheio: m.valor, aPagar: melhor.valor, desconto: melhor.desconto, precisaReconhecer: melhor.desconto === "40" && m.estado !== "reconhecida_sne" };
  });
  const cfg = await db.one("select * from configuracao");
  const fr = await db.one("select f.repasse_conveniencia_bps from clientes c left join franqueados f on f.id = c.franqueado_id where c.id = $1", [clienteId]);
  const resumo = resumoCarrinho(
    itens.map((i) => ({ multaId: i.multa.id, valorCheio: i.valorCheio, aPagar: i.aPagar })),
    { tipo: cfg!.taxa_conv_tipo, valor: cfg!.taxa_conv_valor },
    fr?.repasse_conveniencia_bps ?? 0,
  );
  return { itens, resumo };
}

export async function adicionarAoCarrinho(db: Db, clienteId: string, multaIds: string[]) {
  for (const id of multaIds) {
    await db.q(
      "insert into carrinho_itens (cliente_id, multa_id) select cliente_id, id from multas where id = $1 and cliente_id = $2 on conflict do nothing",
      [id, clienteId],
    );
  }
}

const ABERTOS = "('aguardando_aprovacao','aguardando')";

/**
 * Cria o pagamento do carrinho. Acima do limite de aprovação dupla do cliente, fica aguardando
 * a aprovação de outro usuário antes de gerar o Pix. Multa que já está num pagamento em aberto não entra de novo.
 */
export async function criarPagamento(db: Db, clienteId: string, usuarioId: string): Promise<{ id: string; pendenteAprovacao: boolean }> {
  const { itens, resumo } = await carrinho(db, clienteId);
  if (!itens.length) throw new Error("Carrinho vazio");
  const emAberto = await db.q<{ placa: string }>(
    `select distinct pl.placa from pagamento_itens pi join pagamentos p on p.id = pi.pagamento_id
     join multas m on m.id = pi.multa_id join placas pl on pl.id = m.placa_id
     where pi.multa_id = any($1::uuid[]) and p.status in ${ABERTOS}`,
    [itens.map((i) => i.multa.id)],
  );
  if (emAberto.length) throw new Error(`Já existe um pagamento em aberto para ${emAberto.map((e) => e.placa).join(", ")}. Conclua ou cancele esse pagamento antes.`);

  const c = await db.one("select c.aprovacao_dupla_acima, c.franqueado_id from clientes c where c.id = $1", [clienteId]);
  const pendenteAprovacao = c!.aprovacao_dupla_acima !== null && resumo.total > c!.aprovacao_dupla_acima;
  const ref = randomUUID();
  await db.q(
    `insert into pagamentos (id, cliente_id, franqueado_id, status, multas_valor, taxa, total, economia, split_franqueado, criado_por)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [ref, clienteId, c!.franqueado_id, pendenteAprovacao ? "aguardando_aprovacao" : "aguardando", resumo.multas, resumo.taxa, resumo.total, resumo.economia, resumo.splitFranqueado, usuarioId],
  );
  for (const i of itens) {
    await db.q("insert into pagamento_itens (pagamento_id, cliente_id, multa_id, valor_cheio, a_pagar, desconto) values ($1,$2,$3,$4,$5,$6)", [
      ref, clienteId, i.multa.id, i.valorCheio, i.aPagar, i.desconto,
    ]);
  }
  if (pendenteAprovacao) {
    const admins = await db.q<{ email: string }>("select email from usuarios where cliente_id = $1 and ativo and perfil in ('admin','financeiro') and id <> $2", [clienteId, usuarioId]);
    for (const a of admins) {
      await enfileirar(db, { clienteId, canal: "email", destino: a.email, assunto: "Pagamento aguardando sua aprovação", corpo: `Um pagamento de ${brl(resumo.total)} (${itens.length} multa(s), economia de ${brl(resumo.economia)}) precisa da sua aprovação no Vigia Placa.` });
    }
  } else {
    await emitirCobranca(db, ref);
  }
  return { id: ref, pendenteAprovacao };
}

/** Gera a cobrança Pix no Asaas (com split) para um pagamento já registrado. */
export async function emitirCobranca(db: Db, pagamentoId: string) {
  const pg = await db.one("select * from pagamentos where id = $1", [pagamentoId]);
  const c = await db.one(
    "select c.*, f.asaas_wallet_id from clientes c left join franqueados f on f.id = c.franqueado_id where c.id = $1",
    [pg!.cliente_id],
  );
  const n = await db.one("select count(*) as n from pagamento_itens where pagamento_id = $1", [pagamentoId]);
  const customerId = await garantirCliente({ nome: c!.nome, documento: c!.documento, email: c!.email, asaasId: c!.asaas_customer_id });
  if (!c!.asaas_customer_id) await db.q("update clientes set asaas_customer_id = $2 where id = $1", [c!.id, customerId]);
  const pix = await criarCobrancaPix({
    customerId,
    valorCentavos: pg!.total,
    descricao: `Vigia Placa · ${n!.n} multa(s) com desconto`,
    referencia: pagamentoId,
    split: c!.asaas_wallet_id ? { walletId: c!.asaas_wallet_id, valorCentavos: pg!.split_franqueado } : null,
  });
  await db.q("update pagamentos set status = 'aguardando', asaas_id = $2, pix_payload = $3, pix_qr = $4 where id = $1", [pagamentoId, pix.id, pix.payload, pix.qrBase64]);
}

/** Segunda aprovação: precisa ser de um usuário diferente de quem montou o pagamento. */
export async function aprovarPagamento(db: Db, pagamentoId: string, usuarioId: string) {
  const pg = await db.one("select * from pagamentos where id = $1 for update", [pagamentoId]);
  if (!pg || pg.status !== "aguardando_aprovacao") throw new Error("Este pagamento não está aguardando aprovação.");
  if (pg.criado_por === usuarioId) throw new Error("A segunda aprovação precisa ser de outra pessoa.");
  await db.q("update pagamentos set aprovado_por = $2, aprovado_em = now() where id = $1", [pagamentoId, usuarioId]);
  await emitirCobranca(db, pagamentoId);
}

export async function cancelarPagamento(db: Db, pagamentoId: string) {
  const pg = await db.one("select * from pagamentos where id = $1 for update", [pagamentoId]);
  if (!pg || !["aguardando_aprovacao", "aguardando"].includes(pg.status)) throw new Error("Só dá para cancelar pagamentos ainda não pagos.");
  if (pg.asaas_id) await cancelarCobranca(pg.asaas_id);
  await db.q("update pagamentos set status = 'cancelado' where id = $1", [pagamentoId]);
}

/**
 * Pix confirmado (webhook do Asaas ou simulação): paga cada boleto pelo Pague Contas,
 * cai para a Celcoin se falhar e, se ainda falhar, devolve como crédito. Idempotente.
 */
export async function confirmarPagamento(db: Db, pagamentoId: string) {
  const pg = await db.one("select * from pagamentos where id = $1 for update", [pagamentoId]);
  if (!pg || pg.status !== "aguardando") return { jaProcessado: true };
  await db.q("update pagamentos set status = 'pago', pago_em = now() where id = $1", [pagamentoId]);

  const itens = await db.q(
    `select pi.*, m.linha_digitavel, m.auto_infracao, m.descricao, p.placa from pagamento_itens pi
     join multas m on m.id = pi.multa_id join placas p on p.id = m.placa_id where pi.pagamento_id = $1`,
    [pagamentoId],
  );
  let falhas = 0;
  for (const it of itens) {
    const linha = it.linha_digitavel ?? `8${it.auto_infracao.replace(/\D/g, "").padStart(10, "1")}${String(it.a_pagar).padStart(11, "0")}`;
    let r = await pagarBoleto(linha, `Multa ${it.placa} · auto ${it.auto_infracao}`);
    let parceiro = "asaas";
    if (!r.ok) {
      r = await pagarBoletoCelcoin(linha);
      parceiro = "celcoin";
    }
    if (r.ok) {
      await db.q("update pagamento_itens set boleto_status = 'pago', parceiro = $2, comprovante = $3 where id = $1", [it.id, parceiro, r.id]);
      await db.q("update multas set estado = 'paga' where id = $1", [it.multa_id]);
      await registrarEvento(db, { multaId: it.multa_id, clienteId: it.cliente_id, tipo: "paga", descricao: `Paga por ${brl(it.a_pagar)} (${it.desconto ? it.desconto + "% de desconto" : "sem desconto"}) · comprovante ${r.id}`, fonte: parceiro });
      if (it.valor_cheio > it.a_pagar) {
        await registrarEconomia(db, {
          multaId: it.multa_id, clienteId: it.cliente_id, tipo: "desconto", valor: it.valor_cheio - it.a_pagar, comprovada: true,
          descricao: `${it.placa} · pago com ${it.desconto}% (de ${brl(it.valor_cheio)} por ${brl(it.a_pagar)})`,
        });
      }
    } else {
      falhas++;
      await db.q("update pagamento_itens set boleto_status = 'devolvido', parceiro = $2 where id = $1", [it.id, parceiro]);
      await registrarEvento(db, { multaId: it.multa_id, clienteId: it.cliente_id, tipo: "falha_pagamento", descricao: `Boleto não pôde ser pago (${r.erro}). Valor de ${brl(it.a_pagar)} vira crédito.` });
    }
    await db.q("delete from carrinho_itens where multa_id = $1", [it.multa_id]);
  }
  await db.q("update pagamentos set status = $2 where id = $1", [pagamentoId, falhas ? "parcial" : "quitado"]);
  const c = await db.one("select whatsapp from clientes where id = $1", [pg.cliente_id]);
  await enfileirar(db, { clienteId: pg.cliente_id, canal: "whatsapp", destino: c?.whatsapp, assunto: "Economizei pra você!", corpo: `Pix recebido. ${itens.length - falhas} multa(s) quitada(s), economia de ${brl(pg.economia)}. Comprovantes no app.` });
  return { jaProcessado: false, falhas };
}
