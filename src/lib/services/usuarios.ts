/** Gestão de usuários nos três níveis. O banco (RLS 0006) garante que ninguém grava acima do próprio nível. */
import bcrypt from "bcryptjs";
import type { Db } from "../db";

export type Nivel = "franqueadora" | "franqueado" | "cliente";
export type Perfil = "admin" | "gestor" | "financeiro" | "leitura";

export const PERFIS: Record<Perfil, string> = {
  admin: "Administrador",
  gestor: "Gestor (paga, indica, pede defesa)",
  financeiro: "Financeiro (só paga)",
  leitura: "Leitura",
};

/** Login: e-mail ou nome de usuário simples (letras, números, ponto, hífen, sublinhado). */
export function normalizarLogin(v: string): string | null {
  const l = v.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l) || /^[a-z0-9._-]{3,40}$/.test(l)) return l;
  return null;
}

export function validarSenha(s: string): string | null {
  if (s.length < 10) return "A senha precisa ter pelo menos 10 caracteres.";
  return null;
}

export interface NovoUsuario {
  login: string;
  nome: string;
  senha: string;
  nivel: Nivel;
  perfil: Perfil;
  franqueadoId: string | null;
  clienteId: string | null;
}

/** Níveis que cada nível pode criar (a regra definitiva está no banco). */
export function niveisPermitidos(nivel: Nivel): Nivel[] {
  if (nivel === "franqueadora") return ["franqueadora", "franqueado", "cliente"];
  if (nivel === "franqueado") return ["franqueado", "cliente"];
  return ["cliente"];
}

export async function criarUsuario(db: Db, u: NovoUsuario) {
  const login = normalizarLogin(u.login);
  if (!login) throw new Error("Use um e-mail válido ou um nome de usuário (3 a 40 letras, números, ponto ou hífen).");
  const erroSenha = validarSenha(u.senha);
  if (erroSenha) throw new Error(erroSenha);
  if (u.nivel === "franqueado" && !u.franqueadoId) throw new Error("Escolha o franqueado.");
  if (u.nivel === "cliente" && !u.clienteId) throw new Error("Escolha o cliente.");
  const existe = await db.one("select 1 from usuarios where email = $1", [login]);
  if (existe) throw new Error("Já existe um usuário com este login.");
  await db.q(
    `insert into usuarios (email, nome, senha_hash, nivel, perfil, franqueado_id, cliente_id, trocar_senha)
     values ($1,$2,$3,$4,$5,$6,$7,true)`,
    [login, u.nome || login, bcrypt.hashSync(u.senha, 12), u.nivel,
     u.perfil, u.nivel === "franqueado" ? u.franqueadoId : null, u.nivel === "cliente" ? u.clienteId : null],
  );
  return login;
}

/** Lista os acessos visíveis. `somenteClientes`: o Gestor do Vigia Placa vê e gerencia só acessos de clientes. */
export async function listarUsuarios(db: Db, somenteClientes = false) {
  return db.q(
    `select u.id, u.email, u.nome, u.nivel, u.perfil, u.ativo, u.trocar_senha, u.totp_secret is not null as dois_fatores, u.criado_em,
            f.nome as franqueado_nome, c.nome as cliente_nome
     from usuarios u left join franqueados f on f.id = u.franqueado_id left join clientes c on c.id = u.cliente_id
     ${somenteClientes ? "where u.nivel = 'cliente'" : ""}
     order by u.nivel, coalesce(f.nome, c.nome, ''), u.nome`,
  );
}
