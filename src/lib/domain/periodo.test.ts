import { describe, expect, it } from "vitest";
import { lerPeriodo, resolverPeriodo, textoPeriodo } from "./periodo";

const q = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

describe("período dos relatórios", () => {
  const hoje = "2026-11-12";
  it("hoje, quinzena, mês, trimestre e ano", () => {
    expect(resolverPeriodo("hoje", hoje)).toEqual({ inicio: hoje, fim: hoje });
    expect(resolverPeriodo("quinzena", hoje)).toEqual({ inicio: "2026-11-01", fim: "2026-11-15" });
    expect(resolverPeriodo("quinzena", "2026-02-20")).toEqual({ inicio: "2026-02-16", fim: "2026-02-28" });
    expect(resolverPeriodo("mes", hoje)).toEqual({ inicio: "2026-11-01", fim: "2026-11-30" });
    expect(resolverPeriodo("trimestre", hoje)).toEqual({ inicio: "2026-10-01", fim: "2026-12-31" });
    expect(resolverPeriodo("trimestre", "2026-02-03")).toEqual({ inicio: "2026-01-01", fim: "2026-03-31" });
    expect(resolverPeriodo("ano", hoje)).toEqual({ inicio: "2026-01-01", fim: "2026-12-31" });
    expect(resolverPeriodo("tudo", hoje)).toBeNull();
  });
  it("personalizado aceita de/até, inverte se vier trocado e ignora data inválida", () => {
    expect(resolverPeriodo("personalizado", hoje, { de: "2026-09-10", ate: "2026-10-05" })).toEqual({ inicio: "2026-09-10", fim: "2026-10-05" });
    expect(resolverPeriodo("personalizado", hoje, { de: "2026-10-05", ate: "2026-09-10" })).toEqual({ inicio: "2026-09-10", fim: "2026-10-05" });
    expect(resolverPeriodo("personalizado", hoje, { de: "lixo" })).toEqual({ inicio: "2026-11-01", fim: "2026-11-30" });
  });
  it("lê da URL com o padrão do relatório; faturamento não aceita 'tudo'", () => {
    expect(lerPeriodo(q({}), "ano", hoje).tipo).toBe("ano");
    expect(lerPeriodo(q({ mes: "2026-09" }), "tudo", hoje).periodo).toEqual({ inicio: "2026-09-01", fim: "2026-09-30" });
    expect(lerPeriodo(q({ periodo: "tudo" }), "mes", hoje, false).tipo).toBe("mes");
    expect(textoPeriodo({ inicio: "2026-11-01", fim: "2026-11-15" })).toBe("01/11/2026 a 15/11/2026");
  });
});
