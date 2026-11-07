import { describe, expect, it } from "vitest";
import { aplicarFator, brl, percentual } from "./money";
import { diasEntre, somarDias } from "./dates";
import { gerarRenavam, validarCNPJ, validarCPF, validarPlaca, validarRenavam } from "./validators";
import { elegivel40, limitePontos, notificacaoForaDoPrazo, valoresMulta, type MultaRegra } from "./ctb";
import { acoesDaMulta, ordenarAcoes, recomendacao } from "./acoes";
import { calcularSaving, resumoCarrinho } from "./financeiro";
import { avisoDevido, intervaloDias } from "./monitoramento";

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
    expect(validarRenavam("9876543")).toMatchObject({ ok: false, erro: "Renavam com dígitos faltando" });
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
