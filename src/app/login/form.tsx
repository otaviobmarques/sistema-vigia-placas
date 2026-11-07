"use client";
import { useActionState } from "react";
import { entrar } from "../actions";

export function FormLogin() {
  const [estado, acao, pendente] = useActionState(entrar, {});
  return (
    <form action={acao} className="space-y-4">
      <div>
        <label className="rotulo" htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" required autoComplete="username" defaultValue={estado.email} className="campo" />
      </div>
      <div>
        <label className="rotulo" htmlFor="senha">Senha</label>
        <input id="senha" name="senha" type="password" required autoComplete="current-password" className="campo" />
      </div>
      {estado.pedirCodigo && (
        <div>
          <label className="rotulo" htmlFor="codigo">Código do app autenticador</label>
          <input id="codigo" name="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus className="campo tracking-[0.4em]" />
        </div>
      )}
      {estado.erro && <p className="text-sm text-rec">{estado.erro}</p>}
      <button className="btn-primario w-full" disabled={pendente}>{pendente ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
