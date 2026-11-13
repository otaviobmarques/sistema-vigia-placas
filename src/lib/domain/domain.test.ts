import { describe, expect, it } from "vitest";
import { aplicarFator, brl, percentual } from "./money";
import { diasEntre, somarDias } from "./dates";
import { gerarRenavam, validarCNPJ, validarCPF, validarPlaca, validarRenavam } from "./validators";
import { elegivel40, limitePontos, notificacaoForaDoPrazo, valoresMulta, type MultaRegra } from "./ctb";
import { acoesDaMulta, ordenarAcoes, recomendacao } from "./acoes";
import { calcularSaving, resumoCarrinho } from "./financeiro";
import { avisoDevido, consultasPorMes, custoPorConsulta, escolherFontes, intervaloDias, normalizarFrequencia, rotuloFrequencia } from "./monitoramento";

const base: MultaRegra = {
  valor: 13016,
  estado: "notificada",
  dataInfracao: "2026-10-21",
  notificadaEm: "2026-10-30",
  vencimento: "2026-11-12",
  sneAdesaoEm: "2026-01-10",
  orgaoAderenteSne: true,
  tipoProprietario: "PJ",
  condutorIndicado: false,
};

describe("dinheiro", () => {
  it("bate com os valores das telas desenhadas (média R$ 130,16)", () => {
    expect(aplicarFator(13016, 0.8)).toBe(10413); // R$ 104,13
    expect(aplicarFator(13016, 0.6)).toBe(7810); // R$ 78,10
    expect(brl(7810).replace(/\s/g, " ")).toBe("R$ 78,10");
    expect(percentual(300000, 2000)).toBe(60000); // 20% de R$ 3.000
  });
});

describe("datas", () => {
  it("conta dias corridos", () => {
    expect(somarDias("2026-10-30", 30)).toBe("2026-11-29");
    expect(diasEntre("2026-11-07", "2026-11-12")).toBe(5);
  });
});

describe("validações", () => {
  it("placa antiga e Mercosul", () => {
    expect(validarPlaca("abc-1234")).toMatchObject({ ok: true, padrao: "antigo" });
    expect(validarPlaca("ABC1D23")).toMatchObject({ ok: true, padrao: "mercosul" });
    expect(validarPlaca("AB1234")).toMatchObject({ ok: false, erro: "Placa incompleta" });
    expect(validarPlaca("1BC1D23").ok).toBe(false);
  });
  it("Renavam com dígito verificador", () => {
    const r = gerarRenavam("0123456789");
    expect(validarRenavam(r).ok).toBe(true);
    const errado = r.slice(0, 10) + ((Number(r[10]) + 1) % 10);
    expect(validarRenavam(errado).ok).toBe(false);
    expect(validarRenavam("9876543")).toMatchObject({ ok: false, erro: "Renavam com dígito verificador inválido" }); // completado com zeros, mas o dígito não confere
    expect(validarRenavam("")).toMatchObject({ ok: false, erro: "Informe o Renavam" });
  });
  it("CPF e CNPJ (inclusive alfanumérico)", () => {
    expect(validarCPF("529.982.247-25")).toBe(true);
    expect(validarCPF("111.111.111-11")).toBe(false);
    expect(validarCNPJ("11.222.333/0001-81")).toBe(true);
    expect(validarCNPJ("12.ABC.345/01DE-35")).toBe(true);
    expect(validarCNPJ("11.222.333/0001-80")).toBe(false);
  });
});

describe("CTB", () => {
  it("40% só com adesão ao SNE antes da infração e órgão aderente", () => {
    expect(elegivel40(base)).toBe(true);
    expect(elegivel40({ ...base, sneAdesaoEm: "2026-10-22" })).toBe(false);
    expect(elegivel40({ ...base, orgaoAderenteSne: false })).toBe(false);
  });
  it("NIC = 2x o valor", () => {
    expect(valoresMulta({ ...base, valor: 19523 }).nic).toBe(39046); // R$ 390,46 da tela
  });
  it("notificação fora do prazo (art. 281)", () => {
    expect(notificacaoForaDoPrazo("2026-09-01", "2026-10-05")).toBe(true);
    expect(notificacaoForaDoPrazo("2026-10-21", "2026-10-30")).toBe(false);
  });
  it("limite de pontos (art. 261)", () => {
    expect([limitePontos(0), limitePontos(1), limitePontos(3)]).toEqual([40, 30, 20]);
  });
});

