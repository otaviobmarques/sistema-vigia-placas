/**
 * Relatórios da operação para a equipe Vigia Placa (todos os clientes que o escopo do usuário enxerga).
 * Cada relatório devolve colunas tipadas + linhas, usadas pela tela e pela exportação em Excel.
 */
import * as XLSX from "xlsx";
import type { Db } from "../db";
import { hojeISO, somarDias } from "../domain/dates";
import { CICLOS, type Ciclo } from "../domain/ciclo";
import { calcularFatura } from "./faturamento";
import { listarCondutores } from "./condutores";
import { ESTADOS, type EstadoMulta } from "../domain/ctb";

export type TipoColuna = "texto" | "num" | "brl" | "data";
export interface Coluna { chave: string; rotulo: string; tipo: TipoColuna }
export interface Tabela { titulo: string; descricao: string; colunas: Coluna[]; linhas: Record<string, string | number | null>[] }
export interface Filtros { cliente?: string | null; placa?: string | null; condutor?: string | null; mes?: string | null; novas?: boolean }

export const RELATORIOS = {
  faturamento: "Faturamento por cliente",
  multas: "Multas em aberto",
  ranking: "Ranking de condutores",
  condutores: "Condutores",
  "condutores-cliente": "Condutores por cliente",
  cnh: "CNHs vencidas e a vencer",
  veiculos: "Veículos por cliente",
  placas: "Lista de veículos",
} as const;
export type TipoRelatorio = keyof typeof RELATORIOS;
export const ehRelatorio = (v: string): v is TipoRelatorio => v in RELATORIOS;

const FORMA: Record<string, string> = { pix: "Pix", boleto: "Boleto", cartao: "Cartão" };
const c = (chave: string, rotulo: string, tipo: TipoColuna = "texto"): Coluna => ({ chave, rotulo, tipo });

async function clientesDoFiltro(db: Db, f: Filtros) {
  return db.q<{ id: string; nome: string; documento: string; ciclo_fechamento: string; forma_cobranca: string; bloqueado_em: string | null }>(
    `select id, nome, documento, ciclo_fechamento, forma_cobranca, bloqueado_em from clientes where ativo and excluido_em is null ${f.cliente ? "and id = $1" : ""} order by nome`,
    f.cliente ? [f.cliente] : [],
  );
}

/** Condutores de todos os clientes do filtro, com situação e "pode dirigir". */
async function todosCondutores(db: Db, f: Filtros) {
  const out = [];
  for (const cl of await clientesDoFiltro(db, f)) for (const k of await listarCondutores(db, cl.id)) out.push({ ...k, cliente: cl.nome, cliente_id: cl.id });
  return out;
}

/** Multas em aberto com prazo do dia, condutor indicado e condutores da placa. Filtros: cliente, placa (texto), condutor. */
export async function multasEmAberto(db: Db, f: Filtros) {
  const params: unknown[] = [];
  const cond: string[] = ["m.estado not in ('paga','cancelada')", "c.excluido_em is null"];
  if (f.cliente) { params.push(f.cliente); cond.push(`m.cliente_id = $${params.length}`); }
  if (f.placa) { params.push(`%${f.placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}%`); cond.push(`p.placa like $${params.length}`); }
  if (f.novas) cond.push("m.criado_em > now() - interval '24 hours'");
  if (f.condutor) {
    params.push(f.condutor);
    cond.push(`(m.condutor_id = $${params.length} or exists (select 1 from placa_condutores pc where pc.placa_id = m.placa_id and pc.condutor_id = $${params.length}))`);
  }
  return db.q(
    `select m.id, m.cliente_id, m.criado_em, c.nome as cliente, p.placa, p.apelido, m.descricao, m.gravidade, m.pontos, m.valor, m.estado, m.data_infracao,
            o.nome as orgao, m.vencimento, m.notificada_em, (m.notificada_em + 30) as prazo_indicacao,
            least(m.vencimento, case when m.condutor_id is null and m.notificada_em is not null then m.notificada_em + 30 end) as prazo,
            cd.nome as condutor_indicado,
            (select string_agg(k.nome, ', ' order by k.nome) from placa_condutores pc join condutores k on k.id = pc.condutor_id where pc.placa_id = m.placa_id) as condutores_placa
     from multas m join clientes c on c.id = m.cliente_id join placas p on p.id = m.placa_id join orgaos o on o.id = m.orgao_id
       left join condutores cd on cd.id = m.condutor_id
     where ${cond.join(" and ")}
     order by prazo nulls last, m.valor desc`,
    params,
  );
}


