import { brl } from "@/lib/domain/money";
import { dataBR, diasEntre, hojeISO } from "@/lib/domain/dates";
import { Vazio } from "@/components/ui";
import { LogoOrgao } from "@/components/logo-orgao";

type Linha = { id: string; cliente?: string; auto: string; processo: string | null; descricao: string | null; tipo_fiscalizacao: string | null; placa: string | null; data_infracao: string | null; vencimento: string | null; valor: number; situacao: string | null; impeditiva: boolean | null; aberta: boolean };

/** Selo "Impeditiva": multa que trava o RNTRC (o transportador não renova nem altera o registro enquanto não pagar). */
export function SeloImpeditiva({ impeditiva }: { impeditiva: boolean | null }) {
  if (impeditiva === null) return <span className="text-xs text-suave">—</span>;
  return impeditiva
    ? <span className="rounded-full bg-rec-100 px-2 py-0.5 text-[11px] font-bold text-rec" title="Impeditiva: trava o RNTRC enquanto não for paga">Impeditiva</span>
    : <span className="rounded-full bg-nevoa px-2 py-0.5 text-[11px] font-semibold text-suave" title="Não impeditiva: não trava o RNTRC">Não impeditiva</span>;
}

/** Tabela das multas da ANTT (por CNPJ/CPF; a placa aparece quando o auto informa). */
export function TabelaMultasAntt({ linhas, mostrarCliente = false }: { linhas: Linha[]; mostrarCliente?: boolean }) {
  if (!linhas.length) return <Vazio>Nenhuma multa da ANTT encontrada.</Vazio>;
  const hoje = hojeISO();
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="tabela min-w-[880px]">
        <thead><tr>{mostrarCliente && <th>Cliente</th>}<th>Auto de infração</th><th>Infração</th><th>Placa</th><th>Situação</th><th>Vencimento</th><th className="!text-right">Valor</th></tr></thead>
        <tbody>
          {linhas.map((m) => {
            const dias = m.vencimento ? diasEntre(hoje, m.vencimento) : null;
            return (
              <tr key={m.id} className={m.aberta ? "" : "opacity-60"}>
                {mostrarCliente && <td className="text-sm font-semibold">{m.cliente}</td>}
                <td className="text-sm"><div className="flex items-center gap-2"><LogoOrgao id="ANTT" nome="ANTT" /><span className="font-mono">{m.auto}</span></div>{m.processo && <div className="text-[11px] text-suave">Processo {m.processo}</div>}</td>
                <td className="text-sm">{m.descricao ?? "Infração ANTT"}<div className="text-xs text-suave">{[m.tipo_fiscalizacao, m.data_infracao && dataBR(m.data_infracao)].filter(Boolean).join(" · ")}</div></td>
                <td className="text-sm">{m.placa ?? <span className="text-suave">— (no CNPJ)</span>}</td>
                <td><SeloImpeditiva impeditiva={m.impeditiva} /><div className="mt-1 text-xs text-suave">{m.situacao ?? (m.aberta ? "Em aberto" : "Encerrada")}</div></td>
                <td className="text-sm">{m.vencimento ? <>{dataBR(m.vencimento)}{m.aberta && dias !== null && <div className={`text-xs ${dias < 0 ? "font-bold text-rec" : dias <= 7 ? "font-semibold text-ambar" : "text-suave"}`}>{dias < 0 ? `venceu há ${-dias} dia(s)` : dias === 0 ? "vence hoje" : `em ${dias} dia(s)`}</div>}</> : "—"}</td>
                <td className="num text-right font-semibold">{brl(m.valor)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
