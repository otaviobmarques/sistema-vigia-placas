import Link from "next/link";
import { exigirSessao, noEscopo } from "@/lib/auth";
import { facaHoje } from "@/lib/services/multas";
import { hojeISO } from "@/lib/domain/dates";
import { brl } from "@/lib/domain/money";
import { Cabecalho, Card, Mensagem, Numero, Vazio } from "@/components/ui";
import { bloquearCliente, entrarCliente, excluirCliente, salvarCobrancaCliente } from "../../actions";
import { CICLOS, type Ciclo } from "@/lib/domain/ciclo";
import { CamposPrecosCliente } from "@/components/precos-cliente";
import { franquiasAtivas } from "@/lib/acesso";

export const metadata = { title: "Clientes" };
const FORMA: Record<string, string> = { pix: "Pix", boleto: "Boleto", cartao: "Cartão" };

export default async function Carteira({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; erro?: string }> }) {
  const s = await exigirSessao(["franqueado", "franqueadora"]);
  const sp = await searchParams;
  const mes = hojeISO().slice(0, 7);
  const d = await noEscopo(s, async (db) => {
    const clientes = await db.q(
      `select c.id, c.nome, c.documento, c.segmento, (select g.nome from grupos_economicos g where g.id = c.grupo_id) as grupo, pl.nome as plano, coalesce(c.preco_placa_personalizado, pl.preco_placa) as preco_placa, c.preco_placa_personalizado, c.saving_bps_personalizado, pl.saving_bps as plano_saving_bps, c.forma_cobranca, c.ciclo_fechamento, c.vencimento_dias, c.bloqueado_em, c.motivo_bloqueio, c.preco_defesa_personalizado, c.taxa_conv_tipo_personalizado, c.taxa_conv_valor_personalizado, f.nome as franqueado, f.repasse_mensalidade_bps, f.repasse_saving_bps,
         (select count(*) from placas p where p.cliente_id = c.id and p.status <> 'pausada') as placas,
         (select count(*) from multas m where m.cliente_id = c.id and m.estado not in ('paga','cancelada')) as abertas,
         (select coalesce(sum(valor),0) from economias e where e.cliente_id = c.id and e.mes = $1 and e.comprovada) as economia_mes,
         (select max(a.data) from auditoria a where a.cliente_id = c.id) as ultima_acao
       from clientes c join planos pl on pl.id = c.plano_id left join franqueados f on f.id = c.franqueado_id
       where c.ativo ${sp.q ? "and (c.nome ilike $2 or c.documento ilike $2 or exists (select 1 from placas p where p.cliente_id = c.id and p.placa ilike $2))" : ""}`,
      sp.q ? [mes, `%${sp.q.replace(/[^\w\s]/g, "")}%`] : [mes],
    );
    const acoes = await facaHoje(db, null, 1000);
    const conv = await db.one("select coalesce(sum(split_franqueado),0) as v from pagamentos where to_char(pago_em,'YYYY-MM') = $1", [mes]);
    return { clientes, acoes, conv: Number(conv?.v ?? 0) };
  });
  const prazos = (cid: string) => d.acoes.filter((a) => a.multa.cliente_id === cid && a.dias <= 7).length;
  const lista = [...d.clientes].sort((a, b) => prazos(b.id) - prazos(a.id) || Number(b.abertas) - Number(a.abertas));
  const placas = d.clientes.reduce((a, c) => a + Number(c.placas), 0);
  const prazos7 = d.acoes.filter((a) => a.dias <= 7).length;
  const comissao =
    d.clientes.reduce((a, c) => a + Math.round((Number(c.placas) * (c.preco_placa ?? 0) * (c.repasse_mensalidade_bps ?? 0)) / 10000) + Math.round((Number(c.economia_mes) * 2000 * (c.repasse_saving_bps ?? 0)) / 1e8), 0) + d.conv;
  const emRisco = d.clientes.filter((c) => Number(c.placas) > 0 && Number(c.economia_mes) === 0 && Number(c.abertas) === 0).length;

  return (
    <>
      <Cabecalho
        sobre={s.nivel === "franqueado" ? "Franqueado" : "Vigia Placa · todos os clientes"}
        titulo={s.nivel === "franqueado" ? "Sua carteira" : "Clientes"}
        acoes={<><Link href="/placas/importar" className="btn-contorno">Importar planilha</Link><Link href="/clientes/novo" className="btn-primario">+ Novo cliente</Link></>}
      />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Clientes ativos" valor={d.clientes.length} detalhe={emRisco ? `${emRisco} sem movimento (risco de cancelamento)` : undefined} />
        <Numero rotulo="Placas vigiadas" valor={placas} />
        <Numero rotulo="Prazos em 7 dias" tom={prazos7 ? "rec" : "normal"} valor={prazos7} />
        {s.nivel === "franqueado"
          ? <Numero destaque rotulo="Sua comissão no mês (estimada)" valor={brl(comissao)} detalhe="Mensalidades + saving + conveniência" />
          : <Numero destaque rotulo="Mensalidades no mês" valor={brl(d.clientes.reduce((a, c) => a + Number(c.placas) * (c.preco_placa ?? 0), 0))} detalhe="placas ativas × preço de cada cliente" />}
      </div>
      <Card titulo="Clientes" acoes={<form><input name="q" defaultValue={sp.q} placeholder="Nome, CPF/CNPJ ou placa" className="campo w-64" /></form>}>
        {lista.length === 0 ? <Vazio>Nenhum cliente encontrado.</Vazio> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="tabela min-w-[900px]">
              <thead><tr><th>Cliente</th><th>Preço</th><th>Placas</th><th>Multas em aberto</th><th>Prazos em 7 dias</th><th>Economia no mês</th><th /></tr></thead>
              <tbody>
                {lista.map((c) => {
                  const p = prazos(c.id);
                  return (
                    <tr key={c.id}>
                      <td><div className="font-semibold">{c.nome}{c.bloqueado_em && <span className="ml-2 rounded bg-rec-100 px-1.5 py-0.5 text-[11px] font-bold text-rec">Bloqueado</span>}</div>{c.bloqueado_em && c.motivo_bloqueio && <div className="text-xs text-rec">{c.motivo_bloqueio}</div>}<div className="text-xs text-suave">{c.grupo && <span className="mr-1 rounded bg-nevoa px-1.5 py-0.5 font-semibold text-vigia">🏢 {c.grupo}</span>}{c.segmento} · plano {c.plano}{s.nivel === "franqueadora" && franquiasAtivas() ? ` · ${c.franqueado ?? "direto"}` : ""}</div></td>
                      <td className="whitespace-nowrap text-xs">
                        <b className="num">{c.preco_placa ? brl(c.preco_placa) : "[DEFINIR]"}</b>/placa
                        <div className="text-suave">saving {((c.saving_bps_personalizado ?? c.plano_saving_bps ?? 2000) / 100).toLocaleString("pt-BR")}%{c.preco_placa_personalizado !== null || c.saving_bps_personalizado !== null ? <span className="ml-1 rounded bg-ambar-100 px-1 font-semibold text-[#6b4700]">personalizado</span> : ""}</div>
                        <div className="text-suave">{FORMA[c.forma_cobranca] ?? c.forma_cobranca} · fecha {(CICLOS[c.ciclo_fechamento as Ciclo] ?? "Mensal").split(" (")[0].toLowerCase()} · vence +{c.vencimento_dias}d</div>
                        {s.nivel === "franqueadora" && (
                          <details className="relative">
                            <summary className="link cursor-pointer list-none text-xs">Alterar cobrança</summary>
                            <form action={salvarCobrancaCliente} className="mt-2 w-80 space-y-2 rounded-xl border border-borda bg-white p-3 shadow-lg">
                              <input type="hidden" name="clienteId" value={c.id} />
                              <CamposPrecosCliente c={c} compacto plano={c.plano} />
                              <div><label className="rotulo">Forma de pagamento</label><select name="forma_cobranca" defaultValue={c.forma_cobranca} className="campo py-1.5"><option value="pix">Pix</option><option value="boleto">Boleto</option><option value="cartao">Cartão de crédito</option></select></div>
                              <div className="grid grid-cols-2 gap-2">
                                <div><label className="rotulo">Fechamento</label><select name="ciclo_fechamento" defaultValue={c.ciclo_fechamento} className="campo py-1.5">{Object.entries(CICLOS).map(([k, v]) => <option key={k} value={k}>{v.split(" (")[0]}</option>)}</select></div>
                                <div><label className="rotulo">Vence em (dias)</label><input name="vencimento_dias" type="number" min={0} max={60} defaultValue={c.vencimento_dias} className="campo py-1.5" /></div>
                              </div>
                              <p className="text-[11px] text-suave">Em branco = valores do plano ou o padrão do sistema. Vale a partir da próxima fatura ou cobrança.</p>
                              <button className="btn-primario btn-sm w-full">Salvar</button>
                            </form>
                          </details>
                        )}
                      </td>
                      <td>{c.placas}</td><td>{c.abertas}</td>
                      <td>{p ? <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold ${p >= 3 ? "bg-[#b3261e] text-white" : "bg-ambar text-vigia"}`}>{p}</span> : "—"}</td>
                      <td className={`num ${Number(c.economia_mes) ? "font-semibold text-economia" : "text-suave"}`}>{brl(Number(c.economia_mes))}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-3 whitespace-nowrap text-sm">
                          <a href={`/placas/nova?cliente=${c.id}`} className="link">+ Placa</a>
                          <form action={entrarCliente}><input type="hidden" name="clienteId" value={c.id} /><input type="hidden" name="destino" value="/placas/importar" /><button className="link">Importar</button></form>
                          <form action={entrarCliente}><input type="hidden" name="clienteId" value={c.id} /><button className="link">Abrir</button></form>
                        </div>
                        {s.nivel === "franqueadora" && (
                          <div className="mt-1 flex justify-end gap-3 text-xs">
                            {c.bloqueado_em ? (
                              <form action={bloquearCliente}><input type="hidden" name="clienteId" value={c.id} /><input type="hidden" name="acao" value="desbloquear" /><button className="link">Desbloquear</button></form>
                            ) : (
                              <details className="relative">
                                <summary className="cursor-pointer list-none font-semibold text-[#9a5b00] underline">Bloquear</summary>
                                <form action={bloquearCliente} className="mt-2 w-72 space-y-2 rounded-xl border border-borda bg-white p-3 text-left shadow-lg">
                                  <input type="hidden" name="clienteId" value={c.id} />
                                  <p className="text-xs">Os usuários do cliente perdem o acesso na hora e as placas param de ser consultadas. Dá para desbloquear depois.</p>
                                  <input name="motivo" placeholder="Motivo (ex.: inadimplência)" className="campo py-1.5" />
                                  <button className="btn-ambar btn-sm w-full">Bloquear {c.nome}</button>
                                </form>
                              </details>
                            )}
                            <details className="relative">
                              <summary className="cursor-pointer list-none font-semibold text-rec underline">Excluir</summary>
                              <form action={excluirCliente} className="mt-2 w-80 space-y-2 rounded-xl border-2 border-rec bg-white p-3 text-left shadow-lg">
                                <input type="hidden" name="clienteId" value={c.id} />
                                <p className="text-sm font-bold text-rec">⚠ Excluir {c.nome}?</p>
                                <p className="text-xs">Os acessos do cliente são encerrados, as {c.placas} placa(s) saem do monitoramento e da cobrança e o cliente some das listas. O histórico de multas, pagamentos e faturas fica guardado. <b>Não dá para desfazer pela tela.</b></p>
                                <label className="rotulo">Digite o nome do cliente para confirmar</label>
                                <input name="confirmacao" required autoComplete="off" placeholder={c.nome} className="campo py-1.5" />
                                <button className="btn btn-sm w-full bg-rec text-white hover:bg-[#c42f3b]">Excluir definitivamente</button>
                              </form>
                            </details>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-suave">Mostrando {lista.length} clientes, ordenados pelos prazos mais urgentes.</p>
      </Card>
    </>
  );
}
