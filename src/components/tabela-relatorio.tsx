import { brl } from "@/lib/domain/money";
import { dataBR } from "@/lib/domain/dates";
import { somavel, type Tabela } from "@/lib/services/relatorios-gestao";
import { Vazio } from "@/components/ui";

/** Tabela genérica de relatório (colunas tipadas), com linha de totais para valores e números. */
export function TabelaRelatorio({ t }: { t: Tabela }) {
  if (!t.linhas.length) return <Vazio>Nada encontrado com estes filtros.</Vazio>;
  const fmt = (tipo: string, v: unknown) => (v === null || v === undefined || v === "" ? "—" : tipo === "brl" ? brl(Number(v)) : tipo === "data" ? dataBR(String(v)) : String(v));
  const somaveis = t.colunas.filter(somavel);
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="tabela min-w-[880px]">
        <thead><tr>{t.colunas.map((c) => <th key={c.chave} className={c.tipo === "brl" || c.tipo === "num" ? "!text-right" : ""}>{c.rotulo}</th>)}</tr></thead>
        <tbody>
          {t.linhas.map((l, i) => (
            <tr key={i} className={(l as any).subtotal ? "bg-nevoa/70 font-semibold" : ""}>{t.colunas.map((c, j) => (
              <td key={c.chave} className={`${c.tipo === "brl" || c.tipo === "num" ? "num text-right" : "text-sm"} ${j === 0 ? "font-semibold" : ""} ${c.chave === "pode" && String(l[c.chave]).startsWith("Não") ? "font-semibold text-rec" : ""} ${c.chave === "dias" && Number(l[c.chave]) < 0 ? "font-bold text-rec" : ""}`}>{fmt(c.tipo, l[c.chave])}</td>
            ))}</tr>
          ))}
        </tbody>
        {somaveis.length > 0 && t.linhas.length > 1 && (
          <tfoot><tr className="font-bold">{t.colunas.map((c, j) => (
            <td key={c.chave} className={c.tipo === "brl" || c.tipo === "num" ? "num text-right" : ""}>{j === 0 ? `Total (${t.linhas.filter((l) => !(l as any).subtotal).length})` : somaveis.includes(c) ? fmt(c.tipo, t.linhas.filter((l) => !(l as any).subtotal).reduce((a, l) => a + Number(l[c.chave] ?? 0), 0)) : ""}</td>
          ))}</tr></tfoot>
        )}
      </table>
    </div>
  );
}
