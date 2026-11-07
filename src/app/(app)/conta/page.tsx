import { exigirSessao } from "@/lib/auth";
import { Aviso, Cabecalho, Card, Mensagem } from "@/components/ui";
import { trocarSenha } from "../../actions";
import { Notificacoes } from "@/components/notificacoes";

export const metadata = { title: "Minha conta" };

export default async function Conta({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; primeiro?: string }> }) {
  const s = await exigirSessao();
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-lg">
      <Cabecalho titulo="Minha conta" sub={`${s.nome} · ${s.email}`} />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      {s.trocarSenha && <div className="mb-4"><Aviso tom="ambar">Sua senha é provisória. Crie uma senha sua para continuar.</Aviso></div>}
      <Card titulo="Notificações no celular e no computador" className="mb-6">
        <Notificacoes />
      </Card>
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
