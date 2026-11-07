"use server";

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarSessao, encerrarSessao, escolherCliente, exigirCliente, exigirSessao, noEscopo, podeAgir, type Sessao } from "@/lib/auth";
import { sistema, type Db } from "@/lib/db";
import { verificarTOTP, gerarSegredo } from "@/lib/totp";
import { hojeISO } from "@/lib/domain/dates";
import { parseReais } from "@/lib/domain/money";
import { GRAVIDADES, type Gravidade } from "@/lib/domain/ctb";
import { tipoDocumento, somenteDocumento, validarPlaca, validarRenavam } from "@/lib/domain/validators";
import { adicionarAoCarrinho, confirmarPagamento, criarPagamento } from "@/lib/services/pagamentos";
import { consultarPlaca, varredura } from "@/lib/services/monitoramento";
import { indicarCondutor, aceitarIndicacao, protocolarIndicacao } from "@/lib/services/indicacao";
import { pedirDefesa, atualizarDefesa } from "@/lib/services/defesa";
import { fecharMes } from "@/lib/services/faturamento";
import { lerPlanilha, validarLinhas, type LinhaImport } from "@/lib/services/importacao";
import { auditar, registrarEvento } from "@/lib/services/multas";
import { asaasSimulado } from "@/lib/integrations/asaas";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const ir = (path: string, msg?: { ok?: string; erro?: string }): never => {
  const q = msg?.ok ? `ok=${encodeURIComponent(msg.ok)}` : msg?.erro ? `erro=${encodeURIComponent(msg.erro)}` : "";
  redirect(q ? `${path}${path.includes("?") ? "&" : "?"}${q}` : path);
};
async function exigirPermissao(sessao: Sessao, acao: Parameters<typeof podeAgir>[1], volta: string) {
  if (!(await podeAgir(sessao, acao))) {
    ir(volta, { erro: sessao.nivel === "franqueado" ? "Este cliente exige aprovação própria para esta ação (Configurações › Aprovações)." : "Seu perfil não tem permissão para esta ação." });
  }
}

// ---------------- Autenticação ----------------

export async function entrar(_: unknown, f: FormData): Promise<{ erro?: string; pedirCodigo?: boolean; email?: string }> {
  const email = s(f, "email").toLowerCase();
  const u = await sistema((db) => db.one("select * from usuarios where email = $1", [email]));
  if (!u || !(await bcrypt.compare(s(f, "senha"), u.senha_hash))) return { erro: "E-mail ou senha incorretos.", email };
  if (u.totp_secret) {
    const codigo = s(f, "codigo");
    if (!codigo) return { pedirCodigo: true, email };
    if (!verificarTOTP(u.totp_secret, codigo)) return { erro: "Código de verificação inválido.", pedirCodigo: true, email };
  }
  await criarSessao(u.id);
  redirect("/");
}

export async function sair() {
  await encerrarSessao();
  redirect("/login");
}

export async function entrarCliente(f: FormData) {
  await exigirSessao(["franqueado", "franqueadora"]);
  await escolherCliente(s(f, "clienteId"));
  redirect(s(f, "destino") || "/hoje");
}

export async function sairCliente() {
  const sessao = await exigirSessao(["franqueado", "franqueadora"]);
  await escolherCliente(null);
  redirect(sessao.nivel === "franqueadora" ? "/backoffice" : "/carteira");
}

export async function iniciar2fa() {
  const sessao = await exigirSessao();
  const segredo = gerarSegredo();
  redirect(`/configuracoes?aba=usuarios&segredo=${segredo}`);
}

export async function confirmar2fa(f: FormData) {
  const sessao = await exigirSessao();
  const segredo = s(f, "segredo");
  if (!verificarTOTP(segredo, s(f, "codigo"))) ir(`/configuracoes?aba=usuarios&segredo=${segredo}`, { erro: "Código não confere. Tente o próximo." });
  await sistema((db) => db.q("update usuarios set totp_secret = $2 where id = $1", [sessao.usuarioId, segredo]));
  ir("/configuracoes?aba=usuarios", { ok: "Dois fatores ativados." });
}

// ---------------- Carrinho e Pix ----------------

