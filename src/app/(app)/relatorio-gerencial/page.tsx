import { exigirSessao, noEscopo } from "@/lib/auth";
import { brl } from "@/lib/domain/money";
import { hojeISO } from "@/lib/domain/dates";
import { ehTipoPeriodo, resolverPeriodo, textoPeriodo, type TipoPeriodo } from "@/lib/domain/periodo";
import { gerarRelatorioGerencial, type RelatorioGerencial } from "@/lib/services/relatorio-gerencial";
import { Logo } from "@/components/marca";
import { BotaoImprimir } from "@/components/imprimir";
import { PeriodoGerencial } from "@/components/periodo-gerencial";
import { LogoOrgao } from "@/components/logo-orgao";
import { Vazio } from "@/components/ui";

export const metadata = { title: "Relatório Gerencial" };

const PERMITIDOS: TipoPeriodo[] = ["mes", "trimestre", "semestre", "ano", "personalizado"];
const NOME_PERIODO: Record<string, string> = { mes: "Mensal", trimestre: "Trimestral", semestre: "Semestral", ano: "Anual", personalizado: "Personalizado" };
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const fmtDoc = (d: string) => d.length === 14 ? d.replace(/^(..)(...)(...)(....)(..)$/, "$1.$2.$3/$4-$5") : d.length === 11 ? d.replace(/^(...)(...)(...)(..)$/, "$1.$2.$3-$4") : d;
const vezes = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: x < 10 ? 1 : 0 });

function Barra({ rotulo, valor, max, detalhe, cor = "bg-vigia" }: { rotulo: React.ReactNode; valor: number; max: number; detalhe: string; cor?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-sm">
      <span className="truncate">{rotulo}</span>
      <div className="h-2.5 rounded-full bg-nevoa"><div className={`h-2.5 rounded-full ${cor}`} style={{ width: `${max ? Math.max(3, (valor / max) * 100) : 0}%` }} /></div>
      <span className="num whitespace-nowrap text-right text-xs text-suave">{detalhe}</span>
    </div>
  );
}

function Secao({ n, titulo, sub, children }: { n: string; titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-3xl border border-borda bg-white p-6 sm:p-8">
      <div className="mb-5 flex items-baseline gap-3">
        <span className="num text-sm font-extrabold text-ambar">{n}</span>
        <div><h2 className="text-xl font-extrabold">{titulo}</h2>{sub && <p className="text-sm text-suave">{sub}</p>}</div>
      </div>
      {children}
    </section>
  );
}

