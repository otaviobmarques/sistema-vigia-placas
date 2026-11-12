import Link from "next/link";
import { exigirSessao, noEscopo } from "@/lib/auth";
import { brl } from "@/lib/domain/money";
import { Cabecalho, Card, Mensagem, Numero, Vazio } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { excluirGrupo, salvarGrupo } from "../../../actions";

export const metadata = { title: "Grupos econômicos" };

type Cli = { id: string; nome: string; documento: string; grupo_id: string | null; placas: number; abertas: number; valor_aberto: number };

/** Lista de clientes com caixa de marcar: os já no grupo vêm marcados; os de outro grupo mostram onde estão. */
function ListaClientes({ clientes, grupoId, grupos }: { clientes: Cli[]; grupoId: string | null; grupos: Map<string, string> }) {
  return (
    <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-borda p-2">
      {clientes.map((c) => (
        <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-nevoa">
          <input type="checkbox" name="cliente" value={c.id} defaultChecked={!!grupoId && c.grupo_id === grupoId} className="accent-vigia" />
          <span className="min-w-0 flex-1 truncate"><b>{c.nome}</b> <span className="text-xs text-suave">{fmtDoc(c.documento)}</span></span>
          {c.grupo_id && c.grupo_id !== grupoId && <span className="shrink-0 rounded-full bg-ambar/20 px-2 text-[11px] text-vigia">em {grupos.get(c.grupo_id)}</span>}
        </label>
      ))}
    </div>
  );
}
const fmtDoc = (d: string) =>
  d.length === 14 ? d.replace(/^(..)(...)(...)(....)(..)$/, "$1.$2.$3/$4-$5") : d.length === 11 ? d.replace(/^(...)(...)(...)(..)$/, "$1.$2.$3-$4") : d;

export default async function Grupos({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; editar?: string }> }) {
  const s = await exigirSessao(["franqueadora", "franqueado"]);
  const sp = await searchParams;
  const { grupos, clientes } = await noEscopo(s, async (db) => ({
    grupos: await db.q<{ id: string; nome: string; observacao: string | null }>("select id, nome, observacao from grupos_economicos order by nome"),
    clientes: await db.q<Cli>(
      `select c.id, c.nome, c.documento, c.grupo_id,
         (select count(*)::int from placas p where p.cliente_id = c.id and p.status <> 'pausada') as placas,
         (select count(*)::int from multas m where m.cliente_id = c.id and m.estado not in ('paga','cancelada')) as abertas,
         (select coalesce(sum(m.valor),0)::int from multas m where m.cliente_id = c.id and m.estado not in ('paga','cancelada')) as valor_aberto
       from clientes c where c.excluido_em is null order by c.nome`,
    ),
  }));
  const nomes = new Map(grupos.map((g) => [g.id, g.nome]));
  const semGrupo = clientes.filter((c) => !c.grupo_id).length;
  return (
    <>
      <Cabecalho titulo="Grupos econômicos" sub="Junte os clientes (CNPJs) da mesma empresa ou holding. Os relatórios podem ser filtrados por grupo, com os números somados." />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Numero rotulo="Grupos" valor={grupos.length} />
        <Numero rotulo="Clientes em grupos" valor={clientes.length - semGrupo} detalhe={`de ${clientes.length} clientes`} />
        <Numero rotulo="Clientes sem grupo" valor={semGrupo} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {!grupos.length && <Card><Vazio>Nenhum grupo ainda. Crie o primeiro ao lado.</Vazio></Card>}
          {grupos.map((g) => {
            const membros = clientes.filter((c) => c.grupo_id === g.id);
            const soma = (k: "placas" | "abertas" | "valor_aberto") => membros.reduce((a, c) => a + Number(c[k]), 0);
            const editando = sp.editar === g.id;
            return (
              <Card key={g.id} titulo={<span>🏢 {g.nome}</span>}
                acoes={<div className="flex gap-2">
                  <Link href={`/gestao/relatorios?tipo=faturamento&grupo=${g.id}`} className="btn-leve btn-sm">Relatórios</Link>
                  <Link href={editando ? "?" : `?editar=${g.id}`} className="btn-contorno btn-sm">{editando ? "Fechar" : "Editar"}</Link>
                </div>}>
                {g.observacao && <p className="mb-2 text-xs text-suave">{g.observacao}</p>}
                <div className="mb-3 flex flex-wrap gap-4 text-sm">
                  <span><b className="num">{membros.length}</b> CNPJ(s)</span>
                  <span><b className="num">{soma("placas")}</b> placas</span>
                  <span><b className="num">{soma("abertas")}</b> multas em aberto · <b className="num">{brl(soma("valor_aberto"))}</b></span>
                </div>
                {!editando ? (
                  membros.length ? (
                    <ul className="divide-y divide-borda text-sm">
                      {membros.map((c) => <li key={c.id} className="flex justify-between gap-2 py-1.5"><span><b>{c.nome}</b> <span className="text-xs text-suave">{fmtDoc(c.documento)}</span></span><span className="text-xs text-suave">{c.placas} placas · {c.abertas} multas</span></li>)}
                    </ul>
                  ) : <p className="text-sm text-suave">Nenhum cliente neste grupo. Clique em Editar para incluir.</p>
                ) : (
                  <div className="space-y-4">
                    <form action={salvarGrupo} className="space-y-3">
                      <input type="hidden" name="id" value={g.id} />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div><label className="rotulo">Nome do grupo</label><input name="nome" required defaultValue={g.nome} className="campo" /></div>
                        <div><label className="rotulo">Observação</label><input name="observacao" defaultValue={g.observacao ?? ""} className="campo" /></div>
                      </div>
                      <div><div className="rotulo">Clientes do grupo</div><ListaClientes clientes={clientes} grupoId={g.id} grupos={nomes} />
                        <p className="mt-1 text-xs text-suave">Um cliente fica em um grupo só: marcar aqui tira ele do grupo anterior.</p></div>
                      <BotaoEnviar className="btn-primario btn-sm" enviando="Salvando…">Salvar grupo</BotaoEnviar>
                    </form>
                    <details>
                      <summary className="link cursor-pointer text-xs text-rec">Excluir grupo</summary>
                      <form action={excluirGrupo} className="mt-2 rounded-xl border border-rec/30 bg-rec-100/50 p-3">
                        <input type="hidden" name="id" value={g.id} />
                        <p className="mb-2 text-sm">Os clientes continuam cadastrados, só deixam de estar agrupados.</p>
                        <button className="btn-sm rounded-lg bg-rec px-3 py-1.5 font-semibold text-white">Excluir {g.nome}</button>
                      </form>
                    </details>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
        <Card titulo="Novo grupo" className="h-fit">
          <form action={salvarGrupo} className="space-y-3">
            <div><label className="rotulo">Nome do grupo</label><input name="nome" required placeholder="Ex.: Grupo Raltex" className="campo" /></div>
            <div><label className="rotulo">Observação (opcional)</label><input name="observacao" className="campo" /></div>
            <div><div className="rotulo">Clientes</div><ListaClientes clientes={clientes} grupoId={null} grupos={nomes} /></div>
            <BotaoEnviar className="btn-primario w-full" enviando="Criando…">Criar grupo</BotaoEnviar>
          </form>
        </Card>
      </div>
    </>
  );
}
