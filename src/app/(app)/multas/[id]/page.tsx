import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirCliente, noEscopo } from "@/lib/auth";
import { SELECT_MULTA, regra, type MultaRow } from "@/lib/services/multas";
import { recomendacao } from "@/lib/domain/acoes";
import { simularIndicacao } from "@/lib/domain/condutores";
import { listarCondutores } from "@/lib/services/condutores";
import { GRAVIDADES, elegivel40, melhorValorHoje, pagavel, prazoIndicacao, valoresMulta, ESTADOS } from "@/lib/domain/ctb";
import { dataBR, dataCurta, diasEntre, hojeISO } from "@/lib/domain/dates";
import { brl } from "@/lib/domain/money";
import { Aviso, Card, ChipEstado, ChipPrazo, Mensagem } from "@/components/ui";
import { Placa, Vigi } from "@/components/marca";
import { adicionarCarrinho, indicar, pedirDefesaAction, protocolar, reconhecerSne } from "../../../actions";
import { precosDoCliente } from "@/lib/services/precos";
import { LogoOrgao, logoDoOrgao } from "@/components/logo-orgao";
import { SelosDesconto } from "@/components/selo-desconto";
import { selosDesconto } from "@/lib/domain/ctb";

export default async function DetalheMulta({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await exigirCliente();
  const { id } = await params;
  const sp = await searchParams;
  const d = await noEscopo(s, async (db) => {
    const m = await db.one<MultaRow>(`${SELECT_MULTA} where m.id = $1 and m.cliente_id = $2`, [id, s.clienteId]);
    if (!m) return null;
    return {
      m,
      eventos: await db.q("select * from eventos where multa_id = $1 order by data", [id]),
      condutores: (await listarCondutores(db, s.clienteId)).filter((c) => c.ativo),
      principal: (await db.one("select condutor_principal_id as id from placas where id = (select placa_id from multas where id = $1)", [id]))?.id ?? null,
      defesa: await db.one("select * from pedidos_defesa where multa_id = $1 order by criado_em desc limit 1", [id]),
      cfg: { preco_defesa: (await precosDoCliente(db, s.clienteId)).defesa },
      captura: await db.one("select arquivo_nome, origem from notificacoes_capturadas where multa_id = $1 limit 1", [id]),
    };
  });
  if (!d) notFound();
  const { m } = d;
  const hoje = hojeISO();
  const r = regra(m);
  const v = valoresMulta(r);
  const rec = recomendacao(r, hoje);
  const melhor = melhorValorHoje(r, hoje);
  const limInd = prazoIndicacao(m.notificada_em);
  const prazoPrincipal = m.tipo_proprietario === "PJ" && !m.condutor_id && limInd ? limInd : m.vencimento;
  const aberta = ESTADOS[m.estado].aberta;
  const pg = pagavel(m.estado);

  return (
    <>
      <Link href="/hoje" className="link mb-4 inline-block text-sm">← Voltar para Faça hoje</Link>
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Placa placa={m.placa} tamanho="lg" />
        <div className="min-w-0 flex-1">
          {logoDoOrgao(m.orgao_id) && <div className="mb-1"><LogoOrgao id={m.orgao_id} nome={m.orgao_nome} tamanho="md" /></div>}
          <h1 className="text-2xl font-extrabold">{m.descricao}</h1>
          <p className="text-sm text-suave">
            {GRAVIDADES[m.gravidade].rotulo} · {m.pontos} pontos · <LogoOrgao id={m.orgao_id} nome={m.orgao_nome} /> · {m.local} · {dataBR(m.data_infracao)}{m.hora ? `, ${m.hora}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2"><SelosDesconto selos={selosDesconto(r, hoje)} /><ChipEstado estado={m.estado} />{aberta && prazoPrincipal && <ChipPrazo prefixo="Prazo: " dias={diasEntre(hoje, prazoPrincipal)} />}</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card>
            <div className="mb-4 flex gap-3">
              <div className="shrink-0"><Vigi pose={rec.opcao === "contestar" || rec.opcao === "indicar" ? "alerta" : "ola"} size={64} /></div>
              <div>
                <h2 className="text-lg font-bold">Recomendação do Vigi</h2>
                <p className="text-sm text-suave"><b className="text-vigia">{rec.titulo}.</b> {rec.texto}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-borda p-3">
                <div className="text-xs text-suave">Valor cheio</div>
                <div className="num text-xl font-extrabold">{brl(v.cheio)}</div>
                <div className="text-xs text-economia">Sem desconto</div>
              </div>
              <div className={`rounded-xl border p-3 ${melhor.desconto === "20" ? "border-economia bg-economia-100/50" : "border-borda"}`}>
                <div className="text-xs text-suave">Pagar até o vencimento{m.vencimento ? ` (${dataCurta(m.vencimento)})` : ""}</div>
                <div className="num text-xl font-extrabold">{brl(v.com20)}</div>
                <div className="text-xs text-economia">Economia de {brl(v.cheio - v.com20)} (20%)</div>
              </div>
              <div className={`rounded-xl border p-3 ${v.com40 !== null ? "border-economia bg-economia-100/50" : "border-dashed border-borda opacity-70"}`}>
                <div className="text-xs text-suave">Reconhecer no SNE</div>
                {v.com40 !== null ? (
                  <><div className="num text-xl font-extrabold">{brl(v.com40)}</div><div className="text-xs text-economia">Economia de {brl(v.cheio - v.com40)} (40%)</div></>
                ) : (
                  <div className="mt-1 text-xs text-suave">{!m.sne_adesao_em ? "Cliente/placa sem registro no SNE." : !m.aderente_sne ? "Órgão não aderente ao SNE." : "Adesão ao SNE foi depois da infração."}</div>
                )}
              </div>
            </div>
            {aberta && (
              <div className="mt-4 flex flex-wrap gap-2">
                {pg && !m.no_carrinho && (
                  <form action={adicionarCarrinho}>
                    <input type="hidden" name="multaId" value={m.id} /><input type="hidden" name="volta" value={`/multas/${m.id}`} />
                    <button className="btn-economia">Adicionar ao carrinho · {brl(melhor.valor)}</button>
                  </form>
                )}
                {m.no_carrinho && <Link href="/pagamentos" className="btn-economia">Ir para o carrinho</Link>}
                {v.com40 !== null && m.estado !== "reconhecida_sne" && pg && (
                  <form action={reconhecerSne}><input type="hidden" name="multaId" value={m.id} /><button className="btn-contorno">Já reconheci no SNE</button></form>
                )}
                {m.tipo_proprietario === "PJ" && !m.condutor_id && <a href="#indicar" className="btn-contorno">Indicar condutor</a>}
              </div>
            )}
            {v.com40 !== null && m.estado !== "reconhecida_sne" && pg && (
              <p className="mt-3 text-xs text-suave">
                Para os 40%, o proprietário reconhece a infração no app/portal do SNE (o clique final é seu). Ao reconhecer, você abre mão de defesa e recurso.{" "}
                <a className="link" href="https://www.gov.br/pt-br/servicos/utilizar-o-sne-sistema-de-notificacao-eletronica" target="_blank" rel="noreferrer">Como fazer</a>
              </p>
            )}
          </Card>

          {m.tipo_proprietario === "PJ" && aberta && (
            <Card titulo="Indicação de condutor">
              <div id="indicar" />
              {!m.condutor_id ? (
                <>
                  <p className="mb-3 text-sm text-suave">
                    Veículo de empresa: indique quem dirigia até <b className="text-vigia">{dataBR(limInd)}</b> para evitar a multa NIC de <b className="text-rec">{brl(v.nic)}</b> (art. 257, § 8º).
                  </p>
                  {d.condutores.length ? (
                    <form action={indicar} className="space-y-2">
                      <input type="hidden" name="multaId" value={m.id} />
                      <div className="flex flex-wrap gap-2">
                        <select name="condutorId" className="campo max-w-md" required defaultValue={d.principal ?? undefined}>
                          {d.condutores.map((c) => {
                            const sim = simularIndicacao(c.situacao, m.pontos, m.gravidade === "gravissima");
                            return <option key={c.id} value={c.id}>{c.nome}{c.id === d.principal ? " (principal da placa)" : ""} · {c.situacao.pontos}→{sim.pontos} de {sim.limite} pts{sim.atingeLimite ? " · ATINGE O LIMITE" : ""}</option>;
                          })}
                        </select>
                        <button className="btn-primario">Enviar link de aceite</button>
                      </div>
                      {d.condutores.some((c) => simularIndicacao(c.situacao, m.pontos, m.gravidade === "gravissima").atingeLimite) && (
                        <Aviso tom="ambar">Atenção: para {d.condutores.filter((c) => simularIndicacao(c.situacao, m.pontos, m.gravidade === "gravissima").atingeLimite).map((c) => c.nome).join(", ")}, assumir esta multa ({m.pontos} pts) leva ao limite do art. 261 e pode suspender a CNH. Indique só quem realmente dirigia.</Aviso>
                      )}
                    </form>
                  ) : <Aviso>Cadastre um condutor em <Link className="link" href="/condutores">Condutores</Link> para indicar.</Aviso>}
                </>
              ) : (
                <div className="space-y-3 text-sm">
                  <p>Condutor: <b>{m.condutor_nome}</b> · situação: <b>{{ enviada: "link enviado, aguardando aceite", aceita: "aceita pelo condutor", protocolada: "protocolada no órgão", recusada: "recusada" }[m.indicacao_status ?? "enviada"]}</b>
                    {m.protocolo_indicacao && <> · protocolo {m.protocolo_indicacao}</>}</p>
                  {m.indicacao_status === "enviada" && m.indicacao_token && (
                    <p className="text-xs text-suave">Link de aceite: <Link className="link" href={`/condutor/${m.indicacao_token}`}>/condutor/{m.indicacao_token.slice(0, 8)}…</Link></p>
                  )}
                  {m.indicacao_status !== "protocolada" && (
                    <form action={protocolar} className="flex flex-wrap gap-2">
                      <input type="hidden" name="multaId" value={m.id} />
                      <input name="protocolo" placeholder="Nº do protocolo no órgão" className="campo max-w-xs" />
                      <button className="btn-contorno">Registrar protocolo</button>
                    </form>
                  )}
                </div>
              )}
            </Card>
          )}

          <Card titulo="Linha do tempo">
            <ol className="relative space-y-4 border-l-2 border-borda pl-5">
              {d.eventos.map((e) => (
                <li key={e.id} className="relative">
                  <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ${e.tipo === "detectada" ? "bg-ambar" : e.tipo === "paga" || e.tipo === "cancelada" ? "bg-economia" : "bg-vigia"}`} />
                  <div className="text-sm font-semibold">{new Date(e.data).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" })} · {e.descricao}</div>
                  {e.fonte && <div className="text-xs text-suave">Fonte: {e.fonte}{e.tipo === "detectada" && m.notificada_em ? ` · ${Math.max(0, diasEntre(m.detectada_em, m.notificada_em))} dias antes da carta` : ""}</div>}
                  {e.tipo === "notificada" && <div className="text-xs text-suave">Vencimento para pagar com desconto: {dataBR(m.vencimento)}{m.tipo_proprietario === "PJ" ? ` · indicação de condutor até ${dataBR(limInd)}` : ""}</div>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          {aberta && m.estado !== "em_defesa" && (
            <section className="rounded-2xl bg-vigia p-5 text-white">
              <h2 className="text-lg font-bold">Prefere contestar?</h2>
              <p className="mt-1 text-sm text-white/75">Nossa equipe analisa a multa e faz o recurso para você.{v.com40 !== null ? " Ao recorrer, o desconto de 40% deixa de valer." : ""}</p>
              <div className="num my-3 text-2xl font-extrabold text-ambar">{brl(d.cfg!.preco_defesa)}</div>
              <form action={pedirDefesaAction}><input type="hidden" name="multaId" value={m.id} /><button className="btn-ambar w-full">Quero que vocês recorram</button></form>
              <p className="mt-2 text-xs text-white/60">Cobrado na fatura do mês. Se a multa for cancelada, a economia entra no seu extrato.</p>
            </section>
          )}
          {d.defesa && (
            <Card titulo="Defesa">
              <p className="text-sm">Situação: <b>{{ aguardando_pagamento: "aguardando pagamento", em_andamento: "em andamento", deferida: "deferida: multa cancelada", indeferida: "indeferida" }[d.defesa.status as string]}</b></p>
              {d.defesa.protocolo && <p className="text-sm">Protocolo: {d.defesa.protocolo}</p>}
              {d.defesa.resultado && <p className="text-sm text-suave">{d.defesa.resultado}</p>}
            </Card>
          )}
          <Card titulo="Documentos">
            <ul className="space-y-2 text-sm">
              <li>{d.captura ? <>Notificação enviada pelo cliente: <b>{d.captura.arquivo_nome ?? d.captura.origem}</b></> : <span className="text-suave">Notificação da autuação: aguardando PDF do órgão</span>}</li>
              <li className="text-suave">Fonte da detecção: {m.fonte}</li>
              <li className="text-xs text-suave">Auto de infração nº {m.auto_infracao} · Código {m.codigo_infracao}</li>
              <li className="text-xs text-suave">Primeira detecção em {dataBR(m.detectada_em)}</li>
            </ul>
          </Card>
          <Card titulo="Elegibilidade">
            <ul className="space-y-1 text-sm">
              <li>{m.sne_adesao_em ? "✓" : "✗"} Proprietário no SNE {m.sne_adesao_em && m.sne_adesao_em > "1900-01-01" ? `desde ${dataBR(m.sne_adesao_em)}` : ""}</li>
              <li>{m.aderente_sne ? "✓" : "✗"} Órgão aderente ao SNE</li>
              <li>{elegivel40(r) ? "✓ Elegível a 40%" : "✗ Não elegível a 40%"}</li>
              {m.tipo_proprietario === "PJ" && <li>Pessoa jurídica: indicação evita NIC de {brl(v.nic)}</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
