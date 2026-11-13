import Link from "next/link";
import { exigirCliente, noEscopo } from "@/lib/auth";
import { regra, SELECT_MULTA, type MultaRow } from "@/lib/services/multas";
import { melhorValorHoje, pagavel, prazoIndicacao } from "@/lib/domain/ctb";
import { dataBR, diasEntre, hojeISO } from "@/lib/domain/dates";
import { brl } from "@/lib/domain/money";
import { Abas, Cabecalho, Card, ChipDesconto, ChipEstado, ChipPrazo, Mensagem, Vazio } from "@/components/ui";
import { Placa } from "@/components/marca";
import { adicionarCarrinho } from "../../actions";
import { ehNova, SeloNova } from "@/components/selo-nova";
import { LogoOrgao } from "@/components/logo-orgao";
import { SelosDesconto } from "@/components/selo-desconto";
import { selosDesconto } from "@/lib/domain/ctb";

export const metadata = { title: "Multas" };

const ABAS: Record<string, { rotulo: string; sql: string }> = {
  abertas: { rotulo: "Em aberto", sql: "m.estado not in ('paga','cancelada')" },
  indicar: { rotulo: "Indicar condutor", sql: "c.tipo = 'PJ' and m.condutor_id is null and m.estado in ('detectada','notificada')" },
  pagar: { rotulo: "Pagar", sql: "m.estado in ('notificada','condutor_indicado','reconhecida_sne','penalidade')" },
  defesa: { rotulo: "Em defesa", sql: "m.estado = 'em_defesa'" },
  vencidas: { rotulo: "Vencidas", sql: "m.estado = 'vencida'" },
  resolvidas: { rotulo: "Pagas e canceladas", sql: "m.estado in ('paga','cancelada')" },
};

export default async function Multas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await exigirCliente();
  const sp = await searchParams;
  const aba = sp.aba && ABAS[sp.aba] ? sp.aba : "abertas";
  const hoje = hojeISO();
  const { multas, contagem, filtros } = await noEscopo(s, async (db) => {
    const cond = [`m.cliente_id = $1`, ABAS[aba].sql];
    const p: unknown[] = [s.clienteId];
    if (sp.placa) { p.push(sp.placa.toUpperCase()); cond.push(`p.placa = $${p.length}`); }
    if (sp.orgao) { p.push(sp.orgao); cond.push(`m.orgao_id = $${p.length}`); }
    if (sp.cc) { p.push(sp.cc); cond.push(`p.centro_custo = $${p.length}`); }
    const multas = await db.q<MultaRow>(`${SELECT_MULTA} where ${cond.join(" and ")} order by coalesce(m.vencimento, m.detectada_em + 60) asc limit 500`, p);
    const contagem: Record<string, number> = {};
    for (const [k, v] of Object.entries(ABAS)) {
      contagem[k] = Number((await db.one(`select count(*) as n from multas m join clientes c on c.id = m.cliente_id where m.cliente_id = $1 and ${v.sql}`, [s.clienteId]))!.n);
    }
    const filtros = {
      orgaos: await db.q("select distinct o.id, o.nome from multas m join orgaos o on o.id = m.orgao_id where m.cliente_id = $1 order by o.nome", [s.clienteId]),
      ccs: await db.q("select distinct centro_custo from placas where cliente_id = $1 and centro_custo is not null order by 1", [s.clienteId]),
    };
    return { multas, contagem, filtros };
  });
  const qs = (extra: Record<string, string>) => "?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && !["ok", "erro"].includes(k))) as any, ...extra }).toString();

  return (
    <>
      <Cabecalho titulo="Caixa de Multas" sub="Todas as multas das suas placas, com prazos e o melhor valor para pagar hoje." />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <Abas ativo={aba} itens={Object.entries(ABAS).map(([id, a]) => ({ id, rotulo: a.rotulo, href: qs({ aba: id }), n: contagem[id] }))} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="aba" value={aba} />
        <input name="placa" defaultValue={sp.placa} placeholder="Placa" className="campo w-32" />
        <select name="orgao" defaultValue={sp.orgao ?? ""} className="campo w-48">
          <option value="">Todos os órgãos</option>
          {filtros.orgaos.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
        <select name="cc" defaultValue={sp.cc ?? ""} className="campo w-48">
          <option value="">Todos os centros de custo</option>
          {filtros.ccs.map((c) => <option key={c.centro_custo} value={c.centro_custo}>{c.centro_custo}</option>)}
        </select>
        <button className="btn-contorno">Filtrar</button>
        {(sp.placa || sp.orgao || sp.cc) && <Link href={`?aba=${aba}`} className="btn-leve">Limpar</Link>}
      </form>

      <Card>
        {multas.length === 0 ? <Vazio>Nenhuma multa nesta aba.</Vazio> : (
          <form action={adicionarCarrinho}>
            <input type="hidden" name="volta" value={`/multas${qs({})}`} />
            <div className="-mx-5 overflow-x-auto">
              <table className="tabela min-w-[860px]">
                <thead>
                  <tr><th className="w-8" /><th>Placa</th><th>Infração</th><th>Situação</th><th>Prazo</th><th className="text-right">Valor cheio</th><th className="text-right">Melhor hoje</th><th /></tr>
                </thead>
                <tbody>
                  {multas.map((m) => {
                    const r = regra(m);
                    const melhor = melhorValorHoje(r, hoje);
                    const limInd = m.tipo_proprietario === "PJ" && !m.condutor_id ? prazoIndicacao(m.notificada_em) : null;
                    const prazo = [limInd, m.vencimento].filter(Boolean).sort()[0] as string | undefined;
                    const pg = pagavel(m.estado);
                    return (
                      <tr key={m.id} className="hover:bg-nevoa/60">
                        <td>{pg && !m.no_carrinho && <input type="checkbox" name="multaId" value={m.id} className="h-4 w-4 accent-vigia" aria-label={`Selecionar ${m.placa}`} />}</td>
                        <td><Placa placa={m.placa} tamanho="sm" /><div className="mt-1 text-xs text-suave">{m.apelido}</div></td>
                        <td><div className="flex items-start gap-2"><SelosDesconto selos={selosDesconto(r, hoje)} /><div><div className="font-medium">{m.descricao}{ehNova(m.criado_em) && <SeloNova />}</div><div className="text-xs text-suave"><LogoOrgao id={m.orgao_id} nome={m.orgao_nome} /> · {dataBR(m.data_infracao)} · {m.pontos} pts</div></div></div></td>
                        <td><ChipEstado estado={m.estado} /></td>
                        <td>{prazo && m.estado !== "paga" && m.estado !== "cancelada" ? <><ChipPrazo dias={diasEntre(hoje, prazo)} /><div className="mt-1 text-[11px] text-suave">{prazo === limInd ? "indicação" : "vencimento"}</div></> : <span className="text-xs text-suave">—</span>}</td>
                        <td className="num text-right">{brl(m.valor)}</td>
                        <td className="text-right">{pg ? <><div className="num font-semibold text-economia">{brl(melhor.valor)}</div><ChipDesconto d={melhor.desconto} /></> : "—"}</td>
                        <td className="text-right"><Link href={`/multas/${m.id}`} className="link text-sm">Abrir</Link>{m.no_carrinho && <div className="text-[11px] text-economia">no carrinho</div>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end"><button className="btn-economia">Adicionar selecionadas ao carrinho</button></div>
          </form>
        )}
      </Card>
    </>
  );
}
