import { randomBytes } from "node:crypto";
import type { Db } from "../db";
import { prazoIndicacao, valoresMulta } from "../domain/ctb";
import { dataBR, diasEntre, hojeISO } from "../domain/dates";
import { brl } from "../domain/money";
import { enfileirar } from "../integrations/mensagens";
import { registrarEconomia, registrarEvento, regra, SELECT_MULTA, type MultaRow } from "./multas";

export async function indicarCondutor(db: Db, multaId: string, condutorId: string, usuarioId: string) {
  const m = await db.one<MultaRow>(`${SELECT_MULTA} where m.id = $1`, [multaId]);
  if (!m) throw new Error("Multa não encontrada");
  const limite = prazoIndicacao(m.notificada_em);
  if (limite && diasEntre(hojeISO(), limite) < 0) throw new Error("O prazo de indicação já terminou");
  const cd = await db.one("select * from condutores where id = $1 and cliente_id = $2", [condutorId, m.cliente_id]);
  if (!cd) throw new Error("Condutor não encontrado");
  const token = randomBytes(18).toString("base64url");
  await db.q("update multas set condutor_id = $2, indicacao_status = 'enviada', indicacao_token = $3 where id = $1", [multaId, condutorId, token]);
  await registrarEvento(db, { multaId, clienteId: m.cliente_id, tipo: "indicacao_enviada", descricao: `Link de aceite enviado para ${cd.nome}`, usuarioId });
  const link = `${process.env.APP_URL ?? "http://localhost:3000"}/condutor/${token}`;
  await enfileirar(db, {
    clienteId: m.cliente_id, canal: "whatsapp", destino: cd.whatsapp,
    assunto: "Indicação de condutor",
    corpo: `Olá, ${cd.nome}! Você foi indicado como condutor na multa da placa ${m.placa} (${m.descricao}, ${dataBR(m.data_infracao)}). Confira e aceite até ${dataBR(limite)}: ${link}`,
  });
  return token;
}

/** Aceite do condutor pelo link (A05). Gera a economia NIC como estimada até o protocolo no órgão. */
export async function aceitarIndicacao(db: Db, token: string, cnh: { nome: string; base64: string } | null) {
  const m = await db.one<MultaRow>(`${SELECT_MULTA} where m.indicacao_token = $1`, [token]);
  if (!m || m.indicacao_status !== "enviada") throw new Error("Link inválido ou já utilizado");
  await db.q(
    "update multas set indicacao_status = 'aceita', indicacao_aceite_em = now(), estado = 'condutor_indicado', cnh_arquivo = $2 where id = $1",
    [m.id, cnh ? cnh.nome : null],
  );
  await registrarEvento(db, { multaId: m.id, clienteId: m.cliente_id, tipo: "indicacao_aceita", descricao: `${m.condutor_nome} aceitou a indicação${cnh ? " e enviou a CNH" : ""}` });
  if (m.tipo_proprietario === "PJ") {
    await registrarEconomia(db, { multaId: m.id, clienteId: m.cliente_id, tipo: "nic_evitada", valor: valoresMulta(regra(m)).nic, comprovada: false, descricao: `${m.placa} · condutor indicado` });
  }
}

/** Protocolo da indicação no órgão: a NIC evitada passa a ser economia comprovada (seção 12.2). */
export async function protocolarIndicacao(db: Db, multaId: string, protocolo: string, usuarioId: string) {
  const m = await db.one<MultaRow>(`${SELECT_MULTA} where m.id = $1`, [multaId]);
  if (!m) throw new Error("Multa não encontrada");
  const limite = prazoIndicacao(m.notificada_em);
  const noPrazo = !limite || hojeISO() <= limite;
  await db.q("update multas set indicacao_status = 'protocolada', protocolo_indicacao = $2, estado = 'condutor_indicado' where id = $1", [multaId, protocolo]);
  await registrarEvento(db, { multaId, clienteId: m.cliente_id, tipo: "indicacao_protocolada", descricao: `Indicação protocolada no órgão · ${protocolo}`, usuarioId });
  if (m.tipo_proprietario === "PJ" && noPrazo) {
    await registrarEconomia(db, { multaId, clienteId: m.cliente_id, tipo: "nic_evitada", valor: valoresMulta(regra(m)).nic, comprovada: true, descricao: `${m.placa} · condutor indicado no prazo (NIC de ${brl(valoresMulta(regra(m)).nic)} evitada)` });
  }
}
