"use server";

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { after } from "next/server";
import { despacharOutbox } from "@/lib/services/despacho";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { criarSessao, encerrarSessao, escolherCliente, exigirAdminSistema, exigirCliente, exigirSessao, noEscopo, podeAgir, type Sessao } from "@/lib/auth";
import { ehAdminSistema, ehEquipeVigia, niveisCriaveis, perfisAtribuiveis } from "@/lib/acesso";
import { sistema, type Db } from "@/lib/db";
import { verificarTOTP, gerarSegredo } from "@/lib/totp";
import { hojeISO } from "@/lib/domain/dates";
import { parseReais } from "@/lib/domain/money";
import { GRAVIDADES, type Gravidade } from "@/lib/domain/ctb";
import { tipoDocumento, somenteDocumento, validarPlaca, validarRenavam } from "@/lib/domain/validators";
import { adicionarAoCarrinho, aprovarPagamento, cancelarPagamento, confirmarPagamento, criarPagamento } from "@/lib/services/pagamentos";
import { consultarPlaca, varredura } from "@/lib/services/monitoramento";
import { indicarCondutor, aceitarIndicacao, protocolarIndicacao } from "@/lib/services/indicacao";
import { pedirDefesa, atualizarDefesa } from "@/lib/services/defesa";
import { fecharMes } from "@/lib/services/faturamento";
import { lerPlanilha, validarLinhas, type LinhaImport } from "@/lib/services/importacao";
import { auditar, registrarEvento } from "@/lib/services/multas";
import { asaasSimulado } from "@/lib/integrations/asaas";
import { criarUsuario, validarSenha, type Nivel, type Perfil } from "@/lib/services/usuarios";
import { urlApp } from "@/lib/url";
import { enfileirar } from "@/lib/integrations/mensagens";
import { lerFrequencia } from "@/lib/frequencia-form";
import { normalizarFrequencia } from "@/lib/domain/monitoramento";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
/** Envia as notificações push da fila logo depois de responder ao usuário. */
const despacharDepois = () => after(() => sistema((db) => despacharOutbox(db)).then(() => undefined, () => undefined));
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
  if (u.ativo === false) return { erro: "Este acesso foi desativado. Fale com o administrador.", email };
  if (u.totp_secret) {
    const codigo = s(f, "codigo");
    if (!codigo) return { pedirCodigo: true, email };
    if (!verificarTOTP(u.totp_secret, codigo)) return { erro: "Código de verificação inválido.", pedirCodigo: true, email };
  }
  await criarSessao(u.id);
  redirect("/");
}

export async function criarPrimeiroAdmin(f: FormData) {
  const email = s(f, "email").toLowerCase();
  const senha = s(f, "senha");
  if (senha.length < 10) ir("/primeiro-acesso", { erro: "A senha precisa ter pelo menos 10 caracteres." });
  const id = await sistema(async (db) => {
    // Trava: só cria se ainda não houver nenhum administrador (checado dentro da mesma transação).
    await db.q("lock table usuarios in exclusive mode");
    const n = await db.one("select count(*) as n from usuarios where nivel = 'franqueadora'");
    if (Number(n?.n) > 0) return null;
    const r = await db.one<{ id: string }>(
      "insert into usuarios (email, nome, senha_hash, nivel, perfil) values ($1,$2,$3,'franqueadora','admin') returning id",
      [email, s(f, "nome"), bcrypt.hashSync(senha, 12)],
    );
    await auditar(db, { usuarioId: r!.id, acao: "primeiro_admin", entidade: "usuario", entidadeId: r!.id });
    return r!.id;
  });
  if (!id) redirect("/login");
  await criarSessao(id);
  redirect("/backoffice");
}

export async function trocarSenha(f: FormData) {
  const sessao = await exigirSessao();
  const nova = s(f, "nova");
  if (nova.length < 10) ir("/conta", { erro: "A nova senha precisa ter pelo menos 10 caracteres." });
  if (nova !== s(f, "repete")) ir("/conta", { erro: "As duas senhas novas não conferem." });
  const u = await sistema((db) => db.one("select senha_hash from usuarios where id = $1", [sessao.usuarioId]));
  if (!u || !(await bcrypt.compare(s(f, "atual"), u.senha_hash))) ir("/conta", { erro: "Senha atual incorreta." });
  await sistema(async (db) => {
    await db.q("update usuarios set senha_hash = $2, trocar_senha = false where id = $1", [sessao.usuarioId, bcrypt.hashSync(nova, 12)]);
    await auditar(db, { usuarioId: sessao.usuarioId, acao: "senha_trocada", entidade: "usuario", entidadeId: sessao.usuarioId });
  });
  ir(sessao.trocarSenha ? "/" : "/conta", { ok: "Senha alterada." });
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
  redirect(ehAdminSistema(sessao) ? "/backoffice" : "/carteira");
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
  let r: { id: string; pendenteAprovacao: boolean };
  try {
    r = await noEscopo(sessao, async (db) => {
      const out = await criarPagamento(db, sessao.clienteId, sessao.usuarioId);
      await auditar(db, { usuarioId: sessao.usuarioId, clienteId: sessao.clienteId, acao: out.pendenteAprovacao ? "pagamento_para_aprovacao" : "pix_gerado", entidade: "pagamento", entidadeId: out.id });
      return out;
    });
  } catch (e: any) {
    ir("/pagamentos", { erro: e.message });
  }
  redirect(`/pagamentos/${r!.id}`);
}

