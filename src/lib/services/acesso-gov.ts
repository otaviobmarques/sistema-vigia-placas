/**
 * Qual acesso usar para entrar no gov.br (SENATRAN/SNE) e no SIFAMA em nome do cliente.
 * Ordem: 1) procuração válida: a Vigia Placa entra com o CPF do procurador e escolhe o CNPJ do cliente;
 *        2) login gov.br do próprio cliente; 3) só na ANTT, o login próprio do SIFAMA.
 * As senhas ficam cifradas (AES-256-GCM, chave COFRE_CHAVE) e nunca voltam para a tela.
 */
import { sistema, type Db } from "../db";
import { decifrar } from "../cofre";
import { hojeISO } from "../domain/dates";

export type ViaAcesso = "procuracao" | "gov" | "sifama";
export type Acesso =
  | { ok: true; via: ViaAcesso; rotulo: string; login: string; senha: string; representado: string | null }
  | { ok: false; erro: string };

type ClienteAcesso = {
  documento: string; procuracao_gov: boolean; procurador_usuario_id?: string | null; procuracao_validade: string | null; gov_login: string | null; gov_senha_cifrada: string | null;
  antt_login: string | null; antt_senha_cifrada: string | null; antt_cnpj_representado: string | null;
};

export const ROTULO_VIA: Record<ViaAcesso, string> = { procuracao: "procuração gov.br", gov: "gov.br do cliente", sifama: "login do SIFAMA" };

/** Procuração vale até a data de validade (sem data = sem prazo informado). */
export function procuracaoValida(c: { procuracao_gov: boolean; procuracao_validade: string | null }, hoje = hojeISO()) {
  if (!c.procuracao_gov) return false;
  if (!c.procuracao_validade) return true;
  return String(c.procuracao_validade).slice(0, 10) >= hoje;
}

/** Escolhe o acesso (função pura, testável). */
export function escolherAcesso(c: ClienteAcesso, procurador: { cpf: string | null; senha: string | null }, opts: { sifama?: boolean; hoje?: string } = {}): Acesso {
  const cnpj = c.documento?.length === 14 ? c.documento : null;
  const motivos: string[] = [];
  if (c.procuracao_gov) {
    if (!procuracaoValida(c, opts.hoje)) motivos.push(`procuração vencida em ${String(c.procuracao_validade).slice(0, 10).split("-").reverse().join("/")}`);
    else if (!procurador.cpf || !procurador.senha) motivos.push("procurador sem gov.br cadastrado (o procurador cadastra em Minha conta)");
    else return { ok: true, via: "procuracao", rotulo: ROTULO_VIA.procuracao, login: procurador.cpf, senha: procurador.senha, representado: c.antt_cnpj_representado || cnpj };
  }
  if (c.gov_login) {
    const senha = decifrar(c.gov_senha_cifrada);
    if (senha) return { ok: true, via: "gov", rotulo: ROTULO_VIA.gov, login: c.gov_login, senha, representado: c.antt_cnpj_representado || cnpj };
    motivos.push("senha gov.br do cliente precisa ser digitada de novo");
  }
  if (opts.sifama && c.antt_login) {
    const senha = decifrar(c.antt_senha_cifrada);
    if (senha) return { ok: true, via: "sifama", rotulo: ROTULO_VIA.sifama, login: c.antt_login, senha, representado: c.antt_cnpj_representado || cnpj };
    motivos.push("senha do SIFAMA precisa ser digitada de novo");
  }
  return { ok: false, erro: motivos.length ? `Sem acesso: ${motivos.join("; ")}.` : "Cliente sem procuração nem login gov.br cadastrado." };
}

export type Procurador = { id: string; nome: string; gov_cpf: string; tem_senha: boolean };

/** Usuários da equipe que cadastraram o gov.br de procurador em "Minha conta". */
export async function listarProcuradores(): Promise<Procurador[]> {
  return sistema((db) => db.q<Procurador>(
    "select id, nome, gov_cpf, (gov_senha_cifrada is not null) as tem_senha from usuarios where nivel = 'franqueadora' and gov_cpf is not null order by nome",
  ));
}

/** Login do procurador do cliente: o escolhido no cadastro; senão o padrão do Backoffice; senão, se houver um só, ele.
 *  Precisa da conexão de sistema (lê usuarios da equipe): as telas conferem o escopo antes e chamam com sistema(). */
async function procuradorDoCliente(db: Db, usuarioId: string | null | undefined) {
  {
    const doUsuario = async (id: string) => {
      const u = await db.one<{ gov_cpf: string | null; gov_senha_cifrada: string | null }>("select gov_cpf, gov_senha_cifrada from usuarios where id = $1", [id]);
      return { cpf: u?.gov_cpf ?? null, senha: decifrar(u?.gov_senha_cifrada) };
    };
    if (usuarioId) return doUsuario(usuarioId);
    const cfg = await db.one<{ procurador_cpf: string | null; procurador_senha_cifrada: string | null }>("select procurador_cpf, procurador_senha_cifrada from configuracao where id = 1");
    if (cfg?.procurador_cpf) return { cpf: cfg.procurador_cpf, senha: decifrar(cfg.procurador_senha_cifrada) };
    const unicos = await db.q<{ id: string }>("select id from usuarios where nivel = 'franqueadora' and gov_cpf is not null and gov_senha_cifrada is not null limit 2");
    return unicos.length === 1 ? doUsuario(unicos[0].id) : { cpf: null, senha: null };
  }
}

export async function acessoDoCliente(db: Db, clienteId: string, opts: { sifama?: boolean } = {}): Promise<Acesso> {
  const c = await db.one<ClienteAcesso>(
    `select documento, procuracao_gov, procuracao_validade::text as procuracao_validade, procurador_usuario_id, gov_login, gov_senha_cifrada,
            antt_login, antt_senha_cifrada, antt_cnpj_representado from clientes where id = $1`,
    [clienteId],
  );
  if (!c) return { ok: false, erro: "Cliente não encontrado." };
  const procurador = c.procuracao_gov ? await procuradorDoCliente(db, c.procurador_usuario_id) : { cpf: null, senha: null };
  return escolherAcesso(c, procurador, opts);
}

/** Campos do acesso gov.br para as telas (alias da tabela de clientes: c). A senha nunca sai do banco. */
export const SQL_ACESSO_GOV = `c.procuracao_gov, c.procuracao_validade::text as procuracao_validade, c.procurador_usuario_id, c.gov_login, (c.gov_senha_cifrada is not null) as tem_senha_gov,
  c.gov_multas_ativo, c.gov_ultimo_erro,
  (select d.id from documentos d where d.cliente_id = c.id and d.tipo = 'procuracao' and d.expira_em > now() order by d.criado_em desc limit 1) as doc_procuracao`;
