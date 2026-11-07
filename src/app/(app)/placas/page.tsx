import Link from "next/link";
import { exigirCliente, noEscopo } from "@/lib/auth";
import { dataBR } from "@/lib/domain/dates";
import { rotuloFrequencia } from "@/lib/domain/monitoramento";
import { CampoFrequencia } from "@/components/frequencia";
import { Cabecalho, Card, Mensagem, Vazio } from "@/components/ui";
import { Placa } from "@/components/marca";
import { adicionarPlaca, alterarStatusPlaca, cancelarSolicitacao, consultarAgora, salvarCondutoresPlaca, salvarFrequenciaPlaca, salvarSne } from "../../actions";
import { ehAdminSistema } from "@/lib/acesso";
import { listarCondutores } from "@/lib/services/condutores";
import { PodeDirigir } from "@/components/condutor";
import { CamposCondutorRapido } from "@/components/condutor-rapido";
import { LeitorDocumento } from "@/components/leitor-documento";
import { leitorAtivo } from "@/lib/integrations/leitor";

export const metadata = { title: "Placas" };
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
const STATUS: Record<string, string> = { ativa: "Ativa", pausada: "Pausada", aguardando: "Aguardando 1ª consulta", erro: "Erro de dados" };

export default async function Placas({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; q?: string }> }) {
  const s = await exigirCliente();
  const sp = await searchParams;
  const { placas, pedidos, cli, condutores } = await noEscopo(s, async (db) => ({
    condutores: await listarCondutores(db, s.clienteId),
    placas: await db.q(
      `select p.*, (select count(*) from multas m where m.placa_id = p.id and m.estado not in ('paga','cancelada')) as abertas,
         coalesce((select array_agg(pc.condutor_id::text) from placa_condutores pc where pc.placa_id = p.id), '{}') as condutores
       from placas p where p.cliente_id = $1 ${sp.q ? "and (p.placa ilike $2 or p.apelido ilike $2 or p.grupo ilike $2)" : ""} order by p.status = 'pausada', p.placa`,
      sp.q ? [s.clienteId, `%${sp.q}%`] : [s.clienteId],
    ),
    pedidos: await db.q("select * from solicitacoes_placa where cliente_id = $1 and (status = 'pendente' or decidido_em > now() - interval '30 days') order by criado_em desc limit 20", [s.clienteId]),
    cli: await db.one("select c.frequencia_padrao, c.consultas_avulsas_usadas, pl.consultas_avulsas from clientes c join planos pl on pl.id = c.plano_id where c.id = $1", [s.clienteId]),
  }));
  // Cliente pede inclusão/remoção (a equipe Vigia Placa aprova); Visualizador só vê.
  const ehCliente = s.nivel === "cliente";
  const soVe = s.perfil === "leitura";
  const pendente = new Map(pedidos.filter((r) => r.status === "pendente" && r.placa_id).map((r) => [r.placa_id, r.tipo]));
  const semSne = placas.filter((p) => !p.sne_adesao_em && p.status !== "pausada").length;
  return (
    <>
      <Cabecalho
        titulo="Placas"
        sub={`${placas.filter((p) => p.status !== "pausada").length} placas vigiadas · frequência ${rotuloFrequencia(cli!.frequencia_padrao).toLowerCase()} · ${cli!.consultas_avulsas_usadas}/${cli!.consultas_avulsas} consultas avulsas usadas no plano`}
        acoes={soVe ? undefined : <Link href="/placas/importar" className="btn-contorno">{ehCliente ? "Solicitar várias (planilha)" : "Importar planilha"}</Link>}
      />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      {semSne > 0 && <div className="mb-4 rounded-xl bg-ambar-100 px-4 py-3 text-sm text-[#6b4700]"><b>{semSne} placa(s) sem SNE.</b> Faça a adesão no app Carteira Digital de Trânsito hoje: só multas com infração <i>depois</i> da adesão ganham 40%. Depois, informe a data aqui.</div>}

      {pedidos.length > 0 && (
        <Card titulo="Seus pedidos" className="mb-6">
          <ul className="divide-y divide-borda text-sm">
            {pedidos.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><b>{r.tipo === "remocao" ? "Remoção" : r.placa_id ? "Reativação" : "Inclusão"}</b> da placa <b>{r.placa}</b>
                  <span className="ml-2 text-xs text-suave">{new Date(r.criado_em).toLocaleDateString("pt-BR")}{r.resposta ? ` · “${r.resposta}”` : ""}</span></span>
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.status === "pendente" ? "bg-ambar-100 text-[#6b4700]" : r.status === "aprovada" ? "bg-economia-100 text-economia" : "bg-nevoa text-suave"}`}>{{ pendente: "Em análise", aprovada: "Aprovado", recusada: "Não aprovado", cancelada: "Cancelado" }[r.status as string]}</span>
                  {r.status === "pendente" && ehCliente && !soVe && <form action={cancelarSolicitacao}><input type="hidden" name="id" value={r.id} /><button className="btn-leve btn-sm">Cancelar</button></form>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!soVe && <Card titulo={ehCliente ? "Solicitar inclusão de placa" : "Cadastrar placa"} className="mb-6">
        <form action={adicionarPlaca} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
          <div className="sm:col-span-3 lg:col-span-7"><LeitorDocumento foco="crlv" ativo={leitorAtivo()} rotulo="CRLV-e em PDF ou foto (opcional)" /></div>
          <div><label className="rotulo">Placa</label><input name="placa" required placeholder="ABC1D23" className="campo uppercase" /></div>
          <div><label className="rotulo">Renavam</label><input name="renavam" required inputMode="numeric" placeholder="11 dígitos" className="campo" /></div>
          <div><label className="rotulo">UF</label><select name="uf" className="campo" defaultValue="MG">{UFS.map((u) => <option key={u}>{u}</option>)}</select></div>
          <div><label className="rotulo">Apelido</label><input name="apelido" className="campo" /></div>
          <div><label className="rotulo">Grupo</label><input name="grupo" className="campo" /></div>
          <div><label className="rotulo">Adesão ao SNE</label><input name="sne" type="date" className="campo" /></div>
          <div className="flex items-end"><button className="btn-primario w-full">{ehCliente ? "Solicitar inclusão" : "Cadastrar e consultar"}</button></div>
        </form>
        <p className="mt-2 text-xs text-suave">{ehCliente ? "A equipe Vigia Placa confere os dados e aprova. Na aprovação, a placa entra no monitoramento, a primeira varredura é feita na hora e você recebe um aviso." : "A primeira varredura é gratuita: mostra as multas em aberto e o dinheiro na mesa. Sem certificado digital, só placa e Renavam."}</p>
      </Card>}

      <Card titulo="Suas placas" acoes={<form><input name="q" defaultValue={sp.q} placeholder="Buscar placa, apelido ou grupo" className="campo w-64" /></form>}>
        {placas.length === 0 ? <Vazio>Nenhuma placa cadastrada.</Vazio> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="tabela min-w-[1080px]">
              <thead><tr><th>Placa</th><th>Grupo / centro de custo</th><th>Condutores</th><th>Status</th><th>Última verificação</th><th>Multas abertas</th><th>Adesão SNE</th><th /></tr></thead>
              <tbody>
                {placas.map((p) => (
                  <tr key={p.id} className={p.status === "pausada" ? "opacity-60" : ""}>
                    <td><Placa placa={p.placa} tamanho="sm" /><div className="mt-1 text-xs text-suave">{p.apelido ?? p.modelo ?? ""} · {p.uf} · Renavam {p.renavam}</div></td>
                    <td className="text-xs">{p.grupo ?? "—"}<div className="text-suave">{p.centro_custo ?? ""}</div></td>
                    <td className="text-xs">
                      {condutores.filter((c) => (p.condutores as string[]).includes(c.id)).map((c) => (
                        <div key={c.id} className="mb-1 flex flex-wrap items-center gap-1"><span className="font-semibold">{c.nome}</span><span className="text-suave">{c.situacao.pontos}/{c.situacao.limite} pts</span><PodeDirigir pode={c.pode} compacto /></div>
                      ))}
                      {!(p.condutores as string[]).length && <span className="text-suave">nenhum</span>}
                      {!soVe && (
                        <details className="relative">
                          <summary className="link cursor-pointer list-none">Condutores</summary>
                          <form action={salvarCondutoresPlaca} className="mt-2 w-80 space-y-2 rounded-xl border border-borda bg-white p-3 shadow-lg">
                            <input type="hidden" name="placaId" value={p.id} />
                            <div className="rotulo">Quem dirige a {p.placa}</div>
                            <div className="max-h-40 space-y-1 overflow-y-auto">
                              {condutores.filter((c) => c.ativo).map((c) => (
                                <label key={c.id} className="flex items-center gap-2"><input type="checkbox" name="condutores" value={c.id} defaultChecked={(p.condutores as string[]).includes(c.id)} className="accent-vigia" />{c.nome}<PodeDirigir pode={c.pode} compacto /></label>
                              ))}
                              {!condutores.length && <p className="text-suave">Nenhum condutor cadastrado ainda.</p>}
                            </div>
                            <CamposCondutorRapido />
                            <button className="btn-primario btn-sm w-full">Salvar condutores</button>
                          </form>
                        </details>
                      )}
                    </td>
                    <td className="text-xs">{STATUS[p.status]}{p.motivo_pausa ? ` (${p.motivo_pausa})` : ""}<div className="text-suave">{rotuloFrequencia(p.frequencia ?? cli!.frequencia_padrao).split(" (")[0]}{p.frequencia ? " (própria)" : ""}</div>
                      {ehAdminSistema(s) && (
                        <form action={salvarFrequenciaPlaca} className="mt-1 flex items-center gap-1">
                          <input type="hidden" name="placaId" value={p.id} />
                          <CampoFrequencia nome="frequencia" valor={p.frequencia} permitirPadrao compacto />
                          <button className="btn-leve btn-sm">OK</button>
                        </form>
                      )}</td>
                    <td className="text-xs">{p.ultima_verificacao ? new Date(p.ultima_verificacao).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}<div className="text-suave">próx.: {dataBR(p.proxima_verificacao)}</div></td>
                    <td>{Number(p.abertas) ? <Link className="link" href={`/multas?placa=${p.placa}`}>{p.abertas}</Link> : "0"}</td>
                    <td>
                      {soVe ? (p.sne_adesao_em ? dataBR(p.sne_adesao_em) : "—") : <form action={salvarSne} className="flex items-center gap-1">
                        <input type="hidden" name="placaId" value={p.id} />
                        <input type="date" name="sne" defaultValue={p.sne_adesao_em ?? ""} className={`campo w-36 py-1 text-xs ${p.sne_adesao_em ? "" : "border-ambar"}`} />
                        <button className="btn-leve btn-sm">OK</button>
                      </form>}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {!soVe && p.status !== "pausada" && (
                        <form action={consultarAgora} className="inline"><input type="hidden" name="placaId" value={p.id} /><button className="btn-contorno btn-sm">Consultar agora</button></form>
                      )}{" "}
                      {soVe ? null : pendente.has(p.id) ? (
                        <span className="text-xs text-suave">{pendente.get(p.id) === "remocao" ? "Remoção" : "Reativação"} em análise</span>
                      ) : ehCliente ? (
                        <details className="relative inline-block text-left">
                          <summary className="btn-leve btn-sm list-none">{p.status === "pausada" ? "Solicitar reativação" : "Solicitar remoção"}</summary>
                          <form action={alterarStatusPlaca} className="mt-2 w-64 space-y-2 rounded-xl border border-borda bg-white p-3 shadow-lg">
                            <input type="hidden" name="placaId" value={p.id} />
                            <input type="hidden" name="status" value={p.status === "pausada" ? "ativa" : "pausada"} />
                            <input name="motivo" placeholder={p.status === "pausada" ? "Observação (opcional)" : "Motivo (ex.: veículo vendido)"} className="campo py-1.5 text-xs" />
                            <button className="btn-primario btn-sm w-full">Enviar pedido</button>
                          </form>
                        </details>
                      ) : (
                        <form action={alterarStatusPlaca} className="inline">
                          <input type="hidden" name="placaId" value={p.id} />
                          <input type="hidden" name="status" value={p.status === "pausada" ? "ativa" : "pausada"} />
                          {p.status !== "pausada" && <input type="hidden" name="motivo" value="pausada pela equipe" />}
                          <button className="btn-leve btn-sm">{p.status === "pausada" ? "Reativar" : "Pausar"}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
