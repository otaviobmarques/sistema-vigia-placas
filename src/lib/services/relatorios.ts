/** M14 · Relatórios e centros de custo: agregações por período, com rateio conforme a configuração do cliente. */
import * as XLSX from "xlsx";
import type { Db } from "../db";
import { GRAVIDADES, ESTADOS, type EstadoMulta, type Gravidade } from "../domain/ctb";

export interface Linha { chave: string; detalhe?: string | null; multas: number; valor: number; pago: number; pontos: number }
export interface Relatorio {
  de: string;
  ate: string;
  rateio: "nenhum" | "placa" | "condutor";
  totais: { multas: number; valor: number; pago: number; economia: number; pontos: number; abertas: number };
  porInfracao: Linha[];
  porPlaca: Linha[];
  porCondutor: Linha[];
  porCentroCusto: Linha[];
  porOrgao: Linha[];
  porHorario: Linha[];
  porMes: Linha[];
  multas: Array<Record<string, string | number | null>>;
}

const FAIXAS = [
  { de: 0, ate: 6, rotulo: "Madrugada (00h–06h)" },
  { de: 6, ate: 12, rotulo: "Manhã (06h–12h)" },
  { de: 12, ate: 18, rotulo: "Tarde (12h–18h)" },
  { de: 18, ate: 24, rotulo: "Noite (18h–24h)" },
];

export async function gerarRelatorio(db: Db, clienteId: string, de: string, ate: string): Promise<Relatorio> {
  const cli = await db.one("select rateio from clientes where id = $1", [clienteId]);
  const multas = await db.q(
    `select m.id, m.auto_infracao, m.descricao, m.gravidade, m.pontos, m.valor, m.data_infracao, m.hora, m.local, m.estado,
            p.placa, p.apelido, p.centro_custo, p.grupo, o.nome as orgao, cd.nome as condutor, cp.nome as condutor_principal,
            coalesce(
              (select pi.a_pagar from pagamento_itens pi where pi.multa_id = m.id and pi.boleto_status = 'pago' limit 1),
              -- Paga fora do Pix único: valor cheio menos o desconto comprovado.
              case when m.estado = 'paga' then m.valor - coalesce((select e.valor from economias e where e.multa_id = m.id and e.tipo = 'desconto' and e.comprovada), 0) end
            ) as pago,
            (select coalesce(sum(e.valor),0) from economias e where e.multa_id = m.id and e.comprovada) as economia
     from multas m join placas p on p.id = m.placa_id join orgaos o on o.id = m.orgao_id
     left join condutores cd on cd.id = m.condutor_id left join condutores cp on cp.id = p.condutor_principal_id
     where m.cliente_id = $1 and m.data_infracao between $2 and $3
     order by m.data_infracao desc`,
    [clienteId, de, ate],
  );

  const agrupar = (chave: (m: any) => string, detalhe?: (m: any) => string | null): Linha[] => {
    const mapa = new Map<string, Linha>();
    for (const m of multas) {
      const k = chave(m);
      const l = mapa.get(k) ?? { chave: k, detalhe: detalhe?.(m) ?? null, multas: 0, valor: 0, pago: 0, pontos: 0 };
      l.multas++; l.valor += m.valor; l.pago += m.pago ?? 0; l.pontos += m.pontos;
      mapa.set(k, l);
    }
    return [...mapa.values()].sort((a, b) => b.valor - a.valor || b.multas - a.multas);
  };
  const condutor = (m: any) => m.condutor ?? m.condutor_principal ?? "Não indicado";
  const faixa = (m: any) => {
    const h = Number(String(m.hora ?? "").slice(0, 2));
    return Number.isFinite(h) && m.hora ? FAIXAS.find((f) => h >= f.de && h < f.ate)!.rotulo : "Horário não informado";
  };

  return {
    de, ate,
    rateio: (cli?.rateio ?? "nenhum") as Relatorio["rateio"],
    totais: {
      multas: multas.length,
      valor: multas.reduce((a, m) => a + m.valor, 0),
      pago: multas.reduce((a, m) => a + (m.pago ?? 0), 0),
      economia: multas.reduce((a, m) => a + Number(m.economia), 0),
      pontos: multas.reduce((a, m) => a + m.pontos, 0),
      abertas: multas.filter((m) => ESTADOS[m.estado as EstadoMulta].aberta).length,
    },
    porInfracao: agrupar((m) => m.descricao, (m) => GRAVIDADES[m.gravidade as Gravidade].rotulo),
    porPlaca: agrupar((m) => m.placa, (m) => m.apelido),
    porCondutor: agrupar(condutor),
    // Rateio: por condutor usa quem dirigia; nos demais casos, o centro de custo da placa.
    porCentroCusto: cli?.rateio === "condutor" ? agrupar(condutor) : agrupar((m) => m.centro_custo ?? "Sem centro de custo"),
    porOrgao: agrupar((m) => m.orgao),
    porHorario: agrupar(faixa),
    porMes: agrupar((m) => String(m.data_infracao).slice(0, 7)).sort((a, b) => a.chave.localeCompare(b.chave)),
    multas: multas.map((m) => ({
      Data: m.data_infracao, Hora: m.hora, Placa: m.placa, Apelido: m.apelido, "Centro de custo": m.centro_custo, Grupo: m.grupo,
      Infração: m.descricao, Gravidade: GRAVIDADES[m.gravidade as Gravidade].rotulo, Pontos: m.pontos, Órgão: m.orgao, Local: m.local,
      "Auto de infração": m.auto_infracao, Condutor: condutor(m), Situação: ESTADOS[m.estado as EstadoMulta].rotulo,
      "Valor cheio (R$)": m.valor / 100, "Valor pago (R$)": m.pago === null ? null : m.pago / 100, "Economia comprovada (R$)": Number(m.economia) / 100,
    })),
  };
}