export async function adicionarCarrinho(f: FormData) {
  const sessao = await exigirCliente();
  const ids = f.getAll("multaId").map(String).filter(Boolean);
  const volta = s(f, "volta") || "/pagamentos";
  if (!ids.length) ir(volta, { erro: "Selecione ao menos uma multa." });
  await exigirPermissao(sessao, "pagar", volta);
  await noEscopo(sessao, (db) => adicionarAoCarrinho(db, sessao.clienteId, ids));
  revalidatePath("/", "layout");
  redirect("/pagamentos");
}

export async function removerCarrinho(f: FormData) {
  const sessao = await exigirCliente();
  await noEscopo(sessao, (db) => db.q("delete from carrinho_itens where cliente_id = $1 and multa_id = $2", [sessao.clienteId, s(f, "multaId")]));
  revalidatePath("/pagamentos");
}

export async function gerarPix() {
  const sessao = await exigirCliente();
  await exigirPermissao(sessao, "pagar", "/pagamentos");
  let id: string;
  try {
    id = await noEscopo(sessao, async (db) => {
      const pid = await criarPagamento(db, sessao.clienteId, sessao.usuarioId);
      await auditar(db, { usuarioId: sessao.usuarioId, clienteId: sessao.clienteId, acao: "pix_gerado", entidade: "pagamento", entidadeId: pid });
      return pid;
    });
  } catch (e: any) {
    ir("/pagamentos", { erro: e.message });
  }
  redirect(`/pagamentos/${id!}`);
}

/** Só no modo simulado: faz o papel do webhook PAYMENT_RECEIVED do Asaas. */
export async function simularPagamento(f: FormData) {
  const sessao = await exigirCliente();
  if (!asaasSimulado()) ir(`/pagamentos/${s(f, "id")}`, { erro: "Com o Asaas configurado, a confirmação vem pelo webhook." });
  const id = s(f, "id");
  const meu = await noEscopo(sessao, (db) => db.one("select id from pagamentos where id = $1", [id]));
  if (!meu) ir("/pagamentos", { erro: "Pagamento não encontrado." });
  const r = await sistema((db) => confirmarPagamento(db, id));
  revalidatePath("/", "layout");
  ir(`/pagamentos/${id}`, { ok: r.falhas ? `Pix recebido. ${r.falhas} boleto(s) não puderam ser pagos e viraram crédito.` : "Pix recebido e boletos quitados." });
}

// ---------------- Multa: indicar, SNE, defesa ----------------

export async function indicar(f: FormData) {
  const sessao = await exigirCliente();
  const multaId = s(f, "multaId");
  await exigirPermissao(sessao, "indicar", `/multas/${multaId}`);
  try {
    await noEscopo(sessao, (db) => indicarCondutor(db, multaId, s(f, "condutorId"), sessao.usuarioId));
  } catch (e: any) {
    ir(`/multas/${multaId}`, { erro: e.message });
  }
  ir(`/multas/${multaId}`, { ok: "Link de aceite enviado ao condutor por WhatsApp." });
}

export async function protocolar(f: FormData) {
  const sessao = await exigirCliente();
  const multaId = s(f, "multaId");
  await exigirPermissao(sessao, "indicar", `/multas/${multaId}`);
  if (!s(f, "protocolo")) ir(`/multas/${multaId}`, { erro: "Informe o número do protocolo." });
  await noEscopo(sessao, (db) => protocolarIndicacao(db, multaId, s(f, "protocolo"), sessao.usuarioId));
  ir(`/multas/${multaId}`, { ok: "Indicação protocolada. A multa NIC evitada entrou como economia comprovada." });
}

export async function reconhecerSne(f: FormData) {
  const sessao = await exigirCliente();
  const multaId = s(f, "multaId");
  await exigirPermissao(sessao, "pagar", `/multas/${multaId}`);
  await noEscopo(sessao, async (db) => {
    await db.q("update multas set estado = 'reconhecida_sne' where id = $1 and estado not in ('paga','cancelada')", [multaId]);
    await registrarEvento(db, { multaId, clienteId: sessao.clienteId, tipo: "reconhecida_sne", descricao: "Infração reconhecida no SNE (pagamento com 40%)", usuarioId: sessao.usuarioId });
  });
  ir(`/multas/${multaId}`, { ok: "Reconhecimento registrado. Agora é só pagar com 40%." });
}

