import { exigirSessao, noEscopo } from "@/lib/auth";
import { hojeISO } from "@/lib/domain/dates";
import { brl } from "@/lib/domain/money";
import { FONTES, modoSimulado, UFS_EXIGEM_LOGIN } from "@/lib/integrations/infosimples";
import { TestarFonte } from "@/components/testar-fonte";
import { asaasSimulado } from "@/lib/integrations/asaas";
import { Abas, Aviso, Cabecalho, Card, Mensagem, Numero } from "@/components/ui";
import { atualizarDefesaAction, reativarFonte, rodarVarredura, salvarConfigGlobal, salvarFranqueado, transferirCliente } from "../../actions";

export const metadata = { title: "Backoffice" };
const ABAS = [["geral", "Visão geral"], ["franqueados", "Franqueados"], ["planos", "Planos e percentuais"], ["fontes", "Fontes de dados"], ["cobertura", "Cobertura"], ["defesas", "Defesas"], ["mensagens", "Mensagens"], ["auditoria", "Auditoria"]] as const;
const pct = (bps: number) => (bps / 100).toLocaleString("pt-BR");

export default async function Backoffice({ searchParams }: { searchParams: Promise<{ aba?: string; ok?: string; erro?: string }> }) {
  const s = await exigirSessao(["franqueadora"]);
  const sp = await searchParams;
  const aba = ABAS.some(([id]) => id === sp.aba) ? sp.aba! : "geral";
  const mes = hojeISO().slice(0, 7);
  const d = await noEscopo(s, async (db) => ({
    totais: await db.one(`select (select count(*) from placas where status <> 'pausada') as placas, (select count(*) from clientes where ativo) as clientes,
      (select coalesce(sum(custo),0) from consultas where data > now() - interval '30 days') as custo30,
      (select count(*) from consultas where data > now() - interval '30 days') as consultas30,
      (select coalesce(sum(valor),0) from economias where comprovada and mes = $1) as economia_mes,
      (select coalesce(sum(taxa),0) from pagamentos where to_char(pago_em,'YYYY-MM') = $1) as conveniencia,
      (select coalesce(sum(preco),0) from pedidos_defesa where to_char(criado_em,'YYYY-MM') = $1) as defesa,
      (select coalesce(sum(pl.preco_placa),0) from placas p join clientes c on c.id = p.cliente_id join planos pl on pl.id = c.plano_id where p.status <> 'pausada') as mensalidades`, [mes]),
    cfg: await db.one("select * from configuracao"),
    planos: await db.q("select * from planos order by preco_placa nulls last"),
    franqueados: await db.q(`select f.*, (select count(*) from clientes c where c.franqueado_id = f.id) as clientes,
      (select count(*) from placas p join clientes c on c.id = p.cliente_id where c.franqueado_id = f.id and p.status <> 'pausada') as placas,
      (select coalesce(sum(e.valor),0) from economias e join clientes c on c.id = e.cliente_id where c.franqueado_id = f.id and e.mes = $1 and e.comprovada) as economia
      from franqueados f order by placas desc`, [mes]),
    clientes: await db.q("select id, nome, franqueado_id from clientes order by nome"),
    fontes: await db.q(`select f.*, (select count(*) from consultas c where c.fonte_id = f.id and c.data > now() - interval '7 days') as c7,
      (select count(*) from consultas c where c.fonte_id = f.id and c.data > now() - interval '7 days' and c.resultado = 'erro') as e7 from fontes f order by prioridade`),
    orgaos: await db.q(`select o.*, (select count(*) from multas m where m.orgao_id = o.id) as multas,
      (select count(*) from notificacoes_capturadas n where n.orgao_id = o.id and not n.achada_antes) as buracos from orgaos o order by buracos desc, multas desc`),
    defesas: await db.q("select pd.*, m.descricao, m.auto_infracao, p.placa, c.nome from pedidos_defesa pd join multas m on m.id = pd.multa_id join placas p on p.id = m.placa_id join clientes c on c.id = pd.cliente_id order by pd.criado_em desc"),
    outbox: await db.q("select * from outbox order by criado_em desc limit 50"),
    auditoria: await db.q("select a.*, u.email from auditoria a left join usuarios u on u.id = a.usuario_id order by a.data desc limit 100"),
  }));
  const t = d.totais!;
  const saving = Math.round((Number(t.economia_mes) * d.cfg!.saving_bps) / 10000);
  const receita = Number(t.mensalidades) + saving + Number(t.conveniencia) + Number(t.defesa);
  const custoPlaca = Number(t.placas) ? Number(t.custo30) / Number(t.placas) : 0;

  return (
    <>
      <Cabecalho titulo="Backoffice" sobre="Franqueadora · Vigia Placa" />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      {(modoSimulado() || asaasSimulado()) && <div className="mb-4"><Aviso tom="ambar">Modo simulado: {[modoSimulado() && "Infosimples", asaasSimulado() && "Asaas"].filter(Boolean).join(" e ")} sem chave de API. Configure as variáveis de ambiente (na Vercel, em Settings › Environment Variables) para usar as integrações reais.</Aviso></div>}
      <Abas ativo={aba} itens={ABAS.map(([id, r]) => ({ id, rotulo: r, href: `?aba=${id}` }))} />

      {aba === "geral" && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Numero rotulo="Placas monitoradas" valor={t.placas} detalhe={`${t.clientes} clientes`} />
            <Numero rotulo="Receita do mês (prévia)" valor={brl(receita)} />
            <Numero rotulo="Custo de dados por placa (30 dias)" valor={brl(Math.round(custoPlaca))} detalhe={`${t.consultas30} consultas · ${brl(Number(t.custo30))}`} />
            <Numero destaque rotulo="Margem sobre dados" valor={receita ? `${Math.round((1 - Number(t.custo30) / receita) * 100)}%` : "—"} detalhe="meta: custo de dados até 25% do preço" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card titulo="Receita por fonte">
              <table className="tabela"><tbody>
                {[["Mensalidades", Number(t.mensalidades)], [`Saving (${pct(d.cfg!.saving_bps)}% de ${brl(Number(t.economia_mes))})`, saving], ["Conveniência", Number(t.conveniencia)], ["Defesa", Number(t.defesa)]].map(([r, v]) => (
                  <tr key={r as string}><td>{r}</td><td className="num text-right font-semibold">{brl(v as number)}</td></tr>
                ))}
              </tbody></table>
            </Card>
            <Card titulo="Ranking de franqueados">
              <table className="tabela"><thead><tr><th>Franqueado</th><th className="text-right">Placas</th><th className="text-right">Economia no mês</th></tr></thead><tbody>
                {d.franqueados.map((f) => <tr key={f.id}><td>{f.nome}<div className="text-xs text-suave">{f.cidade}</div></td><td className="text-right">{f.placas}</td><td className="num text-right text-economia">{brl(Number(f.economia))}</td></tr>)}
              </tbody></table>
            </Card>
          </div>
        </>
      )}

      {aba === "franqueados" && (
        <div className="space-y-6">
          {[...d.franqueados, null].map((f) => (
            <Card key={f?.id ?? "novo"} titulo={f ? f.nome : "Novo franqueado"}>
              <form action={salvarFranqueado} className="grid gap-3 sm:grid-cols-4">
                {f && <input type="hidden" name="id" value={f.id} />}
                <div><label className="rotulo">Nome</label><input name="nome" defaultValue={f?.nome} required className="campo" /></div>
                <div><label className="rotulo">CNPJ</label><input name="documento" defaultValue={f?.documento} required className="campo" /></div>
                <div><label className="rotulo">Cidade</label><input name="cidade" defaultValue={f?.cidade ?? ""} className="campo" /></div>
                <div><label className="rotulo">walletId Asaas (split)</label><input name="wallet" defaultValue={f?.asaas_wallet_id ?? ""} className="campo" /></div>
                <div><label className="rotulo">Repasse mensalidade %</label><input name="rep_mensalidade" defaultValue={pct(f?.repasse_mensalidade_bps ?? 3000)} className="campo" /></div>
                <div><label className="rotulo">Repasse saving %</label><input name="rep_saving" defaultValue={pct(f?.repasse_saving_bps ?? 3000)} className="campo" /></div>
                <div><label className="rotulo">Repasse conveniência %</label><input name="rep_conveniencia" defaultValue={pct(f?.repasse_conveniencia_bps ?? 3000)} className="campo" /></div>
                <div><label className="rotulo">Comissão defesa %</label><input name="com_defesa" defaultValue={pct(f?.comissao_defesa_bps ?? 1000)} className="campo" /></div>
                <div className="sm:col-span-4 flex items-center gap-3"><button className="btn-primario btn-sm">Salvar</button>{f && <span className="text-xs text-suave">{f.clientes} clientes · {f.placas} placas</span>}</div>
              </form>
            </Card>
          ))}
          <Card titulo="Transferir cliente entre franqueados">
            <form action={transferirCliente} className="flex flex-wrap gap-2">
              <select name="clienteId" className="campo max-w-xs">{d.clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
              <select name="franqueadoId" className="campo max-w-xs"><option value="">Direto (franqueadora)</option>{d.franqueados.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
              <button className="btn-contorno">Transferir</button>
            </form>
            <p className="mt-2 text-xs text-suave">Só a franqueadora transfere; cada transferência fica na auditoria.</p>
          </Card>
        </div>
      )}

      {aba === "planos" && (
        <Card>
          <form action={salvarConfigGlobal} className="grid max-w-3xl gap-4 sm:grid-cols-3">
            {d.planos.map((p) => (
              <div key={p.id}><label className="rotulo">{p.nome} ({p.frequencia}) · R$/placa/mês</label><input name={`preco_${p.id}`} defaultValue={p.preco_placa ? (p.preco_placa / 100).toFixed(2).replace(".", ",") : ""} placeholder="[DEFINIR]" className="campo" /></div>
            ))}
            <div><label className="rotulo">Saving (% da economia comprovada)</label><input name="saving" defaultValue={pct(d.cfg!.saving_bps)} className="campo" /></div>
            <div><label className="rotulo">Taxa de conveniência</label><select name="taxa_tipo" defaultValue={d.cfg!.taxa_conv_tipo} className="campo"><option value="fixa">Valor fixo (R$)</option><option value="percentual">Percentual (%)</option></select></div>
            <div><label className="rotulo">Valor da taxa</label><input name="taxa_valor" defaultValue={d.cfg!.taxa_conv_tipo === "fixa" ? (d.cfg!.taxa_conv_valor / 100).toFixed(2).replace(".", ",") : pct(d.cfg!.taxa_conv_valor)} className="campo" /></div>
            <div><label className="rotulo">Preço da defesa (R$)</label><input name="preco_defesa" defaultValue={(d.cfg!.preco_defesa / 100).toFixed(2).replace(".", ",")} className="campo" /></div>
            <div className="sm:col-span-3"><button className="btn-primario">Salvar</button></div>
          </form>
          <p className="mt-4 text-xs text-suave">Os preços vêm preenchidos com valores de partida (custo de dados até 25% do preço, seção 12.1). Ajuste após as cotações da Infosimples, do Asaas e da Celcoin.</p>
        </Card>
      )}

      {aba === "fontes" && (
        <>
        <Card titulo="Saúde das fontes" acoes={<form action={rodarVarredura}><button className="btn-primario btn-sm">Rodar varredura agora</button></form>}>
          <table className="tabela">
            <thead><tr><th>Fonte</th><th>Status</th><th className="text-right">Consultas (7d)</th><th className="text-right">Erros (7d)</th><th className="text-right">Custo/consulta</th><th>Última falha</th><th /></tr></thead>
            <tbody>
              {d.fontes.map((f) => (
                <tr key={f.id}>
                  <td className="font-semibold">{f.nome}{f.id === "infosimples" && modoSimulado() && <div className="text-xs font-normal text-[#8a5a00]">simulada</div>}</td>
                  <td>{f.ativa ? <span className="text-economia">● ativa</span> : <span className="text-rec">● desligada{f.desligada_em ? " automaticamente" : ""}</span>}{f.falhas_seguidas > 0 && <div className="text-xs text-suave">{f.falhas_seguidas} falha(s) seguida(s)</div>}</td>
                  <td className="text-right">{f.c7}</td><td className="text-right">{f.e7}</td><td className="num text-right">{brl(f.custo)}</td>
                  <td className="max-w-xs truncate text-xs text-suave">{f.ultima_falha ?? "—"}</td>
                  <td><form action={reativarFonte}><input type="hidden" name="id" value={f.id} /><button className="btn-leve btn-sm">{f.ativa ? "Desligar" : "Ligar"}</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-suave">Cada serviço da Infosimples aparece como uma fonte própria depois da primeira consulta. Fonte com 5 erros seguidos é desligada automaticamente; a linha "Infosimples" liga e desliga todas. A varredura também roda pelo agendador (rota /api/cron/monitoramento).</p>
        </Card>
        <Card titulo="Cobertura da Infosimples por UF" className="mt-6">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div><b>Sem login do proprietário (padrão):</b> PRF em todas as UFs{" + "}{FONTES.filter((f) => f.uf !== "*").map((f) => `${f.uf}${f.aConfirmar ? " (a confirmar)" : ""}`).join(", ")}.</div>
            <div><b>Exigem login gov.br ou certificado:</b> {UFS_EXIGEM_LOGIN.join(", ")}. Nessas UFs, a captura de notificações e a base nacional (Senatran) completam a cobertura.</div>
          </div>
        </Card>
        <Card titulo="Testar fonte com uma placa real" className="mt-6">
          <TestarFonte fontes={FONTES.map((f) => ({ servico: f.servico, nome: f.nome, uf: f.uf, aConfirmar: f.aConfirmar }))} ativo={!modoSimulado()} />
        </Card>
        </>
      )}

      {aba === "cobertura" && (
        <Card titulo="Mapa de cobertura por órgão">
          <p className="mb-3 text-sm text-suave">Toda multa que chega pela captura sem ter sido achada pelas consultas revela um órgão descoberto. Priorize conectores para os órgãos no topo.</p>
          <table className="tabela">
            <thead><tr><th>Órgão</th><th>UF</th><th>Coberto pelas consultas</th><th>Aderente SNE</th><th className="text-right">Multas</th><th className="text-right">Achadas só pela captura</th></tr></thead>
            <tbody>
              {d.orgaos.map((o) => (
                <tr key={o.id} className={Number(o.buracos) ? "bg-rec-100/40" : ""}>
                  <td className="font-semibold">{o.nome}</td><td>{o.uf}</td><td>{o.coberto ? "Sim" : <b className="text-rec">Não</b>}</td><td>{o.aderente_sne ? "Sim" : "Não"}</td>
                  <td className="text-right">{o.multas}</td><td className="text-right font-semibold">{o.buracos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {aba === "defesas" && (
        <Card titulo="Pedidos de defesa (serviço da equipe)">
          {d.defesas.length === 0 ? <p className="text-sm text-suave">Nenhum pedido.</p> : (
            <ul className="divide-y divide-borda">
              {d.defesas.map((p) => (
                <li key={p.id} className="py-4">
                  <div className="mb-2 text-sm"><b>{p.nome}</b> · {p.placa} · {p.descricao} · auto {p.auto_infracao} · {brl(p.preco)} · <b>{p.status}</b></div>
                  <form action={atualizarDefesaAction} className="flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <input name="responsavel" defaultValue={p.responsavel ?? ""} placeholder="Responsável" className="campo w-40" />
                    <input name="protocolo" defaultValue={p.protocolo ?? ""} placeholder="Protocolo" className="campo w-40" />
                    <input name="resultado" defaultValue={p.resultado ?? ""} placeholder="Observação" className="campo w-56" />
                    <select name="status" defaultValue="" className="campo w-44"><option value="">manter status</option><option value="em_andamento">Em andamento</option><option value="deferida">Deferida (cancela)</option><option value="indeferida">Indeferida</option></select>
                    <button className="btn-contorno btn-sm">Atualizar</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {aba === "mensagens" && (
        <Card titulo="Fila de mensagens (WhatsApp, e-mail, push)">
          <table className="tabela"><thead><tr><th>Quando</th><th>Canal</th><th>Destino</th><th>Assunto</th><th>Status</th></tr></thead><tbody>
            {d.outbox.map((m) => <tr key={m.id}><td className="whitespace-nowrap text-xs">{new Date(m.criado_em).toLocaleString("pt-BR")}</td><td>{m.canal}</td><td className="text-xs">{m.destino}</td><td className="text-xs"><b>{m.assunto}</b><div className="text-suave">{m.corpo}</div></td><td className="text-xs">{m.status}</td></tr>)}
          </tbody></table>
        </Card>
      )}

      {aba === "auditoria" && (
        <Card titulo="Auditoria">
          <table className="tabela"><thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Dados</th></tr></thead><tbody>
            {d.auditoria.map((a) => <tr key={a.id}><td className="whitespace-nowrap text-xs">{new Date(a.data).toLocaleString("pt-BR")}</td><td className="text-xs">{a.email ?? "sistema"}</td><td>{a.acao}</td><td className="text-xs">{a.entidade}</td><td className="max-w-xs truncate font-mono text-xs">{a.dados ? JSON.stringify(a.dados) : ""}</td></tr>)}
          </tbody></table>
        </Card>
      )}
    </>
  );
}
