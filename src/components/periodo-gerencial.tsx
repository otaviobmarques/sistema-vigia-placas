"use client";
import { useState } from "react";

const OPCOES = [["mes", "Mensal"], ["trimestre", "Trimestral"], ["semestre", "Semestral"], ["ano", "Anual"], ["personalizado", "Personalizado"]] as const;

/** Período do relatório gerencial: Mensal (com escolha do mês), Trimestral, Semestral, Anual ou Personalizado. */
export function PeriodoGerencial({ valor, mes, de, ate }: { valor: string; mes: string; de?: string; ate?: string }) {
  const [tipo, setTipo] = useState(valor);
  return (
    <>
      <div>
        <label className="rotulo">Período</label>
        <select name="periodo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="campo w-44">
          {OPCOES.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select>
      </div>
      {tipo === "mes" && <div><label className="rotulo">Mês</label><input type="month" name="mes" defaultValue={mes} className="campo w-44" /></div>}
      {tipo === "personalizado" && (
        <>
          <div><label className="rotulo">De</label><input type="date" name="de" defaultValue={de} className="campo w-40" /></div>
          <div><label className="rotulo">Até</label><input type="date" name="ate" defaultValue={ate} className="campo w-40" /></div>
        </>
      )}
    </>
  );
}
