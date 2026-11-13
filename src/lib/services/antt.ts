/**
 * Multas da ANTT por cliente (CNPJ/CPF do transportador): consulta o SIFAMA com o acesso do cliente,
 * guarda as multas em `multas_antt`, os totais em `clientes.antt_resumo` e avisa quando chega multa nova.
 */
import type { Db } from "../db";
import { decifrar } from "../cofre";
import { brl } from "../domain/money";
import { anttEncerrada, consultarAntt, FONTE_ANTT, parametrosAntt, type ResultadoAntt } from "../integrations/antt";
import { chamarServico, dataParaISO, modoSimulado, reaisParaCentavos } from "../integrations/infosimples";
import { baixarArquivo, guardarDocumento } from "./documentos";
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
  return db.q<{ id: string; cliente_id: string; cliente: string; documento: string; auto: string; processo: string | null; codigo: string | null; descricao: string | null; tipo_fiscalizacao: string | null; placa: string | null; data_infracao: string | null; vencimento: string | null; valor: number; situacao: string | null; impeditiva: boolean | null; aberta: boolean; detectada_em: string; codigo_barras: string | null; doc_auto: string | null; doc_boleto: string | null }>(
    `select a.*, c.nome as cliente, c.documento,
            (select d.id from documentos d where d.multa_antt_id = a.id and d.tipo = 'auto_antt' and d.expira_em > now() limit 1) as doc_auto,
            (select d.id from documentos d where d.multa_antt_id = a.id and d.tipo = 'boleto_antt' and d.expira_em > now() limit 1) as doc_boleto
       from multas_antt a join clientes c on c.id = a.cliente_id
      where ${cond.join(" and ")} order by a.aberta desc, a.impeditiva desc nulls last, a.vencimento nulls last, a.valor desc`,
    p,
  );
}