export async function pedirDefesaAction(f: FormData) {
  const sessao = await exigirCliente();
  const multaId = s(f, "multaId");
  await exigirPermissao(sessao, "defesa", `/multas/${multaId}`);
  await noEscopo(sessao, async (db) => {
    await pedirDefesa(db, multaId, sessao.usuarioId);
    await auditar(db, { usuarioId: sessao.usuarioId, clienteId: sessao.clienteId, acao: "defesa_pedida", entidade: "multa", entidadeId: multaId });
  });
  ir(`/multas/${multaId}`, { ok: "Pedido de defesa enviado. Nossa equipe analisa e anexa o protocolo aqui." });
}

// ---------------- Placas ----------------

async function inserirPlaca(db: Db, clienteId: string, p: { placa: string; renavam: string; uf: string; apelido?: string; grupo?: string; centro_custo?: string; sne?: string | null }) {
  const r = await db.one<{ id: string }>(
    `insert into placas (cliente_id, placa, renavam, uf, apelido, grupo, centro_custo, sne_adesao_em) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [clienteId, p.placa, p.renavam, p.uf, p.apelido || null, p.grupo || null, p.centro_custo || null, p.sne || null],
  );
  return r!.id;
}

export async function adicionarPlaca(f: FormData) {
  const sessao = await exigirCliente();
  await exigirPermissao(sessao, "editar", "/placas");
  const pv = validarPlaca(s(f, "placa"));
  const rv = validarRenavam(s(f, "renavam"));
  if (!pv.ok) ir("/placas", { erro: pv.erro });
  if (!rv.ok) ir("/placas", { erro: rv.erro });
  let id: string;
  try {
    id = await noEscopo(sessao, (db) =>
      inserirPlaca(db, sessao.clienteId, { placa: (pv as any).placa, renavam: (rv as any).renavam, uf: s(f, "uf").toUpperCase(), apelido: s(f, "apelido"), grupo: s(f, "grupo"), centro_custo: s(f, "centro_custo"), sne: s(f, "sne") || null }),
    );
  } catch (e: any) {
    ir("/placas", { erro: String(e.message).includes("placas_unica_ativa") ? "Esta placa já está ativa em outro cliente." : e.message });
  }
  // Primeira varredura gratuita.
  const r = await sistema((db) => consultarPlaca(db, id!));
  revalidatePath("/", "layout");
  ir("/placas", { ok: `Placa cadastrada e consultada: ${r.total} multa(s) encontrada(s).` });
}

export async function alterarStatusPlaca(f: FormData) {
  const sessao = await exigirCliente();
  await exigirPermissao(sessao, "editar", "/placas");
  const status = s(f, "status") === "pausada" ? "pausada" : "ativa";
  try {
    await noEscopo(sessao, (db) => db.q("update placas set status = $2, motivo_pausa = $3 where id = $1", [s(f, "placaId"), status, s(f, "motivo") || null]));
  } catch {
    ir("/placas", { erro: "Não foi possível reativar: a placa já está ativa em outro cliente." });
  }
  ir("/placas", { ok: status === "pausada" ? "Placa pausada: deixa de ser consultada e cobrada." : "Placa reativada." });
}

export async function salvarSne(f: FormData) {
  const sessao = await exigirCliente();
  await noEscopo(sessao, (db) => db.q("update placas set sne_adesao_em = $2 where id = $1", [s(f, "placaId"), s(f, "sne") || null]));
  ir("/placas", { ok: "Adesão ao SNE atualizada." });
}

export async function consultarAgora(f: FormData) {
  const sessao = await exigirCliente();
  const placaId = s(f, "placaId");
  const volta = s(f, "volta") || "/placas";
  const lim = await noEscopo(sessao, (db) =>
    db.one("select c.consultas_avulsas_usadas as usadas, p.consultas_avulsas as franquia from clientes c join planos p on p.id = c.plano_id where c.id = $1", [sessao.clienteId]),
  );
  const extra = lim!.usadas >= lim!.franquia;
  const meu = await noEscopo(sessao, (db) => db.one("select id from placas where id = $1", [placaId]));
  if (!meu) ir(volta, { erro: "Placa não encontrada." });
  const r = await sistema(async (db) => {
    await db.q("update clientes set consultas_avulsas_usadas = consultas_avulsas_usadas + 1 where id = $1", [sessao.clienteId]);
    return consultarPlaca(db, placaId, { avulsa: true });
  });
  revalidatePath("/", "layout");
  ir(volta, r.ok ? { ok: `Consulta feita: ${r.novas} multa(s) nova(s).${extra ? " Consulta acima da franquia do plano: entra na fatura como avulsa." : ""}` } : { erro: `A fonte respondeu com erro: ${r.erro}` });
}

export async function validarImportacao(_: unknown, f: FormData): Promise<{ linhas?: LinhaImport[]; arquivo?: string; erro?: string }> {
  const sessao = await exigirSessao();
  const arq = f.get("arquivo") as File | null;
  if (!arq || !arq.size) return { erro: "Escolha a planilha (.xlsx ou .csv)." };
  try {
    const rows = lerPlanilha(await arq.arrayBuffer());
    if (!rows.length) return { erro: "A planilha está vazia." };
    if (rows.length > 5000) return { erro: "Máximo de 5.000 linhas por importação." };
    const linhas = await noEscopo(sessao, (db) => validarLinhas(db, rows, sessao.clienteId));
    return { linhas, arquivo: arq.name };
  } catch (e: any) {
    return { erro: `Não consegui ler a planilha: ${e.message}` };
  }
}

export async function importarPlacas(f: FormData) {
  const sessao = await exigirSessao();
  const linhas: LinhaImport[] = JSON.parse(s(f, "linhas") || "[]");
  const ids: string[] = [];
  await noEscopo(sessao, async (db) => {
    // Revalida no servidor: nunca confiar no que veio do navegador.
    const revalidadas = await validarLinhas(db, linhas.map((l) => ({ ...l, cliente: l.cliente })) as any, sessao.clienteId);
    for (const l of revalidadas.filter((x) => !x.erros.length && x.clienteId)) {
      ids.push(await inserirPlaca(db, l.clienteId!, l));
    }
    await auditar(db, { usuarioId: sessao.usuarioId, acao: "importacao_lote", entidade: "placas", dados: { importadas: ids.length } });
  });
  let multas = 0;
  for (const id of ids) multas += (await sistema((db) => consultarPlaca(db, id))).total;
  revalidatePath("/", "layout");
  ir(sessao.nivel === "cliente" || sessao.clienteId ? "/placas" : "/carteira", { ok: `${ids.length} placas importadas. Primeira varredura feita: ${multas} multa(s) encontrada(s).` });
}

// ---------------- Condutores ----------------

export async function adicionarCondutor(f: FormData) {
  const sessao = await exigirCliente();
  await exigirPermissao(sessao, "editar", "/condutores");
  if (!s(f, "nome")) ir("/condutores", { erro: "Informe o nome." });
  await noEscopo(sessao, (db) =>
    db.q("insert into condutores (cliente_id, nome, cpf, cnh, whatsapp, email) values ($1,$2,$3,$4,$5,$6)", [
      sessao.clienteId, s(f, "nome"), s(f, "cpf").replace(/\D/g, "") || null, s(f, "cnh") || null, s(f, "whatsapp") || null, s(f, "email") || null,
    ]),
  );
  ir("/condutores", { ok: "Condutor cadastrado." });
}

// ---------------- Configurações (seção 7) ----------------

export async function salvarConfiguracoes(f: FormData) {
  const sessao = await exigirCliente();
  const aba = s(f, "aba");
  await exigirPermissao(sessao, "editar", `/configuracoes?aba=${aba}`);
  if (sessao.perfil !== "admin" && sessao.nivel === "cliente") ir(`/configuracoes?aba=${aba}`, { erro: "Só o administrador altera as configurações." });
  const reais = (k: string) => (s(f, k) ? parseReais(s(f, k)) : null);
  await noEscopo(sessao, async (db) => {
    const id = sessao.clienteId;
    if (aba === "monitoramento") {
      await db.q("update clientes set frequencia_padrao = $2 where id = $1", [id, s(f, "frequencia")]);
      for (const [k, v] of f.entries()) if (k.startsWith("freq_grupo:")) await db.q("update placas set frequencia = nullif($3,'') where cliente_id = $1 and coalesce(grupo,'') = $2", [id, k.slice(11), String(v)]);
    }
    if (aba === "alertas") {
      const ant = s(f, "antecedencias").split(/[,\s]+/).map(Number).filter((n) => n > 0 && n <= 60);
      await db.q("update clientes set alertas_canais = $2, alertas_antecedencias = $3, resumo = $4, email = $5, whatsapp = $6 where id = $1", [
        id, f.getAll("canais").map(String), ant.length ? ant : [15, 7, 3, 1], s(f, "resumo"), s(f, "email"), s(f, "whatsapp"),
      ]);
    }
    if (aba === "aprovacoes") {
      if (sessao.nivel === "franqueado") throw new Error("Só o cliente decide se o franqueado pode agir sozinho.");
      await db.q("update clientes set franqueado_pode_agir = $2, aprovacao_dupla_acima = $3 where id = $1", [id, f.get("franqueado_pode_agir") === "on", reais("aprovacao_dupla_acima")]);
    }
    if (aba === "pagamento") {
      await db.q("update clientes set forma_cobranca = $2, pagamento_auto = $3, pagamento_auto_ate = $4, resp_financeiro = $5 where id = $1", [
        id, s(f, "forma_cobranca"), f.get("pagamento_auto") === "on", reais("pagamento_auto_ate"), s(f, "resp_financeiro"),
      ]);
    }
    if (aba === "condutores") await db.q("update clientes set envio_auto_link_condutor = $2 where id = $1", [id, f.get("envio_auto") === "on"]);
    if (aba === "centros") await db.q("update clientes set rateio = $2 where id = $1", [id, s(f, "rateio")]);
    await auditar(db, { usuarioId: sessao.usuarioId, clienteId: id, acao: "configuracao", entidade: "cliente", entidadeId: id, dados: { aba } });
  }).catch((e) => ir(`/configuracoes?aba=${aba}`, { erro: e.message }));
  ir(`/configuracoes?aba=${aba}`, { ok: "Configurações salvas." });
}

export async function convidarUsuario(f: FormData) {
  const sessao = await exigirCliente();
  if (sessao.perfil !== "admin") ir("/configuracoes?aba=usuarios", { erro: "Só o administrador convida usuários." });
  const email = s(f, "email").toLowerCase();
  const senhaTemp = Math.random().toString(36).slice(2, 10);
  try {
    await sistema((db) =>
      db.q("insert into usuarios (email, nome, senha_hash, nivel, cliente_id, perfil) values ($1,$2,$3,'cliente',$4,$5)", [
        email, s(f, "nome") || email, bcrypt.hashSync(senhaTemp, 10), sessao.clienteId, s(f, "perfil"),
      ]),
    );
    await noEscopo(sessao, (db) =>
      db.q("insert into outbox (cliente_id, canal, destino, assunto, corpo) values ($1,'email',$2,'Convite para o Vigia Placa',$3)", [
        sessao.clienteId, email, `Você foi convidado(a) para o Vigia Placa. Acesse ${process.env.APP_URL ?? ""}/login com a senha provisória ${senhaTemp} e troque no primeiro acesso.`,
      ]),
    );
  } catch {
    ir("/configuracoes?aba=usuarios", { erro: "Já existe um usuário com este e-mail." });
  }
  ir("/configuracoes?aba=usuarios", { ok: `Convite enviado para ${email}.` });
}

// ---------------- Onboarding (T02) ----------------

export async function criarCliente(f: FormData) {
  const sessao = await exigirSessao(["franqueado", "franqueadora"]);
  const doc = somenteDocumento(s(f, "documento"));
  const tipo = tipoDocumento(doc);
  if (!tipo) ir("/clientes/novo", { erro: "CPF ou CNPJ inválido." });
  if (f.get("aceite") !== "on") ir("/clientes/novo", { erro: "O aceite dos termos (com a autorização de consulta e LGPD) é obrigatório." });
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  let id: string;
  try {
    id = await noEscopo(sessao, async (db) => {
      const cfg = await db.one("select termo_versao from configuracao");
      const franqueadoId = sessao.nivel === "franqueado" ? sessao.franqueadoId : s(f, "franqueadoId") || null;
      // Sem RETURNING: a política de leitura do RLS ainda não "vê" a linha nova dentro do próprio INSERT.
      const novoId = randomUUID();
      await db.q(
        `insert into clientes (id, franqueado_id, tipo, documento, nome, segmento, email, whatsapp, endereco, resp_financeiro, forma_cobranca, plano_id, frequencia_padrao, aceite_em, aceite_ip, aceite_versao)
         values ($15,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now(), $13, $14)`,
        [franqueadoId, tipo, doc, s(f, "nome"), s(f, "segmento") || null, s(f, "email"), s(f, "whatsapp"), s(f, "endereco") || null, s(f, "resp_financeiro") || null,
         s(f, "forma_cobranca") || "pix", s(f, "plano"), s(f, "frequencia") || "adaptativa", ip, cfg!.termo_versao, novoId],
      );
      await auditar(db, { usuarioId: sessao.usuarioId, clienteId: novoId, acao: "cliente_criado", entidade: "cliente", entidadeId: novoId, dados: { aceite_ip: ip } });
      return novoId;
    });
  } catch (e: any) {
    ir("/clientes/novo", { erro: String(e.message).includes("documento") ? "Já existe um cliente com este CPF/CNPJ." : e.message });
  }
  if (s(f, "email_admin")) {
    await sistema((db) =>
      db.q("insert into usuarios (email, nome, senha_hash, nivel, cliente_id) values ($1,$2,$3,'cliente',$4) on conflict (email) do nothing", [
        s(f, "email_admin").toLowerCase(), s(f, "nome"), bcrypt.hashSync(s(f, "senha_admin") || "trocar123", 10), id!,
      ]),
    );
  }
  // Placas coladas (uma por linha: PLACA;RENAVAM;UF) e primeira varredura gratuita.
  const ids: string[] = [];
  const erros: string[] = [];
  for (const linha of s(f, "placas").split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    const [pl, rn, uf] = linha.split(/[;,\t ]+/);
    const pv = validarPlaca(pl ?? "");
    const rv = validarRenavam(rn ?? "");
    if (!pv.ok || !rv.ok) {
      erros.push(`${pl}: ${!pv.ok ? pv.erro : (rv as any).erro}`);
      continue;
    }
    try {
      ids.push(await noEscopo(sessao, (db) => inserirPlaca(db, id!, { placa: pv.placa, renavam: rv.renavam, uf: (uf ?? "MG").toUpperCase() })));
    } catch {
      erros.push(`${pl}: já ativa em outro cliente`);
    }
  }
  for (const pid of ids) await sistema((db) => consultarPlaca(db, pid));
  await escolherCliente(id!);
  redirect(`/bem-vindo${erros.length ? `?erro=${encodeURIComponent("Placas não cadastradas: " + erros.join("; "))}` : ""}`);
}

// ---------------- Captura de notificações (M11) ----------------

export async function capturarNotificacao(f: FormData) {
  const sessao = await exigirCliente();
  const arq = f.get("arquivo") as File | null;
  const pv = validarPlaca(s(f, "placa"));
  if (!pv.ok) ir("/enviar", { erro: "Placa inválida." });
  const auto = s(f, "auto").toUpperCase();
  if (!auto) ir("/enviar", { erro: "Informe o número do auto de infração (fica no topo da carta)." });
  const grav = (s(f, "gravidade") || "media") as Gravidade;
  const placa = await noEscopo(sessao, (db) => db.one("select * from placas where placa = $1 and cliente_id = $2", [(pv as any).placa, sessao.clienteId]));
  if (!placa) ir("/enviar", { erro: "Esta placa não está cadastrada na sua conta." });
  const orgaoNome = s(f, "orgao") || "Órgão não informado";
  const orgaoId = orgaoNome.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, "-").slice(0, 40);
  // Órgão novo entra como "não coberto": alimenta o mapa de cobertura do backoffice.
  await sistema((sdb) => sdb.q("insert into orgaos (id, nome, uf, aderente_sne, coberto) values ($1,$2,$3,false,false) on conflict (id) do nothing", [orgaoId, orgaoNome, placa!.uf]));
  const r = await noEscopo(sessao, async (db) => {
    const existente = await db.one("select id from multas where auto_infracao = $1 and placa_id = $2", [auto, placa!.id]);
    let multaId = existente?.id as string | undefined;
    if (!multaId) {
      const valor = s(f, "valor") ? parseReais(s(f, "valor")) : GRAVIDADES[grav].valor;
      const notif = s(f, "notificada_em") || hojeISO();
      const m = await db.one<{ id: string }>(
        `insert into multas (placa_id, cliente_id, orgao_id, auto_infracao, codigo_infracao, descricao, gravidade, pontos, valor, data_infracao, local, estado, fonte, notificada_em, vencimento)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'notificada','Captura de notificações',$12,$13) returning id`,
        [placa!.id, sessao.clienteId, orgaoId, auto, s(f, "codigo") || "0000", s(f, "descricao") || "Infração de trânsito", grav, GRAVIDADES[grav].pontos, valor,
         s(f, "data_infracao") || notif, s(f, "local") || null, notif, s(f, "vencimento") || null],
      );
      multaId = m!.id;
      await registrarEvento(db, { multaId, clienteId: sessao.clienteId, tipo: "detectada", descricao: "Cadastrada pela captura de notificação", fonte: arq?.name ?? s(f, "origem"), usuarioId: sessao.usuarioId });
    }
    const buf = arq && arq.size ? Buffer.from(await arq.arrayBuffer()) : null;
    await db.q(
      `insert into notificacoes_capturadas (cliente_id, origem, arquivo_nome, arquivo_tipo, arquivo_base64, dados, multa_id, achada_antes, orgao_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [sessao.clienteId, s(f, "origem") || "foto", arq?.name ?? null, arq?.type ?? null, buf && buf.length < 4_000_000 ? buf.toString("base64") : null,
       JSON.stringify(Object.fromEntries([...f.entries()].filter(([k]) => k !== "arquivo"))), multaId, !!existente, orgaoId],
    );
    return { multaId, existente: !!existente };
  }).catch((e) => ir("/enviar", { erro: e.message }));
  ir(`/multas/${r.multaId}`, { ok: r.existente ? "Esta multa já estava no Vigia Placa (achada pelas consultas). Notificação anexada." : "Multa cadastrada a partir da notificação. Prazos já estão sendo vigiados." });
}

