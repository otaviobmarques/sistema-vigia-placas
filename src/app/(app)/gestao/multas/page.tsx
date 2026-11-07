import Link from "next/link";
import { exigirSessao, noEscopo } from "@/lib/auth";
import { brl } from "@/lib/domain/money";
import { dataBR, diasEntre, hojeISO } from "@/lib/domain/dates";
import { ESTADOS, type EstadoMulta } from "@/lib/domain/ctb";
import { Cabecalho, Card, Numero, Vazio } from "@/components/ui";
import { Placa } from "@/components/marca";
import { ChipPrazo } from "@/components/ui";
import { multasEmAberto } from "@/lib/services/relatorios-gestao";
import { entrarCliente } from "../../../actions";
import { ehNova, SeloNova } from "@/components/selo-nova";

const SeloContagem = ({ n }: { n: number }) => <span className="rounded-full bg-ambar px-1.5 text-xs font-bold text-vigia">{n}</span>;

export const metadata = { title: "Multas em aberto" };

/** Todas as multas em aberto de todos os clientes, com filtro por cliente, placa e condutor. */
export default async function MultasEmAberto({ searchParams }: { searchParams: Promise<{ cliente?: string; placa?: string; condutor?: string; novas?: string }> }) {
  const s = await exigirSessao(["franqueadora", "franqueado"]);
  const sp = await searchParams;
  const hoje = hojeISO();
  const d = await noEscopo(s, async (db) => ({
    multas: await multasEmAberto(db, { cliente: sp.cliente || null, placa: sp.placa || null, condutor: sp.condutor || null, novas: sp.novas === "1" }),
    novas: Number((await db.one("select count(*) as n from multas m join clientes c on c.id = m.cliente_id where m.criado_em > now() - interval '24 hours' and m.estado not in ('paga','cancelada') and c.excluido_em is null"))?.n ?? 0),
    clientes: await db.q<{ id: string; nome: string }>("select id, nome from clientes where ativo and excluido_em is null order by nome"),
    condutores: await db.q<{ id: string; nome: string; cliente: string; cliente_id: string }>(
      `select k.id, k.nome, c.nome as cliente, c.id as cliente_id from condutores k join clientes c on c.id = k.cliente_id
       where k.ativo and c.ativo and c.excluido_em is null ${sp.cliente ? "and c.id = $1" : ""} order by c.nome, k.nome`,
      sp.cliente ? [sp.cliente] : [],
    ),
  }));
  const valor = d.multas.reduce((a, m) => a + Number(m.valor), 0);
  const prazo7 = d.multas.filter((m) => m.prazo && diasEntre(hoje, m.prazo) <= 7).length;
  const semCondutor = d.multas.filter((m) => !m.condutor_indicado && m.notificada_em).length;
  const filtrado = sp.cliente || sp.placa || sp.condutor || sp.novas;
  const exportar = new URLSearchParams(Object.fromEntries(Object.entries({ tipo: "multas", cliente: sp.cliente ?? "", placa: sp.placa ?? "", condutor: sp.condutor ?? "", novas: sp.novas ?? "" }).filter(([, v]) => v)));
  return (
    <>
      <Cabecalho titulo="Multas em aberto" sub="Todas as multas ainda não pagas, de todos os clientes, da mais urgente para a menos urgente." acoes={<a href={`/api/relatorios-gestao?${exportar}`} className="btn-contorno">Exportar Excel</a>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Multas em aberto" valor={d.multas.length} detalhe={filtrado ? "com os filtros aplicados" : "todos os clientes"} />
        <Numero rotulo="Valor cheio" valor={brl(valor)} />
        <Numero rotulo="Prazos em até 7 dias" tom={prazo7 ? "rec" : "normal"} valor={prazo7} />
        <Numero rotulo="Notificadas sem condutor indicado" tom={semCondutor ? "ambar" : "normal"} valor={semCondutor} detalhe="risco de multa NIC" />
      </div>
      <Card titulo="Filtros" className="mb-6">
        <form className="flex flex-wrap items-end gap-2">
          <div><label className="rotulo">Cliente</label><select name="cliente" defaultValue={sp.cliente ?? ""} className="campo w-64"><option value="">Todos os clientes</option>{d.clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          <div><label className="rotulo">Placa</label><input name="placa" defaultValue={sp.placa ?? ""} placeholder="ABC1D23" className="campo w-36 uppercase" /></div>
          <div><label className="rotulo">Condutor</label><select name="condutor" defaultValue={sp.condutor ?? ""} className="campo w-72"><option value="">Todos os condutores</option>{d.condutores.map((k) => <option key={k.id} value={k.id}>{k.nome}{sp.cliente ? "" : ` · ${k.cliente}`}</option>)}</select></div>
          <label className="flex items-center gap-2 self-center rounded-xl border border-borda px-3 py-2.5 text-sm"><input type="checkbox" name="novas" value="1" defaultChecked={sp.novas === "1"} className="accent-vigia" /> Só as novas (24 h){d.novas ? <SeloContagem n={d.novas} /> : null}</label>
          <button className="btn-primario">Filtrar</button>
          {filtrado && <Link href="/gestao/multas" className="btn-leve">Limpar</Link>}
        </form>
        <p className="mt-2 text-xs text-suave">O filtro de condutor traz as multas indicadas a ele e as das placas que ele dirige.</p>
      </Card>
      <Card titulo={`Multas (${d.multas.length})`}>
        {d.multas.length === 0 ? <Vazio>Nenhuma multa em aberto{filtrado ? " com estes filtros" : ""}.</Vazio> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="tabela min-w-[1100px]">
              <thead><tr><th>Cliente</th><th>Placa</th><th>Infração</th><th>Situação</th><th>Prazo</th><th>Condutor</th><th className="!text-right">Valor</th><th /></tr></thead>
              <tbody>
                {d.multas.map((m) => (
                  <tr key={m.id}>
                    <td className="text-sm font-semibold">{m.cliente}</td>
                    <td><Placa placa={m.placa} tamanho="sm" /><div className="mt-1 text-xs text-suave">{m.apelido ?? ""}</div></td>
                    <td className="text-sm">{m.descricao}{ehNova(m.criado_em) && <SeloNova />}<div className="text-xs text-suave">{m.orgao} · {dataBR(m.data_infracao)} · {m.pontos} pts</div></td>
                    <td className="text-xs">{ESTADOS[m.estado as EstadoMulta]?.rotulo ?? m.estado}</td>
                    <td>{m.prazo ? <ChipPrazo dias={diasEntre(hoje, m.prazo)} /> : <span className="text-xs text-suave">—</span>}<div className="text-[11px] text-suave">{m.prazo ? dataBR(m.prazo) : ""}</div></td>
                    <td className="text-xs">{m.condutor_indicado ? <b>{m.condutor_indicado}</b> : <span className="text-suave">não indicado</span>}{m.condutores_placa && <div className="text-suave">dirigem: {m.condutores_placa}</div>}</td>
                    <td className="num text-right font-semibold">{brl(Number(m.valor))}</td>
                    <td className="text-right"><form action={entrarCliente}><input type="hidden" name="clienteId" value={m.cliente_id} /><input type="hidden" name="destino" value={`/multas/${m.id}`} /><button className="link text-sm">Abrir</button></form></td>
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
