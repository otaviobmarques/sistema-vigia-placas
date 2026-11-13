import { describe, expect, it } from "vitest";
import { fracaoMensal, periodoDe, periodosDoMes, vencimentoDe } from "./ciclo";

describe("ciclo de fechamento", () => {
  it("períodos por ciclo", () => {
    expect(periodoDe("diario", "2026-11-07")).toEqual({ inicio: "2026-11-07", fim: "2026-11-07" });
    expect(periodoDe("semanal", "2026-11-07")).toEqual({ inicio: "2026-11-02", fim: "2026-11-08" }); // sáb → seg a dom
    expect(periodoDe("semanal", "2026-11-02")).toEqual({ inicio: "2026-11-02", fim: "2026-11-08" });
    expect(periodoDe("quinzenal", "2026-02-20")).toEqual({ inicio: "2026-02-16", fim: "2026-02-28" });
    expect(periodoDe("mensal", "2026-11-07")).toEqual({ inicio: "2026-11-01", fim: "2026-11-30" });
  });
  it("a mensalidade de um mês inteiro soma 1, em qualquer ciclo", () => {
    for (const c of ["diario", "quinzenal", "mensal"] as const) {
      const soma = periodosDoMes(c, "2026-11").reduce((a, p) => a + fracaoMensal(p), 0);
      expect(soma).toBeCloseTo(1, 10);
    }
    expect(fracaoMensal({ inicio: "2026-11-02", fim: "2026-11-08" })).toBeCloseTo(7 / 30, 10);
  });
  it("semanas que terminam no mês e vencimento", () => {
    expect(periodosDoMes("semanal", "2026-11").map((p) => p.fim)).toEqual(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
    expect(periodosDoMes("quinzenal", "2026-11")).toHaveLength(2);
    expect(vencimentoDe({ inicio: "2026-11-01", fim: "2026-11-30" }, 5)).toBe("2026-12-05");
  });
});

describe("cobrança sempre cheia (independe do dia do cadastro)", async () => {
  const { fracaoCobrada } = await import("./ciclo");
  const nov = { inicio: "2026-11-01", fim: "2026-11-30" };
  it("mensal: placa cadastrada no meio do mês paga o mês cheio", () => {
    expect(fracaoCobrada("mensal", nov, "2026-11-12")).toBeCloseTo(1, 10);
    expect(fracaoCobrada("mensal", nov, "2026-11-30")).toBeCloseTo(1, 10);
  });
  it("não paga período anterior ao cadastro nem placa cadastrada depois", () => {
    expect(fracaoCobrada("mensal", { inicio: "2026-10-01", fim: "2026-10-31" }, "2026-11-12")).toBe(0);
    // Relatório de vários meses: conta do mês do cadastro em diante (nov + dez = 2 meses)
    expect(fracaoCobrada("mensal", { inicio: "2026-01-01", fim: "2026-12-31" }, "2026-11-12")).toBeCloseTo(2, 10);
  });
  it("ciclos curtos cobram o período cheio em que a placa entrou", () => {
    expect(fracaoCobrada("semanal", { inicio: "2026-11-09", fim: "2026-11-15" }, "2026-11-14")).toBeCloseTo(7 / 30, 10);
    expect(fracaoCobrada("quinzenal", { inicio: "2026-11-01", fim: "2026-11-15" }, "2026-11-12")).toBeCloseTo(15 / 30, 10);
  });
});
