import type { Db } from "../db";
import type { EstadoMulta, Gravidade, MultaRegra } from "../domain/ctb";
import { acoesDaMulta, ordenarAcoes, type Acao } from "../domain/acoes";
import { hojeISO } from "../domain/dates";

export interface MultaRow {
  id: string;
  placa_id: string;
  cliente_id: string;
  orgao_id: string;
  auto_infracao: string;
  codigo_infracao: string;
  descricao: string;
  gravidade: Gravidade;
  pontos: number;
  valor: number;
  data_infracao: string;
  hora: string | null;
  local: string | null;
  estado: EstadoMulta;
  detectada_em: string;
  fonte: string;
  notificada_em: string | null;
  vencimento: string | null;
  condutor_id: string | null;
  indicacao_status: string | null;
  indicacao_token: string | null;
  protocolo_indicacao: string | null;
  linha_digitavel: string | null;
  placa: string;
  apelido: string | null;
  centro_custo: string | null;
  sne_adesao_em: string | null;
  tipo_proprietario: "PF" | "PJ";
  cliente_nome: string;
  orgao_nome: string;
  aderente_sne: boolean;
  condutor_nome: string | null;
  no_carrinho: boolean;
}

export const SELECT_MULTA = `
  select m.*, p.placa, p.apelido, p.centro_custo, p.sne_adesao_em, c.tipo as tipo_proprietario, c.nome as cliente_nome,
         o.nome as orgao_nome, o.aderente_sne, cd.nome as condutor_nome,
         exists (select 1 from carrinho_itens ci where ci.multa_id = m.id) as no_carrinho
  from multas m
  join placas p on p.id = m.placa_id
  join clientes c on c.id = m.cliente_id
  join orgaos o on o.id = m.orgao_id
  left join condutores cd on cd.id = m.condutor_id`;

export function regra(r: MultaRow): MultaRegra {
  return {
    valor: r.valor,
    estado: r.estado,
    dataInfracao: r.data_infracao,
    notificadaEm: r.notificada_em,
    vencimento: r.vencimento,
    sneAdesaoEm: r.sne_adesao_em,
    orgaoAderenteSne: r.aderente_sne,
    tipoProprietario: r.tipo_proprietario,
    condutorIndicado: !!r.condutor_id && r.indicacao_status !== "recusada",
  };
}

export type AcaoMulta = Acao & { multa: MultaRow };

export async function multasAbertas(db: Db, clienteId: string | null): Promise<MultaRow[]> {
  return db.q<MultaRow>(
    `${SELECT_MULTA} where m.estado not in ('paga','cancelada') ${clienteId ? "and m.cliente_id = $1" : ""} order by m.vencimento nulls last`,
    clienteId ? [clienteId] : [],
  );
}

/** Faça hoje: a ação principal de cada multa, ordenada por prazo. */
export async function facaHoje(db: Db, clienteId: string | null, limite = 10): Promise<AcaoMulta[]> {
  const hoje = hojeISO();
  const todas: AcaoMulta[] = [];
  for (const m of await multasAbertas(db, clienteId)) {
    const [principal] = acoesDaMulta(regra(m), hoje);
    if (principal) todas.push({ ...principal, multa: m });
  }
  return ordenarAcoes(todas, limite);
}

export async function registrarEvento(db: Db, e: { multaId: string; clienteId: string; tipo: string; descricao: string; fonte?: string; usuarioId?: string | null }) {
  await db.q("insert into eventos (multa_id, cliente_id, tipo, descricao, fonte, usuario_id) values ($1,$2,$3,$4,$5,$6)", [
    e.multaId, e.clienteId, e.tipo, e.descricao, e.fonte ?? null, e.usuarioId ?? null,
  ]);
}

export async function auditar(db: Db, a: { usuarioId: string | null; clienteId?: string | null; acao: string; entidade: string; entidadeId?: string; dados?: unknown }) {
  await db.q("insert into auditoria (usuario_id, cliente_id, acao, entidade, entidade_id, dados) values ($1,$2,$3,$4,$5,$6)", [
    a.usuarioId, a.clienteId ?? null, a.acao, a.entidade, a.entidadeId ?? null, a.dados ? JSON.stringify(a.dados) : null,
  ]);
}

export async function registrarEconomia(db: Db, e: { multaId: string; clienteId: string; tipo: "desconto" | "nic_evitada" | "cancelamento"; valor: number; comprovada: boolean; descricao: string }) {
  const mes = hojeISO().slice(0, 7);
  await db.q(
    `insert into economias (multa_id, cliente_id, tipo, valor, comprovada, mes, descricao) values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (multa_id, tipo) do update set valor = excluded.valor, comprovada = excluded.comprovada or economias.comprovada,
       mes = case when excluded.comprovada and not economias.comprovada then excluded.mes else economias.mes end, descricao = excluded.descricao`,
    [e.multaId, e.clienteId, e.tipo, e.valor, e.comprovada, mes, e.descricao],
  );
}