/** Condutores com mais notificações (multas) nos últimos 12 meses. */
export async function rankingCondutores(db: Db, f: Filtros, limite = 10) {
  const desde = somarDias(hojeISO(), -365);
  const params: unknown[] = [desde, limite];
  let filtro = "";
  if (f.cliente) { params.push(f.cliente); filtro = `and c.id = $${params.length}`; }
  const linhas = await db.q(
    `select k.nome as condutor, c.nome as cliente,
       (select count(*) from multas m where m.condutor_id = k.id and m.data_infracao >= $1) as indicadas,
       (select coalesce(sum(m.pontos),0) from multas m where m.condutor_id = k.id and m.data_infracao >= $1) as pontos,
       (select coalesce(sum(m.valor),0) from multas m where m.condutor_id = k.id and m.data_infracao >= $1) as valor,
       (select count(*) from multas m where m.condutor_id = k.id and m.data_infracao >= $1 and m.gravidade = 'gravissima') as gravissimas,
       (select count(*) from multas m join placa_condutores pc on pc.placa_id = m.placa_id where pc.condutor_id = k.id and m.data_infracao >= $1) as nas_placas,
       (select max(m.data_infracao) from multas m where m.condutor_id = k.id) as ultima
     from condutores k join clientes c on c.id = k.cliente_id
     where k.ativo and c.ativo and c.excluido_em is null ${filtro}
     order by indicadas desc, pontos desc, nas_placas desc, k.nome limit $2`,
    params,
  );
  return linhas
    .map((l: any) => ({ ...l, indicadas: Number(l.indicadas), pontos: Number(l.pontos), valor: Number(l.valor), gravissimas: Number(l.gravissimas), nas_placas: Number(l.nas_placas) }))
    .filter((l: any) => l.indicadas + l.nas_placas > 0)
    .map((l: any, i: number) => ({ posicao: i + 1, ...l }));
}

