import { exigirCliente, noEscopo } from "@/lib/auth";
import { GRAVIDADES } from "@/lib/domain/ctb";
import { Cabecalho, Card, Mensagem } from "@/components/ui";
import { Vigi } from "@/components/marca";
import { capturarNotificacao } from "../../actions";

export const metadata = { title: "Enviar notificação" };

export default async function Enviar({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await exigirCliente();
  const sp = await searchParams;
  const placas = await noEscopo(s, (db) => db.q("select placa, apelido from placas where cliente_id = $1 and status <> 'pausada' order by placa", [s.clienteId]));
  const endereco = `multas+${s.clienteId.slice(0, 8)}@vigiaplaca.com.br`;
  return (
    <div className="mx-auto max-w-3xl">
      <Cabecalho titulo="Enviar notificação" sub="Recebeu carta, PDF do SNE ou e-mail de multa? Envie aqui: a multa entra no controle e os prazos passam a ser vigiados." />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <div className="mb-6 flex items-center gap-4 rounded-2xl bg-white p-4 card">
        <Vigi pose="alerta" size={72} />
        <p className="text-sm text-suave">Também dá para encaminhar o e-mail da notificação para <b className="text-vigia">{endereco}</b>. Toda multa que chega por aqui sem ter sido achada pelas consultas mostra um órgão que ainda não cobrimos, e isso orienta os próximos conectores.</p>
      </div>
      <Card>
        <form action={capturarNotificacao} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="rotulo">Foto da carta ou PDF</label>
            <input type="file" name="arquivo" accept="image/*,application/pdf" capture="environment" className="block w-full rounded-xl border border-dashed border-borda bg-nevoa p-4 text-sm" />
          </div>
          <div><label className="rotulo">Origem</label><select name="origem" className="campo"><option value="foto">Foto da carta</option><option value="pdf">PDF do SNE</option><option value="email">E-mail</option></select></div>
          <div><label className="rotulo">Placa</label><select name="placa" className="campo" required>{placas.map((p) => <option key={p.placa} value={p.placa}>{p.placa}{p.apelido ? ` · ${p.apelido}` : ""}</option>)}</select></div>
          <div><label className="rotulo">Nº do auto de infração</label><input name="auto" required className="campo uppercase" /></div>
          <div><label className="rotulo">Órgão autuador</label><input name="orgao" placeholder="Ex.: Prefeitura de Contagem" className="campo" required /></div>
          <div className="sm:col-span-2"><label className="rotulo">Descrição da infração</label><input name="descricao" className="campo" /></div>
          <div><label className="rotulo">Gravidade</label><select name="gravidade" className="campo" defaultValue="media">{Object.entries(GRAVIDADES).map(([k, g]) => <option key={k} value={k}>{g.rotulo} · R$ {(g.valor / 100).toFixed(2).replace(".", ",")}</option>)}</select></div>
          <div><label className="rotulo">Valor (se diferente)</label><input name="valor" placeholder="R$" className="campo" /></div>
          <div><label className="rotulo">Data da infração</label><input type="date" name="data_infracao" className="campo" /></div>
          <div><label className="rotulo">Data da notificação</label><input type="date" name="notificada_em" className="campo" /></div>
          <div><label className="rotulo">Vencimento</label><input type="date" name="vencimento" className="campo" /></div>
          <div><label className="rotulo">Local</label><input name="local" className="campo" /></div>
          <div className="sm:col-span-2"><button className="btn-primario w-full">Enviar e começar a vigiar</button></div>
        </form>
        <p className="mt-3 text-xs text-suave">A leitura automática (OCR) preenche estes campos quando estiver ativada; até lá, confira os dados da carta.</p>
      </Card>
    </div>
  );
}
