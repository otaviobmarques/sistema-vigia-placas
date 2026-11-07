import type { Db } from "../db";
import { brl } from "../domain/money";
import { enfileirar } from "../integrations/mensagens";
import { registrarEconomia, registrarEvento } from "./multas";

/** M12 · MVP: a defesa é um serviço da equipe, cobrado na fatura do mês via Asaas. */
export async function pedirDefesa(db: Db, multaId: string, usuarioId: string) {
  const m = await db.one("select m.*, p.placa from multas m join placas p on p.id = m.placa_id where m.id = $1", [multaId]);
  if (!m) throw new Error("Multa não encontrada");
  const ja = await db.one("select id from pedidos_defesa where multa_id = $1 and status in ('aguardando_pagamento','em_andamento')", [multaId]);
  if (ja) return ja.id;
  const cfg = await db.one("select preco_defesa from configuracao");
  const p = await db.one<{ id: string }>(
    "insert into pedidos_defesa (multa_id, cliente_id, preco, status) values ($1,$2,$3,'em_andamento') returning id",
    [multaId, m.cliente_id, cfg!.preco_defesa],
  );
  await db.q("update multas set estado = 'em_defesa' where id = $1", [multaId]);
  await registrarEvento(db, { multaId, clienteId: m.cliente_id, tipo: "defesa_pedida", descricao: `Defesa contratada por ${brl(cfg!.preco_defesa)} (cobrada na fatura do mês)`, usuarioId });
  await enfileirar(db, { clienteId: m.cliente_id, canal: "email", destino: "defesa@vigiaplaca.com.br", assunto: `Novo pedido de defesa · ${m.placa}`, corpo: `Auto ${m.auto_infracao} · ${m.descricao}` });
  return p!.id;
}

export async function atualizarDefesa(db: Db, pedidoId: string, dados: { protocolo?: string; status?: "em_andamento" | "deferida" | "indeferida"; resultado?: string; responsavel?: string }, usuarioId: string) {
  const p = await db.one("select pd.*, m.valor, m.estado, pl.placa from pedidos_defesa pd join multas m on m.id = pd.multa_id join placas pl on pl.id = m.placa_id where pd.id = $1", [pedidoId]);
  if (!p) throw new Error("Pedido não encontrado");
  await db.q(
    "update pedidos_defesa set protocolo = coalesce($2, protocolo), status = coalesce($3, status), resultado = coalesce($4, resultado), responsavel = coalesce($5, responsavel) where id = $1",
    [pedidoId, dados.protocolo || null, dados.status ?? null, dados.resultado || null, dados.responsavel || null],
  );
  if (dados.protocolo) await registrarEvento(db, { multaId: p.multa_id, clienteId: p.cliente_id, tipo: "defesa_protocolada", descricao: `Recurso protocolado · ${dados.protocolo}`, usuarioId });
  if (dados.status === "deferida") {
    await db.q("update multas set estado = 'cancelada' where id = $1", [p.multa_id]);
    await registrarEvento(db, { multaId: p.multa_id, clienteId: p.cliente_id, tipo: "cancelada", descricao: "Defesa deferida: multa cancelada", usuarioId });
    await registrarEconomia(db, { multaId: p.multa_id, clienteId: p.cliente_id, tipo: "cancelamento", valor: p.valor, comprovada: true, descricao: `${p.placa} · multa cancelada por defesa` });
  }
  if (dados.status === "indeferida") {
    await db.q("update multas set estado = 'penalidade' where id = $1", [p.multa_id]);
    await registrarEvento(db, { multaId: p.multa_id, clienteId: p.cliente_id, tipo: "defesa_indeferida", descricao: "Defesa indeferida: pagar com 20% até o vencimento", usuarioId });
  }
}
