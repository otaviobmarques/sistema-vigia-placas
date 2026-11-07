import { brl } from "@/lib/domain/money";
import { mesAbrev, nomeMes } from "@/lib/domain/dates";

export interface MesEconomia {
  mes: string;
  desconto: number;
  nic: number;
  cancelamento: number;
}

/** Economia comprovada mês a mês (série única; a composição aparece no tooltip). */
export function GraficoEconomia({ meses, mensalidade }: { meses: MesEconomia[]; mensalidade: number }) {
  const total = (m: MesEconomia) => m.desconto + m.nic + m.cancelamento;
  const max = Math.max(1, ...meses.map(total));
  return (
    <div>
      <div className="flex h-44 items-end gap-[6px] border-b border-borda" role="img" aria-label="Economia comprovada por mês">
        {meses.map((m) => {
          const t = total(m);
          return (
            <div key={m.mes} className="group relative flex h-full flex-1 flex-col justify-end">
              <div
                className="w-full rounded-t-[4px] bg-economia transition-opacity group-hover:opacity-85"
                style={{ height: `${Math.max(t ? 3 : 0, (t / max) * 100)}%` }}
              />
              {/* área de hover maior que a barra */}
              <div className="absolute inset-0" tabIndex={0} aria-label={`${nomeMes(m.mes)}: ${brl(t)}`} />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-48 -translate-x-1/2 rounded-lg border border-borda bg-white p-3 text-xs shadow-lg group-hover:block group-focus-within:block">
                <div className="mb-1 font-semibold capitalize text-vigia">{nomeMes(m.mes)}</div>
                <div className="flex justify-between text-suave"><span>Descontos</span><span className="num text-vigia">{brl(m.desconto)}</span></div>
                <div className="flex justify-between text-suave"><span>NIC evitadas</span><span className="num text-vigia">{brl(m.nic)}</span></div>
                {m.cancelamento > 0 && <div className="flex justify-between text-suave"><span>Cancelamentos</span><span className="num text-vigia">{brl(m.cancelamento)}</span></div>}
                <div className="mt-1 flex justify-between border-t border-borda pt-1 font-semibold text-vigia"><span>Total</span><span className="num">{brl(t)}</span></div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[6px]">
        {meses.map((m) => <div key={m.mes} className="flex-1 text-center text-[11px] text-suave">{mesAbrev(m.mes)}</div>)}
      </div>
      {mensalidade > 0 && <p className="mt-2 text-xs text-suave">Mensalidade de referência: {brl(mensalidade)}/mês</p>}
    </div>
  );
}
