import { exigirSessao, noEscopo } from "@/lib/auth";
import { listarUsuarios } from "@/lib/services/usuarios";
import { ehAdminSistema, franquiasAtivas, niveisCriaveis, perfisAtribuiveis, rotuloPerfil } from "@/lib/acesso";
import { Cabecalho, Card, Mensagem } from "@/components/ui";
import { alternarUsuario, criarUsuarioAction, redefinirSenhaUsuario } from "../../actions";

export const metadata = { title: "Usuários" };
const NIVEL: Record<string, string> = { franqueadora: "Equipe Vigia Placa", franqueado: "Franqueado", cliente: "Cliente" };

export default async function Usuarios({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await exigirSessao(["franqueadora", "franqueado"]);
  const sp = await searchParams;
  const d = await noEscopo(s, async (db) => ({
    usuarios: await listarUsuarios(db, s.nivel === "franqueadora" && !ehAdminSistema(s)),
    franqueados: await db.q("select id, nome from franqueados where ativo order by nome"),
    clientes: await db.q("select id, nome from clientes where ativo order by nome"),
  }));
  const niveis = niveisCriaveis(s);
  const gerencia = s.nivel === "franqueadora" ? ["admin", "gestor"].includes(s.perfil) : s.perfil === "admin";
  // O Gestor do Vigia Placa só altera acessos de clientes.
  const podeAlterar = (u: Record<string, any>) => gerencia && u.id !== s.usuarioId && (ehAdminSistema(s) || s.nivel !== "franqueadora" || u.nivel === "cliente");
  const opcoesPerfil = niveis.flatMap((n) => perfisAtribuiveis(s, n).map((p) => ({ v: `${n}:${p}`, r: `${NIVEL[n]} · ${rotuloPerfil(n, p)}` })));
  return (
    <>
      <Cabecalho titulo="Usuários" sub={s.nivel === "franqueadora" ? (ehAdminSistema(s) ? "Acessos da equipe Vigia Placa e dos clientes." : "Acessos dos clientes. A equipe Vigia Placa é gerenciada pelo Administrador do Sistema.") : "Sua equipe e os acessos dos seus clientes."} />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      {gerencia && <Card titulo="Novo acesso" className="mb-6">
        <form action={criarUsuarioAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div><label className="rotulo">Nome</label><input name="nome" required className="campo" /></div>
          <div><label className="rotulo">Login (e-mail ou usuário)</label><input name="login" required autoCapitalize="none" className="campo" /></div>
          <div><label className="rotulo">Senha (mín. 10)</label><input name="senha" type="password" minLength={10} required autoComplete="new-password" className="campo" /></div>
          <div><label className="rotulo">Tipo de acesso</label>
            <select name="tipo" className="campo" defaultValue={opcoesPerfil.find((o) => o.v.startsWith("cliente:"))?.v}>{opcoesPerfil.map((o) => <option key={o.v} value={o.v}>{o.r}</option>)}</select>
          </div>
          {s.nivel === "franqueadora" && franquiasAtivas() && (
            <div><label className="rotulo">Franqueado (se nível franqueado)</label>
              <select name="franqueadoId" className="campo"><option value="">—</option>{d.franqueados.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
            </div>
          )}
          <div><label className="rotulo">Cliente (para acessos de cliente)</label>
            <select name="clienteId" className="campo"><option value="">—</option>{d.clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          </div>
          {s.nivel === "franqueadora" && (
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="senha_definitiva" defaultChecked className="mt-1 accent-vigia" />
              <span>Senha definitiva para acessos de cliente <span className="block text-xs text-suave">O cliente entra com o usuário e a senha definidos aqui, sem troca obrigatória.</span></span>
            </label>
          )}
          <div className="flex items-end"><button className="btn-primario w-full">Criar acesso</button></div>
        </form>
        <ul className="mt-3 space-y-1 text-xs text-suave">
          {ehAdminSistema(s) && <li><b className="text-vigia">Administrador do Sistema:</b> tudo, inclusive gateways de pagamento, APIs, fontes de dados e regras de consulta.</li>}
          {ehAdminSistema(s) && <li><b className="text-vigia">Gestor do Vigia Placa:</b> clientes, placas, planos, financeiro e aprovação das solicitações, sem a parte técnica.</li>}
          <li><b className="text-vigia">Cliente Responsável:</b> vê e age nas próprias placas e multas (paga, indica condutor, solicita inclusão e remoção de placas).</li>
          <li><b className="text-vigia">Cliente Visualizador:</b> só vê.</li>
          <li>A pessoa entra com a senha provisória e cria uma senha própria no primeiro acesso. Repasse a senha por um canal seguro.</li>
        </ul>
      </Card>}
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
                  <td className="text-xs">{rotuloPerfil(u.nivel, u.perfil)}</td>
                  <td className="text-xs">{!u.ativo ? "Desativado" : u.trocar_senha ? "Senha provisória" : "Ativo"}{u.dois_fatores ? " · 2FA" : ""}</td>
                  <td>
                    {podeAlterar(u) && (
                      <form action={redefinirSenhaUsuario} className="flex gap-1">
                        <input type="hidden" name="id" value={u.id} />
                        <input name="senha" type="password" minLength={10} required placeholder="nova provisória" autoComplete="new-password" className="campo w-36 py-1 text-xs" />
                        <button className="btn-leve btn-sm">OK</button>
                      </form>
                    )}
                  </td>
                  <td className="text-right">
                    {podeAlterar(u) && (
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
