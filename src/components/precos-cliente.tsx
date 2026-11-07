/** Preços negociados por cliente. Em branco = valores do plano (placa/saving) ou globais (defesa/taxa). */
export function CamposPrecosCliente({ c, compacto = false, plano }: { c?: Record<string, any>; compacto?: boolean; plano?: string }) {
  const reais = (v: number | null | undefined) => (v === null || v === undefined ? "" : (v / 100).toFixed(2).replace(".", ","));
  const cls = `campo ${compacto ? "py-1.5" : ""}`;
  return (
    <div className={`grid gap-2 ${compacto ? "grid-cols-2" : "sm:grid-cols-4"}`}>
      <div><label className="rotulo">R$ por placa/mês</label><input name="preco_personalizado" inputMode="decimal" defaultValue={reais(c?.preco_placa_personalizado)} placeholder={plano ? `plano ${plano}` : "do plano"} className={cls} /></div>
      <div><label className="rotulo">% do saving</label><input name="saving_personalizado" inputMode="decimal" defaultValue={c?.saving_bps_personalizado != null ? String(c.saving_bps_personalizado / 100) : ""} placeholder="do plano" className={cls} /></div>
      <div><label className="rotulo">R$ por defesa de multa</label><input name="defesa_personalizado" inputMode="decimal" defaultValue={reais(c?.preco_defesa_personalizado)} placeholder="padrão" className={cls} /></div>
      <div><label className="rotulo">Taxa de conveniência</label>
        <div className="flex gap-1">
          <select name="taxa_tipo_personalizado" defaultValue={c?.taxa_conv_tipo_personalizado ?? "fixa"} className={`${cls} w-20 px-2`}><option value="fixa">R$</option><option value="percentual">%</option></select>
          <input name="taxa_valor_personalizado" inputMode="decimal" defaultValue={c?.taxa_conv_valor_personalizado == null ? "" : c?.taxa_conv_tipo_personalizado === "percentual" ? String(c.taxa_conv_valor_personalizado / 100) : reais(c.taxa_conv_valor_personalizado)} placeholder="padrão" className={cls} />
        </div>
      </div>
    </div>
  );
}
