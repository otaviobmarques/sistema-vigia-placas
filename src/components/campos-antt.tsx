/** Bloco "ANTT / SIFAMA" do cadastro do cliente. A senha nunca volta para a tela: em branco mantém a guardada. */
export function CamposAntt({ c, compacto = false }: { c?: { antt_ativo?: boolean | null; antt_login?: string | null; antt_cnpj_representado?: string | null; tem_senha_antt?: boolean | null; documento?: string | null }; compacto?: boolean }) {
  const py = compacto ? "py-1.5" : "";
  return (
    <div className="rounded-xl border border-borda p-3">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="antt_ativo" defaultChecked={!!c?.antt_ativo} className="h-4 w-4 accent-vigia" /> Monitorar multas da ANTT (SIFAMA)
      </label>
      <p className="mt-1 text-[11px] text-suave">A ANTT multa o CNPJ/CPF do transportador (RNTRC, vale-pedágio, frete/CIOT, produtos perigosos). A consulta usa o acesso do próprio cliente ao SIFAMA.</p>
      <div className={`mt-2 grid gap-2 ${compacto ? "" : "sm:grid-cols-3"}`}>
        <div><label className="rotulo">Login do SIFAMA (CPF ou CNPJ)</label><input name="antt_login" defaultValue={c?.antt_login ?? ""} inputMode="numeric" autoComplete="off" className={`campo ${py}`} /></div>
        <div>
          <label className="rotulo">Senha do SIFAMA</label>
          <input name="antt_senha" type="password" autoComplete="new-password" placeholder={c?.tem_senha_antt ? "•••••• (guardada; digite para trocar)" : ""} className={`campo ${py}`} />
        </div>
        <div><label className="rotulo">CNPJ representado (opcional)</label><input name="antt_cnpj_representado" defaultValue={c?.antt_cnpj_representado ?? ""} placeholder={c?.documento?.length === 14 ? "o CNPJ do cliente" : ""} inputMode="numeric" className={`campo ${py}`} /></div>
      </div>
      <p className="mt-1 text-[11px] text-suave">🔒 A senha fica guardada criptografada e não aparece de novo na tela.</p>
    </div>
  );
}
