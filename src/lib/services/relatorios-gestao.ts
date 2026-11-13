/**
 * Relatórios da operação para a equipe Vigia Placa (todos os clientes que o escopo do usuário enxerga).
 * Cada relatório devolve colunas tipadas + linhas, usadas pela tela e pela exportação em Excel.
 */
import * as XLSX from "xlsx";
import type { Db } from "../db";
import { hojeISO, somarDias } from "../domain/dates";
import { CICLOS, type Ciclo, type Periodo } from "../domain/ciclo";
import { textoPeriodo, type TipoPeriodo } from "../domain/periodo";
import { calcularFatura } from "./faturamento";
import { listarCondutores } from "./condutores";
import { ESTADOS, melhorValorHoje, pagavel, valoresMulta, type EstadoMulta } from "../domain/ctb";
import { regra, SELECT_MULTA, SQL_SNE, type MultaRow } from "./multas";

export type TipoColuna = "texto" | "num" | "brl" | "data";
export interface Coluna { chave: string; rotulo: string; tipo: TipoColuna }
export interface Tabela { titulo: string; descricao: string; colunas: Coluna[]; linhas: Record<string, string | number | null>[] }
export interface Filtros { periodo?: Periodo | null; cliente?: string | null; grupo?: string | null; placa?: string | null; condutor?: string | null; mes?: string | null; novas?: boolean }

export const RELATORIOS = {
  faturamento: "Faturamento por cliente",
  "consultas-api": "Custo por API",
  "multas-pagar": "Multas a pagar",
  "valores-multas": "Valor das multas (cheio, desconto e a pagar)",
  "ranking-placas": "Ranking de placas com mais multas",
  multas: "Multas em aberto",
  ranking: "Ranking de condutores",
  condutores: "Condutores",
  "condutores-cliente": "Condutores por cliente",
  cnh: "CNHs vencidas e a vencer",
  veiculos: "Veículos por cliente",
  placas: "Lista de veículos",
} as const;
export type TipoRelatorio = keyof typeof RELATORIOS;

/** Relatórios com período e o padrão de cada um (os demais mostram a situação atual). */
export const PERIODO_DO_RELATORIO: Partial<Record<TipoRelatorio, { padrao: TipoPeriodo; data: string; aceitaTudo: boolean }>> = {
  faturamento: { padrao: "mes", data: "competência", aceitaTudo: false },
  "consultas-api": { padrao: "mes", data: "data da consulta", aceitaTudo: true },
  multas: { padrao: "tudo", data: "data da infração", aceitaTudo: true },
  "multas-pagar": { padrao: "tudo", data: "vencimento", aceitaTudo: true },
  "valores-multas": { padrao: "tudo", data: "data da infração", aceitaTudo: true },
  "ranking-placas": { padrao: "ano", data: "data da infração", aceitaTudo: true },
};

/** Condição SQL de período sobre uma coluna de data. */
function noPeriodo(f: Filtros, params: unknown[], col: string): string {
  if (!f.periodo) return "";
  params.push(f.periodo.inicio, f.periodo.fim);
  return ` and ${col} between $${params.length - 1} and $${params.length}`;
}
export const ehRelatorio = (v: string): v is TipoRelatorio => v in RELATORIOS;

const FORMA: Record<string, string> = { pix: "Pix", boleto: "Boleto", cartao: "Cartão" };
const c = (chave: string, rotulo: string, tipo: TipoColuna = "texto"): Coluna => ({ chave, rotulo, tipo });

/** Filtro "Geral / Cliente / Grupo econômico" sobre uma coluna que guarda o id do cliente. */
function porCliente(f: Filtros, params: unknown[], col: string): string {
  if (f.cliente) { params.push(f.cliente); return ` and ${col} = $${params.length}`; }
  if (f.grupo) { params.push(f.grupo); return ` and ${col} in (select id from clientes where grupo_id = $${params.length})`; }
  return "";
}

/** Colunas que entram na linha de total (tela e Excel): valores e quantidades, menos posição, médias e dias. */
export const somavel = (col: Coluna) => (col.tipo === "brl" || col.tipo === "num") && !/^(posicao|medio|dias)$/.test(col.chave);

const SQL_GRUPO = "(select g.nome from grupos_economicos g where g.id = c.grupo_id)";

