import { OPCOES_FREQUENCIA, normalizarFrequencia, rotuloFrequencia } from "@/lib/domain/monitoramento";

/** Seletor de frequência: opções prontas + campo "outro nº de dias" (1 a 60). Lido no servidor por lerFrequencia(). */
export function CampoFrequencia({ nome, valor, permitirPadrao = false, compacto = false }: { nome: string; valor: string | null; permitirPadrao?: boolean; compacto?: boolean }) {
  const atual = valor ? normalizarFrequencia(valor) : "";
  const foraDaLista = atual && !OPCOES_FREQUENCIA.includes(atual);
  return (
    <div className={`flex gap-1 ${compacto ? "" : "flex-wrap"}`}>
      <select name={nome} defaultValue={foraDaLista ? "" : atual} className={`campo ${compacto ? "w-40 py-1.5 text-xs" : ""}`}>
        {permitirPadrao && <option value="">Padrão do cliente</option>}
        {!permitirPadrao && foraDaLista && <option value="">—</option>}
        {OPCOES_FREQUENCIA.map((o) => <option key={o} value={o}>{rotuloFrequencia(o).replace(" (semanal; diária em período de risco)", "")}</option>)}
      </select>
      <input name={`${nome}__dias`} type="number" min={1} max={60} defaultValue={foraDaLista ? atual : ""} placeholder="ou nº de dias" className={`campo ${compacto ? "w-24 py-1.5 text-xs" : "w-32"}`} />
    </div>
  );
}
