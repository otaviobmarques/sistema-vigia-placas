/** Placas que precisam de atenção: consulta com erro, parada na fila ou com a última rodada falhando em todas as fontes. */
import type { Db } from "../db";

export const MINUTOS_NA_FILA = 15; // passado disso, "aguardando" deixa de ser fila e vira parada

export type PlacaReprocessar = {
  id: string; placa: string; renavam: string; uf: string; apelido: string | null; status: string;
  cliente_id: string; cliente: string; criado_em: string; reprocessar_em: string | null;
  ultima_tentativa: string | null; erros: Array<{ fonte: string; erro: string }> | null; motivo: "erro" | "parada" | "ultima_falhou" | "na_fila";
};

export async function placasParaReprocessar(db: Db, filtros: { cliente?: string | null } = {}) {
  const linhas = await db.q<PlacaReprocessar>(
    `with ult as (
       select distinct on (placa_id) placa_id, data from consultas order by placa_id, data desc
     ), rodada as (
       select c.placa_id, max(c.data) as data, bool_and(c.resultado <> 'ok') as falhou,
              json_agg(json_build_object('fonte', coalesce(c.fonte_id, ''), 'erro', coalesce(c.erro, c.resultado)) order by c.fonte_id) filter (where c.resultado <> 'ok') as erros
         from consultas c join ult on ult.placa_id = c.placa_id and ult.data = c.data group by c.placa_id
     )
     select p.id, p.placa, p.renavam, p.uf, p.apelido, p.status, p.cliente_id, cl.nome as cliente, p.criado_em, p.reprocessar_em,
            r.data as ultima_tentativa, r.erros,
            case
              when p.status = 'aguardando' and coalesce(p.reprocessar_em, p.criado_em) > now() - make_interval(mins => $2) then 'na_fila'
              when p.status = 'erro' then 'erro'
              when p.status = 'aguardando' then 'parada'
              else 'ultima_falhou'
            end as motivo
       from placas p
       join clientes cl on cl.id = p.cliente_id and cl.excluido_em is null
       left join rodada r on r.placa_id = p.id
      where p.status <> 'pausada'
        and (p.status in ('erro', 'aguardando') or coalesce(r.falhou, false))
        and ($1::uuid is null or p.cliente_id = $1)
      order by (p.status = 'aguardando' and coalesce(p.reprocessar_em, p.criado_em) > now() - make_interval(mins => $2)), cl.nome, p.placa`,
    [filtros.cliente || null, MINUTOS_NA_FILA],
  );
  return linhas;
}

/** Leitura do erro para quem vai corrigir: dado de cadastro errado ou instabilidade da fonte. */
export function diagnostico(erros: Array<{ fonte: string; erro: string }> | null, motivo: PlacaReprocessar["motivo"]): { tipo: "cadastro" | "fonte" | "fila" | "sem_consulta"; texto: string } {
  if (motivo === "na_fila") return { tipo: "fila", texto: "Consulta em andamento. Atualize a página em alguns minutos." };
  if (!erros?.length) return { tipo: "sem_consulta", texto: "A consulta não chegou a rodar. Reprocesse." };
  const todos = erros.map((e) => e.erro).join(" | ");
  if (/\b60[6-8]\b|inv[aá]lid|n[aã]o (encontrad|confere|corresponde|localizad)|renavam|placa|par[aâ]metro|chassi/i.test(todos) && !/falha ao realizar|timeout|tempo/i.test(todos))
    return { tipo: "cadastro", texto: "Provável erro de cadastro: confira placa, Renavam e UF no documento do veículo (CRLV) e corrija." };
  if (/\b60[59]\b|\b61[05]\b|timeout|tempo|indispon|falha ao realizar|\b5\d\d\b|fetch failed|abort|ECONN/i.test(todos))
    return { tipo: "fonte", texto: "Instabilidade da fonte (Direct Data / Infosimples). Os dados parecem certos: reprocesse mais tarde." };
  return { tipo: "fonte", texto: "Erro não identificado. Confira os dados e reprocesse." };
}

export const nomeFonte = (f: string) =>
  f === "directdata" ? "Direct Data" : f.startsWith("infosimples:") ? `Infosimples (${f.slice("infosimples:".length)})` : f === "infosimples" ? "Infosimples" : f || "—";
