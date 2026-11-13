/** Bloco "ANTT / SIFAMA" do cadastro do cliente. A senha nunca volta para a tela: em branco mantém a guardada. */
type AcessoGovTela = {
  procuracao_gov?: boolean | null; procuracao_validade?: string | null; gov_login?: string | null; tem_senha_gov?: boolean | null;
  gov_multas_ativo?: boolean | null; gov_ultimo_erro?: string | null; doc_procuracao?: string | null; procurador_usuario_id?: string | null;
};
type ProcuradorOpcao = { id: string; nome: string; gov_cpf: string; tem_senha: boolean };

/** Bloco "Acesso gov.br" do cadastro do cliente: procuração (usada primeiro) ou login gov.br do cliente. */
export function CamposGov({ c, compacto = false, procuradores = [] }: { c?: AcessoGovTela; compacto?: boolean; procuradores?: ProcuradorOpcao[] }) {
  const py = compacto ? "py-1.5" : "";
  const vencida = !!c?.procuracao_validade && c.procuracao_validade.slice(0, 10) < new Date().toISOString().slice(0, 10);
  return (
    <div className="rounded-xl border border-borda p-3">
      <div className="text-sm font-semibold">Acesso gov.br (SNE / SENATRAN e ANTT)</div>
      <p className="mt-1 text-[11px] text-suave">Usamos primeiro a procuração; sem procuração, o login gov.br do cliente. Com acesso, puxamos as multas de todos os órgãos, a notificação e o boleto com desconto do SNE.</p>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" name="procuracao_gov" defaultChecked={!!c?.procuracao_gov} className="h-4 w-4 accent-vigia" /> Cliente deu procuração no gov.br para a Vigia Placa
      </label>
      <div className="mt-2">
        <label className="rotulo">Procuração para</label>
        <select name="procurador_usuario_id" defaultValue={c?.procurador_usuario_id ?? (procuradores.length === 1 ? procuradores[0].id : "")} className={`campo ${py}`}>
          <option value="">{procuradores.length ? "Procurador padrão (Backoffice)" : "Nenhum procurador cadastrado ainda"}</option>
          {procuradores.map((p) => <option key={p.id} value={p.id}>{p.nome} · CPF {p.gov_cpf}{p.tem_senha ? "" : " (sem senha)"}</option>)}
        </select>
        {!procuradores.length && <p className="mt-1 text-[11px] text-ambar">O procurador cadastra o próprio gov.br em Minha conta.</p>}
      </div>
      <div className={`mt-2 grid gap-2 ${compacto ? "" : "sm:grid-cols-2"}`}>
        <div>
          <label className="rotulo">Validade da procuração</label>
          <input type="date" name="procuracao_validade" defaultValue={c?.procuracao_validade?.slice(0, 10) ?? ""} className={`campo ${py}`} />
          {vencida && <div className="mt-1 text-[11px] font-semibold text-rec">Procuração vencida: renove no gov.br.</div>}
        </div>
        <div>
          <label className="rotulo">PDF da procuração (opcional)</label>
          <input type="file" name="procuracao_arquivo" accept="application/pdf,image/*" className="block w-full text-xs" />
          {c?.doc_procuracao && <a href={`/api/documentos/${c.doc_procuracao}`} target="_blank" rel="noopener" className="link text-[11px]">📄 Ver procuração guardada</a>}
        </div>
      </div>
      <div className={`mt-3 grid gap-2 ${compacto ? "" : "sm:grid-cols-2"}`}>
        <div><label className="rotulo">Login gov.br do cliente (CPF)</label><input name="gov_login" defaultValue={c?.gov_login ?? ""} inputMode="numeric" autoComplete="off" className={`campo ${py}`} /></div>
        <div>
          <label className="rotulo">Senha gov.br do cliente</label>
          <input name="gov_senha" type="password" autoComplete="new-password" placeholder={c?.tem_senha_gov ? "•••••• (guardada; digite para trocar)" : ""} className={`campo ${py}`} />
        </div>
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" name="gov_multas_ativo" defaultChecked={c?.gov_multas_ativo ?? true} className="h-4 w-4 accent-vigia" /> Puxar multas e notificações pelo SNE (SENATRAN)
      </label>
      <input type="hidden" name="gov_form" value="1" />
      {c?.gov_ultimo_erro && <p className="mt-1 text-[11px] font-semibold text-rec">⚠ {c.gov_ultimo_erro}</p>}
      <p className="mt-1 text-[11px] text-suave">🔒 Senha guardada criptografada. Conta gov.br com verificação em duas etapas pode bloquear a consulta automática: prefira a procuração.</p>
    </div>
  );
}

export function CamposAntt({ c, compacto = false, procuradores = [] }: { procuradores?: ProcuradorOpcao[]; c?: AcessoGovTela & { antt_ativo?: boolean | null; antt_login?: string | null; antt_cnpj_representado?: string | null; tem_senha_antt?: boolean | null; documento?: string | null }; compacto?: boolean }) {
  const py = compacto ? "py-1.5" : "";
  return (
    <div className="space-y-3">
    <CamposGov c={c} compacto={compacto} procuradores={procuradores} />
    <div className="rounded-xl border border-borda p-3">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="antt_ativo" defaultChecked={!!c?.antt_ativo} className="h-4 w-4 accent-vigia" /> Monitorar multas da ANTT (SIFAMA)
      </label>
      <p className="mt-1 text-[11px] text-suave">A ANTT multa o CNPJ/CPF do transportador (RNTRC, vale-pedágio, frete/CIOT, produtos perigosos). Usa a procuração ou o gov.br acima; sem eles, o login próprio do SIFAMA abaixo.</p>
      <div className={`mt-2 grid gap-2 ${compacto ? "" : "sm:grid-cols-3"}`}>
        <div><label className="rotulo">Login do SIFAMA (CPF ou CNPJ, se não usar gov.br)</label><input name="antt_login" defaultValue={c?.antt_login ?? ""} inputMode="numeric" autoComplete="off" className={`campo ${py}`} /></div>
        <div>
          <label className="rotulo">Senha do SIFAMA</label>
          <input name="antt_senha" type="password" autoComplete="new-password" placeholder={c?.tem_senha_antt ? "•••••• (guardada; digite para trocar)" : ""} className={`campo ${py}`} />
        </div>
        <div><label className="rotulo">CNPJ representado (opcional)</label><input name="antt_cnpj_representado" defaultValue={c?.antt_cnpj_representado ?? ""} placeholder={c?.documento?.length === 14 ? "o CNPJ do cliente" : ""} inputMode="numeric" className={`campo ${py}`} /></div>
      </div>
      <p className="mt-1 text-[11px] text-suave">🔒 A senha fica guardada criptografada e não aparece de novo na tela.</p>
    </div>
    </div>
  );
}
