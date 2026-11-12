import { describe, expect, it } from "vitest";
import { diagnostico } from "./reprocessamento";

describe("diagnóstico do erro de consulta", () => {
  it("falha genérica e timeout das fontes são instabilidade", () => {
    expect(diagnostico([{ fonte: "directdata", erro: "Falha Ao Realizar Consulta: Falha Ao Realizar Consulta" }, { fonte: "infosimples:prf/infracoes", erro: "605 A consulta não foi realizada dentro do tempo de limite de timeout especificado." }], "erro").tipo).toBe("fonte");
  });
  it("Renavam que não confere é erro de cadastro", () => {
    expect(diagnostico([{ fonte: "infosimples:detran/sp", erro: "607 Renavam não confere com a placa informada" }], "erro").tipo).toBe("cadastro");
  });
  it("placa que nunca rodou pede reprocessamento; na fila só espera", () => {
    expect(diagnostico(null, "parada").tipo).toBe("sem_consulta");
    expect(diagnostico(null, "na_fila").tipo).toBe("fila");
  });
});
