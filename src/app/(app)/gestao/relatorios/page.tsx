import Link from "next/link";
import { exigirSessao, noEscopo } from "@/lib/auth";
import { hojeISO } from "@/lib/domain/dates";
import { Cabecalho, Card } from "@/components/ui";
import { TabelaRelatorio } from "@/components/tabela-relatorio";
import { ehRelatorio, gerarRelatorioGestao, RELATORIOS, type TipoRelatorio } from "@/lib/services/relatorios-gestao";

export const metadata = { title: "Relatórios" };

const GRUPOS: Array<{ titulo: string; icone: string; itens: Array<{ tipo: TipoRelatorio; desc: string }> }> = [
  { titulo: "Financeiro", icone: "💰", itens: [{ tipo: "faturamento", desc: "Mensalidade, saving e total por cliente" }] },
  { titulo: "Multas", icone: "🚨", itens: [{ tipo: "multas", desc: "Em aberto, da mais urgente à menos" }] },
  { titulo: "Condutores", icone: "🪪", itens: [
    { tipo: "ranking", desc: "Quem mais leva multa" },
    { tipo: "condutores", desc: "Pontos, CNH e se pode dirigir" },
    { tipo: "condutores-cliente", desc: "Resumo por cliente" },
    { tipo: "cnh", desc: "Vencidas e a vencer em 30 dias" },
  ] },
  { titulo: "Veículos", icone: "🚚", itens: [
    { tipo: "veiculos", desc: "Placas, SNE e multas por cliente" },
    { tipo: "placas", desc: "Todos os veículos, um a um" },
  ] },
];

export default async function RelatoriosGestao({ searchParams }: { searchParams: Promise<{ tipo?: string; cliente?: string; placa?: string; mes?: string }> }) {
  const s = await exigirSessao(["franqueadora", "franqueado"]);
  const sp = await searchParams;
  const tipo: TipoRelatorio = sp.tipo && ehRelatorio(sp.tipo) ? sp.tipo : "faturamento";
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : hojeISO().slice(0, 7);
  const filtros = { cliente: sp.cliente || null, placa: sp.placa || null, mes };
  const { t, clientes } = await noEscopo(s, async (db) => ({
    t: await gerarRelatorioGestao(db, tipo, filtros),
    clientes: await db.q<{ id: string; nome: string }>("select id, nome from clientes where ativo and excluido_em is null order by nome"),
  }));
  const qs = (extra: Record<string, string>) => new URLSearchParams(Object.fromEntries(Object.entries({ tipo, cliente: sp.cliente ?? "", placa: sp.placa ?? "", mes, ...extra }).filter(([, v]) => v))).toString();
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
                    <Link href={`?${new URLSearchParams({ tipo: i.tipo, ...(sp.cliente ? { cliente: sp.cliente } : {}) })}`} aria-current={ativo ? "page" : undefined}
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
          <div><label className="rotulo">Cliente</label><select name="cliente" defaultValue={sp.cliente ?? ""} className="campo w-64"><option value="">Todos os clientes</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          {tipo === "faturamento" && <div><label className="rotulo">Mês</label><input type="month" name="mes" defaultValue={mes} className="campo w-44" /></div>}
          {(tipo === "placas" || tipo === "multas") && <div><label className="rotulo">Placa</label><input name="placa" defaultValue={sp.placa ?? ""} placeholder="ABC1D23" className="campo w-36 uppercase" /></div>}
          <button className="btn-contorno">Filtrar</button>
          {(sp.cliente || sp.placa) && <Link href={`?tipo=${tipo}`} className="btn-leve">Limpar</Link>}
        </form>
        <p className="mb-3 text-xs text-suave">{t.descricao}</p>
        <TabelaRelatorio t={t} />
      </Card>
    </>
  );
}
