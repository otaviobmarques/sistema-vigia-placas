import Link from "next/link";
import { exigirSessao, noEscopo } from "@/lib/auth";
import { Cabecalho, Card, Mensagem } from "@/components/ui";
import { LeitorDocumento } from "@/components/leitor-documento";
import { leitorAtivo } from "@/lib/integrations/leitor";
import { cadastrarPlacaEquipe } from "../../../actions";
import { listarCondutores } from "@/lib/services/condutores";
import { ClienteECondutores } from "./cliente-condutores";

export const metadata = { title: "Cadastrar placa" };
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

/** Cadastro individual de placa pela equipe Vigia Placa: escolhe o cliente aqui mesmo, sem entrar na conta dele. */
export default async function NovaPlaca({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; cliente?: string }> }) {
  const s = await exigirSessao(["franqueadora", "franqueado"]);
  const sp = await searchParams;
  const { clientes, condutores } = await noEscopo(s, async (db) => {
    const clientes = await db.q<{ id: string; nome: string; documento: string; placas: number }>(
      `select c.id, c.nome, c.documento, (select count(*) from placas p where p.cliente_id = c.id and p.status <> 'pausada') as placas
       from clientes c where c.ativo and c.excluido_em is null and c.bloqueado_em is null order by c.nome`,
    );
    const condutores = [];
    for (const c of clientes) {
      for (const k of await listarCondutores(db, c.id)) {
        if (k.ativo) condutores.push({ id: k.id, nome: k.nome, cliente_id: c.id, pontos: k.situacao.pontos, limite: k.situacao.limite, pode: k.pode });
      }
    }
    return { clientes: clientes.map((c) => ({ ...c, placas: Number(c.placas) })), condutores };
  });
  return (
    <div className="mx-auto max-w-3xl">
      <Cabecalho titulo="Cadastrar placa" sub="Lance uma placa de cada vez. A placa entra no monitoramento e a primeira consulta é feita na hora." />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <Card>
        {clientes.length === 0 ? (
          <p className="text-sm text-suave">Nenhum cliente ativo. <Link href="/clientes/novo" className="link">Cadastre um cliente</Link> primeiro.</p>
        ) : (
          <form action={cadastrarPlacaEquipe} className="grid gap-3 sm:grid-cols-3">
            <ClienteECondutores clientes={clientes} condutores={condutores} inicial={sp.cliente} />
            <div className="sm:col-span-3"><LeitorDocumento foco="crlv" ativo={leitorAtivo()} rotulo="CRLV-e em PDF ou foto (opcional, preenche placa e Renavam)" /></div>
            <div><label className="rotulo">Placa</label><input name="placa" required placeholder="ABC1D23" className="campo uppercase" /></div>
            <div><label className="rotulo">Renavam</label><input name="renavam" required inputMode="numeric" placeholder="11 dígitos" className="campo" /></div>
            <div><label className="rotulo">UF</label><select name="uf" className="campo" defaultValue="MG">{UFS.map((u) => <option key={u}>{u}</option>)}</select></div>
            <div><label className="rotulo">Apelido</label><input name="apelido" placeholder="ex.: Caminhão 05" className="campo" /></div>
            <div><label className="rotulo">Grupo</label><input name="grupo" className="campo" /></div>
            <div><label className="rotulo">Centro de custo</label><input name="centro_custo" className="campo" /></div>
            <div><label className="rotulo">Adesão ao SNE</label><input name="sne" type="date" className="campo" /></div>
            <div className="flex items-end sm:col-span-2"><button className="btn-primario w-full">Cadastrar e consultar</button></div>
          </form>
        )}
      </Card>
    </div>
  );
}
