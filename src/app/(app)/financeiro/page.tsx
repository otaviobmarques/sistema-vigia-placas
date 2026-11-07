import { exigirSessao, noEscopo } from "@/lib/auth";
import { calcularFatura } from "@/lib/services/faturamento";
import { dataBR, hojeISO, nomeMes } from "@/lib/domain/dates";
import { CICLOS, type Ciclo } from "@/lib/domain/ciclo";

const FORMA: Record<string, string> = { pix: "Pix", boleto: "Boleto", cartao: "Cartão" };
import { brl } from "@/lib/domain/money";
import { Cabecalho, Card, Mensagem, Numero } from "@/components/ui";
import { fecharMesAction } from "../../actions";

export const metadata = { title: "Financeiro" };

export default async function Financeiro({ searchParams }: { searchParams: Promise<{ mes?: string; ok?: string; erro?: string }> }) {
  const s = await exigirSessao(["franqueado", "franqueadora"]);
  const sp = await searchParams;
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : hojeISO().slice(0, 7);
  const d = await noEscopo(s, async (db) => {
    const clientes = await db.q<{ id: string }>("select id from clientes where ativo order by nome");
    const previas = [];
    for (const c of clientes) previas.push(await calcularFatura(db, c.id, mes));
    const pagamentos = await db.q(
      "select p.*, c.nome from pagamentos p join clientes c on c.id = p.cliente_id where to_char(p.criado_em, 'YYYY-MM') = $1 order by p.criado_em desc", [mes]);
    const faturas = await db.q("select f.*, c.nome from faturas f join clientes c on c.id = f.cliente_id where f.mes = $1 order by f.periodo_inicio, c.nome", [mes]);
    return { previas, pagamentos, faturas };
  });
  const tot = (k: "mensalidades" | "saving" | "conveniencia" | "defesa" | "splitFranqueado") => d.previas.reduce((a, f) => a + f[k], 0);
  const receita = tot("mensalidades") + tot("saving") + tot("conveniencia") + tot("defesa");
  return (
    <>
      <Cabecalho
        titulo={s.nivel === "franqueado" ? "Comissões e repasses" : "Financeiro"}
        sobre={<span className="capitalize">{nomeMes(mes)}</span>}
        acoes={
          <form className="flex gap-2">
            <input type="month" name="mes" defaultValue={mes} className="campo w-44" /><button className="btn-contorno">Ver</button>
          </form>
        }
      />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {s.nivel === "franqueadora" ? (
          <>
            <Numero rotulo="Receita bruta (prévia)" valor={brl(receita)} detalhe="mensalidade + saving + conveniência + defesa" />
            <Numero rotulo="Repasses aos franqueados" valor={brl(tot("splitFranqueado"))} />
            <Numero destaque rotulo="Receita da franqueadora" valor={brl(receita - tot("splitFranqueado"))} />
            <Numero rotulo="Saving do mês" tom="economia" valor={brl(tot("saving"))} detalhe="sobre economia comprovada" />
          </>
        ) : (
          <>
            <Numero rotulo="Mensalidades da carteira" valor={brl(tot("mensalidades"))} />
            <Numero rotulo="Saving da carteira" tom="economia" valor={brl(tot("saving"))} />
            <Numero rotulo="Taxas de conveniência" valor={brl(tot("conveniencia"))} />
            <Numero destaque rotulo="Seu repasse (split)" valor={brl(tot("splitFranqueado"))} detalhe="cai direto na sua subconta Asaas" />
          </>
        )}
      </div>
      <Card titulo="Faturas por cliente" acoes={s.nivel === "franqueadora" ? (
        <form action={fecharMesAction}><input type="hidden" name="mes" value={mes} /><button className="btn-primario btn-sm">Calcular faturas do mês</button></form>
      ) : null}>
        <div className="-mx-5 overflow-x-auto">
          <table className="tabela min-w-[860px]">
            <thead><tr><th>Cliente</th><th>Fechamento</th><th className="text-right">Placas</th><th className="text-right">Mensalidades</th><th className="text-right">Economia comprovada</th><th className="text-right">Saving</th><th className="text-right">Conveniência</th><th className="text-right">Defesa</th><th className="text-right">Repasse franqueado</th><th>Fatura</th></tr></thead>
            <tbody>
              {d.previas.map((f) => {
                const fats = d.faturas.filter((x) => x.cliente_id === f.cliente.id);
                return (
                  <tr key={f.cliente.id}>
                    <td className="font-semibold">{f.cliente.nome}{f.cliente.preco_placa === null && <div className="text-xs font-normal text-rec">preço do plano [DEFINIR]</div>}</td>
                    <td className="text-xs">{(CICLOS[f.cliente.ciclo_fechamento as Ciclo] ?? "Mensal").split(" (")[0]}<div className="text-suave">{FORMA[f.cliente.forma_cobranca] ?? ""}</div></td>
                    <td className="text-right">{f.placas}</td>
                    <td className="num text-right">{brl(f.mensalidades)}</td>
                    <td className="num text-right text-economia">{brl(f.baseSaving)}</td>
                    <td className="num text-right">{brl(f.saving)}{f.tetoAplicado && <div className="text-[11px] text-suave">teto</div>}</td>
                    <td className="num text-right">{brl(f.conveniencia)}</td>
                    <td className="num text-right">{brl(f.defesa)}</td>
                    <td className="num text-right font-semibold">{brl(f.splitFranqueado)}</td>
                    <td className="text-xs">{fats.length ? `${fats.length} fatura(s)` : "prévia"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-suave">Totais do mês por cliente. Cada cliente fecha no seu ciclo (diário, semanal, quinzenal ou mensal): a mensalidade é proporcional aos dias de cada período. A conveniência é cobrada no próprio Pix; as faturas cobram mensalidade, saving e defesa.</p>
      </Card>
      <Card titulo={`Faturas do mês (${d.faturas.length})`} className="mt-6">
        {d.faturas.length === 0 ? <p className="text-sm text-suave">Nenhuma fatura fechada neste mês. Elas fecham sozinhas no fim de cada período; o botão acima calcula as que já começaram.</p> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="tabela min-w-[760px]">
              <thead><tr><th>Cliente</th><th>Período</th><th>Vencimento</th><th>Forma</th><th className="!text-right">Placas</th><th className="!text-right">Total</th><th>Situação</th></tr></thead>
              <tbody>{d.faturas.map((x) => (
                <tr key={x.id}>
                  <td className="font-semibold">{x.nome}</td>
                  <td className="text-xs">{dataBR(x.periodo_inicio)}{x.periodo_fim !== x.periodo_inicio ? ` a ${dataBR(x.periodo_fim)}` : ""}</td>
                  <td className="text-xs">{dataBR(x.vencimento)}</td>
                  <td className="text-xs">{FORMA[x.forma] ?? "—"}</td>
                  <td className="num text-right">{x.placas}</td>
                  <td className="num text-right font-semibold">{brl(x.total)}</td>
                  <td className="text-xs">{{ aberta: "Aberta", emitida: "Emitida", paga: "Paga", cancelada: "Cancelada" }[x.status as string] ?? x.status}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      <Card titulo="Pagamentos Pix do mês (conciliação)" className="mt-6">
        <div className="-mx-5 overflow-x-auto">
          <table className="tabela min-w-[640px]">
            <thead><tr><th>Data</th><th>Cliente</th><th>Cobrança Asaas</th><th className="text-right">Total</th><th className="text-right">Taxa</th><th className="text-right">Split</th><th>Status</th></tr></thead>
            <tbody>
              {d.pagamentos.length ? d.pagamentos.map((p) => (
                <tr key={p.id}><td>{new Date(p.criado_em).toLocaleDateString("pt-BR")}</td><td>{p.nome}</td><td className="font-mono text-xs">{p.asaas_id}</td><td className="num text-right">{brl(p.total)}</td><td className="num text-right">{brl(p.taxa)}</td><td className="num text-right">{brl(p.split_franqueado)}</td><td>{p.status}</td></tr>
              )) : <tr><td colSpan={7} className="text-center text-suave">Nenhum pagamento neste mês.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
