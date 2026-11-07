import Link from "next/link";
import { exigirSessao, noEscopo } from "@/lib/auth";
import { facaHoje, multasAbertas, regra } from "@/lib/services/multas";
import { melhorValorHoje, pagavel, valoresMulta } from "@/lib/domain/ctb";
import { hojeISO, nomeMes } from "@/lib/domain/dates";
import { brl } from "@/lib/domain/money";
import { Cabecalho, Card, ChipPrazo, Numero, Vazio } from "@/components/ui";
import { Placa, Vigi } from "@/components/marca";
import { GraficoEconomia, type MesEconomia } from "@/components/grafico-economia";
import { adicionarCarrinho } from "../../actions";
import { redirect } from "next/navigation";

export const metadata = { title: "Faça hoje" };

function saudacao() {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export default async function Hoje({ searchParams }: { searchParams: Promise<{ todos?: string }> }) {
  const s = await exigirSessao();
  const { todos } = await searchParams;
  const visaoCarteira = s.nivel !== "cliente" && (todos === "1" || !s.clienteId);
  if (!visaoCarteira && !s.clienteId) redirect("/carteira");
  const cid = visaoCarteira ? null : s.clienteId;
  const hoje = hojeISO();

  const dados = await noEscopo(s, async (db) => {
    const acoes = await facaHoje(db, cid, 10);
    const abertas = await multasAbertas(db, cid);
    const filtro = cid ? "where cliente_id = $1" : "";
    const p = cid ? [cid] : [];
    const placas = await db.one(`select count(*) filter (where status <> 'pausada') as total, count(*) filter (where ultima_verificacao > now() - interval '24 hours') as recentes,
      max(ultima_verificacao) as ultima, min(proxima_verificacao) filter (where status <> 'pausada') as proxima,
      count(*) filter (where status <> 'pausada' and sne_adesao_em is not null) as sne from placas ${filtro}`, p);
    const eco = await db.q<{ mes: string; tipo: string; v: number }>(`select mes, tipo, sum(valor) as v from economias ${filtro ? filtro + " and" : "where"} comprovada group by mes, tipo`, p);
    const desde = await db.one(`select min(mes) as m from economias ${filtro}`, p);
    const mensal = cid ? await db.one("select pl.preco_placa from clientes c join planos pl on pl.id = c.plano_id where c.id = $1", [cid]) : null;
    const perdido = await db.one(
      `select coalesce(sum(m.valor * 0.2),0)::int as v from multas m join placas pl on pl.id = m.placa_id
       where (pl.sne_adesao_em is null or pl.sne_adesao_em > m.data_infracao) and m.estado = 'paga' ${cid ? "and m.cliente_id = $1" : ""}`, p);
    return { acoes, abertas, placas, eco, desde: desde?.m as string | null, preco: mensal?.preco_placa ?? 0, perdido: perdido?.v ?? 0 };
  });

  const meses: MesEconomia[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 1 - i, 15)).toISOString().slice(0, 7);
    const doMes = dados.eco.filter((e) => e.mes === d);
    const v = (t: string) => doMes.filter((e) => e.tipo === t).reduce((a, e) => a + Number(e.v), 0);
    meses.push({ mes: d, desconto: v("desconto"), nic: v("nic_evitada"), cancelamento: v("cancelamento") });
  }
  const acumulada = dados.eco.reduce((a, e) => a + Number(e.v), 0);
  const mesAtual = meses[meses.length - 1];
  const totalMes = mesAtual.desconto + mesAtual.nic + mesAtual.cancelamento;

  let naMesa = 0, nMesa = 0, emAberto = 0;
  for (const m of dados.abertas) {
    emAberto += m.valor;
    if (pagavel(m.estado)) {
      const mv = melhorValorHoje(regra(m), hoje);
      if (mv.desconto) { naMesa += m.valor - mv.valor; nMesa++; }
    }
  }
  const prox7 = dados.acoes.filter((a) => a.dias <= 7);
  const nInd = prox7.filter((a) => a.tipo === "indicar").length;
  const nPlacas = Number(dados.placas?.total ?? 0);
  const mensalidade = nPlacas * dados.preco;
  const mesesDesde = dados.desde ? Math.max(1, (Number(hoje.slice(0, 4)) - Number(dados.desde.slice(0, 4))) * 12 + Number(hoje.slice(5, 7)) - Number(dados.desde.slice(5, 7)) + 1) : 0;
  const roi = mensalidade && mesesDesde ? acumulada / (mensalidade * mesesDesde) : 0;
  const ultima = dados.placas?.ultima ? new Date(dados.placas.ultima).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <>
      <Cabecalho
        sobre={visaoCarteira ? "Todos os clientes da carteira" : `${s.clienteNome} · ${nPlacas} placas`}
        titulo={`${saudacao()}! Aqui está o que precisa de você hoje.`}
        acoes={<div className="text-right text-xs text-suave">Última verificação: {ultima}<br />{dados.placas?.recentes} de {nPlacas} placas nas últimas 24h</div>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero destaque rotulo="Economia acumulada" valor={brl(acumulada)} detalhe={dados.desde ? `Desde ${nomeMes(dados.desde).split(" de ")[0]}${roi ? ` · cada R$ 1 investido voltou ${brl(Math.round(roi * 100))}` : ""}` : "Comprovada multa a multa"} />
        <Numero rotulo="Dinheiro na mesa" tom="economia" valor={brl(naMesa)} detalhe={`Descontos ainda disponíveis em ${nMesa} multa${nMesa === 1 ? "" : "s"}`} />
        <Numero rotulo="Prazos nos próximos 7 dias" tom={prox7.length ? "rec" : "normal"} valor={prox7.length} detalhe={`${nInd} indicaç${nInd === 1 ? "ão" : "ões"} de condutor · ${prox7.length - nInd} outro(s)`} />
        <Numero rotulo="Em aberto" valor={brl(emAberto)} detalhe={`${dados.abertas.length} multas não pagas`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card titulo="Faça hoje" acoes={dados.acoes.some((a) => a.tipo.startsWith("pagar")) && !visaoCarteira ? (
          <form action={adicionarCarrinho}>
            {dados.acoes.filter((a) => a.tipo.startsWith("pagar")).map((a) => <input key={a.multa.id} type="hidden" name="multaId" value={a.multa.id} />)}
            <input type="hidden" name="volta" value="/hoje" />
            <button className="btn-economia btn-sm">Pagar todas com desconto num Pix só</button>
          </form>
        ) : null}>
          {dados.acoes.length === 0 ? (
            <Vazio>
              <div className="flex flex-col items-center gap-2"><Vigi pose="economia" size={90} />Nada para hoje. Eu sigo vigiando suas placas.</div>
            </Vazio>
          ) : (
            <ul className="divide-y divide-borda">
              {dados.acoes.map((a) => (
                <li key={a.multa.id + a.tipo} className="flex items-center gap-3 py-3">
                  <div className="w-20 shrink-0"><ChipPrazo dias={a.dias} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
                      {a.titulo} · <Placa placa={a.multa.placa} tamanho="sm" />
                    </div>
                    <div className="truncate text-xs text-suave">
                      {visaoCarteira && <b className="text-vigia">{a.multa.cliente_nome} · </b>}
                      {a.detalhe} · {a.multa.descricao} · {a.multa.orgao_nome}
                    </div>
                  </div>
                  {a.tipo.startsWith("pagar") && !visaoCarteira ? (
                    <form action={adicionarCarrinho}>
                      <input type="hidden" name="multaId" value={a.multa.id} />
                      <input type="hidden" name="volta" value="/hoje" />
                      <button className="btn-economia btn-sm">{a.botao}</button>
                    </form>
                  ) : (
                    <Link href={`/multas/${a.multa.id}`} className={a.tipo === "defesa" ? "btn-contorno btn-sm" : "btn-primario btn-sm"}>{a.botao}</Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card titulo="Economia por mês" acoes={<Vigi pose="economia" size={44} />}>
          <GraficoEconomia meses={meses} mensalidade={mensalidade} />
          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-suave">Descontos obtidos</dt><dd className="num font-semibold">{brl(mesAtual.desconto)}</dd></div>
            <div className="flex justify-between"><dt className="text-suave">Multas NIC evitadas</dt><dd className="num font-semibold">{brl(mesAtual.nic)}</dd></div>
            <div className="flex justify-between border-t border-borda pt-1.5"><dt className="font-semibold capitalize">{nomeMes(mesAtual.mes).split(" de ")[0]}</dt><dd className="num font-bold text-economia">{brl(totalMes)}</dd></div>
          </dl>
          {!visaoCarteira && <Link href="/extrato" className="link mt-3 inline-block text-sm">Ver extrato completo</Link>}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card titulo="Proteção SNE">
          <div className="flex items-center gap-4">
            <div className="num text-3xl font-extrabold">{nPlacas ? Math.round((Number(dados.placas?.sne ?? 0) / nPlacas) * 100) : 0}%</div>
            <div className="text-sm text-suave">das placas aderidas ao SNE. Sem adesão antes da infração, o desconto cai de 40% para 20%.
              {dados.perdido > 0 && <> Já deixou de economizar <b className="text-rec">{brl(dados.perdido)}</b> por falta de adesão.</>}
            </div>
          </div>
          {!visaoCarteira && <Link href="/placas" className="link mt-3 inline-block text-sm">Ver placas sem SNE</Link>}
        </Card>
        <Card titulo="Cobertura">
          <p className="text-sm text-suave">
            <b className="text-vigia">{dados.placas?.recentes} de {nPlacas}</b> placas verificadas nas últimas 24 horas. Próxima varredura: <b className="text-vigia">{dados.placas?.proxima?.split("-").reverse().join("/") ?? "—"}</b>.
          </p>
          <p className="mt-2 text-xs text-suave">Consulta automática nas fontes oficiais e controle de 100% das multas notificadas. Recebeu uma carta que não está aqui? <Link className="link" href="/enviar">Envie a foto</Link>.</p>
        </Card>
      </div>
    </>
  );
}
