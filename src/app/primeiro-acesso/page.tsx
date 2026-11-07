import { redirect } from "next/navigation";
import { sistema } from "@/lib/db";
import { Logo, Vigi } from "@/components/marca";
import { Mensagem } from "@/components/ui";
import { criarPrimeiroAdmin } from "../actions";

export const metadata = { title: "Primeiro acesso", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Só existe enquanto não há nenhum administrador da franqueadora. */
export default async function PrimeiroAcesso({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const n = await sistema((db) => db.one("select count(*) as n from usuarios where nivel = 'franqueadora'"));
  if (Number(n?.n) > 0) redirect("/login");
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="mb-6 flex flex-col items-center gap-3"><Vigi pose="ola" size={110} /><Logo tamanho={22} /></div>
      <h1 className="text-2xl font-extrabold">Primeiro acesso</h1>
      <p className="mb-6 mt-1 text-sm text-suave">Crie o administrador da franqueadora. Esta tela some assim que ele existir.</p>
      <Mensagem erro={sp.erro} />
      <form action={criarPrimeiroAdmin} className="space-y-4">
        <div><label className="rotulo">Nome</label><input name="nome" required className="campo" /></div>
        <div><label className="rotulo">E-mail</label><input name="email" type="email" required className="campo" /></div>
        <div><label className="rotulo">Senha (mínimo 10 caracteres)</label><input name="senha" type="password" minLength={10} required className="campo" /></div>
        <button className="btn-primario w-full">Criar administrador</button>
      </form>
    </main>
  );
}
