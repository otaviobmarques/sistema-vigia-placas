import Link from "next/link";
import { exigirSessao, noEscopo } from "@/lib/auth";
import { facaHoje } from "@/lib/services/multas";
import { hojeISO } from "@/lib/domain/dates";
import { brl } from "@/lib/domain/money";
import { Cabecalho, Card, Mensagem, Numero, Vazio } from "@/components/ui";
import { entrarCliente } from "../../actions";

export const metadata = { title: "Carteira" };

export default async function Carteira({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; erro?: string }> }) {
  const s = await exigirSessao(["franqueado", "franqueadora"]);
  const sp = await searchParams;
  const mes = hojeISO().slice(0, 7);
  const d = await noEscopo(s, async (db) => {
    const clientes = await db.q(
      `select c.id, c.nome, c.documento, c.segmento, pl.nome as plano, pl.preco_placa, f.nome as franqueado, f.repasse_mensalidade_bps, f.repasse_saving_bps,
         (select count(*) from placas p where p.cliente_id = c.id and p.status <> 'pausada') as placas,
         (select count(*) from multas m where m.cliente_id = c.id and m.estado not in ('paga','cancelada')) as abertas,
         (select coalesce(sum(valor),0) from economias e where e.cliente_id = c.id and e.mes = $1 and e.comprovada) as economia_mes,
         (select max(a.data) from auditoria a where a.cliente_id = c.id) as ultima_acao
       from clientes c join planos pl on pl.id = c.plano_id left join franqueados f on f.id = c.franqueado_id
       where c.ativo ${sp.q ? "and (c.nome ilike $2 or c.documento ilike $2 or exists (select 1 from placas p where p.cliente_id = c.id and p.placa ilike $2))" : ""}`,
      sp.q ? [mes, `%${sp.q.replace(/[^\w\s]/g, "")}%`] : [mes],
    );
    const acoes = await facaHoje(db, null, 1000);
    const conv = await db.one("select coalesce(sum(split_franqueado),0) as v from pagamentos where to_char(pago_em,'YYYY-MM') = $1", [mes]);
    return { clientes, acoes, conv: Number(conv?.v ?? 0) };
  });
  const prazos = (cid: string) => d.acoes.filter((a) => a.multa.cliente_id === cid && a.dias <= 7).length;
  const lista = [...d.clientes].sort((a, b) => prazos(b.id) - prazos(a.id) || Number(b.abertas) - Number(a.abertas));
  const placas = d.clientes.reduce((a, c) => a + Number(c.placas), 0);
  const prazos7 = d.acoes.filter((a) => a.dias <= 7).length;
  const comissao =
    d.clientes.reduce((a, c) => a + Math.round((Number(c.placas) * (c.preco_placa ?? 0) * (c.repasse_mensalidade_bps ?? 0)) / 10000) + Math.round((Number(c.economia_mes) * 2000 * (c.repasse_saving_bps ?? 0)) / 1e8), 0) + d.conv;
  const emRisco = d.clientes.filter((c) => Number(c.placas) > 0 && Number(c.economia_mes) === 0 && Number(c.abertas) === 0).length;

  return (
    <>
      <Cabecalho
        sobre={s.nivel === "franqueado" ? "Franqueado" : "Franqueadora · todos os clientes"}
        titulo="Sua carteira"
        acoes={<><Link href="/placas/importar" className="btn-contorno">Importar planilha</Link><Link href="/clientes/novo" className="btn-primario">+ Novo cliente</Link></>}
      />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Clientes ativos" valor={d.clientes.length} detalhe={emRisco ? `${emRisco} sem movimento (risco de cancelamento)` : undefined} />
        <Numero rotulo="Placas vigiadas" valor={placas} />
        <Numero rotulo="Prazos em 7 dias" tom={prazos7 ? "rec" : "normal"} valor={prazos7} />
        <Numero destaque rotulo="Sua comissão no mês (estimada)" valor={brl(comissao)} detalhe="Mensalidades + saving + conveniência" />
      </div>
      <Card titulo="Clientes" acoes={<form><input name="q" defaultValue={sp.q} placeholder="Nome, CPF/CNPJ ou placa" className="campo w-64" /></form>}>
        {lista.length === 0 ? <Vazio>Nenhum cliente encontrado.</Vazio> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="tabela min-w-[720px]">
              <thead><tr><th>Cliente</th><th>Placas</th><th>Multas em aberto</th><th>Prazos em 7 dias</th><th>Economia no mês</th><th /></tr></thead>
              <tbody>
                {lista.map((c) => {
                  const p = prazos(c.id);
                  return (
                    <tr key={c.id}>
                      <td><div className="font-semibold">{c.nome}</div><div className="text-xs text-suave">{c.segmento} · plano {c.plano}{s.nivel === "franqueadora" ? ` · ${c.franqueado ?? "direto"}` : ""}</div></td>
                      <td>{c.placas}</td><td>{c.abertas}</td>
                      <td>{p ? <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold ${p >= 3 ? "bg-[#b3261e] text-white" : "bg-ambar text-vigia"}`}>{p}</span> : "—"}</td>
                      <td className={`num ${Number(c.economia_mes) ? "font-semibold text-economia" : "text-suave"}`}>{brl(Number(c.economia_mes))}</td>
                      <td className="text-right">
                        <form action={entrarCliente}><input type="hidden" name="clienteId" value={c.id} /><button className="link text-sm">Abrir</button></form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-suave">Mostrando {lista.length} clientes, ordenados pelos prazos mais urgentes.</p>
      </Card>
    </>
  );
}
