import Link from "next/link";
import { exigirCliente, noEscopo } from "@/lib/auth";
import { calcularFatura } from "@/lib/services/faturamento";
import { hojeISO, nomeMes } from "@/lib/domain/dates";
import { brl } from "@/lib/domain/money";
import { Aviso, Card, Vazio } from "@/components/ui";
import { Vigi } from "@/components/marca";
import { BotaoImprimir } from "@/components/imprimir";

export const metadata = { title: "Extrato de Economia" };
const TIPO: Record<string, string> = { desconto: "Desconto obtido", nic_evitada: "Multa NIC evitada", cancelamento: "Multa cancelada" };

export default async function Extrato({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const s = await exigirCliente();
  const sp = await searchParams;
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : hojeISO().slice(0, 7);
  const d = await noEscopo(s, async (db) => ({
    linhas: await db.q("select e.*, m.auto_infracao from economias e join multas m on m.id = e.multa_id where e.cliente_id = $1 and e.mes = $2 order by e.comprovada desc, e.valor desc", [s.clienteId, mes]),
    total: await db.one("select coalesce(sum(valor),0) as v, min(mes) as desde from economias where cliente_id = $1 and comprovada", [s.clienteId]),
    meses: await db.q<{ mes: string }>("select distinct mes from economias where cliente_id = $1 order by mes desc", [s.clienteId]),
    fatura: await calcularFatura(db, s.clienteId, mes),
  }));
  const comprovadas = d.linhas.filter((l) => l.comprovada);
  const estimadas = d.linhas.filter((l) => !l.comprovada);
  const soma = (t: string) => comprovadas.filter((l) => l.tipo === t).reduce((a, l) => a + l.valor, 0);
  const totalMes = comprovadas.reduce((a, l) => a + l.valor, 0);
  const f = d.fatura;
  const roi = f.mensalidades ? totalMes / (f.mensalidades + f.saving) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-vigia p-6 text-white">
        <div>
          <div className="text-sm capitalize text-white/75">Extrato de Economia · {nomeMes(mes)}</div>
          <div className="num text-4xl font-extrabold text-ambar sm:text-5xl">{brl(totalMes)}</div>
          <div className="text-sm text-white/75">economizados com descontos e multas NIC evitadas{d.total?.desde ? ` · desde ${nomeMes(d.total.desde)}: ${brl(Number(d.total.v))}` : ""}</div>
        </div>
        <div className="rounded-3xl bg-white p-2"><Vigi pose="economia" size={110} /></div>
      </section>

      <div className="nao-imprimir mb-4 flex flex-wrap items-center justify-between gap-2">
        <form className="flex gap-2">
          <select name="mes" defaultValue={mes} className="campo w-48">
            {[...new Set([hojeISO().slice(0, 7), ...d.meses.map((m) => m.mes)])].map((m) => <option key={m} value={m}>{nomeMes(m)}</option>)}
          </select>
          <button className="btn-contorno">Ver mês</button>
        </form>
        <BotaoImprimir />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs text-suave">Descontos</div><div className="num text-2xl font-extrabold">{brl(soma("desconto"))}</div></div>
        <div className="card p-4"><div className="text-xs text-suave">Multas NIC evitadas</div><div className="num text-2xl font-extrabold">{brl(soma("nic_evitada"))}</div></div>
        <div className="card p-4"><div className="text-xs text-suave">Cancelamentos</div><div className="num text-2xl font-extrabold">{brl(soma("cancelamento"))}</div></div>
      </div>

      <Card titulo="Multa a multa">
        {comprovadas.length === 0 ? <Vazio>Nenhuma economia comprovada neste mês ainda.</Vazio> : (
          <ul className="divide-y divide-borda">
            {comprovadas.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-3">
                <div><div className="text-sm font-semibold">{l.descricao}</div><div className="text-xs text-suave">{TIPO[l.tipo]} · auto {l.auto_infracao} · <Link className="underline" href={`/multas/${l.multa_id}`}>ver multa</Link></div></div>
                <div className="num font-bold text-economia">+ {brl(l.valor)}</div>
              </li>
            ))}
          </ul>
        )}
        {estimadas.length > 0 && (
          <>
            <h3 className="mb-2 mt-6 text-sm font-bold text-suave">Estimadas (ainda sem comprovação, não entram no saving)</h3>
            <ul className="divide-y divide-borda opacity-75">
              {estimadas.map((l) => (
                <li key={l.id} className="flex justify-between py-2 text-sm"><span>{l.descricao} · {TIPO[l.tipo]}</span><span className="num">{brl(l.valor)}</span></li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card titulo="Como fica a sua fatura deste mês" className="mt-6">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-suave">Mensalidade ({f.placas} placas)</dt><dd className="num">{brl(f.mensalidades)}</dd></div>
          <div className="flex justify-between"><dt className="text-suave">Saving: {(f.savingBps / 100).toLocaleString("pt-BR")}% × {brl(f.baseSaving)} comprovados{f.tetoAplicado ? " (teto aplicado)" : ""}</dt><dd className="num">{brl(f.saving)}</dd></div>
          {f.defesa > 0 && <div className="flex justify-between"><dt className="text-suave">Defesas contratadas</dt><dd className="num">{brl(f.defesa)}</dd></div>}
          <div className="flex justify-between border-t border-borda pt-1.5 font-semibold"><dt>Total previsto</dt><dd className="num">{brl(f.total)}</dd></div>
          {roi !== null && <div className="flex justify-between font-semibold text-economia"><dt>Para cada R$ 1 pago, você economizou</dt><dd className="num">{brl(Math.round(roi * 100))}</dd></div>}
        </dl>
      </Card>

      <div className="mt-6"><Aviso tom="economia">Só entra aqui o que foi comprovado por fonte oficial ou comprovante de pagamento. Valores estimados nunca são cobrados. Você vê o cálculo linha a linha antes de a fatura ser emitida.</Aviso></div>
    </div>
  );
}
