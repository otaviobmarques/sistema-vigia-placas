import { exigirCliente, noEscopo } from "@/lib/auth";
import { brl } from "@/lib/domain/money";
import { Cabecalho, Card, Numero, Vazio } from "@/components/ui";
import { LogoOrgao } from "@/components/logo-orgao";
import { TabelaMultasAntt } from "@/components/multas-antt";
import { multasAntt } from "@/lib/services/antt";

export const metadata = { title: "Multas ANTT" };

/** Portal do cliente: multas da ANTT no CNPJ/CPF dele. */
export default async function MultasAnttCliente({ searchParams }: { searchParams: Promise<{ todas?: string }> }) {
  const s = await exigirCliente();
  const sp = await searchParams;
  const d = await noEscopo(s, async (db) => ({
    multas: await multasAntt(db, { cliente: s.clienteId, todas: sp.todas === "1" }),
    c: await db.one<{ antt_ativo: boolean; antt_ultima_consulta: string | null }>("select antt_ativo, antt_ultima_consulta from clientes where id = $1", [s.clienteId]),
  }));
  const abertas = d.multas.filter((m) => m.aberta);
  const imped = abertas.filter((m) => m.impeditiva);
  const soma = (l: typeof abertas) => l.reduce((a, m) => a + Number(m.valor), 0);
  return (
    <>
      <Cabecalho titulo={<span className="flex items-center gap-3"><LogoOrgao id="ANTT" nome="ANTT" tamanho="md" /> Multas ANTT</span>}
        sub="Multas da Agência Nacional de Transportes Terrestres no CNPJ/CPF da empresa: RNTRC, vale-pedágio, frete/CIOT, produtos perigosos." />
      {!d.c?.antt_ativo ? (
        <Card><Vazio>O monitoramento da ANTT ainda não está ativo. Fale com a equipe Vigia Placa para cadastrar o acesso ao SIFAMA da sua empresa.</Vazio></Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Numero rotulo="Em aberto" valor={abertas.length} tom={abertas.length ? "rec" : "economia"} detalhe={brl(soma(abertas))} />
            <Numero rotulo="Impeditivas" valor={imped.length} tom={imped.length ? "rec" : "normal"} detalhe={imped.length ? "travam o RNTRC até o pagamento" : "nenhuma trava no RNTRC"} />
            <Numero rotulo="Última consulta" valor={d.c.antt_ultima_consulta ? new Date(d.c.antt_ultima_consulta).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"} detalhe="no SIFAMA" />
          </div>
          <Card titulo="Multas" acoes={<a href={sp.todas === "1" ? "?" : "?todas=1"} className="btn-leve btn-sm">{sp.todas === "1" ? "Só em aberto" : "Ver pagas/encerradas"}</a>}>
            <TabelaMultasAntt linhas={d.multas} />
          </Card>
        </>
      )}
    </>
  );
}