async function clientesDoFiltro(db: Db, f: Filtros) {
  const params: unknown[] = [];
  return db.q<{ id: string; nome: string; documento: string; ciclo_fechamento: string; forma_cobranca: string; bloqueado_em: string | null; grupo: string | null }>(
    `select c.id, c.nome, c.documento, c.ciclo_fechamento, c.forma_cobranca, c.bloqueado_em, ${SQL_GRUPO} as grupo
       from clientes c where c.ativo and c.excluido_em is null${porCliente(f, params, "c.id")} order by c.nome`,
    params,
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
  const pc = porCliente(f, params, "m.cliente_id"); if (pc) cond.push(pc.slice(5));
  const pp = noPeriodo(f, params, "m.data_infracao"); if (pp) cond.push(pp.slice(5));
  if (f.placa) { params.push(`%${f.placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}%`); cond.push(`p.placa like $${params.length}`); }
  if (f.novas) cond.push("m.criado_em > now() - interval '24 hours'");
  if (f.condutor) {
    params.push(f.condutor);
    cond.push(`(m.condutor_id = $${params.length} or exists (select 1 from placa_condutores pc where pc.placa_id = m.placa_id and pc.condutor_id = $${params.length}))`);
  }
  return db.q(
    `select m.id, m.cliente_id, m.orgao_id, m.criado_em, ${SQL_SNE} as sne_adesao_em, o.aderente_sne, c.tipo as tipo_proprietario, m.condutor_id, m.indicacao_status, c.nome as cliente, ${SQL_GRUPO} as grupo, p.placa, p.apelido, m.descricao, m.gravidade, m.pontos, m.valor, m.estado, m.data_infracao,
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
  const filtro = porCliente(f, params, "c.id");
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

/** Provedor de cada fonte: as várias bases da Infosimples somam como "Infosimples". */
export const SQL_PROVEDOR = `case when q.fonte_id = 'directdata' then 'Direct Data' when q.fonte_id like 'infosimples%' then 'Infosimples' else coalesce(f.nome, q.fonte_id) end`;

/** Consultas e custo por API (Direct Data, Infosimples) no mês, para conferir com a fatura de cada fornecedor. */
export async function consultasPorApi(db: Db, mes: string, cliente?: string | null) {
  return db.q<{ provedor: string; consultas: number; ok: number; erros: number; custo: number; placas: number }>(
    `select ${SQL_PROVEDOR} as provedor, count(*)::int as consultas, count(*) filter (where q.resultado = 'ok')::int as ok,
            count(*) filter (where q.resultado <> 'ok')::int as erros, coalesce(sum(q.custo),0)::int as custo, count(distinct q.placa_id)::int as placas
       from consultas q left join fontes f on f.id = q.fonte_id
      where to_char(q.data at time zone 'America/Sao_Paulo','YYYY-MM') = $1 and q.fonte_id is not null and ($2::uuid is null or q.cliente_id = $2)
      group by 1 order by custo desc`,
    [mes, cliente || null],
  );
}

export async function gerarRelatorioGestao(db: Db, tipo: TipoRelatorio, f: Filtros): Promise<Tabela> {
  const hoje = hojeISO();
  const mes = f.mes && /^\d{4}-\d{2}$/.test(f.mes) ? f.mes : hoje.slice(0, 7);
  const titulo = RELATORIOS[tipo];

  if (tipo === "faturamento") {
    const linhas = [];
    for (const cl of await clientesDoFiltro(db, f)) {
      const x = await calcularFatura(db, cl.id, f.periodo ?? mes);
      linhas.push({
        cliente: cl.nome, grupo: cl.grupo, documento: cl.documento, ciclo: (CICLOS[cl.ciclo_fechamento as Ciclo] ?? "Mensal").split(" (")[0], forma: FORMA[cl.forma_cobranca] ?? cl.forma_cobranca,
        placas: x.placas, mensalidades: x.mensalidades, economia: x.baseSaving, saving: x.saving, conveniencia: x.conveniencia, defesa: x.defesa, total: x.total + x.conveniencia,
      });
    }
    linhas.sort((a, b) => b.total - a.total);
    const colunas = [c("cliente", "Cliente"), c("grupo", "Grupo econômico"), c("documento", "CPF/CNPJ"), c("ciclo", "Fechamento"), c("forma", "Pagamento"), c("placas", "Placas", "num"), c("mensalidades", "Mensalidades", "brl"),
        c("economia", "Economia comprovada", "brl"), c("saving", "Saving", "brl"), c("conveniencia", "Conveniência", "brl"), c("defesa", "Defesa", "brl"), c("total", "Faturamento", "brl")];
    return { titulo, descricao: `${f.periodo ? textoPeriodo(f.periodo) : `Mês ${mes}`}: mensalidades proporcionais aos dias, saving sobre a economia comprovada, conveniência e defesa.`, linhas, colunas };
  }

  if (tipo === "consultas-api") {
    const pa: unknown[] = [];
    const filtroApi = porCliente(f, pa, "q.cliente_id") + noPeriodo(f, pa, "(q.data at time zone 'America/Sao_Paulo')::date");
    const linhas = await db.q(
      `select ${SQL_PROVEDOR} as provedor, coalesce(f.nome, q.fonte_id) as servico, cl.nome as cliente, (select g.nome from grupos_economicos g where g.id = cl.grupo_id) as grupo,
              count(*)::int as consultas, count(*) filter (where q.resultado = 'ok')::int as ok, count(*) filter (where q.resultado <> 'ok')::int as erros,
              coalesce(sum(q.custo),0)::int as custo, round(coalesce(avg(q.custo),0))::int as medio
         from consultas q left join fontes f on f.id = q.fonte_id join clientes cl on cl.id = q.cliente_id
        where q.fonte_id is not null${filtroApi}
        group by 1, 2, 3, 4 order by 1, custo desc`,
      pa,
    );
    const colunas = [c("provedor", "API"), c("servico", "Base"), c("cliente", "Cliente"), c("grupo", "Grupo econômico"), c("consultas", "Consultas", "num"), c("ok", "Com sucesso", "num"), c("erros", "Com erro", "num"),
      c("custo", "Custo", "brl"), c("medio", "Custo médio", "brl")];
    return { titulo, descricao: `${textoPeriodo(f.periodo ?? null)}: quantas consultas foram feitas em cada API (Direct Data e Infosimples) e quanto custaram, por base e por cliente. Consultas com erro normalmente não são cobradas pela fonte.`, linhas: linhas, colunas };
  }

  if (tipo === "multas-pagar" || tipo === "valores-multas") {
    const pm: unknown[] = [];
    const filtroM = porCliente(f, pm, "m.cliente_id") + noPeriodo(f, pm, tipo === "multas-pagar" ? "m.vencimento" : "m.data_infracao");
    const rows = await db.q<MultaRow & { grupo: string | null }>(
      `${SELECT_MULTA.replace("c.nome as cliente_nome,", `c.nome as cliente_nome, ${SQL_GRUPO} as grupo,`)}
        where m.estado not in ('paga', 'cancelada') and c.excluido_em is null${filtroM}
        order by m.vencimento nulls last, m.valor desc`,
      pm,
    );
    const calc = rows.map((m) => {
      const r = regra(m);
      const v = valoresMulta(r);
      const hojeV = melhorValorHoje(r, hoje);
      const vencida = !!m.vencimento && m.vencimento < hoje;
      return { m, v, hojeV, vencida, comDesconto: v.com40 ?? v.com20 };
    });
    const pa: unknown[] = [];
    const filtroA = porCliente(f, pa, "a.cliente_id") + noPeriodo(f, pa, tipo === "multas-pagar" ? "a.vencimento" : "a.data_infracao");
    const antt = await db.q<any>(
      `select a.*, c.nome as cliente_nome, ${SQL_GRUPO} as grupo from multas_antt a join clientes c on c.id = a.cliente_id
        where a.aberta and c.excluido_em is null${filtroA} order by a.vencimento nulls last`,
      pa,
    );
    if (tipo === "multas-pagar") {
      const linhas: Record<string, any>[] = calc.filter((x) => pagavel(x.m.estado as EstadoMulta)).map(({ m, v, hojeV, vencida, comDesconto }) => ({
        cliente: m.cliente_nome, grupo: m.grupo, placa: m.placa, apelido: m.apelido, auto: m.auto_infracao, infracao: m.descricao, orgao: m.orgao_nome,
        data: m.data_infracao, vencimento: m.vencimento, dias: m.vencimento ? Math.round((Date.parse(m.vencimento) - Date.parse(hoje)) / 864e5) : null,
        cheio: v.cheio, desconto: comDesconto, pagar: hojeV.valor, faixa: hojeV.desconto ? `${hojeV.desconto}%` : vencida ? "Vencida" : "Sem desconto",
        situacao: ESTADOS[m.estado as EstadoMulta]?.rotulo ?? m.estado, origem: "Trânsito",
      }));
      // ANTT: multa no CNPJ, sem desconto de 20%/40% (regras próprias da agência).
      for (const a of antt) linhas.push({
        cliente: a.cliente_nome, grupo: a.grupo, placa: a.placa, apelido: null, auto: a.auto, infracao: a.descricao ?? "Infração ANTT", orgao: "ANTT",
        data: a.data_infracao, vencimento: a.vencimento, dias: a.vencimento ? Math.round((Date.parse(a.vencimento) - Date.parse(hoje)) / 864e5) : null,
        cheio: Number(a.valor), desconto: Number(a.valor), pagar: Number(a.valor), faixa: a.impeditiva ? "Impeditiva" : "—", situacao: a.situacao ?? "Em aberto", origem: "ANTT",
      });
      linhas.sort((x, y) => String(x.vencimento ?? "9999").localeCompare(String(y.vencimento ?? "9999")));
      const colunas = [c("cliente", "Cliente"), c("grupo", "Grupo econômico"), c("origem", "Origem"), c("placa", "Placa"), c("apelido", "Veículo"), c("auto", "Auto de infração"), c("infracao", "Infração"), c("orgao", "Órgão"),
        c("data", "Data da infração", "data"), c("vencimento", "Vencimento", "data"), c("dias", "Dias para vencer", "num"), c("cheio", "Valor da multa", "brl"), c("desconto", "Valor com desconto", "brl"),
        c("pagar", "Valor a pagar hoje", "brl"), c("faixa", "Desconto hoje"), c("situacao", "Situação")];
      return { titulo, descricao: `Vencimento: ${textoPeriodo(f.periodo ?? null)}. ` + "Multas de trânsito e da ANTT que já podem ser pagas, do vencimento mais próximo ao mais distante. \"Valor a pagar hoje\" aplica o desconto que ainda vale (40% com SNE, 20% até o vencimento) ou o valor cheio se venceu; a ANTT não tem esses descontos.",
        linhas: linhas, colunas };
    }
    // valores-multas: resumo por cliente
    const por = new Map<string, any>();
    for (const { m, v, hojeV, comDesconto } of calc) {
      const k = m.cliente_id;
      const l = por.get(k) ?? { cliente: m.cliente_nome, grupo: m.grupo, multas: 0, cheio: 0, desconto: 0, pagar: 0, economia: 0, com40: 0 };
      l.multas++; l.cheio += v.cheio; l.desconto += comDesconto; l.pagar += hojeV.valor; l.economia += v.cheio - hojeV.valor; if (v.com40 !== null) l.com40++;
      por.set(k, l);
    }
    for (const a of antt) {
      const l = por.get(a.cliente_id) ?? { cliente: a.cliente_nome, grupo: a.grupo, multas: 0, cheio: 0, desconto: 0, pagar: 0, economia: 0, com40: 0 };
      l.antt = (l.antt ?? 0) + Number(a.valor); l.antt_qtd = (l.antt_qtd ?? 0) + 1;
      por.set(a.cliente_id, l);
    }
    const linhas = [...por.values()].map((l) => ({ ...l, antt: l.antt ?? 0, antt_qtd: l.antt_qtd ?? 0, total: l.pagar + (l.antt ?? 0) })).sort((a, b) => b.total - a.total);
    const colunas = [c("cliente", "Cliente"), c("grupo", "Grupo econômico"), c("multas", "Multas de trânsito", "num"), c("com40", "Com direito a 40% (SNE)", "num"), c("cheio", "Valor da multa", "brl"),
      c("desconto", "Valor com desconto", "brl"), c("pagar", "Valor a ser pago hoje", "brl"), c("economia", "Economia pagando hoje", "brl"),
      c("antt_qtd", "Multas ANTT", "num"), c("antt", "ANTT em aberto", "brl"), c("total", "Total a pagar hoje", "brl")];
    return { titulo, descricao: `Infrações: ${textoPeriodo(f.periodo ?? null)}. ` + "Multas em aberto por cliente: valor cheio, valor com o maior desconto possível (40% com SNE ou 20%) e quanto se paga hoje, com os descontos que ainda valem.", linhas: linhas, colunas };
  }

  if (tipo === "ranking-placas") {
    const pr: unknown[] = [];
    const filtroP = porCliente(f, pr, "p.cliente_id");
    const periodoP = noPeriodo(f, pr, "m.data_infracao");
    const linhas = (await db.q(
      `select p.placa, p.apelido, c.nome as cliente, ${SQL_GRUPO} as grupo,
              count(m.id)::int as multas, count(m.id) filter (where m.estado not in ('paga','cancelada'))::int as abertas,
              coalesce(sum(m.pontos),0)::int as pontos, coalesce(sum(m.valor),0)::int as valor,
              count(m.id) filter (where m.gravidade = 'gravissima')::int as gravissimas, max(m.data_infracao) as ultima,
              (select string_agg(k.nome, ', ' order by k.nome) from placa_condutores pc join condutores k on k.id = pc.condutor_id where pc.placa_id = p.id) as condutores
         from placas p join clientes c on c.id = p.cliente_id and c.excluido_em is null
         join multas m on m.placa_id = p.id and m.estado <> 'cancelada'${periodoP}
        where true${filtroP}
        group by p.id, p.placa, p.apelido, c.nome, c.grupo_id
        order by multas desc, pontos desc, valor desc limit 500`,
      pr,
    )).map((l: any, i: number) => ({ posicao: i + 1, ...l }));
    return { titulo, descricao: `Infrações: ${textoPeriodo(f.periodo ?? null)}. Placas com mais multas no período (multas canceladas não contam).`, linhas,
      colunas: [c("posicao", "#", "num"), c("placa", "Placa"), c("apelido", "Veículo"), c("cliente", "Cliente"), c("grupo", "Grupo econômico"), c("multas", "Multas", "num"), c("abertas", "Em aberto", "num"),
        c("pontos", "Pontos", "num"), c("valor", "Valor das multas", "brl"), c("gravissimas", "Gravíssimas", "num"), c("condutores", "Condutores"), c("ultima", "Última infração", "data")] };
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
    const pv: unknown[] = [];
    const linhas = await db.q(
      `select c.nome as cliente,
         count(p.id) filter (where p.status <> 'pausada') as ativas,
         count(p.id) filter (where p.status = 'pausada') as pausadas,
         count(p.id) filter (where p.status <> 'pausada' and p.sne_adesao_em is null) as sem_sne,
         count(p.id) filter (where p.status <> 'pausada' and not exists (select 1 from placa_condutores pc where pc.placa_id = p.id)) as sem_condutor,
         (select count(*) from multas m where m.cliente_id = c.id and m.estado not in ('paga','cancelada')) as multas_abertas,
         (select coalesce(sum(m.valor),0) from multas m where m.cliente_id = c.id and m.estado not in ('paga','cancelada')) as valor_aberto
       from clientes c left join placas p on p.cliente_id = c.id
       where c.ativo and c.excluido_em is null${porCliente(f, pv, "c.id")}
       group by c.id, c.nome order by ativas desc, c.nome`,
      pv,
    );
    return { titulo, descricao: "Placas de cada cliente, adesão ao SNE, condutores e multas em aberto.", linhas: linhas.map((l: any) => ({ ...l, ativas: Number(l.ativas), pausadas: Number(l.pausadas), sem_sne: Number(l.sem_sne), sem_condutor: Number(l.sem_condutor), multas_abertas: Number(l.multas_abertas), valor_aberto: Number(l.valor_aberto) })),
      colunas: [c("cliente", "Cliente"), c("ativas", "Placas ativas", "num"), c("pausadas", "Pausadas", "num"), c("sem_sne", "Sem SNE", "num"), c("sem_condutor", "Sem condutor", "num"), c("multas_abertas", "Multas em aberto", "num"), c("valor_aberto", "Valor em aberto", "brl")] };
  }

  // placas: lista detalhada
  const params: unknown[] = [];
  const cond = ["c.ativo", "c.excluido_em is null"];
  const pcl = porCliente(f, params, "p.cliente_id"); if (pcl) cond.push(pcl.slice(5));
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
  const aoa = [[`Vigia Placa · ${t.titulo}`], [t.descricao], [], t.colunas.map((c) => (c.tipo === "brl" ? `${c.rotulo} (R$)` : c.rotulo)), ...t.linhas.map((l) => t.colunas.map((c) => fmt(c, l[c.chave]))),
    ...(t.linhas.length > 1 && t.colunas.some(somavel)
      ? [t.colunas.map((c, i) => (i === 0 ? `Total (${t.linhas.length})` : somavel(c) ? fmt(c, t.linhas.reduce((a, l) => a + Number(l[c.chave] ?? 0), 0)) : ""))]
      : [])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = t.colunas.map((c) => ({ wch: c.tipo === "texto" ? 26 : 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t.titulo.slice(0, 31));
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