export async function gerarRelatorioGestao(db: Db, tipo: TipoRelatorio, f: Filtros): Promise<Tabela> {
  const hoje = hojeISO();
  const mes = f.mes && /^\d{4}-\d{2}$/.test(f.mes) ? f.mes : hoje.slice(0, 7);
  const titulo = RELATORIOS[tipo];

  if (tipo === "faturamento") {
    const linhas = [];
    for (const cl of await clientesDoFiltro(db, f)) {
      const x = await calcularFatura(db, cl.id, mes);
      linhas.push({
        cliente: cl.nome, documento: cl.documento, ciclo: (CICLOS[cl.ciclo_fechamento as Ciclo] ?? "Mensal").split(" (")[0], forma: FORMA[cl.forma_cobranca] ?? cl.forma_cobranca,
        placas: x.placas, mensalidades: x.mensalidades, economia: x.baseSaving, saving: x.saving, conveniencia: x.conveniencia, defesa: x.defesa, total: x.total + x.conveniencia,
      });
    }
    linhas.sort((a, b) => b.total - a.total);
    return { titulo, descricao: `Mês ${mes}: mensalidades proporcionais, saving sobre a economia comprovada, conveniência e defesa.`, linhas,
      colunas: [c("cliente", "Cliente"), c("documento", "CPF/CNPJ"), c("ciclo", "Fechamento"), c("forma", "Pagamento"), c("placas", "Placas", "num"), c("mensalidades", "Mensalidades", "brl"),
        c("economia", "Economia comprovada", "brl"), c("saving", "Saving", "brl"), c("conveniencia", "Conveniência", "brl"), c("defesa", "Defesa", "brl"), c("total", "Faturamento", "brl")] };
  }

  if (tipo === "multas") {
    const linhas = (await multasEmAberto(db, f)).map((m: any) => ({
      cliente: m.cliente, placa: m.placa, apelido: m.apelido, infracao: m.descricao, orgao: m.orgao, data: m.data_infracao, pontos: m.pontos, valor: m.valor,
      situacao: ESTADOS[m.estado as EstadoMulta]?.rotulo ?? m.estado, prazo: m.prazo, condutor: m.condutor_indicado ?? (m.condutores_placa ? `(placa) ${m.condutores_placa}` : null),
    }));
    return { titulo, descricao: "Todas as multas ainda não pagas nem canceladas, da mais urgente para a menos urgente.", linhas,
      colunas: [c("cliente", "Cliente"), c("placa", "Placa"), c("apelido", "Veículo"), c("infracao", "Infração"), c("orgao", "Órgão"), c("data", "Data", "data"), c("pontos", "Pontos", "num"),
        c("valor", "Valor", "brl"), c("situacao", "Situação"), c("prazo", "Próximo prazo", "data"), c("condutor", "Condutor")] };
  }

  if (tipo === "ranking") {
    const linhas = await rankingCondutores(db, f, 1000);
    return { titulo, descricao: "Condutores com mais multas nos últimos 12 meses: as indicadas a eles e as das placas que dirigem.", linhas,
      colunas: [c("posicao", "#", "num"), c("condutor", "Condutor"), c("cliente", "Cliente"), c("indicadas", "Multas indicadas", "num"), c("pontos", "Pontos", "num"), c("valor", "Valor das multas", "brl"),
        c("nas_placas", "Multas nas placas que dirige", "num"), c("gravissimas", "Gravíssimas", "num"), c("ultima", "Última infração", "data")] };
  }

  if (tipo === "condutores" || tipo === "cnh" || tipo === "condutores-cliente") {
    const todos = (await todosCondutores(db, f)).filter((k) => k.ativo);
    if (tipo === "condutores-cliente") {
      const por = new Map<string, Record<string, string | number | null>>();
      for (const k of todos) {
        const l = por.get(k.cliente_id) ?? { cliente: k.cliente, total: 0, podem: 0, nao_podem: 0, perto_limite: 0, cnh_vencida: 0, pontos: 0 };
        l.total = Number(l.total) + 1;
        if (k.pode.pode) l.podem = Number(l.podem) + 1; else l.nao_podem = Number(l.nao_podem) + 1;
        if (k.situacao.nivel === "critico" || k.situacao.nivel === "suspensao") l.perto_limite = Number(l.perto_limite) + 1;
        if (k.situacao.cnhDias !== null && k.situacao.cnhDias < 0) l.cnh_vencida = Number(l.cnh_vencida) + 1;
        l.pontos = Number(l.pontos) + k.situacao.pontos;
        por.set(k.cliente_id, l);
      }
      return { titulo, descricao: "Condutores ativos de cada cliente e quantos estão impedidos de dirigir.", linhas: [...por.values()].sort((a, b) => Number(b.total) - Number(a.total)),
        colunas: [c("cliente", "Cliente"), c("total", "Condutores", "num"), c("podem", "Podem dirigir", "num"), c("nao_podem", "Não podem", "num"), c("perto_limite", "Perto do limite de pontos", "num"), c("cnh_vencida", "CNH vencida", "num"), c("pontos", "Pontos somados", "num")] };
    }
    const base = tipo === "cnh"
      ? todos.filter((k) => k.cnh_validade && k.situacao.cnhDias !== null && k.situacao.cnhDias <= 30).sort((a, b) => (a.situacao.cnhDias ?? 0) - (b.situacao.cnhDias ?? 0))
      : todos.filter((k) => !f.condutor || k.id === f.condutor);
    const linhas = base.map((k) => ({
      cliente: k.cliente, condutor: k.nome, cpf: k.cpf, cnh: k.cnh, categoria: k.cnh_categoria, validade: k.cnh_validade,
      dias: k.situacao.cnhDias, toxicologico: k.toxicologico_validade, pontos: `${k.situacao.pontos}/${k.situacao.limite}`,
      placas: k.placas.join(", ") || null, pode: k.pode.pode ? "Sim" : `Não: ${k.pode.motivos.filter((m) => m !== "validade da CNH não informada").join(", ")}`,
    }));
    return tipo === "cnh"
      ? { titulo, descricao: `CNHs vencidas e as que vencem até ${somarDias(hoje, 30).split("-").reverse().join("/")}.`, linhas,
          colunas: [c("cliente", "Cliente"), c("condutor", "Condutor"), c("cnh", "CNH"), c("categoria", "Cat."), c("validade", "Validade", "data"), c("dias", "Dias (negativo = vencida)", "num"), c("placas", "Placas"), c("pode", "Pode dirigir")] }
      : { titulo, descricao: "Condutores ativos com pontos dos últimos 12 meses (limite do art. 261) e se podem dirigir.", linhas,
          colunas: [c("cliente", "Cliente"), c("condutor", "Condutor"), c("cpf", "CPF"), c("cnh", "CNH"), c("categoria", "Cat."), c("validade", "Validade CNH", "data"), c("toxicologico", "Toxicológico", "data"), c("pontos", "Pontos"), c("placas", "Placas"), c("pode", "Pode dirigir")] };
  }

  if (tipo === "veiculos") {
    const linhas = await db.q(
      `select c.nome as cliente,
         count(p.id) filter (where p.status <> 'pausada') as ativas,
         count(p.id) filter (where p.status = 'pausada') as pausadas,
         count(p.id) filter (where p.status <> 'pausada' and p.sne_adesao_em is null) as sem_sne,
         count(p.id) filter (where p.status <> 'pausada' and not exists (select 1 from placa_condutores pc where pc.placa_id = p.id)) as sem_condutor,
         (select count(*) from multas m where m.cliente_id = c.id and m.estado not in ('paga','cancelada')) as multas_abertas,
         (select coalesce(sum(m.valor),0) from multas m where m.cliente_id = c.id and m.estado not in ('paga','cancelada')) as valor_aberto
       from clientes c left join placas p on p.cliente_id = c.id
       where c.ativo and c.excluido_em is null ${f.cliente ? "and c.id = $1" : ""}
       group by c.id, c.nome order by ativas desc, c.nome`,
      f.cliente ? [f.cliente] : [],
    );
    return { titulo, descricao: "Placas de cada cliente, adesão ao SNE, condutores e multas em aberto.", linhas: linhas.map((l: any) => ({ ...l, ativas: Number(l.ativas), pausadas: Number(l.pausadas), sem_sne: Number(l.sem_sne), sem_condutor: Number(l.sem_condutor), multas_abertas: Number(l.multas_abertas), valor_aberto: Number(l.valor_aberto) })),
      colunas: [c("cliente", "Cliente"), c("ativas", "Placas ativas", "num"), c("pausadas", "Pausadas", "num"), c("sem_sne", "Sem SNE", "num"), c("sem_condutor", "Sem condutor", "num"), c("multas_abertas", "Multas em aberto", "num"), c("valor_aberto", "Valor em aberto", "brl")] };
  }

  // placas: lista detalhada
  const params: unknown[] = [];
  const cond = ["c.ativo", "c.excluido_em is null"];
  if (f.cliente) { params.push(f.cliente); cond.push(`p.cliente_id = $${params.length}`); }
  if (f.placa) { params.push(`%${f.placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}%`); cond.push(`p.placa like $${params.length}`); }
  const linhas = await db.q(
    `select c.nome as cliente, p.placa, p.renavam, p.uf, p.apelido, p.grupo, p.centro_custo,
       case p.status when 'pausada' then 'Pausada' when 'erro' then 'Erro de dados' else 'Ativa' end as status, p.sne_adesao_em as sne, p.ultima_verificacao::date as verificada,
       (select string_agg(k.nome, ', ' order by k.nome) from placa_condutores pc join condutores k on k.id = pc.condutor_id where pc.placa_id = p.id) as condutores,
       (select count(*) from multas m where m.placa_id = p.id and m.estado not in ('paga','cancelada')) as abertas
     from placas p join clientes c on c.id = p.cliente_id where ${cond.join(" and ")} order by c.nome, p.placa`,
    params,
  );
  return { titulo, descricao: "Todos os veículos cadastrados, com condutores e multas em aberto.", linhas: linhas.map((l: any) => ({ ...l, abertas: Number(l.abertas) })),
    colunas: [c("cliente", "Cliente"), c("placa", "Placa"), c("renavam", "Renavam"), c("uf", "UF"), c("apelido", "Apelido"), c("grupo", "Grupo"), c("status", "Situação"), c("sne", "Adesão SNE", "data"), c("condutores", "Condutores"), c("abertas", "Multas abertas", "num"), c("verificada", "Última consulta", "data")] };
}

/** Planilha com o relatório (valores em reais e datas como texto dd/mm/aaaa). */
export function tabelaXlsx(t: Tabela): Buffer {
  const fmt = (col: Coluna, v: unknown) => {
    if (v === null || v === undefined || v === "") return "";
    if (col.tipo === "brl") return Number(v) / 100;
    if (col.tipo === "num") return Number(v);
    if (col.tipo === "data") return String(v).slice(0, 10).split("-").reverse().join("/");
    return String(v);
  };
  const aoa = [[`Vigia Placa · ${t.titulo}`], [t.descricao], [], t.colunas.map((c) => (c.tipo === "brl" ? `${c.rotulo} (R$)` : c.rotulo)), ...t.linhas.map((l) => t.colunas.map((c) => fmt(c, l[c.chave])))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = t.colunas.map((c) => ({ wch: c.tipo === "texto" ? 26 : 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t.titulo.slice(0, 31));
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