describe("Faça hoje e recomendação", () => {
  it("PJ sem condutor: indicar vem antes de pagar", () => {
    const acoes = acoesDaMulta(base, "2026-11-07");
    expect(acoes.map((a) => a.tipo)).toEqual(["indicar", "pagar40"]);
    expect(recomendacao(base, "2026-11-07").opcao).toBe("indicar");
  });
  it("PF elegível: pagar com 40%", () => {
    const m = { ...base, tipoProprietario: "PF" as const };
    expect(acoesDaMulta(m, "2026-11-07")[0]).toMatchObject({ tipo: "pagar40", impacto: 13016 - 7810, dias: 5 });
    expect(recomendacao(m, "2026-11-07").opcao).toBe("pagar40");
  });
  it("ordena por prazo", () => {
    const a = acoesDaMulta({ ...base, tipoProprietario: "PF" }, "2026-11-07");
    const b = acoesDaMulta({ ...base, tipoProprietario: "PF", vencimento: "2026-11-09" }, "2026-11-07");
    expect(ordenarAcoes([...a, ...b])[0].dias).toBe(2);
  });
  it("multa paga não gera ação", () => {
    expect(acoesDaMulta({ ...base, estado: "paga" }, "2026-11-07")).toEqual([]);
  });
});

describe("financeiro", () => {
  it("carrinho da tela T06", () => {
    const r = resumoCarrinho(
      [
        { multaId: "1", valorCheio: 13016, aPagar: 7810 },
        { multaId: "2", valorCheio: 19523, aPagar: 15618 },
        { multaId: "3", valorCheio: 13016, aPagar: 10413 },
      ],
      { tipo: "fixa", valor: 490 },
      3000,
    );
    expect(r.multas).toBe(33841); // R$ 338,41
    expect(r.economia).toBe(11714); // R$ 117,14
    expect(r.total).toBe(33841 + 490);
    expect(r.splitFranqueado).toBe(147);
  });
  it("simulação 12.3: R$ 3.000 comprovados, 20% de saving, 30% ao franqueado", () => {
    const s = calcularSaving(
      [
        { tipo: "desconto", valor: 200000, comprovada: true },
        { tipo: "nic_evitada", valor: 100000, comprovada: true },
        { tipo: "desconto", valor: 50000, comprovada: false },
      ],
      2000,
      3000,
      null,
    );
    expect(s).toMatchObject({ baseComprovada: 300000, estimada: 50000, saving: 60000, parteFranqueado: 18000, parteFranqueadora: 42000 });
    expect(calcularSaving([{ tipo: "desconto", valor: 300000, comprovada: true }], 2000, 3000, 50000).saving).toBe(50000);
  });
});

describe("monitoramento", () => {
  it("adaptativa acelera em período de risco", () => {
    expect(intervaloDias("adaptativa", { ultimaMultaEm: null, proximoPrazo: null }, "2026-11-07")).toBe(7);
    expect(intervaloDias("adaptativa", { ultimaMultaEm: "2026-10-20", proximoPrazo: null }, "2026-11-07")).toBe(1);
  });
  it("avisos D-15, D-7, D-3, D-1 sem repetir", () => {
    const av = [15, 7, 3, 1];
    expect(avisoDevido("2026-11-20", "2026-11-07", av, [])).toBe(15);
    expect(avisoDevido("2026-11-14", "2026-11-07", av, [15])).toBe(7);
    expect(avisoDevido("2026-11-13", "2026-11-07", av, [15, 7])).toBeNull();
    expect(avisoDevido("2026-11-30", "2026-11-07", av, [])).toBeNull();
  });
});

import { consultarMultas } from "../integrations/infosimples";
describe("Infosimples simulado", () => {
  it("gera multas válidas para qualquer placa (sem índices negativos)", async () => {
    for (let i = 0; i < 300; i++) {
      const r = await consultarMultas(`TST${i}A${String(i % 100).padStart(2, "0")}`.slice(0, 7), "01234567897", i % 2 ? "MG" : "SP");
      expect(r.ok).toBe(true);
      for (const m of r.multas) expect(m.orgaoId).toBeTruthy();
    }
  });
});

