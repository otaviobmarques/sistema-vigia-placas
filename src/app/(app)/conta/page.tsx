import { exigirSessao } from "@/lib/auth";
import { Aviso, Cabecalho, Card, Mensagem } from "@/components/ui";
import { trocarSenha, salvarMeuGov } from "../../actions";
import { sistema } from "@/lib/db";
import { Notificacoes } from "@/components/notificacoes";

export const metadata = { title: "Minha conta" };

export default async function Conta({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; primeiro?: string }> }) {
  const s = await exigirSessao();
  const sp = await searchParams;
  // Equipe da Vigia Placa: quem recebe procuração dos clientes cadastra aqui o próprio gov.br.
  const equipe = s.nivel === "franqueadora" && ["admin", "gestor"].includes(s.perfil);
  const gov = equipe
    ? await sistema((db) => db.one<{ gov_cpf: string | null; tem_senha: boolean; clientes: number }>(
        `select u.gov_cpf, (u.gov_senha_cifrada is not null) as tem_senha,
                (select count(*)::int from clientes c where c.procuracao_gov and c.procurador_usuario_id = u.id and c.excluido_em is null) as clientes
           from usuarios u where u.id = $1`, [s.usuarioId]))
    : null;
  return (
    <div className="mx-auto max-w-lg">
      <Cabecalho titulo="Minha conta" sub={`${s.nome} · ${s.email}`} />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      {s.trocarSenha && <div className="mb-4"><Aviso tom="ambar">Sua senha é provisória. Crie uma senha sua para continuar.</Aviso></div>}
      <Card titulo="Notificações no celular e no computador" className="mb-6">
        <Notificacoes />
      </Card>
      {equipe && (
        <Card titulo="Procurador gov.br" className="mb-6">
          <p className="mb-3 text-sm text-suave">
            Se os clientes dão procuração no gov.br para você, cadastre aqui o seu acesso. O Vigia Placa entra com ele para puxar multas e notificações do SNE e as multas da ANTT de cada cliente.
            {gov?.gov_cpf ? <> <b className="text-tinta">Cadastrado: CPF {gov.gov_cpf}{gov.tem_senha ? "" : " (falta a senha)"} · {gov.clientes} cliente(s) com procuração para você.</b></> : null}
          </p>
          <form action={salvarMeuGov} className="space-y-3">
            <div><label className="rotulo">Seu CPF (login gov.br)</label><input name="gov_cpf" defaultValue={gov?.gov_cpf ?? ""} inputMode="numeric" autoComplete="off" className="campo" /></div>
            <div><label className="rotulo">Sua senha gov.br</label><input name="gov_senha" type="password" autoComplete="new-password" placeholder={gov?.tem_senha ? "•••••• (guardada; digite para trocar)" : ""} className="campo" /></div>
            <button className="btn-primario w-full">Salvar meu acesso de procurador</button>
          </form>
          <p className="mt-2 text-[11px] text-suave">🔒 A senha fica guardada criptografada e não aparece de novo. Para deixar de ser procurador, apague o CPF e salve. Conta gov.br com verificação em duas etapas pode bloquear a consulta automática.</p>
        </Card>
      )}
      <Card titulo="Trocar senha">
        <form action={trocarSenha} className="space-y-4">
          <div><label className="rotulo">Senha atual</label><input name="atual" type="password" required autoComplete="current-password" className="campo" /></div>
          <div><label className="rotulo">Nova senha (mínimo 10 caracteres)</label><input name="nova" type="password" minLength={10} required autoComplete="new-password" className="campo" /></div>
          <div><label className="rotulo">Repita a nova senha</label><input name="repete" type="password" minLength={10} required autoComplete="new-password" className="campo" /></div>
          <button className="btn-primario w-full">Salvar nova senha</button>
        </form>
      </Card>
    </div>
  );
}