function Relatorio({ r }: { r: RelatorioGerencial }) {
  const e = r.economia;
  const maxEcon = Math.max(e.desc40.valor, e.desc20.valor, e.nic.valor, e.defesa.valor, 1);
  const maxMes = Math.max(...r.multas.porMes.map((m) => m.qtd), 1);
  const maxGrav = Math.max(...r.multas.porGravidade.map((g) => g.qtd), 1);
  const totalMultas = r.multas.qtd + r.antt.qtd;
  return (
    <div className="space-y-5 print:space-y-4">
      {/* Capa */}
      <header className="overflow-hidden rounded-3xl bg-vigia p-8 text-white sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Logo negativo tamanho={26} />
          <div className="text-right text-xs text-white/60">Relatório Gerencial<br />gerado em {r.geradoEm.split("-").reverse().join("/")}</div>
        </div>
        <p className="mt-10 text-sm font-semibold uppercase tracking-[0.2em] text-ambar">Resultado do período · {textoPeriodo(r.periodo)}</p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">{r.cliente.nome}</h1>
        <p className="mt-1 text-sm text-white/70">{fmtDoc(r.cliente.documento)}{r.cliente.grupo ? ` · ${r.cliente.grupo}` : ""} · plano {r.cliente.plano}</p>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/90">
          Multa não é custo fixo. Com o Vigia Placa monitorando sua frota todos os dias, cada autuação chega a tempo de indicar o condutor,
          pagar com desconto ou contestar. Este relatório mostra, em números, quanto isso significou para a sua empresa.
        </p>
      </header>

      {/* Números principais */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl bg-economia p-6 text-white sm:col-span-1">
          <div className="text-sm font-semibold text-white/80">Economia no período</div>
          <div className="num mt-1 text-3xl font-extrabold lg:text-4xl print:text-2xl">{brl(e.total)}</div>
          <div className="mt-1 text-xs text-white/75">descontos, NIC evitada e defesas</div>
        </div>
        <div className="rounded-3xl border border-borda bg-white p-6">
          <div className="text-sm font-semibold text-suave">Investimento no Vigia Placa</div>
          <div className="num mt-1 text-3xl font-extrabold lg:text-4xl print:text-2xl">{brl(r.investimento.total)}</div>
          <div className="mt-1 text-xs text-suave">mensalidades{r.investimento.saving ? ", saving" : ""}{r.investimento.defesa ? ", defesas" : ""}{r.investimento.conveniencia ? " e conveniência" : ""}</div>
        </div>
        <div className="rounded-3xl border-2 border-ambar bg-ambar/10 p-6">
          <div className="text-sm font-semibold text-vigia">Retorno sobre o investimento</div>
          {r.retorno !== null ? (
            <>
              <div className="num mt-1 text-3xl font-extrabold lg:text-4xl print:text-2xl">{vezes(r.retorno)}x</div>
              <div className="mt-1 text-xs text-vigia/80">para cada R$ 1,00 investido, {brl(Math.round(r.retorno * 100))} de economia</div>
            </>
          ) : <div className="mt-2 text-sm text-suave">Sem cobrança no período.</div>}
        </div>
      </div>

      <Secao n="01" titulo="Sua frota monitorada" sub="Veículos acompanhados por placa e Renavam em bases oficiais redundantes.">
        <div className="flex flex-wrap items-end gap-8">
          <div><div className="num text-5xl font-extrabold">{r.frota.total}</div><div className="text-sm text-suave">veículo{r.frota.total === 1 ? "" : "s"} ativo{r.frota.total === 1 ? "" : "s"}</div></div>
          <div className="flex flex-wrap gap-2">
            {r.frota.porTipo.map((t) => <span key={t.tipo} className="rounded-full bg-nevoa px-3 py-1.5 text-sm"><b className="num">{t.qtd}</b> {t.tipo}</span>)}
          </div>
          <div className="text-sm text-suave">{r.frota.comSne || r.cliente.sne_cadastrado ? <>🟢 {r.cliente.sne_cadastrado ? "Empresa registrada no SNE" : `${r.frota.comSne} veículo(s) com adesão ao SNE`}: direito a <b className="text-vigia">40% de desconto</b>.</> : <>Sem adesão ao SNE: os descontos ficam em 20%. Aderir dá direito a <b className="text-vigia">40%</b>.</>}</div>
        </div>
      </Secao>

      <Secao n="02" titulo="Multas recebidas no período" sub="Infrações de trânsito por placa e autuações da ANTT no CNPJ.">
        {totalMultas === 0 ? <Vazio>Nenhuma multa no período. Frota em dia! 🎉</Vazio> : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-nevoa p-4"><div className="num text-3xl font-extrabold">{r.multas.qtd}</div><div className="text-xs text-suave">multas de trânsito</div></div>
                <div className="rounded-2xl bg-nevoa p-4"><div className="num text-2xl font-extrabold">{brl(r.multas.valor)}</div><div className="text-xs text-suave">em valor cheio</div></div>
                <div className="rounded-2xl bg-nevoa p-4"><div className="num text-3xl font-extrabold">{r.multas.pontos}</div><div className="text-xs text-suave">pontos na CNH</div></div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-suave">Por gravidade</div>
                {r.multas.porGravidade.map((g) => <Barra key={g.gravidade} rotulo={g.rotulo} valor={g.qtd} max={maxGrav} detalhe={`${g.qtd}`} cor={g.gravidade === "gravissima" ? "bg-rec" : g.gravidade === "grave" ? "bg-ambar" : "bg-vigia"} />)}
              </div>
              {r.multas.porMes.length > 1 && (
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-suave">Por mês</div>
                  <div className="flex h-28 items-end gap-2">
                    {r.multas.porMes.map((m) => (
                      <div key={m.chave} className="flex flex-1 flex-col items-center gap-1">
                        <span className="num text-[11px] font-bold">{m.qtd}</span>
                        <div className="w-full rounded-t-lg bg-vigia" style={{ height: `${(m.qtd / maxMes) * 80}px` }} />
                        <span className="text-[10px] text-suave">{MESES[Number(m.chave.slice(5)) - 1]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-5">
              {r.multas.porOrgao.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-suave">Órgãos que mais autuaram</div>
                  {r.multas.porOrgao.map((o) => <Barra key={o.chave} rotulo={o.chave} valor={o.qtd} max={r.multas.porOrgao[0].qtd} detalhe={`${o.qtd} · ${brl(o.valor)}`} />)}
                </div>
              )}
              {r.multas.porPlaca.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-suave">Veículos com mais multas</div>
                  {r.multas.porPlaca.map((o) => <Barra key={o.chave} rotulo={<span className="font-mono font-bold">{o.chave}</span>} valor={o.qtd} max={r.multas.porPlaca[0].qtd} detalhe={`${o.qtd} · ${brl(o.valor)}`} cor="bg-ambar" />)}
                </div>
              )}
              <div className="flex items-center gap-4 rounded-2xl border border-borda p-4">
                <LogoOrgao id="ANTT" nome="ANTT" tamanho="md" />
                <div className="text-sm">
                  {r.cliente.antt_ativo || r.antt.qtd ? (
                    <><b className="num">{r.antt.qtd}</b> autuação(ões) da ANTT no CNPJ · <b className="num">{brl(r.antt.valor)}</b>{r.antt.impeditivas ? <span className="text-rec"> · {r.antt.impeditivas} impeditiva(s)</span> : null}</>
                  ) : <span className="text-suave">Monitoramento da ANTT (SIFAMA) não ativado. Ative para acompanhar RNTRC, vale-pedágio e frete.</span>}
                </div>
              </div>
            </div>
          </div>
        )}
      </Secao>

      <Secao n="03" titulo="Onde está a sua economia" sub="Valores que deixaram de sair do caixa graças ao monitoramento e às ações no prazo.">
        <div className="space-y-3">
          <Barra rotulo="Desconto de 40% (SNE)" valor={e.desc40.valor} max={maxEcon} detalhe={`${e.desc40.qtd} multa(s) · ${brl(e.desc40.valor)}`} cor="bg-rec" />
          <Barra rotulo="Desconto de 20%" valor={e.desc20.valor} max={maxEcon} detalhe={`${e.desc20.qtd} multa(s) · ${brl(e.desc20.valor)}`} cor="bg-ambar" />
          <Barra rotulo="NIC evitada" valor={e.nic.valor} max={maxEcon} detalhe={`${e.nic.qtd} condutor(es) indicado(s) · ${brl(e.nic.valor)}`} cor="bg-economia" />
          <Barra rotulo="Defesas deferidas" valor={e.defesa.valor} max={maxEcon} detalhe={`${e.defesa.qtd} multa(s) cancelada(s) · ${brl(e.defesa.valor)}`} cor="bg-vigia" />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-economia-100 p-4">
          <span className="font-semibold text-economia">Economia total comprovada no período</span>
          <span className="num text-2xl font-extrabold text-economia">{brl(e.total)}</span>
        </div>
        <p className="mt-3 text-xs text-suave">NIC: multa por não indicar o condutor, que em veículo de empresa custa o dobro da original. Indicando no prazo, ela não existe.</p>
      </Secao>

      {r.oportunidade.multas > 0 && (
        <Secao n="04" titulo="Ainda dá para economizar" sub="Multas em aberto hoje que ainda têm desconto.">
          <p className="text-lg">Pagando no prazo as <b className="num">{r.oportunidade.multas}</b> multa(s) em aberto com desconto disponível, sua empresa economiza mais <b className="num text-economia">{brl(r.oportunidade.valor)}</b>.</p>
        </Secao>
      )}

      <section className="break-inside-avoid rounded-3xl bg-vigia p-8 text-white">
        <h2 className="text-2xl font-extrabold">O Vigia Placa trabalha enquanto sua frota roda</h2>
        <div className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
          <div><b className="block text-ambar">Monitoramento diário</b>Consultas automáticas em bases oficiais redundantes (Serpro, PRF, DNIT, Detrans e ANTT): se uma fonte falha, a outra cobre.</div>
          <div><b className="block text-ambar">Prazos que não se perdem</b>Aviso imediato de cada multa nova, indicação de condutor e pagamento com o maior desconto possível.</div>
          <div><b className="block text-ambar">Gestão de verdade</b>Ranking de condutores, CNHs vencendo, defesas e relatórios para decidir com dados, não com sustos.</div>
        </div>
        <p className="mt-6 text-xs text-white/60">Vigia Placa · www.vigiaplaca.com.br{process.env.SITE_WHATSAPP ? ` · WhatsApp (${process.env.SITE_WHATSAPP.slice(2, 4)}) ${process.env.SITE_WHATSAPP.slice(4, 9)}-${process.env.SITE_WHATSAPP.slice(9)}` : ""}</p>
      </section>
    </div>
  );
}

export default async function RelatorioGerencialPage({ searchParams }: { searchParams: Promise<{ cliente?: string; periodo?: string; mes?: string; de?: string; ate?: string }> }) {
  const s = await exigirSessao();
  const sp = await searchParams;
  const hoje = hojeISO();
  const tipo: TipoPeriodo = ehTipoPeriodo(sp.periodo) && PERMITIDOS.includes(sp.periodo) ? sp.periodo : "mes";
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : hoje.slice(0, 7);
  const periodo = resolverPeriodo(tipo, hoje, { mes, de: sp.de, ate: sp.ate })!;
  const ehEquipe = s.nivel !== "cliente";
  const clienteId = ehEquipe ? sp.cliente || null : s.clienteId;
  const d = await noEscopo(s, async (db) => ({
    clientes: ehEquipe ? await db.q<{ id: string; nome: string }>("select id, nome from clientes where excluido_em is null order by nome") : [],
    r: clienteId ? await gerarRelatorioGerencial(db, clienteId, periodo).catch(() => null) : null,
  }));
  return (
    <div className="mx-auto max-w-5xl">
      <form className="nao-imprimir mb-6 flex flex-wrap items-end gap-2 rounded-2xl border border-borda bg-white p-4">
        {ehEquipe && (
          <div><label className="rotulo">Cliente</label><select name="cliente" defaultValue={clienteId ?? ""} required className="campo w-72"><option value="" disabled>Escolha o cliente…</option>{d.clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
        )}
        <PeriodoGerencial valor={tipo} mes={mes} de={sp.de} ate={sp.ate} />
        <button className="btn-contorno">Gerar</button>
        {d.r && <div className="ml-auto"><BotaoImprimir rotulo="Imprimir / Salvar PDF" /></div>}
      </form>
      {!clienteId ? <Vazio>Escolha o cliente e o período para gerar o Relatório Gerencial.</Vazio>
        : !d.r ? <Vazio>Cliente não encontrado.</Vazio>
        : <><p className="nao-imprimir mb-3 text-xs text-suave">{NOME_PERIODO[tipo]} · {textoPeriodo(periodo)}</p><Relatorio r={d.r} /></>}
    </div>
  );
}
