import { describe, expect, it } from "vitest";
import { anttEncerrada, interpretarAntt, parametrosAntt } from "./antt";

describe("ANTT / SIFAMA", () => {
  it("login CNPJ ou CPF vira o parâmetro certo; representado só com dígitos", () => {
    expect(parametrosAntt("12.345.678/0001-95", "s3nha", "39.908.361/0001-76")).toEqual({ login_cnpj: "12345678000195", login_senha: "s3nha", cnpj_representado: "39908361000176" });
    expect(parametrosAntt("529.982.247-25", "s3nha", null)).toEqual({ login_cpf: "52998224725", login_senha: "s3nha" });
  });

  it("lê totais por representado e as infrações (soltas ou agrupadas por tipo)", () => {
    const r = interpretarAntt({
      code: 200, header: { price: "0.20" },
      data: [{
        cnpj_representados: [{
          cnpj_representado: "39.908.361/0001-76", qtd_multas_impeditivas: "1", normalizado_multas_impeditivas_reais: 5000,
          qtd_multas_nao_impeditivas: "1", multas_nao_impeditivas_reais: "R$ 550,00", normalizado_total_debito_reais: 5550,
          infracoes: [
            { tipo: "Multas impeditivas", lista: [{ nr_doc: "AI-001", data_ocorrencia: "02/10/2026", valor: "5.000,00", situacao: "Aguardando pagamento", descricao: "Sem RNTRC", placa: "abc-1d23" }] },
            { nr_doc: "AI-002", data_ocorrencia: "15/08/2026", valor: "550,00", situacao: "Não impeditiva - em cobrança", vencimento: "08/11/2026" },
            { nr_doc: "AI-003", valor: "100,00", situacao: "Paga" },
          ],
        }],
      }],
    });
    expect(r.ok).toBe(true);
    expect(r.custo).toBe(20);
    expect(r.resumo).toEqual({ impeditivas: { qtd: 1, valor: 500000 }, naoImpeditivas: { qtd: 1, valor: 55000 }, suspensaoJudicial: { qtd: 0, valor: 0 }, debitoTotal: 555000 });
    const a = r.multas.find((m) => m.auto === "AI-001")!;
    expect(a).toMatchObject({ valor: 500000, impeditiva: true, placa: "ABC1D23", dataInfracao: "2026-10-02", orgao: "ANTT" });
    expect(r.multas.find((m) => m.auto === "AI-002")).toMatchObject({ impeditiva: false, vencimento: "2026-11-08" });
    expect(anttEncerrada(r.multas.find((m) => m.auto === "AI-003")!)).toBe(true);
    expect(anttEncerrada(a)).toBe(false);
  });

  it("senha errada é marcada como problema de acesso; 612 é 'nada encontrado'", () => {
    const e = interpretarAntt({ code: 600, code_message: "Login ou senha inválidos no SIFAMA" });
    expect(e.ok).toBe(false);
    expect(e.contaInvalida).toBe(true);
    expect(interpretarAntt({ code: 612 }).ok).toBe(true);
  });
});
