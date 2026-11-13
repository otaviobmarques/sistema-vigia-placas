/**
 * Relatório Gerencial do Cliente: o que o Vigia Placa fez por ele no período.
 * Frota (veículos e tipos), multas de trânsito e da ANTT, quanto pagou pelo serviço,
 * quanto economizou (20%, 40% SNE, NIC evitada, defesa) e o retorno sobre o investimento.
 */
import type { Db } from "../db";
import type { Periodo } from "../domain/ciclo";
import { GRAVIDADES, melhorValorHoje, type Gravidade } from "../domain/ctb";
import { hojeISO } from "../domain/dates";
import { calcularFatura } from "./faturamento";
import { regra, SELECT_MULTA, type MultaRow } from "./multas";

/** Tipo do veículo pelo modelo/apelido (o cadastro não guarda o tipo). */
export function tipoVeiculo(texto: string | null | undefined): string {
  const t = (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!t.trim()) return "Não informado";
  if (/caminh|truck|carreta|cavalo|bitrem|rodotrem|scania|volvo fh|actros|axor|atego|accelo|constellation|delivery|cargo|tector|daily|hr\b|vuc|toco|trucad/.test(t)) return "Caminhão";
  if (/moto|cg ?1|fan|titan|biz|pop ?1|factor|fazer|xre|bros|nmax|pcx/.test(t)) return "Moto";
  if (/van|sprinter|master|ducato|boxer|jumper|kombi|furgao|fiorino|kangoo|doblo|partner|expert|utilit|strada|saveiro|montana|toro|hilux|s10|ranger|amarok|frontier|l200|picape|pickup/.test(t)) return "Van / utilitário";
  if (/onibus|micro|bus/.test(t)) return "Ônibus";
  return "Carro";
}

export type RelatorioGerencial = Awaited<ReturnType<typeof gerarRelatorioGerencial>>;