import { simularIndicacao, situacaoCondutor, exigeToxicologico } from "./condutores";
describe("condutores (M13)", () => {
  const base = { pontosInformados: 0, gravissimasInformadas: 0, pontosIndicados: 0, gravissimasIndicadas: 0, cnhValidade: "2027-06-01", toxicologicoValidade: null };
  it("soma pontos informados e indicados e aplica o limite do art. 261", () => {
    const s = situacaoCondutor({ ...base, pontosInformados: 10, pontosIndicados: 14, gravissimasIndicadas: 2 }, "2026-11-07");
    expect(s).toMatchObject({ pontos: 24, gravissimas: 2, limite: 20, nivel: "suspensao" });
  });
  it("sem gravíssimas o limite é 40", () => {
    expect(situacaoCondutor({ ...base, pontosIndicados: 21 }, "2026-11-07")).toMatchObject({ limite: 40, nivel: "atencao" });
  });
  it("avisa antes de indicar se a multa leva ao limite", () => {
    const s = situacaoCondutor({ ...base, pontosInformados: 25, gravissimasInformadas: 1 }, "2026-11-07");
    expect(simularIndicacao(s, 7, true)).toMatchObject({ pontos: 32, limite: 20, atingeLimite: true });
    expect(simularIndicacao(situacaoCondutor(base, "2026-11-07"), 4, false).atingeLimite).toBe(false);
  });
  it("CNH vencida derruba a nota", () => {
    const ok = situacaoCondutor(base, "2026-11-07").nota;
    const vencida = situacaoCondutor({ ...base, cnhValidade: "2026-10-01" }, "2026-11-07").nota;
    expect(ok).toBe(100);
    expect(vencida).toBe(80);
  });
  it("toxicológico só para categorias C, D e E", () => {
    expect([exigeToxicologico("B"), exigeToxicologico("D"), exigeToxicologico("AE")]).toEqual([false, true, true]);
  });
});

describe("regra de consulta", () => {
  it("frequência em dias, adaptativa e valores antigos", () => {
    expect([normalizarFrequencia("semanal"), normalizarFrequencia("20"), normalizarFrequencia("99"), normalizarFrequencia("adaptativa")]).toEqual(["7", "20", "adaptativa", "adaptativa"]);
    expect(intervaloDias("20", { ultimaMultaEm: null, proximoPrazo: null }, "2026-11-07")).toBe(20);
    expect(rotuloFrequencia("20")).toBe("A cada 20 dias");
    expect(rotuloFrequencia("quinzenal")).toBe("Quinzenal");
    expect(consultasPorMes("15")).toBe(2);
  });
  const base = { principal: "directdata" as const, disponiveis: ["directdata", "infosimples"] as ("directdata" | "infosimples")[], infosimplesCobreUf: true, ultimaFonte: null };
  it("principal com reserva: uma fonte só", () => {
    expect(escolherFontes({ ...base, estrategia: "principal_reserva" })).toEqual({ primeiras: ["directdata"], reserva: "infosimples" });
  });
  it("por estado: Infosimples onde tem Detran sem login, Direct Data no resto", () => {
    expect(escolherFontes({ ...base, estrategia: "por_uf" }).primeiras).toEqual(["infosimples"]);
    expect(escolherFontes({ ...base, estrategia: "por_uf", infosimplesCobreUf: false }).primeiras).toEqual(["directdata"]);
  });
  it("alternar revezando a última", () => {
    expect(escolherFontes({ ...base, estrategia: "alternar", ultimaFonte: "directdata" }).primeiras).toEqual(["infosimples"]);
    expect(escolherFontes({ ...base, estrategia: "alternar", ultimaFonte: "infosimples" }).primeiras).toEqual(["directdata"]);
  });
  it("fonte indisponível cai para a outra, sem reserva", () => {
    expect(escolherFontes({ ...base, estrategia: "principal_reserva", disponiveis: ["infosimples"] })).toEqual({ primeiras: ["infosimples"], reserva: null });
  });
  it("custo: só as as duas fontes juntas somam", () => {
    const custos = { directdata: 36, infosimples: 52 };
    expect(custoPorConsulta(escolherFontes({ ...base, estrategia: "principal_reserva" }), custos)).toBe(36);
    expect(custoPorConsulta(escolherFontes({ ...base, estrategia: "ambas" }), custos)).toBe(88);
  });
});

