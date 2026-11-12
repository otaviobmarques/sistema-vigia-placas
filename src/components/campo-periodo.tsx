"use client";
import { useState } from "react";
import { PERIODOS, type TipoPeriodo } from "@/lib/domain/periodo";

/** Seletor de período dos relatórios: Hoje, Quinzena, Mês, Trimestre, Ano, Tudo ou Personalizado (com De/Até). */
export function CampoPeriodo({ valor, de, ate, aceitaTudo = true, intervalo }: { valor: TipoPeriodo; de?: string; ate?: string; aceitaTudo?: boolean; intervalo: string }) {
  const [tipo, setTipo] = useState<TipoPeriodo>(valor);
  const opcoes = (Object.keys(PERIODOS) as TipoPeriodo[]).filter((k) => aceitaTudo || k !== "tudo");
  return (
    <>
      <div>
        <label className="rotulo">Período</label>
        <select name="periodo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoPeriodo)} className="campo w-44">
          {opcoes.map((k) => <option key={k} value={k}>{PERIODOS[k]}</option>)}
        </select>
      </div>
      {tipo === "personalizado" ? (
        <>
          <div><label className="rotulo">De</label><input type="date" name="de" defaultValue={de} className="campo w-40" /></div>
          <div><label className="rotulo">Até</label><input type="date" name="ate" defaultValue={ate} className="campo w-40" /></div>
        </>
      ) : (
        tipo === valor && <p className="self-center pb-2 text-xs text-suave">{intervalo}</p>
      )}
    </>
  );
}
