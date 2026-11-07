import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";
import { comEscopo, sistema, type Db, type Escopo } from "./db";

const COOKIE = "vp_sessao";
const COOKIE_CLIENTE = "vp_cliente";

function segredo() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("Defina SESSION_SECRET em produção");
  return new TextEncoder().encode(s ?? "vigia-placa-dev-nao-use-em-producao");
}

export interface Sessao {
  usuarioId: string;
  nome: string;
  email: string;
  nivel: Escopo["nivel"];
  perfil: "admin" | "gestor" | "financeiro" | "leitura";
  franqueadoId: string | null;
  /** Cliente do próprio usuário (nível cliente). */
  clienteProprioId: string | null;
  /** Cliente em foco na tela: o próprio, ou o escolhido pelo franqueado/franqueadora. */
  clienteId: string | null;
  clienteNome: string | null;
  doisFatores: boolean;
}

export async function criarSessao(usuarioId: string) {
  const jwt = await new SignJWT({ sub: usuarioId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(segredo());
  (await cookies()).set(COOKIE, jwt, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600 });
}

export async function encerrarSessao() {
  const c = await cookies();
  c.delete(COOKIE);
  c.delete(COOKIE_CLIENTE);
}

export async function escolherCliente(clienteId: string | null) {
  const c = await cookies();
  if (clienteId) c.set(COOKIE_CLIENTE, clienteId, { httpOnly: true, sameSite: "lax", path: "/" });
  else c.delete(COOKIE_CLIENTE);
}

export async function sessaoAtual(): Promise<Sessao | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  let sub: string;
  try {
    sub = (await jwtVerify(token, segredo())).payload.sub as string;
  } catch {
    return null;
  }
  const u = await sistema((db) => db.one("select * from usuarios where id = $1", [sub]));
  if (!u) return null;
  const escopo: Escopo = { nivel: u.nivel, franqueadoId: u.franqueado_id, clienteId: u.cliente_id };
  let clienteId: string | null = u.cliente_id;
  let clienteNome: string | null = null;
  const escolhido = jar.get(COOKIE_CLIENTE)?.value;
  if (u.nivel === "cliente") {
    clienteNome = (await comEscopo(escopo, (db) => db.one("select nome from clientes where id = $1", [u.cliente_id])))?.nome ?? null;
  } else if (escolhido) {
    // O RLS garante que o franqueado só "entra" em clientes da própria carteira.
    const c = await comEscopo(escopo, (db) => db.one("select id, nome from clientes where id = $1", [escolhido]));
    if (c) {
      clienteId = c.id;
      clienteNome = c.nome;
    }
  }
  return {
    usuarioId: u.id, nome: u.nome, email: u.email, nivel: u.nivel, perfil: u.perfil,
    franqueadoId: u.franqueado_id, clienteProprioId: u.cliente_id, clienteId, clienteNome, doisFatores: !!u.totp_secret,
  };
}

export async function exigirSessao(niveis?: Sessao["nivel"][]): Promise<Sessao> {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  if (niveis && !niveis.includes(s.nivel)) redirect("/");
  return s;
}

/** Exige um cliente em foco (para telas do cliente). Franqueado sem cliente escolhido vai para a carteira. */
export async function exigirCliente(): Promise<Sessao & { clienteId: string }> {
  const s = await exigirSessao();
  if (!s.clienteId) redirect(s.nivel === "franqueadora" ? "/backoffice" : "/carteira");
  return s as Sessao & { clienteId: string };
}

export function escopoDe(s: Sessao): Escopo {
  return { nivel: s.nivel, franqueadoId: s.franqueadoId, clienteId: s.clienteProprioId };
}

export function noEscopo<T>(s: Sessao, fn: (db: Db) => Promise<T>) {
  return comEscopo(escopoDe(s), fn);
}

/** Permissões por perfil e pelas regras de aprovação do cliente (seção 7, aba Aprovações). */
export async function podeAgir(s: Sessao, acao: "pagar" | "indicar" | "defesa" | "editar"): Promise<boolean> {
  if (s.perfil === "leitura") return false;
  if (s.perfil === "financeiro" && acao !== "pagar") return false;
  if (s.nivel === "franqueado" && s.clienteId && acao !== "editar") {
    const c = await noEscopo(s, (db) => db.one("select franqueado_pode_agir from clientes where id = $1", [s.clienteId]));
    return !!c?.franqueado_pode_agir;
  }
  return true;
}