// ---------------- Condutor (A05, link público) ----------------

export async function aceitarIndicacaoAction(f: FormData) {
  const token = s(f, "token");
  if (f.get("confirmo") !== "on") ir(`/condutor/${token}`, { erro: "Marque a confirmação para aceitar." });
  const arq = f.get("cnh") as File | null;
  try {
    await sistema((db) => aceitarIndicacao(db, token, arq && arq.size ? { nome: arq.name, base64: "" } : null));
  } catch (e: any) {
    ir(`/condutor/${token}`, { erro: e.message });
  }
  ir(`/condutor/${token}`, { ok: "Pronto! Indicação aceita. Obrigado." });
}

// ---------------- Backoffice (franqueadora) ----------------

export async function salvarConfigGlobal(f: FormData) {
  const sessao = await exigirSessao(["franqueadora"]);
  await noEscopo(sessao, async (db) => {
    await db.q("update configuracao set saving_bps = $1, taxa_conv_tipo = $2, taxa_conv_valor = $3, preco_defesa = $4", [
      Math.round(Number(s(f, "saving").replace(",", ".")) * 100), s(f, "taxa_tipo"),
      s(f, "taxa_tipo") === "fixa" ? parseReais(s(f, "taxa_valor")) : Math.round(Number(s(f, "taxa_valor").replace(",", ".")) * 100), parseReais(s(f, "preco_defesa")),
    ]);
    for (const id of ["essencial", "profissional", "frota"]) {
      const v = s(f, `preco_${id}`);
      await db.q("update planos set preco_placa = $2 where id = $1", [id, v ? parseReais(v) : null]);
    }
    await auditar(db, { usuarioId: sessao.usuarioId, acao: "config_global", entidade: "configuracao" });
  });
  ir("/backoffice?aba=planos", { ok: "Planos e percentuais salvos." });
}

