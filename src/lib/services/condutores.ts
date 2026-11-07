import type { Db } from "../db";
import { hojeISO, somarDias } from "../domain/dates";
import { situacaoCondutor, type SituacaoCondutor } from "../domain/condutores";

export interface CondutorComSituacao {
  id: string;
  nome: string;
  cpf: string | null;
  cnh: string | null;
  cnh_categoria: string | null;
  cnh_validade: string | null;
  toxicologico_validade: string | null;
  whatsapp: string | null;
  email: string | null;
  pontos_12m: number;
  gravissimas_12m: number;
  ativo: boolean;
  indicacoes: number;
  pontos_indicados: number;
  gravissimas_indicadas: number;
  placas: string[];
  situacao: SituacaoCondutor;
}

/** Condutores do cliente com os pontos dos últimos 12 meses (informados + multas indicadas e aceitas). */
export async function listarCondutores(db: Db, clienteId: string): Promise<CondutorComSituacao[]> {
  const hoje = hojeISO();
  const linhas = await db.q(
    `select c.*,
       (select count(*) from multas m where m.condutor_id = c.id) as indicacoes,
       coalesce((select sum(m.pontos) from multas m where m.condutor_id = c.id and m.indicacao_status in ('aceita','protocolada') and m.data_infracao >= $2), 0) as pontos_indicados,
       (select count(*) from multas m where m.condutor_id = c.id and m.indicacao_status in ('aceita','protocolada') and m.data_infracao >= $2 and m.gravidade = 'gravissima') as gravissimas_indicadas,
       coalesce((select array_agg(p.placa order by p.placa) from placas p where p.condutor_principal_id = c.id), '{}') as placas
     from condutores c where c.cliente_id = $1 order by c.ativo desc, c.nome`,
    [clienteId, somarDias(hoje, -365)],
  );
  return linhas.map((c: any) => ({
    ...c,
    indicacoes: Number(c.indicacoes),
    pontos_indicados: Number(c.pontos_indicados),
    gravissimas_indicadas: Number(c.gravissimas_indicadas),
    situacao: situacaoCondutor({
      pontosInformados: c.pontos_12m, gravissimasInformadas: c.gravissimas_12m,
      pontosIndicados: Number(c.pontos_indicados), gravissimasIndicadas: Number(c.gravissimas_indicadas),
      cnhValidade: c.cnh_validade, toxicologicoValidade: c.toxicologico_validade,
    }, hoje),
  }));
}
