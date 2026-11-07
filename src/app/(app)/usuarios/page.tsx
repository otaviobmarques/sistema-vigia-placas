import { exigirSessao, noEscopo } from "@/lib/auth";
import { listarUsuarios, niveisPermitidos, PERFIS } from "@/lib/services/usuarios";
import { Cabecalho, Card, Mensagem } from "@/components/ui";
import { alternarUsuario, criarUsuarioAction, redefinirSenhaUsuario } from "../../actions";

export const metadata = { title: "Usuários" };
const NIVEL: Record<string, string> = { franqueadora: "Franqueadora", franqueado: "Franqueado", cliente: "Cliente" };

export default async function Usuarios({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await exigirSessao(["franqueadora", "franqueado"]);
  const sp = await searchParams;
  const d = await noEscopo(s, async (db) => ({
    usuarios: await listarUsuarios(db),
    franqueados: await db.q("select id, nome from franqueados where ativo order by nome"),
    clientes: await db.q("select id, nome from clientes where ativo order by nome"),
  }));
  const niveis = niveisPermitidos(s.nivel);
  return (
    <>
      <Cabecalho titulo="Usuários" sub={s.nivel === "franqueadora" ? "Acessos da franqueadora, dos franqueados e dos clientes." : "Sua equipe e os acessos dos seus clientes."} />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <Card titulo="Novo acesso" className="mb-6">
        <form action={criarUsuarioAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div><label className="rotulo">Nome</label><input name="nome" required className="campo" /></div>
          <div><label className="rotulo">Login (e-mail ou usuário)</label><input name="login" required autoCapitalize="none" className="campo" /></div>
          <div><label className="rotulo">Senha provisória (mín. 10)</label><input name="senha" type="password" minLength={10} required autoComplete="new-password" className="campo" /></div>
          <div><label className="rotulo">Nível</label>
            <select name="nivel" className="campo" defaultValue={niveis[niveis.length - 1]}>{niveis.map((n) => <option key={n} value={n}>{NIVEL[n]}</option>)}</select>
          </div>
          {s.nivel === "franqueadora" && (
            <div><label className="rotulo">Franqueado (se nível franqueado)</label>
              <select name="franqueadoId" className="campo"><option value="">—</option>{d.franqueados.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
            </div>
          )}
          <div><label className="rotulo">Cliente (se nível cliente)</label>
            <select name="clienteId" className="campo"><option value="">—</option>{d.clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          </div>
          <div><label className="rotulo">Perfil</label>
            <select name="perfil" className="campo" defaultValue="admin">{Object.entries(PERFIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
          <div className="flex items-end"><button className="btn-primario w-full">Criar acesso</button></div>
        </form>
        <p className="mt-2 text-xs text-suave">A pessoa entra com a senha provisória e é obrigada a criar uma senha própria no primeiro acesso. Repasse a senha por um canal seguro.</p>
      </Card>
      <Card titulo={`Acessos (${d.usuarios.length})`}>
        <div className="-mx-5 overflow-x-auto">
          <table className="tabela min-w-[900px]">
            <thead><tr><th>Nome</th><th>Login</th><th>Nível</th><th>Vínculo</th><th>Perfil</th><th>Situação</th><th>Redefinir senha</th><th /></tr></thead>
            <tbody>
              {d.usuarios.map((u) => (
                <tr key={u.id} className={u.ativo ? "" : "opacity-50"}>
                  <td className="font-semibold">{u.nome}</td>
                  <td className="text-xs">{u.email}</td>
                  <td className="text-xs">{NIVEL[u.nivel]}</td>
                  <td className="text-xs">{u.franqueado_nome ?? u.cliente_nome ?? "—"}</td>
                  <td className="text-xs">{PERFIS[u.perfil as keyof typeof PERFIS].split(" (")[0]}</td>
                  <td className="text-xs">{!u.ativo ? "Desativado" : u.trocar_senha ? "Senha provisória" : "Ativo"}{u.dois_fatores ? " · 2FA" : ""}</td>
                  <td>
                    {u.id !== s.usuarioId && (
                      <form action={redefinirSenhaUsuario} className="flex gap-1">
                        <input type="hidden" name="id" value={u.id} />
                        <input name="senha" type="password" minLength={10} required placeholder="nova provisória" autoComplete="new-password" className="campo w-36 py-1 text-xs" />
                        <button className="btn-leve btn-sm">OK</button>
                      </form>
                    )}
                  </td>
                  <td className="text-right">
                    {u.id !== s.usuarioId && (
                      <form action={alternarUsuario}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="ativo" value={u.ativo ? "0" : "1"} /><button className="btn-leve btn-sm">{u.ativo ? "Desativar" : "Reativar"}</button></form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
