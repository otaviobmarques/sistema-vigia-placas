import { describe, expect, it } from "vitest";
import { cifrar, decifrar } from "./cofre";

describe("cofre de credenciais", () => {
  it("cifra e decifra; o texto cifrado não contém a senha e muda a cada vez", () => {
    const a = cifrar("Senha#Sifama123"), b = cifrar("Senha#Sifama123");
    expect(a).not.toContain("Senha");
    expect(a).not.toBe(b);
    expect(decifrar(a)).toBe("Senha#Sifama123");
  });
  it("texto adulterado ou vazio não decifra", () => {
    const a = cifrar("x");
    expect(decifrar(a.slice(0, -2) + "AA")).toBeNull();
    expect(decifrar(null)).toBeNull();
    expect(decifrar("lixo")).toBeNull();
  });
});
