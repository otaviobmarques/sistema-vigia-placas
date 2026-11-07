import Link from "next/link";
import { exigirCliente, noEscopo } from "@/lib/auth";
import { multasAbertas, regra } from "@/lib/services/multas";
import { melhorValorHoje, pagavel, valoresMulta } from "@/lib/domain/ctb";
import { hojeISO } from "@/lib/domain/dates";
import { brl } from "@/lib/domain/money";
import { Card, Mensagem } from "@/components/ui";
import { Vigi } from "@/components/marca";

export const metadata = { title: "Bem-vindo" };

export default async function BemVindo({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const s = await exigirCliente();
  const sp = await searchParams;
  const hoje = hojeISO();
  const d = await noEscopo(s, async (db) => ({
    multas: await multasAbertas(db, s.clienteId),
    placas: await db.one("select count(*) as n, count(*) filter (where sne_adesao_em is null) as sem_sne from placas where cliente_id = $1", [s.clienteId]),
  }));
  let mesa = 0, nic = 0;
  for (const m of d.multas) {
    if (pagavel(m.estado)) mesa += m.valor - melhorValorHoje(regra(m), hoje).valor;
    if (m.tipo_proprietario === "PJ" && !m.condutor_id) nic += valoresMulta(regra(m)).nic;
  }
  return (
    <div className="mx-auto max-w-3xl">
      <Mensagem erro={sp.erro} />
      <section className="mb-6 flex flex-wrap items-center gap-6 rounded-2xl bg-vigia p-6 text-white">
        <div className="rounded-3xl bg-white p-2"><Vigi pose={d.multas.length ? "alerta" : "economia"} size={130} /></div>
        <div className="flex-1">
          <div className="text-sm text-white/75">Primeira varredura de {s.clienteNome}</div>
          <h1 className="text-3xl font-extrabold">{d.multas.length ? `Achei ${d.multas.length} multa(s) em aberto.` : "Nenhuma multa em aberto. Ótimo começo!"}</h1>
          <div className="mt-2 text-sm text-white/75">Dinheiro na mesa (descontos ainda disponíveis)</div>
          <div className="num text-4xl font-extrabold text-ambar">{brl(mesa)}</div>
          {nic > 0 && <div className="mt-1 text-sm">+ até <b className="text-ambar">{brl(nic)}</b> em multas NIC que dá para evitar indicando o condutor.</div>}
        </div>
      </section>
      <Card titulo="Checklist do primeiro dia">
        <ol className="space-y-3 text-sm">
          <li>☐ <b>Aderir ao SNE</b> com todas as placas ({d.placas?.sem_sne} sem adesão). Só infrações depois da adesão ganham 40%. Informe a data em <Link className="link" href="/placas">Placas</Link>.</li>
          <li>☐ <b>Cadastrar os condutores</b> para indicar em 1 clique. <Link className="link" href="/condutores">Condutores</Link></li>
          <li>☐ <b>Conferir alertas</b> (WhatsApp e e-mail, D-15, D-7, D-3, D-1). <Link className="link" href="/configuracoes?aba=alertas">Alertas</Link></li>
          <li>☐ <b>Resolver o Faça hoje.</b> <Link className="link" href="/hoje">Ir para o Faça hoje</Link></li>
        </ol>
      </Card>
    </div>
  );
}
