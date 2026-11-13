"use client";
import { useRef, useState } from "react";

const TOM = { "40": "bg-rec text-white", "20": "bg-ambar text-vigia", nenhum: "bg-nevoa text-suave line-through" } as const;

/**
 * Selo 40% / 20% na frente da multa. A explicação aparece ao passar o mouse, focar ou tocar;
 * o balão é posicionado na tela (fixed) para não ser cortado por tabelas com rolagem.
 */
export function SeloDesconto({ faixa, texto }: { faixa: "40" | "20" | null; texto: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; acima: boolean } | null>(null);
  const abrir = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const acima = r.bottom + 140 > window.innerHeight;
    setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - 296)), y: acima ? r.top - 6 : r.bottom + 6, acima });
  };
  return (
    <>
      <button ref={ref} type="button" aria-label={texto} onMouseEnter={abrir} onMouseLeave={() => setPos(null)} onFocus={abrir} onBlur={() => setPos(null)}
        onClick={abrir}
        className={`inline-flex h-6 min-w-[2.6rem] shrink-0 cursor-help items-center justify-center rounded-full px-1.5 align-middle text-[11px] font-extrabold ${TOM[faixa ?? "nenhum"]}`}>
        {faixa ? `${faixa}%` : "0%"}
      </button>
      {pos && (
        <span role="tooltip" style={{ left: pos.x, top: pos.y, transform: pos.acima ? "translateY(-100%)" : undefined }}
          className="pointer-events-none fixed z-50 w-72 rounded-xl bg-vigia p-3 text-left text-xs font-normal leading-snug text-white shadow-lg">
          {texto}
        </span>
      )}
    </>
  );
}

/** Os selos da multa lado a lado (40% e 20% quando há direito ao SNE; só 20% ou "0%" nos demais casos). */
export function SelosDesconto({ selos }: { selos: Array<{ faixa: "40" | "20" | null; texto: string }> }) {
  return <span className="inline-flex shrink-0 flex-col gap-1">{selos.map((s) => <SeloDesconto key={s.faixa ?? "0"} {...s} />)}</span>;
}
