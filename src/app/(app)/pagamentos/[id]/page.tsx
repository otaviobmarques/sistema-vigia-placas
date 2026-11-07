import { notFound } from "next/navigation";
import Link from "next/link";
import { exigirCliente, noEscopo } from "@/lib/auth";
import { asaasSimulado } from "@/lib/integrations/asaas";
import { brl } from "@/lib/domain/money";
import { Aviso, Card, Mensagem } from "@/components/ui";
import { Placa, Vigi } from "@/components/marca";
import { CopiarPix } from "@/components/copiar";
import { aprovarPagamentoAction, cancelarPagamentoAction, simularPagamento } from "../../../actions";

export const metadata = { title: "Pagamento Pix" };

export default async function PagamentoPix({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await exigirCliente();
  const { id } = await params;
  const sp = await searchParams;
  const d = await noEscopo(s, async (db) => {
    const p = await db.one("select * from pagamentos where id = $1 and cliente_id = $2", [id, s.clienteId]);
    if (!p) return null;
    const itens = await db.q("select i.*, pl.placa, m.descricao from pagamento_itens i join multas m on m.id = i.multa_id join placas pl on pl.id = m.placa_id where i.pagamento_id = $1", [id]);
    return { p, itens };
  });
  if (!d) notFound();
  const { p, itens } = d;
  const aguardando = p.status === "aguardando";
  const paraAprovar = p.status === "aguardando_aprovacao";
  const souQuemCriou = p.criado_por === s.usuarioId;
  const etapas = [
    ...(paraAprovar || p.aprovado_por ? [{ t: "Segunda aprovação", ok: !!p.aprovado_por }] : []),
    { t: "Aguardando o Pix", ok: !aguardando && !paraAprovar },
    { t: `Pagando ${itens.length} boleto(s)`, ok: ["quitado", "parcial"].includes(p.status) },
    { t: "Comprovantes anexados às multas", ok: ["quitado", "parcial"].includes(p.status) },
  ];
  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/pagamentos" className="link mb-4 inline-block text-sm">← Pagamentos</Link>
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <div className="grid gap-6 md:grid-cols-2">
        <Card titulo="Resumo">
          <ul className="space-y-2 text-sm">
            {itens.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><Placa placa={i.placa} tamanho="sm" /> {i.desconto ? `${i.desconto}%` : ""}</span>
                <span className="flex items-center gap-2">
                  {i.boleto_status === "pago" && <span className="text-xs text-economia">✓ pago ({i.parceiro})</span>}
                  {i.boleto_status === "devolvido" && <span className="text-xs text-rec">virou crédito</span>}
                  <b className="num">{brl(i.a_pagar)}</b>
                </span>
              </li>
            ))}
            <li className="flex justify-between text-suave"><span>Taxa de conveniência</span><span className="num">{brl(p.taxa)}</span></li>
            <li className="flex justify-between border-t border-borda pt-2 font-semibold text-economia"><span>Você economiza</span><span className="num">{brl(p.economia)}</span></li>
          </ul>
          <ol className="mt-6 space-y-2 text-sm">
            {etapas.map((e) => <li key={e.t} className={e.ok ? "text-economia" : "text-suave"}>{e.ok ? "✓" : "○"} {e.t}</li>)}
          </ol>
        </Card>
        <section className="card flex flex-col items-center p-6 text-center">
          {paraAprovar ? (
            <>
              <Vigi pose="alerta" size={110} />
              <h2 className="mt-2 text-xl font-extrabold">Aguardando segunda aprovação</h2>
              <p className="mt-1 text-sm text-suave">O total de <b className="text-vigia">{brl(p.total)}</b> passa do limite de aprovação dupla deste cliente (Configurações › Aprovações).</p>
              {souQuemCriou ? (
                <p className="mt-4 text-sm text-suave">Outra pessoa com permissão de pagar precisa aprovar. Avisamos os administradores e o financeiro por e-mail.</p>
              ) : (
                <form action={aprovarPagamentoAction} className="mt-4 w-full"><input type="hidden" name="id" value={p.id} /><button className="btn-economia w-full">Aprovar e gerar o Pix</button></form>
              )}
              <form action={cancelarPagamentoAction} className="mt-2 w-full"><input type="hidden" name="id" value={p.id} /><button className="btn-leve w-full">Cancelar pagamento</button></form>
            </>
          ) : p.status === "cancelado" ? (
            <>
              <Vigi pose="ola" size={110} />
              <h2 className="mt-2 text-xl font-extrabold">Pagamento cancelado</h2>
              <p className="mt-1 text-sm text-suave">As multas continuam no carrinho e podem ser pagas de novo.</p>
              <Link href="/pagamentos" className="btn-primario mt-4">Voltar ao carrinho</Link>
            </>
          ) : aguardando ? (
            <>
              <div className="text-sm text-suave">Total no Pix</div>
              <div className="num mb-4 text-3xl font-extrabold">{brl(p.total)}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.pix_qr} alt="QR Code Pix" className="h-56 w-56 rounded-xl border-2 border-vigia p-2" />
              <div className="mt-4 w-full"><CopiarPix texto={p.pix_payload} /></div>
              <p className="mt-3 text-xs text-suave">Quando o Pix cair, quitamos cada boleto, seja qual for o banco, e enviamos os comprovantes.</p>
              <form action={cancelarPagamentoAction} className="mt-2 w-full"><input type="hidden" name="id" value={p.id} /><button className="btn-leve w-full">Cancelar este Pix</button></form>
              {asaasSimulado() && (
                <form action={simularPagamento} className="mt-4 w-full">
                  <input type="hidden" name="id" value={p.id} />
                  <button className="btn-contorno w-full">Já paguei (simular confirmação do Pix)</button>
                  <p className="mt-2 text-[11px] text-suave">Modo simulado: sem ASAAS_API_KEY, este botão faz o papel do webhook do Asaas.</p>
                </form>
              )}
            </>
          ) : (
            <>
              <Vigi pose="economia" size={140} />
              <h2 className="mt-2 text-2xl font-extrabold">Economizei pra você!</h2>
              <p className="num mt-1 text-3xl font-extrabold text-economia">{brl(p.economia)}</p>
              <p className="mt-2 text-sm text-suave">Pix de {brl(p.total)} recebido em {p.pago_em ? new Date(p.pago_em).toLocaleString("pt-BR") : "—"}.</p>
              {p.status === "parcial" && <div className="mt-4"><Aviso tom="ambar">Algum boleto não pôde ser pago nem pelo Asaas nem pela Celcoin. O valor ficou como crédito para o próximo pagamento.</Aviso></div>}
              <Link href="/extrato" className="btn-primario mt-4">Ver Extrato de Economia</Link>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
