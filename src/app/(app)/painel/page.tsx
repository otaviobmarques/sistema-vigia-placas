import Link from "next/link";
import { exigirSessao, noEscopo } from "@/lib/auth";
import { hojeISO, nomeMes } from "@/lib/domain/dates";
import { brl } from "@/lib/domain/money";
import { rotuloPerfil } from "@/lib/acesso";
import { Cabecalho, Card, Numero, Vazio } from "@/components/ui";
import { GraficoBarras } from "@/components/grafico-barras";
import { Notificacoes } from "@/components/notificacoes";
import { consultasPorApi, rankingCondutores } from "@/lib/services/relatorios-gestao";

export const metadata = { title: "Dashboard" };

/** Últimos n meses (YYYY-MM), do mais antigo ao atual. */
function ultimosMeses(n: number): string[] {
  const [y, m] = hojeISO().slice(0, 7).split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

export default async function Painel({ searchParams }: { searchParams: Promise<{ todos?: string }> }) {
  const s = await exigirSessao(["franqueadora"]);
  const sp = await searchParams;
  const mes = hojeISO().slice(0, 7);
  const meses = ultimosMeses(6);
  const d = await noEscopo(s, async (db) => ({
    t: (await db.one(
      `select
         (select count(*) from placas where status <> 'pausada') as placas_ativas,
         (select count(*) from placas where status = 'pausada') as placas_pausadas,
         (select count(*) from clientes where ativo) as clientes,
         (select count(*) from multas where estado not in ('paga','cancelada')) as multas_abertas,
         (select coalesce(sum(valor),0) from multas where estado not in ('paga','cancelada')) as valor_aberto,
         (select count(*) from multas where to_char(detectada_em,'YYYY-MM') = $1) as multas_mes,
         (select count(*) from multas) as multas_total,
         (select coalesce(sum(valor),0) from economias where comprovada and mes = $1) as economia_mes,
         (select coalesce(sum(custo),0) from consultas where to_char(data,'YYYY-MM') = $1) as custo_mes,
         (select count(*) from consultas where to_char(data,'YYYY-MM') = $1) as consultas_mes,
         (select count(*) from consultas where to_char(data,'YYYY-MM') = $1 and resultado = 'erro') as erros_mes,
         (select coalesce(sum(taxa),0) from pagamentos where to_char(pago_em,'YYYY-MM') = $1) as conveniencia,
         (select coalesce(sum(preco),0) from pedidos_defesa where to_char(criado_em,'YYYY-MM') = $1) as defesa,
         (select count(*) from solicitacoes_placa where status = 'pendente') as solicitacoes`,
      [mes],
    ))!,
    clientes: await db.q(
      `select c.id, c.nome, pl.nome as plano,
         (select count(*) from placas p where p.cliente_id = c.id and p.status <> 'pausada') as placas,
         coalesce(c.preco_placa_personalizado, pl.preco_placa, 0) as preco,
         coalesce(c.saving_bps_personalizado, pl.saving_bps, cfg.saving_bps) as saving_bps,
         (select coalesce(sum(valor),0) from economias e where e.cliente_id = c.id and e.mes = $1 and e.comprovada) as economia,
         (select coalesce(sum(custo),0) from consultas q where q.cliente_id = c.id and to_char(q.data,'YYYY-MM') = $1) as custo_api,
         (select count(*) from multas m where m.cliente_id = c.id and m.estado not in ('paga','cancelada')) as abertas
       from clientes c join planos pl on pl.id = c.plano_id cross join configuracao cfg where c.ativo`,
      [mes],
    ),
    porMes: await db.q(
      `select m.mes,
         (select coalesce(sum(custo),0) from consultas where to_char(data,'YYYY-MM') = m.mes) as custo,
         (select count(*) from consultas where to_char(data,'YYYY-MM') = m.mes) as consultas,
         (select count(*) from multas where to_char(detectada_em,'YYYY-MM') = m.mes) as multas,
         (select coalesce(sum(valor),0) from economias where comprovada and mes = m.mes) as economia
       from unnest($1::text[]) as m(mes) order by m.mes`,
      [meses],
    ),
    ranking: await rankingCondutores(db, {}, 5),
    apis: await consultasPorApi(db, mes),
    fontes: await db.q(
      `select f.nome, count(q.id) as consultas, count(*) filter (where q.resultado = 'erro') as erros, coalesce(sum(q.custo),0) as custo
       from consultas q join fontes f on f.id = q.fonte_id where to_char(q.data,'YYYY-MM') = $1 group by f.nome order by custo desc`,
      [mes],
    ),
  }));
  const t = d.t;
  type Linha = Record<string, any> & { mensalidade: number; saving: number; total: number; margem: number };
  const linhas: Linha[] = d.clientes.map((c: Record<string, any>): Linha => {
    const mensalidade = Number(c.placas) * Number(c.preco);
    const saving = Math.round((Number(c.economia) * Number(c.saving_bps)) / 10000);
    const total = mensalidade + saving;
    return { ...c, mensalidade, saving, total, margem: total - Number(c.custo_api) };
  }).sort((a, b) => b.total - a.total || Number(b.placas) - Number(a.placas));
  const faturamento = linhas.reduce((a, l) => a + l.total, 0) + Number(t.conveniencia) + Number(t.defesa);
  const custo = Number(t.custo_mes);
  const placas = Number(t.placas_ativas);
  const mostrar = sp.todos ? linhas : linhas.slice(0, 10);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return (
    <>
      <Cabecalho sobre={`${rotuloPerfil(s.nivel, s.perfil)} · ${nomeMes(mes)}`} titulo="Dashboard da operação"
        acoes={Number(t.solicitacoes) ? <Link href="/solicitacoes" className="btn-ambar">{t.solicitacoes} solicitação(ões) de placa</Link> : undefined} />

      <div className="mb-4"><Notificacoes compacto /></div>
      <p className="sobretitulo mb-2">Carteira</p>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Placas gerenciadas" valor={placas} detalhe={`${t.clientes} clientes · ${t.placas_pausadas} pausada(s)`} />
        <Numero rotulo="Multas em aberto" tom={Number(t.multas_abertas) ? "rec" : "normal"} valor={Number(t.multas_abertas)} detalhe={`${brl(Number(t.valor_aberto))} em valor cheio`} />
        <Numero rotulo="Multas detectadas no mês" valor={Number(t.multas_mes)} detalhe={`${t.multas_total} no total`} />
        <Numero tom="economia" rotulo="Economia gerada aos clientes" valor={brl(Number(t.economia_mes))} detalhe="comprovada no mês" />
      </div>

      <p className="sobretitulo mb-2">Números da operação</p>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero destaque rotulo="Faturamento previsto no mês" valor={brl(faturamento)} detalhe="mensalidades + saving + conveniência + defesa" />
        <Numero rotulo="Custo com consultas (API)" valor={brl(custo)} detalhe={`${t.consultas_mes} consultas · ${t.erros_mes} com erro`} />
        <Numero rotulo="Custo de API por placa" valor={brl(placas ? Math.round(custo / placas) : 0)} detalhe="no mês, por placa gerenciada" />
        <Numero tom={faturamento && custo / faturamento > 0.25 ? "rec" : "economia"} rotulo="Custo de API / faturamento" valor={pct(custo, faturamento)} detalhe="meta: até 25%" />
      </div>

      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="sobretitulo">Consultas por API no mês</p>
        <Link href="/gestao/relatorios?tipo=consultas-api" className="link text-xs">Ver por base e por cliente</Link>
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {(["Direct Data", "Infosimples"] as const).map((nome) => {
          const a = d.apis.find((x) => x.provedor === nome) ?? { consultas: 0, ok: 0, erros: 0, custo: 0, placas: 0 };
          return (
            <div key={nome} className="card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold">{nome}</span>
                <span className="num text-xl font-extrabold">{brl(a.custo)}</span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs text-suave">
                <div><b className="num block text-lg text-vigia">{a.consultas}</b>consultas</div>
                <div><b className="num block text-lg text-economia">{a.ok}</b>com sucesso</div>
                <div><b className={`num block text-lg ${a.erros ? "text-rec" : "text-vigia"}`}>{a.erros}</b>com erro</div>
                <div><b className="num block text-lg text-vigia">{brl(a.consultas ? Math.round(a.custo / a.consultas) : 0)}</b>custo médio</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card titulo="Custo com consultas por mês">
          <GraficoBarras rotulo="Custo com consultas por mês" formatar={brl} cor="bg-vigia"
            dados={d.porMes.map((m) => ({ chave: m.mes, legenda: nomeMes(m.mes).split(" de ")[0], valor: Number(m.custo), detalhe: `${m.consultas} consultas` }))} />
        </Card>
        <Card titulo="Multas detectadas por mês">
          <GraficoBarras rotulo="Multas detectadas por mês" formatar={(v) => String(v)} cor="bg-rec"
            dados={d.porMes.map((m) => ({ chave: m.mes, legenda: nomeMes(m.mes).split(" de ")[0], valor: Number(m.multas) }))} />
        </Card>
        <Card titulo="Economia gerada por mês">
          <GraficoBarras rotulo="Economia gerada por mês" formatar={brl} cor="bg-economia"
            dados={d.porMes.map((m) => ({ chave: m.mes, legenda: nomeMes(m.mes).split(" de ")[0], valor: Number(m.economia) }))} />
        </Card>
      </div>

      <Card titulo={sp.todos ? `Faturamento por cliente (${linhas.length})` : "Top 10 clientes por faturamento"} className="mb-6"
        acoes={linhas.length > 10 ? <Link href={sp.todos ? "/painel" : "/painel?todos=1"} className="link text-sm">{sp.todos ? "Ver só o top 10" : `Ver todos os ${linhas.length}`}</Link> : undefined}>
        {linhas.length === 0 ? <Vazio>Nenhum cliente ainda.</Vazio> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="tabela min-w-[880px]">
              <thead><tr><th>#</th><th>Cliente</th><th className="!text-right">Placas</th><th className="!text-right">Mensalidade</th><th className="!text-right">Saving</th><th className="!text-right">Faturamento</th><th className="!text-right">Custo de API</th><th className="!text-right">Margem</th><th className="!text-right">Multas abertas</th></tr></thead>
              <tbody>
                {mostrar.map((l, i) => (
                  <tr key={l.id}>
                    <td className="text-xs text-suave">{i + 1}</td>
                    <td><div className="font-semibold">{l.nome}</div><div className="text-xs text-suave">plano {l.plano} · {brl(Number(l.preco))}/placa</div></td>
                    <td className="num text-right">{l.placas}</td>
                    <td className="num text-right">{brl(l.mensalidade)}</td>
                    <td className="num text-right">{brl(l.saving)}</td>
                    <td className="num text-right font-bold">{brl(l.total)}</td>
                    <td className="num text-right text-suave">{brl(Number(l.custo_api))}</td>
                    <td className={`num text-right font-semibold ${l.margem < 0 ? "text-rec" : "text-economia"}`}>{brl(l.margem)}</td>
                    <td className="num text-right">{l.abertas}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-bold"><td /><td>Total</td><td className="num text-right">{placas}</td><td className="num text-right">{brl(linhas.reduce((a, l) => a + l.mensalidade, 0))}</td><td className="num text-right">{brl(linhas.reduce((a, l) => a + l.saving, 0))}</td><td className="num text-right">{brl(linhas.reduce((a, l) => a + l.total, 0))}</td><td className="num text-right">{brl(custo)}</td><td className="num text-right">{brl(linhas.reduce((a, l) => a + l.margem, 0))}</td><td /></tr></tfoot>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-suave">Prévia do mês corrente: mensalidade = placas ativas × preço do cliente (personalizado ou do plano); saving = % sobre a economia já comprovada no mês. A fatura fechada fica em Financeiro.</p>
      </Card>

      <Card titulo="Condutores com mais multas (12 meses)" className="mb-6" acoes={<Link href="/gestao/relatorios?tipo=ranking" className="link text-sm">Ranking completo</Link>}>
        {d.ranking.length === 0 ? <Vazio>Nenhuma multa indicada a condutores ainda.</Vazio> : (
          <ol className="divide-y divide-borda">
            {d.ranking.map((r: any) => (
              <li key={`${r.condutor}-${r.cliente}`} className="flex items-center gap-3 py-2.5">
                <span className={`num flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-extrabold ${r.posicao === 1 ? "bg-rec text-white" : "bg-nevoa text-vigia"}`}>{r.posicao}</span>
                <div className="min-w-0 flex-1"><div className="truncate font-semibold">{r.condutor}</div><div className="truncate text-xs text-suave">{r.cliente}</div></div>
                <div className="text-right text-sm"><b className="num">{r.indicadas}</b> multa(s) · <span className="num">{r.pontos}</span> pts<div className="text-xs text-suave">{brl(r.valor)}{r.nas_placas ? ` · ${r.nas_placas} nas placas que dirige` : ""}</div></div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card titulo="Custo por fonte de dados no mês">
        {d.fontes.length === 0 ? <Vazio>Nenhuma consulta neste mês.</Vazio> : (
          <div className="-mx-5 overflow-x-auto"><table className="tabela min-w-[520px]">
            <thead><tr><th>Fonte</th><th className="!text-right">Consultas</th><th className="!text-right">Com erro</th><th className="!text-right">Custo</th><th className="!text-right">Custo médio</th></tr></thead>
            <tbody>{d.fontes.map((f) => (
              <tr key={f.nome}><td>{f.nome}</td><td className="num text-right">{f.consultas}</td><td className="num text-right">{f.erros}</td><td className="num text-right font-semibold">{brl(Number(f.custo))}</td><td className="num text-right text-suave">{brl(Number(f.consultas) ? Math.round(Number(f.custo) / Number(f.consultas)) : 0)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