export async function aprovarPagamentoAction(f: FormData) {
  const sessao = await exigirCliente();
  const id = s(f, "id");
  await exigirPermissao(sessao, "pagar", `/pagamentos/${id}`);
  try {
    await noEscopo(sessao, async (db) => {
      await aprovarPagamento(db, id, sessao.usuarioId);
      await auditar(db, { usuarioId: sessao.usuarioId, clienteId: sessao.clienteId, acao: "pagamento_aprovado", entidade: "pagamento", entidadeId: id });
    });
  } catch (e: any) {
    ir(`/pagamentos/${id}`, { erro: e.message });
  }
  ir(`/pagamentos/${id}`, { ok: "Pagamento aprovado. O Pix já pode ser pago." });
}

export async function cancelarPagamentoAction(f: FormData) {
  const sessao = await exigirCliente();
  const id = s(f, "id");
  await exigirPermissao(sessao, "pagar", `/pagamentos/${id}`);
  try {
    await noEscopo(sessao, async (db) => {
      await cancelarPagamento(db, id);
      await auditar(db, { usuarioId: sessao.usuarioId, clienteId: sessao.clienteId, acao: "pagamento_cancelado", entidade: "pagamento", entidadeId: id });
    });
  } catch (e: any) {
    ir(`/pagamentos/${id}`, { erro: e.message });
  }
  ir("/pagamentos", { ok: "Pagamento cancelado. As multas continuam no carrinho." });
}

/** Só no modo simulado: faz o papel do webhook PAYMENT_RECEIVED do Asaas. */
export async function simularPagamento(f: FormData) {
  const sessao = await exigirCliente();
  if (!asaasSimulado()) ir(`/pagamentos/${s(f, "id")}`, { erro: "Com o Asaas configurado, a confirmação vem pelo webhook." });
  const id = s(f, "id");
  const meu = await noEscopo(sessao, (db) => db.one("select id from pagamentos where id = $1", [id]));
  if (!meu) ir("/pagamentos", { erro: "Pagamento não encontrado." });
  const r = await sistema((db) => confirmarPagamento(db, id));
  despacharDepois();
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
  if (sessao.nivel === "cliente") {
    await solicitar(sessao, { tipo: "inclusao", placa: (pv as any).placa, renavam: (rv as any).renavam, uf: s(f, "uf").toUpperCase(), apelido: s(f, "apelido"), grupo: s(f, "grupo") });
    ir("/placas", { ok: `Inclusão da placa ${(pv as any).placa} solicitada. Assim que a equipe Vigia Placa aprovar, ela entra no monitoramento e você recebe um aviso.` });
  }
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
  despacharDepois();
  revalidatePath("/", "layout");
  ir("/placas", { ok: `Placa cadastrada e consultada: ${r.total} multa(s) encontrada(s).` });
}

// ---------------- Solicitações de placa (cliente pede, equipe Vigia Placa aprova) ----------------

