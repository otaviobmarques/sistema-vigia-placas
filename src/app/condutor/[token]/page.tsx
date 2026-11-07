import { notFound } from "next/navigation";
import { sistema } from "@/lib/db";
import { SELECT_MULTA, type MultaRow } from "@/lib/services/multas";
import { prazoIndicacao, GRAVIDADES } from "@/lib/domain/ctb";
import { dataBR } from "@/lib/domain/dates";
import { Logo, Placa, Vigi } from "@/components/marca";
import { Mensagem } from "@/components/ui";
import { aceitarIndicacaoAction } from "../../actions";

export const metadata = { title: "Aceitar indicação", robots: { index: false } };

export default async function AceiteCondutor({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!/^[\w-]{20,40}$/.test(token)) notFound();
  const m = await sistema((db) => db.one<MultaRow>(`${SELECT_MULTA} where m.indicacao_token = $1`, [token]));
  if (!m) notFound();
  const aceita = m.indicacao_status !== "enviada";
  return (
    <main className="mx-auto min-h-screen max-w-md p-5">
      <div className="mb-6 flex justify-center"><Logo tamanho={20} /></div>
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <div className="card p-5 text-center">
        <div className="flex justify-center"><Vigi pose={aceita ? "economia" : "alerta"} size={110} /></div>
        <p className="mt-2 text-sm text-suave">Olá, <b className="text-vigia">{m.condutor_nome}</b>! {m.cliente_nome} indicou você como condutor nesta multa.</p>
        <div className="my-4 flex justify-center"><Placa placa={m.placa} tamanho="lg" /></div>
        <h1 className="text-xl font-extrabold">{m.descricao}</h1>
        <p className="text-sm text-suave">{m.orgao_nome} · {dataBR(m.data_infracao)}{m.hora ? ` às ${m.hora}` : ""} · {m.local}</p>
        <p className="mt-2 text-sm">{GRAVIDADES[m.gravidade].rotulo} · <b>{m.pontos} pontos</b> na sua CNH</p>
      </div>
      {aceita ? (
        <p className="mt-6 text-center text-sm text-economia">Indicação já aceita. Obrigado!</p>
      ) : (
        <form action={aceitarIndicacaoAction} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={token} />
          <div><label className="rotulo">Foto da CNH (frente)</label><input type="file" name="cnh" accept="image/*,application/pdf" capture="environment" className="block w-full rounded-xl border border-dashed border-borda bg-white p-4 text-sm" /></div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="confirmo" className="mt-1 accent-vigia" />
            <span>Confirmo que eu dirigia o veículo nesta data e aceito a indicação como condutor responsável. Prazo: {dataBR(prazoIndicacao(m.notificada_em))}.</span>
          </label>
          <button className="btn-primario w-full">Aceitar indicação</button>
        </form>
      )}
    </main>
  );
}