export async function salvarFranqueado(f: FormData) {
  const sessao = await exigirSessao(["franqueadora"]);
  const pct = (k: string) => Math.round(Number(s(f, k).replace(",", ".") || 0) * 100);
  await noEscopo(sessao, async (db) => {
    const vals = [s(f, "nome"), somenteDocumento(s(f, "documento")), s(f, "cidade"), s(f, "wallet") || null, pct("rep_mensalidade"), pct("rep_saving"), pct("rep_conveniencia"), pct("com_defesa")];
    if (s(f, "id")) {
      await db.q("update franqueados set nome=$2, documento=$3, cidade=$4, asaas_wallet_id=$5, repasse_mensalidade_bps=$6, repasse_saving_bps=$7, repasse_conveniencia_bps=$8, comissao_defesa_bps=$9 where id=$1", [s(f, "id"), ...vals]);
    } else {
      await db.q("insert into franqueados (nome, documento, cidade, asaas_wallet_id, repasse_mensalidade_bps, repasse_saving_bps, repasse_conveniencia_bps, comissao_defesa_bps) values ($1,$2,$3,$4,$5,$6,$7,$8)", vals);
    }
    await auditar(db, { usuarioId: sessao.usuarioId, acao: "franqueado_salvo", entidade: "franqueado", entidadeId: s(f, "id") || undefined });
  }).catch((e) => ir("/backoffice?aba=franqueados", { erro: e.message }));
  ir("/backoffice?aba=franqueados", { ok: "Franqueado salvo." });
}