/** Registra o pedido do cliente. Com `parar`, um pedido repetido volta para /placas com erro; sem, só é ignorado. */
async function solicitar(sessao: Sessao, d: { tipo: "inclusao" | "remocao"; placa: string; renavam?: string; uf?: string; apelido?: string; grupo?: string; placaId?: string; motivo?: string }, parar = true) {
  try {
    await noEscopo(sessao, async (db) => {
      if (d.tipo === "inclusao" && !d.placaId && (await db.one("select 1 from placas where cliente_id = $1 and placa = $2", [sessao.clienteId, d.placa]))) {
        throw new Error(`A placa ${d.placa} já está na sua frota.`);
      }
      await db.q(
        `insert into solicitacoes_placa (cliente_id, tipo, placa, renavam, uf, apelido, grupo, placa_id, motivo, solicitado_por) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [sessao.clienteId, d.tipo, d.placa, d.renavam || null, d.uf || null, d.apelido || null, d.grupo || null, d.placaId || null, d.motivo || null, sessao.usuarioId],
      );
      await auditar(db, { usuarioId: sessao.usuarioId, clienteId: sessao.clienteId, acao: `solicitacao_${d.tipo}`, entidade: "placa", dados: { placa: d.placa } });
    });
    return true;
  } catch (e: any) {
    if (!parar) return false;
    ir("/placas", { erro: String(e.message).includes("solicitacoes_placa_unica_pendente") ? `Já existe um pedido em análise para a placa ${d.placa}.` : e.message });
  }
  return false;
}

export async function cancelarSolicitacao(f: FormData) {
  const sessao = await exigirCliente();
  await exigirPermissao(sessao, "editar", "/placas");
  await noEscopo(sessao, (db) => db.q("update solicitacoes_placa set status = 'cancelada', decidido_em = now() where id = $1 and status = 'pendente'", [s(f, "id")]));
  ir("/placas", { ok: "Pedido cancelado." });
}

export async function aprovarSolicitacao(f: FormData) {
  return decidirSolicitacao(f, true);
}
export async function recusarSolicitacao(f: FormData) {
  return decidirSolicitacao(f, false);
}

async function decidirSolicitacao(f: FormData, aprovar: boolean) {
  const sessao = await exigirSessao(["franqueadora", "franqueado"]);
  if (!["admin", "gestor"].includes(sessao.perfil)) ir("/solicitacoes", { erro: "Seu perfil não aprova solicitações." });
  const resposta = s(f, "resposta") || null;
  let novaPlaca: string | null = null;
  let r: any;
  try {
    r = await noEscopo(sessao, async (db) => {
      const sol = await db.one("select * from solicitacoes_placa where id = $1 and status = 'pendente'", [s(f, "id")]);
      if (!sol) throw new Error("Pedido não encontrado ou já decidido.");
      if (aprovar) {
        if (sol.tipo === "remocao") {
          await db.q("update placas set status = 'pausada', motivo_pausa = $2 where id = $1", [sol.placa_id, `removida a pedido do cliente${sol.motivo ? `: ${sol.motivo}` : ""}`]);
        } else if (sol.placa_id) {
          await db.q("update placas set status = 'ativa', motivo_pausa = null where id = $1", [sol.placa_id]);
        } else {
          if (!sol.renavam) throw new Error("O pedido não tem Renavam.");
          novaPlaca = await inserirPlaca(db, sol.cliente_id, { placa: sol.placa, renavam: sol.renavam, uf: sol.uf || "MG", apelido: sol.apelido ?? undefined, grupo: sol.grupo ?? undefined });
        }
      }
      await db.q("update solicitacoes_placa set status = $2, resposta = $3, decidido_por = $4, decidido_em = now() where id = $1", [sol.id, aprovar ? "aprovada" : "recusada", resposta, sessao.usuarioId]);
      await auditar(db, { usuarioId: sessao.usuarioId, clienteId: sol.cliente_id, acao: `solicitacao_${aprovar ? "aprovada" : "recusada"}`, entidade: "placa", dados: { placa: sol.placa, tipo: sol.tipo } });
      return sol;
    });
  } catch (e: any) {
    ir("/solicitacoes", { erro: String(e.message).includes("placas_unica_ativa") ? "Esta placa já está ativa em outro cliente." : e.message });
  }
  const acao = r.tipo === "remocao" ? "remoção" : "inclusão";
  const texto = aprovar ? `Pedido de ${acao} da placa ${r.placa} aprovado.` : `Pedido de ${acao} da placa ${r.placa} não aprovado${resposta ? `: ${resposta}` : "."}`;
  await sistema(async (db) => {
    const c = await db.one("select email, alertas_canais from clientes where id = $1", [r.cliente_id]);
    await enfileirar(db, { clienteId: r.cliente_id, canal: "email", destino: c?.email, assunto: texto, corpo: texto });
    if ((c?.alertas_canais ?? []).includes("push")) await enfileirar(db, { clienteId: r.cliente_id, canal: "push", destino: r.cliente_id, assunto: "Placas", corpo: texto, url: "/placas" });
  });
  if (novaPlaca) await sistema((db) => consultarPlaca(db, novaPlaca!));
  despacharDepois();
  revalidatePath("/", "layout");
  ir("/solicitacoes", { ok: texto });
}

export async function alterarStatusPlaca(f: FormData) {
  const sessao = await exigirCliente();
  await exigirPermissao(sessao, "editar", "/placas");
  const status = s(f, "status") === "pausada" ? "pausada" : "ativa";
  if (sessao.nivel === "cliente") {
    const p = await noEscopo(sessao, (db) => db.one("select id, placa, renavam, uf from placas where id = $1", [s(f, "placaId")]));
    if (!p) ir("/placas", { erro: "Placa não encontrada." });
    await solicitar(sessao, { tipo: status === "pausada" ? "remocao" : "inclusao", placa: p!.placa, renavam: p!.renavam, uf: p!.uf, placaId: p!.id, motivo: s(f, "motivo") });
    ir("/placas", { ok: status === "pausada" ? `Remoção da placa ${p!.placa} solicitada. Ela continua monitorada até a aprovação.` : `Reativação da placa ${p!.placa} solicitada.` });
  }
  try {
    await noEscopo(sessao, (db) => db.q("update placas set status = $2, motivo_pausa = $3 where id = $1", [s(f, "placaId"), status, s(f, "motivo") || null]));
  } catch {
    ir("/placas", { erro: "Não foi possível reativar: a placa já está ativa em outro cliente." });
  }
  ir("/placas", { ok: status === "pausada" ? "Placa pausada: deixa de ser consultada e cobrada." : "Placa reativada." });
}

export async function salvarSne(f: FormData) {
  const sessao = await exigirCliente();
  await exigirPermissao(sessao, "editar", "/placas");
  await noEscopo(sessao, (db) => db.q("update placas set sne_adesao_em = $2 where id = $1", [s(f, "placaId"), s(f, "sne") || null]));
  ir("/placas", { ok: "Adesão ao SNE atualizada." });
}

export async function consultarAgora(f: FormData) {
  const sessao = await exigirCliente();
  const placaId = s(f, "placaId");
  const volta = s(f, "volta") || "/placas";
  if (sessao.perfil === "leitura") ir(volta, { erro: "O perfil Visualizador não faz consultas." });
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
  despacharDepois();
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
  if (sessao.nivel === "cliente") {
    await exigirPermissao(sessao, "editar", "/placas");
    const validas = (await noEscopo(sessao, (db) => validarLinhas(db, linhas as any, sessao.clienteId))).filter((x) => !x.erros.length);
    let n = 0;
    for (const l of validas) {
      if (await solicitar(sessao, { tipo: "inclusao", placa: l.placa, renavam: l.renavam, uf: l.uf, apelido: l.apelido, grupo: l.grupo }, false)) n++;
    }
    ir("/placas", { ok: `${n} placa(s) enviada(s) para aprovação da equipe Vigia Placa.` });
  }
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
  despacharDepois();
  revalidatePath("/", "layout");
  ir(sessao.nivel === "cliente" || sessao.clienteId ? "/placas" : "/carteira", { ok: `${ids.length} placas importadas. Primeira varredura feita: ${multas} multa(s) encontrada(s).` });
}

// ---------------- Condutores ----------------

function camposCondutor(f: FormData) {
  const num = (k: string) => Math.max(0, Math.min(99, Number(s(f, k) || 0)));
  return {
    nome: s(f, "nome"),
    cpf: s(f, "cpf").replace(/\D/g, "") || null,
    cnh: s(f, "cnh") || null,
    categoria: s(f, "cnh_categoria") || null,
    validade: s(f, "cnh_validade") || null,
    toxicologico: s(f, "toxicologico_validade") || null,
    whatsapp: s(f, "whatsapp") || null,
    email: s(f, "email") || null,
    pontos: num("pontos_12m"),
    gravissimas: num("gravissimas_12m"),
  };
}

export async function adicionarCondutor(f: FormData) {
  const sessao = await exigirCliente();
  await exigirPermissao(sessao, "editar", "/condutores");
  const c = camposCondutor(f);
  if (!c.nome) ir("/condutores", { erro: "Informe o nome." });
  await noEscopo(sessao, (db) =>
    db.q(
      `insert into condutores (cliente_id, nome, cpf, cnh, cnh_categoria, cnh_validade, toxicologico_validade, whatsapp, email, pontos_12m, gravissimas_12m)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [sessao.clienteId, c.nome, c.cpf, c.cnh, c.categoria, c.validade, c.toxicologico, c.whatsapp, c.email, c.pontos, c.gravissimas],
    ),
  );
  ir("/condutores", { ok: "Condutor cadastrado." });
}

export async function atualizarCondutor(f: FormData) {
  const sessao = await exigirCliente();
  await exigirPermissao(sessao, "editar", "/condutores");
  const id = s(f, "id");
  const c = camposCondutor(f);
  if (!c.nome) ir("/condutores", { erro: "Informe o nome." });
  const placas = f.getAll("placas").map(String);
  await noEscopo(sessao, async (db) => {
    await db.q(
      `update condutores set nome=$3, cpf=$4, cnh=$5, cnh_categoria=$6, cnh_validade=$7, toxicologico_validade=$8, whatsapp=$9, email=$10,
         pontos_12m=$11, gravissimas_12m=$12, ativo=$13 where id = $1 and cliente_id = $2`,
      [id, sessao.clienteId, c.nome, c.cpf, c.cnh, c.categoria, c.validade, c.toxicologico, c.whatsapp, c.email, c.pontos, c.gravissimas, f.get("ativo") === "on"],
    );
    // Placas em que este é o condutor principal (usado no rateio e como sugestão de indicação).
    await db.q("update placas set condutor_principal_id = null where cliente_id = $1 and condutor_principal_id = $2 and not (id = any($3::uuid[]))", [sessao.clienteId, id, placas]);
    if (placas.length) await db.q("update placas set condutor_principal_id = $2 where cliente_id = $1 and id = any($3::uuid[])", [sessao.clienteId, id, placas]);
    await auditar(db, { usuarioId: sessao.usuarioId, clienteId: sessao.clienteId, acao: "condutor_atualizado", entidade: "condutor", entidadeId: id });
  });
  ir("/condutores", { ok: `${c.nome} atualizado.` });
}

// ---------------- Configurações (seção 7) ----------------

export async function salvarConfiguracoes(f: FormData) {
  const sessao = await exigirCliente();
  const aba = s(f, "aba");
  await exigirPermissao(sessao, "editar", `/configuracoes?aba=${aba}`);
  if (sessao.perfil !== "admin" && sessao.nivel === "cliente") ir(`/configuracoes?aba=${aba}`, { erro: "Só o Responsável altera as configurações." });
  const reais = (k: string) => (s(f, k) ? parseReais(s(f, k)) : null);
  await noEscopo(sessao, async (db) => {
    const id = sessao.clienteId;
    if (aba === "monitoramento") {
      if (!ehAdminSistema(sessao)) throw new Error("A frequência de consulta é definida pelo Administrador do Sistema.");
      await db.q("update clientes set frequencia_padrao = $2 where id = $1", [id, lerFrequencia(f, "frequencia") ?? "adaptativa"]);
      for (const k of new Set([...f.keys()].filter((k) => k.startsWith("freq_grupo:") && !k.endsWith("__dias")))) {
        await db.q("update placas set frequencia = $3 where cliente_id = $1 and coalesce(grupo,'') = $2", [id, k.slice(11), lerFrequencia(f, k)]);
      }
      await reagendarPlacas(db, "cliente_id = $1", [id]);
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
  if (sessao.perfil !== "admin") ir("/configuracoes?aba=usuarios", { erro: "Só o Responsável convida usuários." });
  if (!["admin", "leitura"].includes(s(f, "perfil"))) ir("/configuracoes?aba=usuarios", { erro: "Escolha Responsável ou Visualizador." });
  let login = "";
  try {
    login = await noEscopo(sessao, (db) =>
      criarUsuario(db, { login: s(f, "email"), nome: s(f, "nome"), senha: s(f, "senha"), nivel: "cliente", perfil: s(f, "perfil") as Perfil, franqueadoId: null, clienteId: sessao.clienteId }),
    );
  } catch (e: any) {
    ir("/configuracoes?aba=usuarios", { erro: e.message });
  }
  ir("/configuracoes?aba=usuarios", { ok: `Acesso criado para ${login}. Repasse a senha provisória por um canal seguro.` });
}

// ---------------- Regra de consulta (franqueadora) ----------------

/** Recalcula a próxima consulta das placas a partir da última feita, com a frequência nova (não dispara consulta extra). */
async function reagendarPlacas(db: Db, filtro: string, params: unknown[]) {
  await db.q(
    `update placas p set proxima_verificacao = coalesce(p.ultima_verificacao::date, current_date) +
       (case when coalesce(p.frequencia, c.frequencia_padrao) ~ '^[0-9]+$' then coalesce(p.frequencia, c.frequencia_padrao)::int else 7 end)
     from clientes c where c.id = p.cliente_id and p.status <> 'pausada' and ${filtro.replace(/cliente_id/g, "p.cliente_id").replace(/\bid =/g, "p.id =")}`,
    params,
  );
}

export async function salvarFrequenciaPlaca(f: FormData) {
  const sessao = await exigirAdminSistema("/placas");
  const placaId = s(f, "placaId");
  await noEscopo(sessao, async (db) => {
    await db.q("update placas set frequencia = $2 where id = $1", [placaId, lerFrequencia(f, "frequencia")]);
    await reagendarPlacas(db, "id = $1", [placaId]);
    await auditar(db, { usuarioId: sessao.usuarioId, acao: "frequencia_placa", entidade: "placa", entidadeId: placaId, dados: { frequencia: lerFrequencia(f, "frequencia") } });
  });
  ir("/placas", { ok: "Frequência da placa atualizada." });
}

export async function salvarRegraFontes(f: FormData) {
  const sessao = await exigirAdminSistema("/backoffice?aba=regras");
  const estrategia = s(f, "estrategia");
  const principal = s(f, "principal");
  if (!["principal_reserva", "por_uf", "alternar", "ambas"].includes(estrategia) || !["directdata", "infosimples"].includes(principal)) ir("/backoffice?aba=regras", { erro: "Regra inválida." });
  await noEscopo(sessao, async (db) => {
    await db.q("update configuracao set estrategia_fontes = $1, fonte_principal = $2 where id = 1", [estrategia, principal]);
    await auditar(db, { usuarioId: sessao.usuarioId, acao: "regra_fontes", entidade: "configuracao", dados: { estrategia, principal } });
  });
  ir("/backoffice?aba=regras", { ok: "Regra de fontes salva. Vale a partir da próxima consulta." });
}

export async function salvarRegraCliente(f: FormData) {
  const sessao = await exigirAdminSistema("/backoffice?aba=regras");
  const clienteId = s(f, "clienteId");
  const teto = s(f, "teto") ? parseReais(s(f, "teto")) : null;
  await noEscopo(sessao, async (db) => {
    await db.q("update clientes set frequencia_padrao = $2, teto_dados_mensal = $3 where id = $1", [clienteId, lerFrequencia(f, "frequencia") ?? "adaptativa", teto]);
    await reagendarPlacas(db, "cliente_id = $1", [clienteId]);
    await auditar(db, { usuarioId: sessao.usuarioId, clienteId, acao: "regra_cliente", entidade: "cliente", entidadeId: clienteId, dados: { frequencia: lerFrequencia(f, "frequencia"), teto } });
  });
  ir("/backoffice?aba=regras", { ok: "Frequência e teto do cliente salvos." });
}

// ---------------- Usuários (franqueadora e franqueado) ----------------

/** Quem gerencia acessos: Administrador do Sistema, Gestor do Vigia Placa e o administrador do franqueado. */
const gerenciaAcessos = (sessao: Sessao) => ehEquipeVigia(sessao) ? ["admin", "gestor"].includes(sessao.perfil) : sessao.perfil === "admin";
/** O Gestor do Vigia Placa só mexe em acessos de clientes; a equipe Vigia Placa é do Administrador do Sistema. */
async function podeAlterarAcesso(sessao: Sessao, usuarioId: string) {
  if (!gerenciaAcessos(sessao) || usuarioId === sessao.usuarioId) return false;
  if (ehAdminSistema(sessao) || !ehEquipeVigia(sessao)) return true;
  const alvo = await noEscopo(sessao, (db) => db.one("select nivel from usuarios where id = $1", [usuarioId]));
  return alvo?.nivel === "cliente";
}

export async function criarUsuarioAction(f: FormData) {
  const sessao = await exigirSessao(["franqueadora", "franqueado"]);
  if (!gerenciaAcessos(sessao)) ir("/usuarios", { erro: "Seu perfil não gerencia acessos." });
  const [nivelTipo, perfilTipo] = s(f, "tipo").split(":");
  const nivel = (nivelTipo || s(f, "nivel")) as Nivel;
  if (!niveisCriaveis(sessao).includes(nivel)) ir("/usuarios", { erro: "Você não pode criar acessos deste nível." });
  const perfil = perfilTipo || s(f, "perfil") || "admin";
  if (nivel === "cliente" && !s(f, "clienteId")) ir("/usuarios", { erro: "Escolha o cliente deste acesso." });
  if (!perfisAtribuiveis(sessao, nivel).includes(perfil)) ir("/usuarios", { erro: "Perfil inválido para este nível." });
  let login = "";
  try {
    login = await noEscopo(sessao, async (db) => {
      const l = await criarUsuario(db, {
        login: s(f, "login"), nome: s(f, "nome"), senha: s(f, "senha"), nivel, perfil: perfil as Perfil,
        franqueadoId: nivel !== "franqueado" ? null : sessao.nivel === "franqueado" ? sessao.franqueadoId : s(f, "franqueadoId") || null,
        clienteId: nivel === "cliente" ? s(f, "clienteId") || null : null,
      });
      await auditar(db, { usuarioId: sessao.usuarioId, clienteId: s(f, "clienteId") || null, acao: "usuario_criado", entidade: "usuario", dados: { login: l, nivel } });
      return l;
    });
  } catch (e: any) {
    ir("/usuarios", { erro: String(e.message).includes("row-level security") ? "Você não pode criar acessos para este vínculo." : e.message });
  }
  ir("/usuarios", { ok: `Acesso criado: ${login}. No primeiro login a pessoa troca a senha provisória.` });
}

export async function redefinirSenhaUsuario(f: FormData) {
  const sessao = await exigirSessao(["franqueadora", "franqueado"]);
  if (!(await podeAlterarAcesso(sessao, s(f, "id")))) ir("/usuarios", { erro: "Você não pode alterar este acesso." });
  const erro = validarSenha(s(f, "senha"));
  if (erro) ir("/usuarios", { erro });
  const r = await noEscopo(sessao, async (db) => {
    const rows = await db.q("update usuarios set senha_hash = $2, trocar_senha = true where id = $1 and id <> $3 returning email", [s(f, "id"), bcrypt.hashSync(s(f, "senha"), 12), sessao.usuarioId]);
    if (rows.length) await auditar(db, { usuarioId: sessao.usuarioId, acao: "senha_redefinida", entidade: "usuario", entidadeId: s(f, "id") });
    return rows[0];
  }).catch(() => null);
  ir("/usuarios", r ? { ok: `Senha provisória definida para ${r.email}.` } : { erro: "Você não pode alterar este acesso." });
}

export async function alternarUsuario(f: FormData) {
  const sessao = await exigirSessao(["franqueadora", "franqueado"]);
  if (!(await podeAlterarAcesso(sessao, s(f, "id")))) ir("/usuarios", { erro: "Você não pode alterar este acesso." });
  const ativo = s(f, "ativo") === "1";
  const r = await noEscopo(sessao, async (db) => {
    const rows = await db.q("update usuarios set ativo = $2 where id = $1 and id <> $3 returning email", [s(f, "id"), ativo, sessao.usuarioId]);
    if (rows.length) await auditar(db, { usuarioId: sessao.usuarioId, acao: ativo ? "usuario_reativado" : "usuario_desativado", entidade: "usuario", entidadeId: s(f, "id") });
    return rows[0];
  }).catch(() => null);
  ir("/usuarios", r ? { ok: `${r.email} ${ativo ? "reativado" : "desativado"}.` } : { erro: "Você não pode alterar este acesso." });
}

// ---------------- Onboarding (T02) ----------------

/** Preço/saving negociados para um cliente (só a equipe Vigia Placa). Vazio = valor do plano. */
function lerPrecoPersonalizado(f: FormData, volta: string, sessao: Sessao): { preco: number | null; saving: number | null } | null {
  if (!ehEquipeVigia(sessao)) return null;
  const p = s(f, "preco_personalizado");
  const sv = s(f, "saving_personalizado").replace(",", ".").replace("%", "");
  const preco = p ? parseReais(p) : null;
  const saving = sv ? Math.round(Number(sv) * 100) : null;
  if (preco !== null && !(preco >= 0)) ir(volta, { erro: "Preço por placa inválido." });
  if (saving !== null && !(saving >= 0 && saving <= 10000)) ir(volta, { erro: "O saving deve ficar entre 0% e 100%." });
  return { preco, saving };
}

export async function salvarPrecoCliente(f: FormData) {
  const sessao = await exigirSessao(["franqueadora"]);
  if (!["admin", "gestor"].includes(sessao.perfil)) ir("/carteira", { erro: "Seu perfil não altera preços." });
  const preco = lerPrecoPersonalizado(f, "/carteira", sessao)!;
  const clienteId = s(f, "clienteId");
  await noEscopo(sessao, async (db) => {
    await db.q("update clientes set preco_placa_personalizado = $2, saving_bps_personalizado = $3 where id = $1", [clienteId, preco.preco, preco.saving]);
    await auditar(db, { usuarioId: sessao.usuarioId, clienteId, acao: "preco_personalizado", entidade: "cliente", entidadeId: clienteId, dados: preco });
  });
  revalidatePath("/", "layout");
  ir("/carteira", { ok: preco.preco === null && preco.saving === null ? "Cliente voltou ao preço do plano." : "Preço personalizado salvo. Vale a partir da próxima fatura." });
}

export async function criarCliente(f: FormData) {
  const sessao = await exigirSessao(["franqueado", "franqueadora"]);
  const doc = somenteDocumento(s(f, "documento"));
  const tipo = tipoDocumento(doc);
  if (!tipo) ir("/clientes/novo", { erro: "CPF ou CNPJ inválido." });
  if (f.get("aceite") !== "on") ir("/clientes/novo", { erro: "O aceite dos termos (com a autorização de consulta e LGPD) é obrigatório." });
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  const avisos: string[] = [];
  const preco = lerPrecoPersonalizado(f, "/clientes/novo", sessao);
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
         s(f, "forma_cobranca") || "pix", s(f, "plano"),
         ehAdminSistema(sessao) ? lerFrequencia(f, "frequencia") ?? "adaptativa" : normalizarFrequencia((await db.one("select frequencia from planos where id = $1", [s(f, "plano")]))?.frequencia),
         ip, cfg!.termo_versao, novoId],
      );
      if (preco) await db.q("update clientes set preco_placa_personalizado = $2, saving_bps_personalizado = $3 where id = $1", [novoId, preco.preco, preco.saving]);
      await auditar(db, { usuarioId: sessao.usuarioId, clienteId: novoId, acao: "cliente_criado", entidade: "cliente", entidadeId: novoId, dados: { aceite_ip: ip } });
      return novoId;
    });
  } catch (e: any) {
    ir("/clientes/novo", { erro: String(e.message).includes("documento") ? "Já existe um cliente com este CPF/CNPJ." : e.message });
  }
  if (s(f, "email_admin")) {
    try {
      await noEscopo(sessao, (db) =>
        criarUsuario(db, { login: s(f, "email_admin"), nome: s(f, "nome"), senha: s(f, "senha_admin"), nivel: "cliente", perfil: "admin", franqueadoId: null, clienteId: id! }),
      );
    } catch (e: any) {
      avisos.push(`Acesso do cliente não criado: ${e.message}`);
    }
  }
  // Placas coladas (uma por linha: PLACA;RENAVAM;UF) e primeira varredura gratuita.
  const ids: string[] = [];
  const erros: string[] = [...avisos];
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
  despacharDepois();
  await escolherCliente(id!);
  redirect(`/bem-vindo${erros.length ? `?erro=${encodeURIComponent("Atenção: " + erros.join("; "))}` : ""}`);
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
    const planos = await db.q<{ id: string }>("select id from planos");
    for (const { id } of planos) {
      const v = s(f, `preco_${id}`);
      const sv = s(f, `saving_${id}`).replace(",", ".");
      const bps = sv === "" ? null : Math.round(Number(sv) * 100);
      if (bps !== null && !(bps >= 0 && bps <= 10000)) throw new Error(`Saving do plano ${id} deve ficar entre 0% e 100%.`);
      const itens = s(f, `itens_${id}`).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join("\n");
      await db.q("update planos set preco_placa = $2, saving_bps = $3, frase_site = $4, itens_site = $5, destaque_site = $6 where id = $1", [
        id, v ? parseReais(v) : null, bps, s(f, `frase_${id}`).trim(), itens, s(f, "destaque") === id,
      ]);
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
  const sessao = await exigirAdminSistema("/backoffice?aba=fontes");
  await noEscopo(sessao, (db) => db.q("update fontes set ativa = not ativa, falhas_seguidas = 0 where id = $1", [s(f, "id")]));
  ir("/backoffice?aba=fontes", { ok: "Fonte atualizada." });
}

export async function rodarVarredura() {
  await exigirAdminSistema("/backoffice?aba=fontes");
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

// ---------------- Infosimples: teste de fonte (franqueadora) ----------------

export async function testarFonteInfosimples(_: unknown, f: FormData): Promise<{ erro?: string; servico?: string; resumo?: string; multas?: Array<Record<string, unknown>>; bruto?: string }> {
  if (!ehAdminSistema(await exigirSessao(["franqueadora"]))) return { erro: "Só o Administrador do Sistema testa as fontes de dados." };
  const { FONTES, chamarServico, interpretarResposta, montarParametros, modoSimulado } = await import("@/lib/integrations/infosimples");
  const dd = await import("@/lib/integrations/directdata");
  if (s(f, "servico") === dd.SERVICO_DIRECTDATA) {
    if (!dd.directDataAtiva()) return { erro: "Sem DIRECTDATA_TOKEN: configure o token na Vercel." };
    const pv = validarPlaca(s(f, "placa"));
    const rv = validarRenavam(s(f, "renavam"));
    if (!pv.ok) return { erro: pv.erro };
    if (!rv.ok) return { erro: (rv as any).erro };
    try {
      const json = await dd.chamarDirectData(pv.placa, rv.renavam);
      const r = dd.interpretarDirectData(json);
      // Dados pessoais do proprietário não são exibidos nem guardados.
      if (json?.retorno) {
        if (json.retorno.nomeProprietario) json.retorno.nomeProprietario = "[oculto]";
        if (json.retorno.documentoProprietario) json.retorno.documentoProprietario = "[oculto]";
      }
      const bruto = JSON.stringify(json, null, 2);
      return {
        servico: dd.SERVICO_DIRECTDATA,
        resumo: r.ok ? `OK (${json?.metaDados?.resultado}) · ${r.multas.length} multa(s) reconhecida(s) · custo R$ ${(r.custo / 100).toFixed(2).replace(".", ",")}` : `Erro: ${r.erro}`,
        multas: r.multas.map((m) => ({ auto: m.autoInfracao, orgao: m.orgaoNome, descricao: m.descricao, valor: (m.valor / 100).toFixed(2), data: m.dataInfracao, vencimento: m.vencimento, pontos: m.pontos })),
        bruto: bruto.length > 20000 ? bruto.slice(0, 20000) + "\n… (cortado)" : bruto,
      };
    } catch (e: any) {
      return { erro: `Falha ao chamar a Direct Data: ${e.message}` };
    }
  }
  if (modoSimulado()) return { erro: "Sem INFOSIMPLES_TOKEN: configure o token na Vercel para testar as fontes reais." };
  const fonte = FONTES.find((x) => x.servico === s(f, "servico"));
  if (!fonte) return { erro: "Escolha uma fonte." };
  const pv = validarPlaca(s(f, "placa"));
  const rv = validarRenavam(s(f, "renavam"));
  if (fonte.parametros.includes("placa") && !pv.ok) return { erro: pv.erro };
  if (fonte.parametros.includes("renavam") && !rv.ok) return { erro: (rv as any).erro };
  try {
    const params = montarParametros(fonte, { placa: (pv as any).placa ?? "", renavam: (rv as any).renavam ?? "", documento: somenteDocumento(s(f, "documento")) || null });
    const { json } = await chamarServico(fonte.servico, params);
    const r = interpretarResposta(fonte, json);
    const bruto = JSON.stringify({ ...json, site_receipts: json?.site_receipts ? "[omitido]" : undefined }, null, 2);
    return {
      servico: fonte.servico,
      resumo: r.ok ? `OK (código ${r.codigo}) · ${r.multas.length} multa(s) reconhecida(s) · custo R$ ${(r.custo / 100).toFixed(2).replace(".", ",")}` : `Erro: ${r.erro}`,
      multas: r.multas.map((m) => ({ auto: m.autoInfracao, orgao: m.orgaoNome, descricao: m.descricao, valor: (m.valor / 100).toFixed(2), data: m.dataInfracao, vencimento: m.vencimento, pontos: m.pontos })),
      bruto: bruto.length > 20000 ? bruto.slice(0, 20000) + "\n… (cortado)" : bruto,
    };
  } catch (e: any) {
    return { erro: `Falha ao chamar a Infosimples: ${e.message}` };
  }
}
