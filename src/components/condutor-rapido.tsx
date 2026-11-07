import { CATEGORIAS_CNH } from "@/lib/domain/condutores";

/** Cadastro rápido de um condutor junto com a placa (campos com prefixo novo_). */
export function CamposCondutorRapido() {
  return (
    <details className="rounded-lg border border-dashed border-borda p-2">
      <summary className="cursor-pointer text-xs font-semibold text-vigia">+ Novo condutor</summary>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="col-span-2"><label className="rotulo">Nome</label><input name="novo_nome" className="campo py-1.5" /></div>
        <div><label className="rotulo">CPF</label><input name="novo_cpf" className="campo py-1.5" /></div>
        <div><label className="rotulo">Nº da CNH</label><input name="novo_cnh" className="campo py-1.5" /></div>
        <div><label className="rotulo">Categoria</label><select name="novo_cnh_categoria" className="campo py-1.5"><option value="">—</option>{CATEGORIAS_CNH.map((k) => <option key={k}>{k}</option>)}</select></div>
        <div><label className="rotulo">Validade da CNH</label><input type="date" name="novo_cnh_validade" className="campo py-1.5" /></div>
        <div><label className="rotulo">Pontos já na CNH</label><input name="novo_pontos_12m" type="number" min={0} max={99} defaultValue={0} className="campo py-1.5" /></div>
        <div><label className="rotulo">WhatsApp</label><input name="novo_whatsapp" className="campo py-1.5" /></div>
        <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" name="novo_impedido" className="accent-rec" /> Impedido de dirigir</label>
        <div className="col-span-2"><input name="novo_motivo_impedimento" placeholder="Motivo (se impedido)" className="campo py-1.5" /></div>
      </div>
    </details>
  );
}
