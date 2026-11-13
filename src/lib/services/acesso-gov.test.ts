import { describe, expect, it, vi } from "vitest";
vi.mock("../cofre", () => ({ decifrar: (x: string | null) => (x ? `senha:${x}` : null) }));
import { escolherAcesso, procuracaoValida } from "./acesso-gov";

const base = { documento: "11222333000181", procuracao_gov: false, procuracao_validade: null, gov_login: null, gov_senha_cifrada: null, antt_login: null, antt_senha_cifrada: null, antt_cnpj_representado: null };
const procurador = { cpf: "52998224725", senha: "proc" };

describe("acesso gov.br: procuração → gov.br do cliente → SIFAMA", () => {
  it("procuração válida vem primeiro, com o CNPJ do cliente como representado", () => {
    const a = escolherAcesso({ ...base, procuracao_gov: true, procuracao_validade: "2027-01-01", gov_login: "11144477735", gov_senha_cifrada: "x" }, procurador, { hoje: "2026-11-13" });
    expect(a).toMatchObject({ ok: true, via: "procuracao", login: "52998224725", representado: "11222333000181" });
  });
  it("procuração vencida cai para o gov.br do cliente", () => {
    const a = escolherAcesso({ ...base, procuracao_gov: true, procuracao_validade: "2026-10-01", gov_login: "11144477735", gov_senha_cifrada: "x" }, procurador, { hoje: "2026-11-13" });
    expect(a).toMatchObject({ ok: true, via: "gov", login: "11144477735", senha: "senha:x" });
  });
  it("sem procurador configurado também cai para o gov.br do cliente", () => {
    const a = escolherAcesso({ ...base, procuracao_gov: true, gov_login: "11144477735", gov_senha_cifrada: "x" }, { cpf: null, senha: null });
    expect(a).toMatchObject({ ok: true, via: "gov" });
  });
  it("login do SIFAMA só vale para a ANTT", () => {
    const c = { ...base, antt_login: "11222333000181", antt_senha_cifrada: "s" };
    expect(escolherAcesso(c, procurador).ok).toBe(false);
    expect(escolherAcesso(c, procurador, { sifama: true })).toMatchObject({ ok: true, via: "sifama" });
  });
  it("explica por que não há acesso", () => {
    const a = escolherAcesso({ ...base, procuracao_gov: true, procuracao_validade: "2026-01-31" }, procurador, { hoje: "2026-11-13" });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.erro).toContain("vencida em 31/01/2026");
  });
  it("procuração sem validade informada continua valendo", () => {
    expect(procuracaoValida({ procuracao_gov: true, procuracao_validade: null })).toBe(true);
    expect(procuracaoValida({ procuracao_gov: false, procuracao_validade: null })).toBe(false);
  });
});