export async function gerarRelatorioGerencial(db: Db, clienteId: string, p: Periodo) {
  const hoje = hojeISO();
  const cliente = await db.one<{ id: string; nome: string; documento: string; tipo: string; criado_em: string; plano: string; sne_cadastrado: boolean; antt_ativo: boolean; grupo: string | null }>(
    `select c.id, c.nome, c.documento, c.tipo, c.criado_em, pl.nome as plano, c.sne_cadastrado, c.antt_ativo,
            (select g.nome from grupos_economicos g where g.id = c.grupo_id) as grupo
       from clientes c join planos pl on pl.id = c.plano_id where c.id = $1`,
    [clienteId],
  );
  if (!cliente) throw new Error("Cliente não encontrado");

  // Frota
  const placas = await db.q<{ placa: string; apelido: string | null; modelo: string | null; status: string; sne_adesao_em: string | null }>(
    "select placa, apelido, modelo, status, sne_adesao_em from placas where cliente_id = $1 and status <> 'pausada' order by placa",
    [clienteId],
  );
  const porTipo = new Map<string, number>();
  for (const v of placas) {
    const tipo = tipoVeiculo(`${v.modelo ?? ""} ${v.apelido ?? ""}`);
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
  }

  // Multas de trânsito com infração no período
  const multas = await db.q<MultaRow>(`${SELECT_MULTA} where m.cliente_id = $1 and m.data_infracao between $2 and $3 order by m.data_infracao`, [clienteId, p.inicio, p.fim]);
  const porGravidade = (Object.keys(GRAVIDADES) as Gravidade[]).map((g) => ({ gravidade: g, rotulo: GRAVIDADES[g].rotulo, qtd: multas.filter((m) => m.gravidade === g).length }));
  const somaPor = (chave: (m: MultaRow) => string) => {
    const mapa = new Map<string, { qtd: number; valor: number }>();
    for (const m of multas) {
      const k = chave(m);
      const x = mapa.get(k) ?? { qtd: 0, valor: 0 };
      x.qtd++; x.valor += Number(m.valor);
      mapa.set(k, x);
    }
    return [...mapa.entries()].map(([k, v]) => ({ chave: k, ...v })).sort((a, b) => b.qtd - a.qtd || b.valor - a.valor);
  };
  const porMes = somaPor((m) => m.data_infracao.slice(0, 7)).sort((a, b) => a.chave.localeCompare(b.chave));
  const porOrgao = somaPor((m) => m.orgao_nome).slice(0, 6);
  const porPlaca = somaPor((m) => m.placa).slice(0, 5);
  const valorMultas = multas.reduce((a, m) => a + Number(m.valor), 0);
  const pontos = multas.reduce((a, m) => a + Number(m.pontos), 0);

  // ANTT (multas no CNPJ)
  const antt = await db.q<{ valor: number; impeditiva: boolean | null; aberta: boolean }>(
    "select valor, impeditiva, aberta from multas_antt where cliente_id = $1 and coalesce(data_infracao, detectada_em) between $2 and $3",
    [clienteId, p.inicio, p.fim],
  );

  // Economia comprovada registrada no período, separando desconto de 20% e de 40% pelo tamanho do abatimento.
  const econ = await db.q<{ tipo: string; valor: number; cheio: number }>(
    `select e.tipo, e.valor, m.valor as cheio from economias e join multas m on m.id = e.multa_id
      where e.cliente_id = $1 and e.comprovada and e.criado_em::date between $2 and $3`,
    [clienteId, p.inicio, p.fim],
  );
  const soma = (f: (e: (typeof econ)[number]) => boolean) => {
    const ls = econ.filter(f);
    return { qtd: ls.length, valor: ls.reduce((a, e) => a + Number(e.valor), 0) };
  };
  const desc40 = soma((e) => e.tipo === "desconto" && Number(e.valor) >= Number(e.cheio) * 0.3);
  const desc20 = soma((e) => e.tipo === "desconto" && Number(e.valor) < Number(e.cheio) * 0.3);
  const nic = soma((e) => e.tipo === "nic_evitada");
  const defesa = soma((e) => e.tipo === "cancelamento");
  const economiaTotal = desc40.valor + desc20.valor + nic.valor + defesa.valor;

  // Quanto pagou pelo Vigia Placa no período (mensalidades proporcionais + saving + defesas + conveniência).
  const f = await calcularFatura(db, clienteId, p);
  const investimento = { mensalidades: f.mensalidades, saving: f.saving, defesa: f.defesa, conveniencia: f.conveniencia, total: f.total + f.conveniencia };

  // Oportunidade agora: multas em aberto que ainda têm desconto.
  const abertas = await db.q<MultaRow>(`${SELECT_MULTA} where m.cliente_id = $1 and m.estado not in ('paga','cancelada')`, [clienteId]);
  let oportunidade = 0, comDesconto = 0;
  for (const m of abertas) {
    const melhor = melhorValorHoje(regra(m), hoje);
    if (melhor.desconto) { comDesconto++; oportunidade += Number(m.valor) - melhor.valor; }
  }

  return {
    cliente, periodo: p, geradoEm: hoje,
    frota: { total: placas.length, porTipo: [...porTipo.entries()].map(([tipo, qtd]) => ({ tipo, qtd })).sort((a, b) => b.qtd - a.qtd), comSne: placas.filter((v) => v.sne_adesao_em).length },
    multas: { qtd: multas.length, valor: valorMultas, pontos, porGravidade, porMes, porOrgao, porPlaca, condutorIndicado: multas.filter((m) => m.condutor_id).length },
    antt: { qtd: antt.length, valor: antt.reduce((a, x) => a + Number(x.valor), 0), impeditivas: antt.filter((x) => x.impeditiva).length, abertas: antt.filter((x) => x.aberta).length },
    economia: { desc40, desc20, nic, defesa, total: economiaTotal },
    investimento,
    retorno: investimento.total > 0 ? economiaTotal / investimento.total : null,
    oportunidade: { valor: oportunidade, multas: comDesconto },
  };
}
