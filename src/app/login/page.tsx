import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth";
import { sistema } from "@/lib/db";
import { Logo, Vigi } from "@/components/marca";
import { FormLogin } from "./form";

export const metadata = { title: "Entrar" };

export default async function Login() {
  if (await sessaoAtual()) redirect("/");
  const semAdmin = Number((await sistema((db) => db.one("select count(*) as n from usuarios where nivel = 'franqueadora'")))?.n) === 0;
  if (semAdmin) redirect("/primeiro-acesso");
  const demo = !process.env.DATABASE_URL;
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between bg-vigia p-12 text-white lg:flex">
        <Logo negativo tamanho={30} />
        <div>
          <div className="inline-block rounded-[2rem] bg-white p-3"><Vigi pose="ola" size={200} /></div>
          <h1 className="mt-6 text-4xl font-extrabold leading-tight">
            Olá! Eu sou o Vigi.
            <br />
            <span className="text-ambar">A multa chega antes. O desconto também.</span>
          </h1>
          <p className="mt-4 max-w-md text-white/75">
            Eu vigio cada placa, aviso antes do prazo e mostro quanto dá para economizar. Tudo pago com um Pix só.
          </p>
        </div>
        <p className="text-xs text-white/50">Master Laudo / Scale360</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-4 lg:hidden">
            <Vigi pose="ola" size={120} />
            <Logo tamanho={26} />
          </div>
          <h2 className="text-2xl font-extrabold">Entrar</h2>
          <p className="mb-6 mt-1 text-sm text-suave">Acesse sua conta do Vigia Placa.</p>
          <FormLogin />
          {demo && (
            <div className="mt-8 rounded-xl border border-borda bg-white p-4 text-xs text-suave">
              <div className="mb-2 font-semibold text-vigia">Contas de demonstração · senha vigia123</div>
              <ul className="space-y-1">
                <li><b className="text-vigia">carla@transportadora.exemplo</b> · cliente (frota PJ)</li>
                <li><b className="text-vigia">joao@exemplo.com.br</b> · cliente (pessoa física)</li>
                <li><b className="text-vigia">franqueado@exemplo.com.br</b> · franqueado</li>
                <li><b className="text-vigia">admin@vigiaplaca.com.br</b> · franqueadora</li>
              </ul>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
