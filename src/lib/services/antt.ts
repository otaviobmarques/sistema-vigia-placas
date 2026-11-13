/**
 * Multas da ANTT por cliente (CNPJ/CPF do transportador): consulta o SIFAMA com o acesso do cliente,
 * guarda as multas em `multas_antt`, os totais em `clientes.antt_resumo` e avisa quando chega multa nova.
 */
import type { Db } from "../db";
import { decifrar } from "../cofre";
import { brl } from "../domain/money";
import { anttEncerrada, consultarAntt, FONTE_ANTT, type ResultadoAntt } from "../integrations/antt";
import { enfileirar } from "../integrations/mensagens";

export type ClienteAntt = { id: string; nome: string; email: string | null; documento: string; tipo: string; alertas_canais: string[] | null; antt_ativo: boolean; antt_login: string | null; antt_senha_cifrada: string | null; antt_cnpj_representado: string | null };

/** Consulta o SIFAMA de um cliente e atualiza as multas. Usa a conexão de sistema (rotina e fila). */
export async function consultarAnttCliente(db: Db, clienteId: string): Promise<ResultadoAntt & { novas: number }> {
  const c = await db.one<ClienteAntt>(
    "select id, nome, email, documento, tipo, alertas_canais, antt_ativo, antt_login, antt_senha_cifrada, antt_cnpj_representado from clientes where id = $1 and excluido_em is null",
    [clienteId],
  );
  const falha = async (erro: string) => {
    await db.q("update clientes set antt_ultima_consulta = now(), antt_ultimo_erro = $2 where id = $1", [clienteId, erro]);
    return { ok: false, codigo: null, custo: 0, multas: [], resumo: null, erro, novas: 0 };
  };
  if (!c) return falha("Cliente não encontrado.");
  if (!c.antt_ativo || !c.antt_login) return falha("Acesso ao SIFAMA não cadastrado.");
  const senha = decifrar(c.antt_senha_cifrada);
  if (!senha) return falha("Senha do SIFAMA precisa ser cadastrada de novo.");

  const representado = c.antt_cnpj_representado || (c.documento.length === 14 ? c.documento : null);
  const r = await consultarAntt(c.antt_login, senha, representado);
  await db.q("insert into fontes (id, nome, ativa, prioridade, custo) values ($1, 'ANTT · SIFAMA (multas)', true, 1, 20) on conflict (id) do nothing", [FONTE_ANTT]);
  await db.q("insert into consultas (placa_id, cliente_id, fonte_id, custo, resultado, multas_encontradas, erro) values (null, $1, $2, $3, $4, $5, $6)",
    [clienteId, FONTE_ANTT, r.custo, r.ok ? "ok" : "erro", r.multas.length, r.erro ?? null]);
  if (!r.ok) {
    const msg = r.contaInvalida ? `Acesso recusado pelo SIFAMA: confira login e senha. (${r.erro})` : r.erro ?? "Erro na consulta";
    await db.q("update clientes set antt_ultima_consulta = now(), antt_ultimo_erro = $2 where id = $1", [clienteId, msg]);
    return { ...r, erro: msg, novas: 0 };
  }

  const antes = new Set((await db.q<{ auto: string }>("select auto from multas_antt where cliente_id = $1", [clienteId])).map((x) => x.auto));
  let novas = 0, valorNovas = 0;
  for (const m of r.multas) {
    const aberta = !anttEncerrada(m);
    await db.q(
      `insert into multas_antt (cliente_id, auto, processo, codigo, descricao, tipo_fiscalizacao, orgao, placa, data_infracao, vencimento, valor, situacao, impeditiva, aberta, dados)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (cliente_id, auto) do update set processo = excluded.processo, codigo = excluded.codigo, descricao = coalesce(excluded.descricao, multas_antt.descricao),
         tipo_fiscalizacao = coalesce(excluded.tipo_fiscalizacao, multas_antt.tipo_fiscalizacao), placa = coalesce(excluded.placa, multas_antt.placa),
         data_infracao = coalesce(excluded.data_infracao, multas_antt.data_infracao), vencimento = coalesce(excluded.vencimento, multas_antt.vencimento),
         valor = case when excluded.valor > 0 then excluded.valor else multas_antt.valor end, situacao = excluded.situacao,
         impeditiva = coalesce(excluded.impeditiva, multas_antt.impeditiva), aberta = excluded.aberta, dados = excluded.dados, atualizada_em = now()`,
      [clienteId, m.auto, m.processo, m.codigo, m.descricao, m.tipoFiscalizacao, m.orgao, m.placa, m.dataInfracao, m.vencimento, m.valor, m.situacao, m.impeditiva, aberta, JSON.stringify(m.dados)],
    );
    if (aberta && !antes.has(m.auto)) { novas++; valorNovas += m.valor; }
  }
  // O que sumiu do SIFAMA foi pago ou baixado.
  const autos = r.multas.map((m) => m.auto);
  await db.q("update multas_antt set aberta = false, situacao = coalesce(situacao, 'Baixada no SIFAMA'), atualizada_em = now() where cliente_id = $1 and aberta and not (auto = any($2::text[]))", [clienteId, autos]);
  await db.q("update clientes set antt_ultima_consulta = now(), antt_ultimo_erro = null, antt_resumo = $2 where id = $1", [clienteId, JSON.stringify(r.resumo)]);

  if (novas) {
    const assunto = `${novas} multa(s) nova(s) da ANTT`;
    const corpo = `${c.nome}: ${novas} multa(s) nova(s) da ANTT no SIFAMA, somando ${brl(valorNovas)}. Multas impeditivas travam o RNTRC: confira os prazos.`;
    await enfileirar(db, { clienteId, canal: "email", destino: c.email, assunto, corpo, url: "/antt" });
    if ((c.alertas_canais ?? []).includes("push")) await enfileirar(db, { clienteId, canal: "push", destino: clienteId, assunto, corpo, url: "/antt" });
    await enfileirar(db, { clienteId, canal: "push", destino: "equipe", assunto: `ANTT · ${c.nome}`, corpo, url: "/gestao/antt" });
  }
  return { ...r, novas };
}

/** Clientes com acesso ao SIFAMA ativo (a rotina diária consulta todos). */
export async function clientesComAntt(db: Db) {
  return (await db.q<{ id: string }>("select id from clientes where antt_ativo and antt_login is not null and excluido_em is null and bloqueado_em is null")).map((x) => x.id);
}

/** Multas da ANTT para as telas (escopo do usuário via RLS). */
export async function multasAntt(db: Db, f: { cliente?: string | null; grupo?: string | null; todas?: boolean } = {}) {
  const p: unknown[] = [];
  const cond = ["c.excluido_em is null"];
  if (!f.todas) cond.push("a.aberta");
  if (f.cliente) { p.push(f.cliente); cond.push(`a.cliente_id = $${p.length}`); }
  else if (f.grupo) { p.push(f.grupo); cond.push(`c.grupo_id = $${p.length}`); }
  return db.q<{ id: string; cliente_id: string; cliente: string; documento: string; auto: string; processo: string | null; codigo: string | null; descricao: string | null; tipo_fiscalizacao: string | null; placa: string | null; data_infracao: string | null; vencimento: string | null; valor: number; situacao: string | null; impeditiva: boolean | null; aberta: boolean; detectada_em: string }>(
    `select a.*, c.nome as cliente, c.documento from multas_antt a join clientes c on c.id = a.cliente_id
      where ${cond.join(" and ")} order by a.aberta desc, a.impeditiva desc nulls last, a.vencimento nulls last, a.valor desc`,
    p,
  );
}