export function relatorioXlsx(r: Relatorio, nomeCliente: string): Buffer {
  const wb = XLSX.utils.book_new();
  const resumo = XLSX.utils.aoa_to_sheet([
    ["Vigia Placa · Relatório de infrações"], ["Cliente", nomeCliente], ["Período", `${r.de} a ${r.ate}`], [],
    ["Multas", r.totais.multas], ["Em aberto", r.totais.abertas], ["Valor cheio (R$)", r.totais.valor / 100],
    ["Valor pago (R$)", r.totais.pago / 100], ["Economia comprovada (R$)", r.totais.economia / 100], ["Pontos", r.totais.pontos],
  ]);
  resumo["!cols"] = [{ wch: 28 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, resumo, "Resumo");
  const aba = (nome: string, rotulo: string, linhas: Linha[]) => {
    const ws = XLSX.utils.json_to_sheet(linhas.map((l) => ({
      [rotulo]: l.chave, ...(l.detalhe !== null && l.detalhe !== undefined ? { Detalhe: l.detalhe } : {}),
      Multas: l.multas, "Valor cheio (R$)": l.valor / 100, "Valor pago (R$)": l.pago / 100, Pontos: l.pontos,
    })));
    ws["!cols"] = [{ wch: 40 }, { wch: 18 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, nome);
  };
  aba("Por infração", "Infração", r.porInfracao);
  aba("Por placa", "Placa", r.porPlaca);
  aba("Por condutor", "Condutor", r.porCondutor);
  aba("Rateio", r.rateio === "condutor" ? "Condutor" : "Centro de custo", r.porCentroCusto);
  aba("Por órgão", "Órgão", r.porOrgao);
  aba("Por horário", "Faixa", r.porHorario);
  aba("Por mês", "Mês", r.porMes);
  const todas = XLSX.utils.json_to_sheet(r.multas);
  XLSX.utils.book_append_sheet(wb, todas, "Multas");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