// ---------------- Documentos sob demanda (cada chamada é cobrada pela Infosimples) ----------------

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Página imprimível com os dados do auto de infração (a API devolve os dados, não um PDF). */
function htmlAuto(auto: string, d: any): string {
  const linha = (rotulo: string, v: unknown) => (v === null || v === undefined || v === "" ? "" : `<tr><th>${esc(rotulo)}</th><td>${esc(v)}</td></tr>`);
  const bloco = (titulo: string, o: any, campos: Array<[string, string]>) => {
    const rows = campos.map(([k, r]) => linha(r, o?.[k])).join("");
    return rows ? `<h2>${esc(titulo)}</h2><table>${rows}</table>` : "";
  };
  const veic = Array.isArray(d?.veiculos) ? d.veiculos[0] : d?.veiculos;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Auto de infração ANTT ${esc(auto)}</title>
<style>body{font-family:Arial,sans-serif;color:#0b2545;max-width:780px;margin:24px auto;padding:0 16px}h1{font-size:20px}h2{font-size:14px;margin:18px 0 6px;color:#0b7a3b;text-transform:uppercase;letter-spacing:.06em}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;width:38%;color:#5b6b82;font-weight:normal;padding:4px 8px;border-bottom:1px solid #e3e7ee}td{padding:4px 8px;border-bottom:1px solid #e3e7ee}.nota{font-size:11px;color:#5b6b82;margin-top:24px}</style></head><body>
<h1>Auto de infração ANTT nº ${esc(d?.numero ?? auto)}</h1>
${bloco("Infração", d?.tipificacao, [["codigo_infracao", "Código"], ["descricao_infracao", "Descrição"], ["amparo_legal", "Amparo legal"], ["resolucao", "Resolução"], ["prazo_apresentacao_defesa", "Prazo para defesa"], ["observacoes_agente_fiscalizador", "Observações do agente"]])}
${bloco("Local e data", d?.local, [["data", "Data"], ["hora", "Hora"], ["rodovia", "Rodovia"], ["km", "Km"], ["municipio", "Município"], ["uf", "UF"], ["local", "Local"]])}
${bloco("Multa", d?.multa, [["valor", "Valor"], ["pbt_pbtc_aferido", "PBT/PBTC aferido"], ["limite_pbt_pbtc", "Limite PBT/PBTC"]])}
${bloco("Veículo", veic, [["placa", "Placa"], ["marca", "Marca"], ["modelo", "Modelo"], ["especie", "Espécie"], ["quantidade_eixos", "Eixos"]])}
${bloco("Transportador", d?.transportador, [["nome", "Nome"], ["cpf_cnpj", "CPF/CNPJ"]])}
${bloco("Agente", d?.agente, [["matricula", "Matrícula"], ["data", "Data"]])}
<p class="nota">Dados obtidos no SIFAMA (ANTT) pelo Vigia Placa. Documento guardado por 60 dias.</p></body></html>`;
}

async function credenciais(db: Db, clienteId: string) {
  const c = await db.one<ClienteAntt>("select id, nome, email, documento, tipo, alertas_canais, antt_ativo, antt_login, antt_senha_cifrada, antt_cnpj_representado from clientes where id = $1", [clienteId]);
  const senha = decifrar(c?.antt_senha_cifrada);
  if (!c?.antt_login || !senha) throw new Error("Acesso ao SIFAMA do cliente não cadastrado ou senha precisa ser digitada de novo.");
  return { login: c.antt_login, senha, representado: c.antt_cnpj_representado || (c.documento.length === 14 ? c.documento : null) };
}

async function registrarCusto(db: Db, clienteId: string, servico: string, custo: number, ok: boolean, erro?: string) {
  await db.q("insert into fontes (id, nome, ativa, prioridade, custo) values ($1, $2, true, 1, 20) on conflict (id) do nothing", [`infosimples:${servico}`, servico === "antt/sifama/download-auto" ? "ANTT · SIFAMA (auto de infração)" : "ANTT · SIFAMA (2ª via de boleto)"]);
  await db.q("insert into consultas (placa_id, cliente_id, fonte_id, custo, resultado, erro) values (null, $1, $2, $3, $4, $5)", [clienteId, `infosimples:${servico}`, custo, ok ? "ok" : "erro", erro ?? null]);
}

/** Chamada à Infosimples; sem token (ambiente local) devolve um exemplo para ver as telas. */
async function chamarAntt(servico: string, params: Record<string, string>): Promise<any> {
  if (!modoSimulado()) return (await chamarServico(servico, params)).json;
  if (servico.endsWith("download-auto")) return { code: 200, header: { price: "0" }, data: [{ numero: params.auto_infracao, tipificacao: { codigo_infracao: "5.0001", descricao_infracao: "Transportar carga sem inscrição válida no RNTRC", amparo_legal: "Resolução ANTT 5.982/2022", prazo_apresentacao_defesa: "30 dias" }, local: { data: "04/10/2026", hora: "10:42", rodovia: "BR-381", km: "450", municipio: "Betim", uf: "MG" }, multa: { valor: "R$ 5.000,00" }, veiculos: [{ placa: "RST4E56", marca: "VW", modelo: "Delivery 9.170" }], transportador: { nome: "Cliente exemplo", cpf_cnpj: params.cnpj_representado ?? "" }, agente: { matricula: "12345" } }] };
  return { code: 200, header: { price: "0" }, data: [{ codigo_barras: "85810000050 0 00000000000 0 12345678901 2 34567890123 4", data_vencimento: "28/11/2026", valor_documento: "5.000,00" }] };
}

/** Tenta guardar o primeiro comprovante em PDF que a Infosimples devolve (site_receipts). */
async function comprovantePdf(json: any) {
  const urls: string[] = (Array.isArray(json?.site_receipts) ? json.site_receipts : []).filter((u: unknown): u is string => typeof u === "string");
  for (const u of urls) { const a = await baixarArquivo(u); if (a?.mime === "application/pdf") return { ...a, url: u }; }
  return null;
}

/** Baixa o auto de infração da ANTT e guarda (60 dias). */
export async function baixarAutoAntt(db: Db, multaAnttId: string) {
  const m = await db.one<{ id: string; cliente_id: string; auto: string }>("select id, cliente_id, auto from multas_antt where id = $1", [multaAnttId]);
  if (!m) throw new Error("Multa da ANTT não encontrada.");
  const cr = await credenciais(db, m.cliente_id);
  const json = await chamarAntt("antt/sifama/download-auto", { ...parametrosAntt(cr.login, cr.senha, cr.representado), auto_infracao: m.auto });
  const custo = Math.round(Number(json?.header?.price ?? 0) * 100) || 0;
  const ok = Number(json?.code) === 200;
  await registrarCusto(db, m.cliente_id, "antt/sifama/download-auto", custo, ok, ok ? undefined : json?.code_message);
  if (!ok) throw new Error(`SIFAMA não devolveu o auto: ${json?.code_message ?? json?.code ?? "erro"}`);
  const dados = Array.isArray(json?.data) ? json.data[0] : json?.data;
  const pdf = await comprovantePdf(json);
  const doc = pdf
    ? { mime: pdf.mime, base64: pdf.base64, nome: `auto-antt-${m.auto}.pdf`, origemUrl: pdf.url }
    : { mime: "text/html; charset=utf-8", base64: Buffer.from(htmlAuto(m.auto, dados)).toString("base64"), nome: `auto-antt-${m.auto}.html`, origemUrl: null };
  return guardarDocumento(db, { clienteId: m.cliente_id, multaAnttId: m.id, tipo: "auto_antt", ...doc });
}

/** 2ª via do boleto da ANTT: grava código de barras, vencimento e valor; guarda o PDF se a fonte devolver. */
export async function segundaViaAntt(db: Db, multaAnttId: string) {
  const m = await db.one<{ id: string; cliente_id: string; auto: string; impeditiva: boolean | null }>("select id, cliente_id, auto, impeditiva from multas_antt where id = $1", [multaAnttId]);
  if (!m) throw new Error("Multa da ANTT não encontrada.");
  const cr = await credenciais(db, m.cliente_id);
  const json = await chamarAntt("antt/sifama/boleto-2via", { ...parametrosAntt(cr.login, cr.senha, cr.representado), auto_infracao: m.auto });
  const custo = Math.round(Number(json?.header?.price ?? 0) * 100) || 0;
  const ok = Number(json?.code) === 200;
  await registrarCusto(db, m.cliente_id, "antt/sifama/boleto-2via", custo, ok, ok ? undefined : json?.code_message);
  if (!ok) throw new Error(`SIFAMA não emitiu a 2ª via: ${json?.code_message ?? json?.code ?? "erro"}`);
  const d = Array.isArray(json?.data) ? json.data[0] : json?.data;
  const codigo = String(d?.codigo_barras ?? "").replace(/\D/g, "") || null;
  await db.q("update multas_antt set codigo_barras = coalesce($2, codigo_barras), vencimento = coalesce($3, vencimento), valor = case when $4::int > 0 then $4 else valor end, atualizada_em = now() where id = $1",
    [m.id, codigo, dataParaISO(d?.data_vencimento), reaisParaCentavos(d?.normalizado_valor_documento ?? d?.valor_documento)]);
  const pdf = await comprovantePdf(json);
  if (pdf) await guardarDocumento(db, { clienteId: m.cliente_id, multaAnttId: m.id, tipo: "boleto_antt", mime: pdf.mime, base64: pdf.base64, nome: `boleto-antt-${m.auto}.pdf`, origemUrl: pdf.url });
  return { codigo, temPdf: !!pdf };
}
