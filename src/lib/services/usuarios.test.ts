import { describe, expect, it } from "vitest";
import { niveisPermitidos, normalizarLogin, validarSenha } from "./usuarios";

describe("usuários", () => {
  it("aceita e-mail ou usuário simples, sem diferenciar maiúsculas", () => {
    expect(normalizarLogin("Admin")).toBe("admin");
    expect(normalizarLogin(" Carla@Empresa.com.br ")).toBe("carla@empresa.com.br");
    expect(normalizarLogin("ab")).toBeNull();
    expect(normalizarLogin("com espaço")).toBeNull();
  });
  it("senha mínima de 10 caracteres", () => {
    expect(validarSenha("curta")).not.toBeNull();
    expect(validarSenha("suficiente10")).toBeNull();
  });
  it("ninguém cria acesso acima do próprio nível", () => {
    expect(niveisPermitidos("franqueado")).not.toContain("franqueadora");
    expect(niveisPermitidos("cliente")).toEqual(["cliente"]);
    expect(niveisPermitidos("franqueadora")).toContain("franqueadora");
  });
});