describe("pode dirigir", () => {
  const sit = (o: Partial<Parameters<typeof situacaoCondutor>[0]> = {}) =>
    situacaoCondutor({ pontosInformados: 0, gravissimasInformadas: 0, pontosIndicados: 0, gravissimasIndicadas: 0, cnhValidade: "2027-01-01", toxicologicoValidade: null, ...o }, "2026-11-07");
  it("libera quem está em dia e barra CNH vencida, limite de pontos e impedimento", async () => {
    const { podeDirigir } = await import("./condutores");
    expect(podeDirigir({ ativo: true }, sit()).pode).toBe(true);
    expect(podeDirigir({ ativo: true }, sit({ cnhValidade: "2026-10-01" }))).toMatchObject({ pode: false, motivos: ["CNH vencida"] });
    expect(podeDirigir({ ativo: true }, sit({ pontosInformados: 40 })).pode).toBe(false);
    expect(podeDirigir({ ativo: true, impedido: true, motivo_impedimento: "CNH suspensa" }, sit()).motivos).toContain("impedido: CNH suspensa");
    expect(podeDirigir({ ativo: true }, sit({ cnhValidade: null }))).toMatchObject({ pode: true, motivos: ["validade da CNH não informada"] });
    expect(podeDirigir({ ativo: true, cnh_categoria: "E" }, sit({ toxicologicoValidade: "2026-11-01" })).motivos).toContain("exame toxicológico vencido");
    expect(podeDirigir({ ativo: true, cnh_categoria: "B" }, sit({ toxicologicoValidade: "2026-11-01" })).pode).toBe(true);
  });
});

describe("zeros à esquerda que faltam", async () => {
  const { validarRenavam } = await import("./validators");
  it("Renavam com 9 ou 10 dígitos é completado com zeros", () => {
    expect(validarRenavam("1232276623")).toEqual({ ok: true, renavam: "01232276623" });
    expect(validarRenavam("157218287")).toEqual({ ok: true, renavam: "00157218287" });
  });
  it("Renavam completado ainda passa pelo dígito verificador", () => {
    expect(validarRenavam("1232276624").ok).toBe(false);
  });
});

describe("selo de desconto (20% / 40%)", async () => {
  const { seloDesconto } = await import("./ctb");
  const base = { valor: 19523, estado: "notificada" as const, dataInfracao: "2026-10-10", notificadaEm: "2026-10-20", vencimento: "2026-11-30", sneAdesaoEm: null, orgaoAderenteSne: true, tipoProprietario: "PJ" as const, condutorIndicado: false };
  it("todos têm 20% até o vencimento", () => {
    const s = seloDesconto(base, "2026-11-13");
    expect(s.faixa).toBe("20");
    expect(s.texto).toMatch(/não está registrado no SNE/);
  });
  it("40% só com SNE antes da infração e órgão aderente", () => {
    expect(seloDesconto({ ...base, sneAdesaoEm: "1900-01-01" }, "2026-11-13").faixa).toBe("40");
    expect(seloDesconto({ ...base, sneAdesaoEm: "2026-11-01" }, "2026-11-13").texto).toMatch(/depois da infração/);
    expect(seloDesconto({ ...base, sneAdesaoEm: "1900-01-01", orgaoAderenteSne: false }, "2026-11-13").faixa).toBe("20");
    expect(seloDesconto({ ...base, sneAdesaoEm: "1900-01-01", estado: "em_defesa" }, "2026-11-13").faixa).toBe("20");
  });
  it("depois do vencimento, sem desconto", () => {
    expect(seloDesconto({ ...base, sneAdesaoEm: "1900-01-01" }, "2026-12-01").faixa).toBeNull();
  });
});
