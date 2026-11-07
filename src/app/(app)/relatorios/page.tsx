import { exigirCliente, noEscopo } from "@/lib/auth";
import { gerarRelatorio, type Linha } from "@/lib/services/relatorios";
import { hojeISO, somarDias, dataBR, mesAbrev } from "@/lib/domain/dates";
import { brl } from "@/lib/domain/money";
import { Cabecalho, Card, Numero, Vazio } from "@/components/ui";

export const metadata = { title: "Relatórios" };

function Tabela({ titulo, rotulo, linhas, formatar }: { titulo: string; rotulo: string; linhas: Linha[]; formatar?: (k: string) => string }) {
  const max = Math.max(1, ...linhas.map((l) => l.valor));
  return (
    <Card titulo={titulo}>
      {linhas.length === 0 ? <Vazio>Sem multas no período.</Vazio> : (
        <div className="-mx-5 overflow-x-auto">
          <table className="tabela min-w-[520px]">
            <thead><tr><th>{rotulo}</th><th className="text-right">Multas</th><th className="w-[38%]">Valor cheio</th><th className="text-right">Pago</th><th className="text-right">Pontos</th></tr></thead>
            <tbody>
              {linhas.slice(0, 12).map((l) => (
                <tr key={l.chave}>
                  <td><div className="font-medium">{formatar ? formatar(l.chave) : l.chave}</div>{l.detalhe && <div className="text-xs text-suave">{l.detalhe}</div>}</td>
                  <td className="text-right">{l.multas}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-nevoa"><div className="h-2 rounded-full bg-vigia" style={{ width: `${(l.valor / max) * 100}%` }} /></div>
                      <span className="num w-24 shrink-0 text-right text-xs">{brl(l.valor)}</span>
                    </div>
                  </td>
                  <td className="num text-right text-xs">{l.pago ? brl(l.pago) : "—"}</td>
                  <td className="text-right">{l.pontos}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {linhas.length > 12 && <p className="px-5 pt-2 text-xs text-suave">+ {linhas.length - 12} linha(s) no Excel.</p>}
        </div>
      )}
    </Card>
  );
}

export default async function Relatorios({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const s = await exigirCliente();
  const sp = await searchParams;
  const valida = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const ate = valida(sp.ate) ?? hojeISO();
  const de = valida(sp.de) ?? somarDias(ate, -365);
  const r = await noEscopo(s, (db) => gerarRelatorio(db, s.clienteId, de, ate));
  const rotuloRateio = r.rateio === "condutor" ? "Rateio por condutor" : "Rateio por centro de custo";
  return (
    <>
      <Cabecalho
        titulo="Relatórios"
        sub={`Infrações de ${dataBR(de)} a ${dataBR(ate)}, pela data da infração.`}
        acoes={
          <form className="flex flex-wrap items-end gap-2">
            <div><label className="rotulo">De</label><input type="date" name="de" defaultValue={de} className="campo" /></div>
            <div><label className="rotulo">Até</label><input type="date" name="ate" defaultValue={ate} className="campo" /></div>
            <button className="btn-contorno">Ver</button>
            <a href={`/api/relatorios?de=${de}&ate=${ate}`} className="btn-primario">Exportar Excel</a>
          </form>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Multas no período" valor={r.totais.multas} detalhe={`${r.totais.abertas} em aberto`} />
        <Numero rotulo="Valor cheio" valor={brl(r.totais.valor)} />
        <Numero rotulo="Pago" valor={brl(r.totais.pago)} detalhe="com os descontos obtidos" />
        <Numero rotulo="Economia comprovada" tom="economia" valor={brl(r.totais.economia)} detalhe={`${r.totais.pontos} pontos no período`} />
      </div>
      <div className="grid gap-6 2xl:grid-cols-2">
        <Tabela titulo="Por infração" rotulo="Infração" linhas={r.porInfracao} />
        <Tabela titulo={rotuloRateio} rotulo={r.rateio === "condutor" ? "Condutor" : "Centro de custo"} linhas={r.porCentroCusto} />
        <Tabela titulo="Por placa" rotulo="Placa" linhas={r.porPlaca} />
        <Tabela titulo="Por condutor" rotulo="Condutor" linhas={r.porCondutor} />
        <Tabela titulo="Por órgão autuador" rotulo="Órgão" linhas={r.porOrgao} />
        <Tabela titulo="Por horário" rotulo="Faixa" linhas={r.porHorario} />
        <Tabela titulo="Por mês" rotulo="Mês" linhas={r.porMes} formatar={(k) => `${mesAbrev(k)}/${k.slice(0, 4)}`} />
      </div>
      <p className="mt-4 text-xs text-suave">O tipo de rateio (centro de custo da placa ou condutor) é definido em Configurações › Centros de custo.</p>
    </>
  );
}
