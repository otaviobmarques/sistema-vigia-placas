/** Barras verticais de uma série só (mês a mês), com tooltip no hover/foco e rótulo no último valor. */
export function GraficoBarras({ dados, formatar, cor = "bg-vigia", rotulo }: {
  dados: Array<{ chave: string; legenda: string; valor: number; detalhe?: string }>;
  formatar: (v: number) => string;
  cor?: string;
  rotulo: string;
}) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  const ultimo = dados.length - 1;
  return (
    <div>
      <div className="flex h-40 items-end gap-[6px] border-b border-borda" role="img" aria-label={`${rotulo}: ${dados.map((d) => `${d.legenda} ${formatar(d.valor)}`).join(", ")}`}>
        {dados.map((d, i) => (
          <div key={d.chave} className="group relative flex h-full flex-1 flex-col justify-end">
            {i === ultimo && d.valor > 0 && <div className="num mb-1 text-center text-[11px] font-semibold text-vigia">{formatar(d.valor)}</div>}
            <div className={`w-full rounded-t-[4px] ${cor} transition-opacity group-hover:opacity-80`} style={{ height: `${Math.max(d.valor ? 3 : 0, (d.valor / max) * 100)}%` }} />
            <div className="absolute inset-0" tabIndex={0} aria-label={`${d.legenda}: ${formatar(d.valor)}`} />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-44 -translate-x-1/2 rounded-lg border border-borda bg-white p-2.5 text-xs shadow-lg group-hover:block group-focus-within:block">
              <div className="font-semibold capitalize text-vigia">{d.legenda}</div>
              <div className="num mt-0.5 text-base font-extrabold text-vigia">{formatar(d.valor)}</div>
              {d.detalhe && <div className="text-suave">{d.detalhe}</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[6px]">{dados.map((d) => <div key={d.chave} className="flex-1 text-center text-[11px] capitalize text-suave">{d.legenda.slice(0, 3)}</div>)}</div>
    </div>
  );
}