export async function transferirCliente(f: FormData) {
  const sessao = await exigirSessao(["franqueadora"]);
  await noEscopo(sessao, async (db) => {
    const antes = await db.one("select franqueado_id from clientes where id = $1", [s(f, "clienteId")]);
    await db.q("update clientes set franqueado_id = nullif($2,'')::uuid where id = $1", [s(f, "clienteId"), s(f, "franqueadoId")]);
    await auditar(db, { usuarioId: sessao.usuarioId, clienteId: s(f, "clienteId"), acao: "transferencia_cliente", entidade: "cliente", entidadeId: s(f, "clienteId"), dados: { de: antes?.franqueado_id, para: s(f, "franqueadoId") } });
  });
  ir("/backoffice?aba=franqueados", { ok: "Cliente transferido (registrado na auditoria)." });
}

export async function reativarFonte(f: FormData) {
  const sessao = await exigirSessao(["franqueadora"]);
  await noEscopo(sessao, (db) => db.q("update fontes set ativa = not ativa, falhas_seguidas = 0 where id = $1", [s(f, "id")]));
  ir("/backoffice?aba=fontes", { ok: "Fonte atualizada." });
}

export async function rodarVarredura() {
  await exigirSessao(["franqueadora"]);
  const r = await sistema((db) => varredura(db));
  revalidatePath("/", "layout");
  ir("/backoffice?aba=fontes", { ok: `Varredura: ${r.placas} placa(s) consultada(s), ${r.novas} multa(s) nova(s), ${r.erros} erro(s), ${r.avisos} aviso(s) de prazo.` });
}

export async function fecharMesAction(f: FormData) {
  await exigirSessao(["franqueadora"]);
  const mes = s(f, "mes") || hojeISO().slice(0, 7);
  const n = await sistema((db) => fecharMes(db, mes));
  ir("/financeiro", { ok: `Faturas de ${mes} calculadas para ${n} cliente(s).` });
}

export async function atualizarDefesaAction(f: FormData) {
  const sessao = await exigirSessao(["franqueadora"]);
  await noEscopo(sessao, (db) =>
    atualizarDefesa(db, s(f, "id"), { protocolo: s(f, "protocolo"), status: (s(f, "status") || undefined) as any, resultado: s(f, "resultado"), responsavel: s(f, "responsavel") }, sessao.usuarioId),
  );
  revalidatePath("/", "layout");
  ir("/backoffice?aba=defesas", { ok: "Pedido de defesa atualizado." });
}
