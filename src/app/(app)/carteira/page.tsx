import Link from "next/link";
import { exigirSessao, noEscopo } from "@/lib/auth";
import { facaHoje } from "@/lib/services/multas";
import { hojeISO } from "@/lib/domain/dates";
import { brl } from "@/lib/domain/money";
import { Cabecalho, Card, Mensagem, Numero, Vazio } from "@/components/ui";
import { entrarCliente, salvarPrecoCliente } from "../../actions";
import { franquiasAtivas } from "@/lib/acesso";

export const metadata = { title: "Carteira" };

export default async function Carteira({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; erro?: string }> }) {
  const s = await exigirSessao(["franqueado", "franqueadora"]);
  const sp = await searchParams;
  const mes = hojeISO().slice(0, 7);
  const d = await noEscopo(s, async (db) => {
    const clientes = await db.q(
      `select c.id, c.nome, c.documento, c.segmento, pl.nome as plano, coalesce(c.preco_placa_personalizado, pl.preco_placa) as preco_placa, c.preco_placa_personalizado, c.saving_bps_personalizado, pl.saving_bps as plano_saving_bps, f.nome as franqueado, f.repasse_mensalidade_bps, f.repasse_saving_bps,
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
        sobre={s.nivel === "franqueado" ? "Franqueado" : "Vigia Placa · todos os clientes"}
        titulo={s.nivel === "franqueado" ? "Sua carteira" : "Clientes"}
        acoes={<><Link href="/placas/importar" className="btn-contorno">Importar planilha</Link><Link href="/clientes/novo" className="btn-primario">+ Novo cliente</Link></>}
      />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Clientes ativos" valor={d.clientes.length} detalhe={emRisco ? `${emRisco} sem movimento (risco de cancelamento)` : undefined} />
        <Numero rotulo="Placas vigiadas" valor={placas} />
        <Numero rotulo="Prazos em 7 dias" tom={prazos7 ? "rec" : "normal"} valor={prazos7} />
        {s.nivel === "franqueado"
          ? <Numero destaque rotulo="Sua comissão no mês (estimada)" valor={brl(comissao)} detalhe="Mensalidades + saving + conveniência" />
          : <Numero destaque rotulo="Mensalidades no mês" valor={brl(d.clientes.reduce((a, c) => a + Number(c.placas) * (c.preco_placa ?? 0), 0))} detalhe="placas ativas × preço de cada cliente" />}
      </div>
      <Card titulo="Clientes" acoes={<form><input name="q" defaultValue={sp.q} placeholder="Nome, CPF/CNPJ ou placa" className="campo w-64" /></form>}>
        {lista.length === 0 ? <Vazio>Nenhum cliente encontrado.</Vazio> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="tabela min-w-[900px]">
              <thead><tr><th>Cliente</th><th>Preço</th><th>Placas</th><th>Multas em aberto</th><th>Prazos em 7 dias</th><th>Economia no mês</th><th /></tr></thead>
              <tbody>
                {lista.map((c) => {
                  const p = prazos(c.id);
                  return (
                    <tr key={c.id}>
                      <td><div className="font-semibold">{c.nome}</div><div className="text-xs text-suave">{c.segmento} · plano {c.plano}{s.nivel === "franqueadora" && franquiasAtivas() ? ` · ${c.franqueado ?? "direto"}` : ""}</div></td>
                      <td className="whitespace-nowrap text-xs">
                        <b className="num">{c.preco_placa ? brl(c.preco_placa) : "[DEFINIR]"}</b>/placa
                        <div className="text-suave">saving {((c.saving_bps_personalizado ?? c.plano_saving_bps ?? 2000) / 100).toLocaleString("pt-BR")}%{c.preco_placa_personalizado !== null || c.saving_bps_personalizado !== null ? <span className="ml-1 rounded bg-ambar-100 px-1 font-semibold text-[#6b4700]">personalizado</span> : ""}</div>
                        {s.nivel === "franqueadora" && (
                          <details className="relative">
                            <summary className="link cursor-pointer list-none text-xs">Alterar preço</summary>
                            <form action={salvarPrecoCliente} className="absolute left-0 z-10 mt-1 w-64 space-y-2 rounded-xl border border-borda bg-white p-3 shadow-lg">
                              <input type="hidden" name="clienteId" value={c.id} />
                              <div><label className="rotulo">Preço por placa/mês (R$)</label><input name="preco_personalizado" defaultValue={c.preco_placa_personalizado !== null ? (c.preco_placa_personalizado / 100).toFixed(2).replace(".", ",") : ""} placeholder={`plano: ${c.plano}`} className="campo py-1.5" /></div>
                              <div><label className="rotulo">Saving (%)</label><input name="saving_personalizado" defaultValue={c.saving_bps_personalizado !== null ? String(c.saving_bps_personalizado / 100) : ""} placeholder="do plano" className="campo py-1.5" /></div>
                              <p className="text-[11px] text-suave">Em branco = valor do plano. Vale na próxima fatura.</p>
                              <button className="btn-primario btn-sm w-full">Salvar</button>
                            </form>
                          </details>
                        )}
                      </td>
                      <td>{c.placas}</td><td>{c.abertas}</td>
                      <td>{p ? <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold ${p >= 3 ? "bg-[#b3261e] text-white" : "bg-ambar text-vigia"}`}>{p}</span> : "—"}</td>
                      <td className={`num ${Number(c.economia_mes) ? "font-semibold text-economia" : "text-suave"}`}>{brl(Number(c.economia_mes))}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-3 whitespace-nowrap text-sm">
                          <form action={entrarCliente}><input type="hidden" name="clienteId" value={c.id} /><input type="hidden" name="destino" value="/placas" /><button className="link">+ Placa</button></form>
                          <form action={entrarCliente}><input type="hidden" name="clienteId" value={c.id} /><input type="hidden" name="destino" value="/placas/importar" /><button className="link">Importar</button></form>
                          <form action={entrarCliente}><input type="hidden" name="clienteId" value={c.id} /><button className="link">Abrir</button></form>
                        </div>
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
