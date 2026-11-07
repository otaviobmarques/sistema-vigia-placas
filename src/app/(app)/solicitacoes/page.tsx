import { exigirSessao, noEscopo } from "@/lib/auth";
import { Cabecalho, Card, Mensagem, Vazio } from "@/components/ui";
import { Placa } from "@/components/marca";
import { aprovarSolicitacao, recusarSolicitacao } from "../../actions";

export const metadata = { title: "Solicitações de placas" };
const TIPO: Record<string, string> = { inclusao: "Inclusão", remocao: "Remoção" };
const STATUS: Record<string, string> = { aprovada: "Aprovada", recusada: "Recusada", cancelada: "Cancelada pelo cliente" };

export default async function Solicitacoes({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await exigirSessao(["franqueadora", "franqueado"]);
  const sp = await searchParams;
  const d = await noEscopo(s, async (db) => ({
    pendentes: await db.q(
      `select sp.*, c.nome as cliente, c.documento, u.nome as solicitante, pl.nome as plano, pl.preco_placa,
         (select count(*) from placas p where p.cliente_id = sp.cliente_id and p.status <> 'pausada') as placas_ativas
       from solicitacoes_placa sp join clientes c on c.id = sp.cliente_id join planos pl on pl.id = c.plano_id
       left join usuarios u on u.id = sp.solicitado_por
       where sp.status = 'pendente' order by sp.criado_em`,
    ),
    recentes: await db.q(
      `select sp.*, c.nome as cliente, u.nome as decidido_nome from solicitacoes_placa sp join clientes c on c.id = sp.cliente_id
       left join usuarios u on u.id = sp.decidido_por where sp.status <> 'pendente' order by sp.decidido_em desc nulls last limit 30`,
    ),
  }));
  const podeDecidir = ["admin", "gestor"].includes(s.perfil);
  const dt = (v: string) => new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <>
      <Cabecalho titulo="Solicitações de placas" sub="Os clientes pedem a inclusão ou a remoção de placas. A placa só entra no monitoramento, ou sai da cobrança, depois da sua aprovação." />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <Card titulo={`Aguardando aprovação (${d.pendentes.length})`} className="mb-6">
        {d.pendentes.length === 0 ? <Vazio>Nenhum pedido pendente.</Vazio> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="tabela min-w-[960px]">
              <thead><tr><th>Pedido</th><th>Placa</th><th>Cliente</th><th>Efeito na mensalidade</th><th>Decisão</th></tr></thead>
              <tbody>
                {d.pendentes.map((r) => {
                  const delta = r.tipo === "remocao" ? -1 : 1;
                  return (
                    <tr key={r.id}>
                      <td><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.tipo === "remocao" ? "bg-rec-100 text-rec" : "bg-economia-100 text-economia"}`}>{TIPO[r.tipo]}{r.placa_id && r.tipo === "inclusao" ? " (reativar)" : ""}</span>
                        <div className="mt-1 text-xs text-suave">{dt(r.criado_em)} · {r.solicitante ?? "cliente"}</div></td>
                      <td><Placa placa={r.placa} tamanho="sm" /><div className="mt-1 text-xs text-suave">{[r.uf, r.renavam && `Renavam ${r.renavam}`, r.apelido, r.grupo].filter(Boolean).join(" · ")}</div>
                        {r.motivo && <div className="mt-1 text-xs">Motivo: {r.motivo}</div>}</td>
                      <td className="text-sm"><b>{r.cliente}</b><div className="text-xs text-suave">{r.documento} · plano {r.plano} · {r.placas_ativas} placa(s) ativa(s)</div></td>
                      <td className="text-xs">{r.preco_placa ? <>{delta > 0 ? "+" : "−"} R$ {(r.preco_placa / 100).toFixed(2).replace(".", ",")}/mês<div className="text-suave">fica com {Number(r.placas_ativas) + delta} placa(s)</div></> : "—"}</td>
                      <td>
                        {podeDecidir ? (
                          <form action={aprovarSolicitacao} className="flex flex-wrap items-center gap-1">
                            <input type="hidden" name="id" value={r.id} />
                            <input name="resposta" placeholder="Resposta ao cliente (opcional)" className="campo w-52 py-1.5 text-xs" />
                            <button className="btn-economia btn-sm">Aprovar</button>
                            <button formAction={recusarSolicitacao} className="btn-leve btn-sm text-rec">Recusar</button>
                          </form>
                        ) : <span className="text-xs text-suave">Seu perfil só visualiza.</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-suave">Ao aprovar uma inclusão, a placa é cadastrada e a primeira consulta é feita na hora. Ao aprovar uma remoção, a placa é pausada: deixa de ser consultada e cobrada, e o histórico de multas continua disponível. O cliente é avisado por e-mail e no celular.</p>
      </Card>
      <Card titulo="Decididas recentemente">
        {d.recentes.length === 0 ? <Vazio>Nada por aqui ainda.</Vazio> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="tabela min-w-[720px]">
              <thead><tr><th>Quando</th><th>Pedido</th><th>Cliente</th><th>Resultado</th></tr></thead>
              <tbody>{d.recentes.map((r) => (
                <tr key={r.id}>
                  <td className="text-xs">{r.decidido_em ? dt(r.decidido_em) : "—"}</td>
                  <td className="text-sm">{TIPO[r.tipo]} · <b>{r.placa}</b></td>
                  <td className="text-sm">{r.cliente}</td>
                  <td className="text-xs">{STATUS[r.status]}{r.decidido_nome ? ` por ${r.decidido_nome}` : ""}{r.resposta ? <div className="text-suave">“{r.resposta}”</div> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
