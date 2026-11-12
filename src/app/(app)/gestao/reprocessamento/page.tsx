import Link from "next/link";
import { exigirSessao, noEscopo } from "@/lib/auth";
import { Cabecalho, Card, Mensagem, Numero, Vazio } from "@/components/ui";
import { Placa } from "@/components/marca";
import { BotaoEnviar } from "@/components/botao-enviar";
import { diagnostico, MINUTOS_NA_FILA, nomeFonte, placasParaReprocessar, type PlacaReprocessar } from "@/lib/services/reprocessamento";
import { corrigirEReprocessarPlaca, reprocessarPlacas } from "../../../actions";

export const metadata = { title: "Reprocessamento de placas" };

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
const dataHora = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const ROTULO: Record<PlacaReprocessar["motivo"], string> = { erro: "Erro na consulta", parada: "Não consultada", ultima_falhou: "Última consulta falhou", na_fila: "Reprocessando…" };
const TOM = { cadastro: "bg-rec-100 text-rec", fonte: "bg-ambar/20 text-vigia", fila: "bg-nevoa text-suave", sem_consulta: "bg-nevoa text-vigia" } as const;

export default async function Reprocessamento({ searchParams }: { searchParams: Promise<{ cliente?: string; ok?: string; erro?: string }> }) {
  const s = await exigirSessao(["franqueadora", "franqueado"]);
  const sp = await searchParams;
  const { placas, clientes } = await noEscopo(s, async (db) => ({
    placas: await placasParaReprocessar(db, { cliente: sp.cliente || null }),
    clientes: await db.q<{ id: string; nome: string }>("select id, nome from clientes where excluido_em is null order by nome"),
  }));
  const pendentes = placas.filter((p) => p.motivo !== "na_fila");
  const naFila = placas.filter((p) => p.motivo === "na_fila");
  const comDiag = pendentes.map((p) => ({ p, d: diagnostico(p.erros, p.motivo) }));
  const cadastro = comDiag.filter((x) => x.d.tipo === "cadastro").length;
  return (
    <>
      <Cabecalho titulo="Reprocessamento de placas" sub="Placas cuja consulta deu erro ou não rodou. Veja o motivo, corrija o cadastro se for o caso e reprocesse." />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Precisam de atenção" valor={pendentes.length} tom={pendentes.length ? "rec" : "economia"} detalhe={pendentes.length ? "consulta com erro ou não feita" : "tudo em dia"} />
        <Numero rotulo="Provável erro de cadastro" valor={cadastro} tom={cadastro ? "rec" : "normal"} detalhe="placa, Renavam ou UF" />
        <Numero rotulo="Instabilidade da fonte" valor={comDiag.filter((x) => x.d.tipo !== "cadastro").length} tom="ambar" detalhe="reprocessar resolve" />
        <Numero rotulo="Reprocessando agora" valor={naFila.length} detalhe={`consultas dos últimos ${MINUTOS_NA_FILA} min`} />
      </div>

      <Card
        titulo="Placas com erro"
        acoes={pendentes.length ? (
          <form action={reprocessarPlacas}>
            {pendentes.map((p) => <input key={p.id} type="hidden" name="id" value={p.id} />)}
            <BotaoEnviar className="btn-primario btn-sm" enviando="Enviando…">Reprocessar todas ({pendentes.length})</BotaoEnviar>
          </form>
        ) : null}
      >
        <form className="mb-4 flex flex-wrap items-end gap-2">
          <div><label className="rotulo">Cliente</label><select name="cliente" defaultValue={sp.cliente ?? ""} className="campo w-64"><option value="">Todos os clientes</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          <button className="btn-contorno">Filtrar</button>
          {sp.cliente && <Link href="?" className="btn-leve">Limpar</Link>}
        </form>
        {!pendentes.length ? <Vazio>Nenhuma placa com erro. Todas as consultas estão em dia.</Vazio> : (
          <ul className="divide-y divide-borda">
            {comDiag.map(({ p, d }) => (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="w-28 shrink-0"><Placa placa={p.placa} tamanho="sm" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{p.cliente}<span className="font-normal text-suave"> · {p.apelido ?? "sem apelido"} · {p.uf} · Renavam {p.renavam}</span></div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-rec-100 px-2 py-0.5 font-semibold text-rec">{ROTULO[p.motivo]}</span>
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${TOM[d.tipo]}`}>{d.texto}</span>
                      <span className="text-suave">Última tentativa: {dataHora(p.ultima_tentativa)}</span>
                    </div>
                    {!!p.erros?.length && (
                      <ul className="mt-1 space-y-0.5 text-xs text-suave">
                        {p.erros.map((e, i) => <li key={i}><b className="text-vigia">{nomeFonte(e.fonte)}:</b> {e.erro}</li>)}
                      </ul>
                    )}
                    <details className="mt-2">
                      <summary className="link cursor-pointer text-xs">Corrigir dados</summary>
                      <form action={corrigirEReprocessarPlaca} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={p.id} />
                        <div><label className="rotulo">Placa</label><input name="placa" defaultValue={p.placa} required className="campo w-32 uppercase" /></div>
                        <div><label className="rotulo">Renavam</label><input name="renavam" defaultValue={p.renavam} required inputMode="numeric" className="campo w-40" /></div>
                        <div><label className="rotulo">UF</label><select name="uf" defaultValue={p.uf} className="campo w-24">{UFS.map((u) => <option key={u}>{u}</option>)}</select></div>
                        <BotaoEnviar className="btn-primario btn-sm" enviando="Salvando…">Salvar e reprocessar</BotaoEnviar>
                      </form>
                    </details>
                  </div>
                  <form action={reprocessarPlacas} className="shrink-0">
                    <input type="hidden" name="id" value={p.id} />
                    <BotaoEnviar className="btn-contorno btn-sm" enviando="Enviando…">Reprocessar</BotaoEnviar>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!!naFila.length && (
        <Card titulo="Reprocessando agora" className="mt-6">
          <p className="mb-3 text-xs text-suave">Estas placas foram enviadas para consulta há menos de {MINUTOS_NA_FILA} minutos. Se der erro de novo, voltam para a lista acima.</p>
          <div className="flex flex-wrap gap-3">
            {naFila.map((p) => <div key={p.id} className="flex items-center gap-2 text-sm"><Placa placa={p.placa} tamanho="sm" /><span className="text-suave">{p.cliente}</span></div>)}
          </div>
        </Card>
      )}
    </>
  );
}
