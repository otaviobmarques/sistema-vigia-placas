import Link from "next/link";
import { exigirCliente, noEscopo } from "@/lib/auth";
import { carrinho } from "@/lib/services/pagamentos";
import { brl } from "@/lib/domain/money";
import { Aviso, Cabecalho, Card, ChipDesconto, Mensagem, Vazio } from "@/components/ui";
import { Placa, Vigi } from "@/components/marca";
import { gerarPix, removerCarrinho } from "../../actions";

export const metadata = { title: "Pagamentos" };

export default async function Pagamentos({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await exigirCliente();
  const sp = await searchParams;
  const { cart, historico, cfg } = await noEscopo(s, async (db) => ({
    cart: await carrinho(db, s.clienteId),
    historico: await db.q("select p.*, (select count(*) from pagamento_itens i where i.pagamento_id = p.id) as n from pagamentos p where p.cliente_id = $1 order by p.criado_em desc limit 20", [s.clienteId]),
    cfg: await db.one("select taxa_conv_tipo, taxa_conv_valor from configuracao"),
  }));
  const { itens, resumo } = cart;
  const precisaSne = itens.filter((i) => i.precisaReconhecer);

  return (
    <>
      <Cabecalho titulo="Pagar várias multas com um Pix só" sub="Você paga multas com desconto e a taxa num Pix único. Nós quitamos cada boleto, seja qual for o banco, e enviamos os comprovantes." />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card titulo={`Carrinho · ${itens.length} multa${itens.length === 1 ? "" : "s"}`}>
          {itens.length === 0 ? (
            <Vazio>Carrinho vazio. Adicione multas pela <Link href="/multas?aba=pagar" className="link">Caixa de Multas</Link> ou pelo <Link className="link" href="/hoje">Faça hoje</Link>.</Vazio>
          ) : (
            <>
              <div className="-mx-5 overflow-x-auto">
                <table className="tabela min-w-[560px]">
                  <thead><tr><th>Placa</th><th>Infração</th><th>Desconto</th><th className="text-right">Valor cheio</th><th className="text-right">A pagar</th><th /></tr></thead>
                  <tbody>
                    {itens.map((i) => (
                      <tr key={i.multa.id}>
                        <td><Placa placa={i.multa.placa} tamanho="sm" /></td>
                        <td><Link href={`/multas/${i.multa.id}`} className="hover:underline">{i.multa.descricao}</Link></td>
                        <td><ChipDesconto d={i.desconto} /></td>
                        <td className="num text-right text-suave line-through">{brl(i.valorCheio)}</td>
                        <td className="num text-right font-semibold">{brl(i.aPagar)}</td>
                        <td className="text-right"><form action={removerCarrinho}><input type="hidden" name="multaId" value={i.multa.id} /><button className="text-xs text-suave hover:text-rec" aria-label="Remover">Remover</button></form></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="ml-auto mt-4 max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-suave">Multas com desconto</dt><dd className="num">{brl(resumo.multas)}</dd></div>
                <div className="flex justify-between"><dt className="text-suave">Taxa de conveniência</dt><dd className="num">{brl(resumo.taxa)}</dd></div>
                <div className="flex justify-between font-semibold text-economia"><dt>Você economiza</dt><dd className="num">{brl(resumo.economia)}</dd></div>
                <div className="flex justify-between border-t border-borda pt-2 text-base font-extrabold"><dt>Total no Pix</dt><dd className="num">{brl(resumo.total)}</dd></div>
              </dl>
              {precisaSne.length > 0 && (
                <div className="mt-4"><Aviso tom="ambar">
                  {precisaSne.map((i) => i.multa.placa).join(", ")}: o valor com 40% só vale depois do reconhecimento no SNE. Reconheça no app do SNE e marque “Já reconheci no SNE” na multa antes de pagar.
                </Aviso></div>
              )}
            </>
          )}
        </Card>
        <section className="card flex flex-col items-center p-6 text-center">
          <Vigi pose="economia" size={110} />
          <h2 className="mt-2 text-lg font-bold">Pague com Pix</h2>
          <p className="mb-4 text-sm text-suave">Um QR Code só para todas as multas do carrinho. Taxa de conveniência: {cfg!.taxa_conv_tipo === "fixa" ? brl(cfg!.taxa_conv_valor) : `${cfg!.taxa_conv_valor / 100}%`}.</p>
          <form action={gerarPix} className="w-full"><button className="btn-primario w-full" disabled={!itens.length || precisaSne.length > 0}>Gerar Pix de {brl(resumo.total)}</button></form>
          <ol className="mt-5 w-full space-y-1 text-left text-xs text-suave">
            <li>1. Aguardando o Pix</li><li>2. Pagamos os {itens.length || ""} boleto(s) pelo Pague Contas</li><li>3. Comprovantes anexados às multas</li>
          </ol>
        </section>
      </div>
      {historico.length > 0 && (
        <Card titulo="Pagamentos anteriores" className="mt-6">
          <div className="-mx-5 overflow-x-auto">
            <table className="tabela min-w-[520px]">
              <thead><tr><th>Data</th><th>Multas</th><th className="text-right">Total</th><th className="text-right">Economia</th><th>Situação</th><th /></tr></thead>
              <tbody>
                {historico.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.criado_em).toLocaleDateString("pt-BR")}</td><td>{p.n}</td>
                    <td className="num text-right">{brl(p.total)}</td><td className="num text-right text-economia">{brl(p.economia)}</td>
                    <td>{{ aguardando_aprovacao: "Aguardando aprovação", aguardando: "Aguardando Pix", pago: "Pix recebido", quitado: "Quitado", parcial: "Quitado em parte", cancelado: "Cancelado" }[p.status as string]}</td>
                    <td className="text-right"><Link className="link text-sm" href={`/pagamentos/${p.id}`}>Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
