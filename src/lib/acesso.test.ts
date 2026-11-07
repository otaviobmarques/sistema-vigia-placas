import { describe, expect, it } from "vitest";
import { ehAdminSistema, niveisCriaveis, perfisAtribuiveis, rotuloPerfil } from "./acesso";

const admin = { nivel: "franqueadora", perfil: "admin" };
const gestor = { nivel: "franqueadora", perfil: "gestor" };

describe("perfis de acesso", () => {
  it("só o Administrador do Sistema cria a equipe Vigia Placa", () => {
    expect(niveisCriaveis(admin)).toContain("franqueadora");
    expect(perfisAtribuiveis(admin, "franqueadora")).toEqual(["admin", "gestor"]);
    expect(niveisCriaveis(gestor)).not.toContain("franqueadora");
    expect(perfisAtribuiveis(gestor, "franqueadora")).toEqual([]);
  });
  it("o Gestor cria só acessos de cliente (Responsável ou Visualizador)", () => {
    expect(niveisCriaveis(gestor)).toEqual(["cliente"]);
    expect(perfisAtribuiveis(gestor, "cliente")).toEqual(["admin", "leitura"]);
  });
  it("rótulos", () => {
    expect(ehAdminSistema(gestor)).toBe(false);
    expect(rotuloPerfil("franqueadora", "admin")).toBe("Administrador do Sistema");
    expect(rotuloPerfil("cliente", "admin")).toBe("Responsável");
    expect(rotuloPerfil("cliente", "leitura")).toBe("Visualizador");
  });
});
