import Link from "next/link";
import { exigirSessao, noEscopo } from "@/lib/auth";
import { hojeISO } from "@/lib/domain/dates";
import { Cabecalho, Card } from "@/components/ui";
import { TabelaRelatorio } from "@/components/tabela-relatorio";
import { ehRelatorio, gerarRelatorioGestao, PERIODO_DO_RELATORIO, RELATORIOS, type TipoRelatorio } from "@/lib/services/relatorios-gestao";
import { lerPeriodo, textoPeriodo } from "@/lib/domain/periodo";
import { CampoPeriodo } from "@/components/campo-periodo";

export const metadata = { title: "Relatórios" };

const GRUPOS: Array<{ titulo: string; icone: string; itens: Array<{ tipo: TipoRelatorio; desc: string }> }> = [
  { titulo: "Financeiro", icone: "💰", itens: [{ tipo: "faturamento", desc: "Mensalidade, saving e total por cliente" }, { tipo: "consultas-api", desc: "Cada API: consultas, erros, preço e custo real" }] },
  { titulo: "Multas", icone: "🚨", itens: [
    { tipo: "multas", desc: "Em aberto, da mais urgente à menos" },
    { tipo: "multas-pagar", desc: "Vencimento, valor cheio e com desconto" },
    { tipo: "valores-multas", desc: "Valor cheio, com desconto e a pagar" },
  ] },
  { titulo: "Condutores", icone: "🪪", itens: [
    { tipo: "ranking", desc: "Quem mais leva multa" },
    { tipo: "condutores", desc: "Pontos, CNH e se pode dirigir" },
    { tipo: "condutores-cliente", desc: "Resumo por cliente" },
    { tipo: "cnh", desc: "Vencidas e a vencer em 30 dias" },
  ] },
  { titulo: "Veículos", icone: "🚚", itens: [
    { tipo: "ranking-placas", desc: "Placas com mais multas no período" },
    { tipo: "veiculos", desc: "Placas, SNE e multas por cliente" },
    { tipo: "placas", desc: "Todos os veículos, um a um" },
  ] },
];

export default async function RelatoriosGestao({ searchParams }: { searchParams: Promise<{ tipo?: string; cliente?: string; grupo?: string; placa?: string; mes?: string; periodo?: string; de?: string; ate?: string; ver?: string }> }) {
  const s = await exigirSessao(["franqueadora", "franqueado"]);
  const sp = await searchParams;
  const tipo: TipoRelatorio = sp.tipo && ehRelatorio(sp.tipo) ? sp.tipo : "faturamento";
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : hojeISO().slice(0, 7);
  const cfgP = PERIODO_DO_RELATORIO[tipo];
  const per = cfgP ? lerPeriodo({ get: (k: string) => (sp as Record<string, string | undefined>)[k] ?? null }, cfgP.padrao, hojeISO(), cfgP.aceitaTudo) : null;
  const filtros = { ver: sp.ver || null, periodo: per?.periodo ?? null, cliente: sp.cliente || null, grupo: sp.cliente ? null : sp.grupo || null, placa: sp.placa || null, mes };
  const { t, clientes, grupos } = await noEscopo(s, async (db) => ({
    t: await gerarRelatorioGestao(db, tipo, filtros),
    clientes: await db.q<{ id: string; nome: string }>("select id, nome from clientes where ativo and excluido_em is null order by nome"),
    grupos: await db.q<{ id: string; nome: string; n: number }>("select g.id, g.nome, (select count(*)::int from clientes c where c.grupo_id = g.id and c.excluido_em is null) as n from grupos_economicos g order by g.nome"),
  }));
  const qs = (extra: Record<string, string>) => new URLSearchParams(Object.fromEntries(Object.entries({ tipo, cliente: sp.cliente ?? "", grupo: filtros.grupo ?? "", placa: sp.placa ?? "", periodo: per?.tipo ?? "", de: per?.tipo === "personalizado" ? sp.de ?? "" : "", ate: per?.tipo === "personalizado" ? sp.ate ?? "" : "", mes: !sp.periodo && sp.mes ? sp.mes : "", ver: tipo === "consultas-api" ? sp.ver ?? "" : "", ...extra }).filter(([, v]) => v))).toString();
  return (
    <>
      <Cabecalho titulo="Relatórios" sub="Números da operação de todos os clientes. Filtre e exporte para Excel." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {GRUPOS.map((g) => (
          <div key={g.titulo} className={`card p-4 ${g.itens.some((i) => i.tipo === tipo) ? "border-vigia ring-2 ring-vigia/10" : ""}`}>
            <div className="mb-2 flex items-center gap-2"><span className="text-lg" aria-hidden>{g.icone}</span><span className="sobretitulo">{g.titulo}</span></div>
            <ul className="space-y-1">
              {g.itens.map((i) => {
                const ativo = i.tipo === tipo;
                return (
                  <li key={i.tipo}>
                    <Link href={`?${new URLSearchParams({ tipo: i.tipo, ...(sp.cliente ? { cliente: sp.cliente } : {}), ...(filtros.grupo ? { grupo: filtros.grupo } : {}) })}`} aria-current={ativo ? "page" : undefined}
                      className={`block rounded-lg px-2.5 py-1.5 text-sm transition ${ativo ? "bg-vigia font-semibold text-white" : "hover:bg-nevoa"}`}>
                      {RELATORIOS[i.tipo]}
                      <span className={`block text-[11px] ${ativo ? "text-white/70" : "text-suave"}`}>{i.desc}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <Card titulo={t.titulo} acoes={<a href={`/api/relatorios-gestao?${qs({})}`} className="btn-primario btn-sm">Exportar Excel</a>}>
        <form className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="tipo" value={tipo} />
          {grupos.length > 0 && <div><label className="rotulo">Grupo econômico</label><select name="grupo" defaultValue={filtros.grupo ?? ""} className="campo w-56"><option value="">Todos os grupos</option>{grupos.map((g) => <option key={g.id} value={g.id}>{g.nome} ({g.n})</option>)}</select></div>}
          <div><label className="rotulo">Cliente</label><select name="cliente" defaultValue={sp.cliente ?? ""} className="campo w-64"><option value="">{filtros.grupo ? "Todos do grupo" : "Todos os clientes"}</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          {tipo === "consultas-api" && <div><label className="rotulo">Ver</label><select name="ver" defaultValue={sp.ver ?? "api"} className="campo w-44"><option value="api">Por API</option><option value="cliente">Por API e cliente</option><option value="dia">Por API e dia</option></select></div>}
          {cfgP && per && <CampoPeriodo key={`${tipo}-${per.tipo}`} valor={per.tipo} de={sp.de} ate={sp.ate} aceitaTudo={cfgP.aceitaTudo} intervalo={`${cfgP.data}: ${textoPeriodo(per.periodo)}`} />}
          {(tipo === "placas" || tipo === "multas") && <div><label className="rotulo">Placa</label><input name="placa" defaultValue={sp.placa ?? ""} placeholder="ABC1D23" className="campo w-36 uppercase" /></div>}
          <button className="btn-contorno">Filtrar</button>
          {(sp.cliente || sp.grupo || sp.placa || sp.periodo) && <Link href={`?tipo=${tipo}`} className="btn-leve">Limpar</Link>}
        </form>
        <p className="mb-3 text-xs text-suave">{t.descricao}</p>
        <TabelaRelatorio t={t} />
      </Card>
    </>
  );
}
