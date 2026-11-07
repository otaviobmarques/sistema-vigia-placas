import { describe, expect, it } from "vitest";
import { erroDeConta, FONTES, fontesParaUf, interpretarResposta, montarParametros, reaisParaCentavos, dataParaISO } from "./infosimples";

const fonte = (s: string) => FONTES.find((f) => f.servico === s)!;

describe("Infosimples · roteamento", () => {
  it("toda placa consulta a PRF e a fonte do seu estado", () => {
    expect(fontesParaUf("MG").map((f) => f.servico)).toEqual(["prf/infracoes", "detran/mg/multas-extrato"]);
    expect(fontesParaUf("sp").map((f) => f.servico)).toEqual(["prf/infracoes"]);
  });
  it("Detran-RJ usa o CPF/CNPJ do dono", () => {
    expect(montarParametros(fonte("detran/rj/multas-guias"), { placa: "ABC1D23", renavam: "01234567897", documento: "11222333000181" })).toEqual({ renavam: "01234567897", cnpj: "11222333000181" });
    expect(montarParametros(fonte("prf/infracoes"), { placa: "ABC1D23", renavam: "01234567897" })).toEqual({ placa: "ABC1D23", renavam: "01234567897" });
  });
});

describe("Infosimples · respostas", () => {
  it("PRF: lista aninhada em data[0].infracoes", () => {
    const r = interpretarResposta(fonte("prf/infracoes"), {
      code: 200, header: { price: "0.24" },
      data: [{ codigo_controle: "x", infracoes: [
        { ait: "S012345678", codigo: "745-50", descricao: "Transitar em velocidade superior à máxima permitida em até 20%", datahora: "03/10/2026 14:22", local: "BR-381 KM 450", pontos: "4", valor: "R$ 130,16", boleto_vencimento: "20/11/2026", boleto_codigo_barras: "85890000001-3 30160...", status: "Em aberto" },
        { ait: "S000000001", descricao: "Paga", datahora: "01/01/2026", valor: "88,38", status: "Paga" },
      ] }],
    });
    expect(r).toMatchObject({ ok: true, codigo: 200, custo: 24 });
    expect(r.multas).toHaveLength(1);
    expect(r.multas[0]).toMatchObject({
      orgaoId: "PRF", autoInfracao: "S012345678", codigoInfracao: "74550", gravidade: "media", pontos: 4, valor: 13016,
      dataInfracao: "2026-10-03", hora: "14:22", vencimento: "2026-11-20",
    });
  });
  it("Detran-MG: uma multa por item, órgão informado, valor normalizado", () => {
    const r = interpretarResposta(fonte("detran/mg/multas-extrato"), {
      code: 200, header: { price: 0.28 },
      data: [{ ait: "AB123", orgao_autuador: "BHTRANS", descricao: "Estacionar em local proibido", data_infracao: "21/10/2026", normalizado_valor: 130.16, boleto_vencimento: "12/11/2026", situacao: "A PAGAR" }],
    });
    expect(r.multas[0]).toMatchObject({ orgaoId: "BHTRANS", orgaoNome: "BHTRANS", valor: 13016, gravidade: "media", vencimento: "2026-11-12" });
  });
  it("Detran-PA: várias listas (vencidas e a vencer) sem duplicar", () => {
    const multa = { ait: "PA1", descricao: "Avançar sinal vermelho", valor: "293,47", data_infracao: "2026-09-10" };
    const r = interpretarResposta(fonte("detran/pa/infracoes"), { code: 200, data: [{ infracoes_vencidas: [multa], infracoes_a_vencer: [multa, { ...multa, ait: "PA2" }] }] });
    expect(r.multas.map((m) => m.autoInfracao).sort()).toEqual(["PA1", "PA2"]);
    expect(r.multas[0]).toMatchObject({ gravidade: "gravissima", pontos: 7, orgaoId: "DETRAN-PA" });
  });
  it("612 = consultou e não há multas: não é erro", () => {
    expect(interpretarResposta(fonte("prf/infracoes"), { code: 612, code_message: "A consulta não retornou dados." })).toMatchObject({ ok: true, multas: [] });
  });
  it("outros códigos são erro e trazem a mensagem", () => {
    const r = interpretarResposta(fonte("detran/mg/multas-extrato"), { code: 606, code_message: "Parâmetros inválidos", errors: ["login_cpf obrigatório"] });
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("606");
    expect(r.erro).toContain("login_cpf obrigatório");
  });
  it("conversões de valor e data", () => {
    expect(reaisParaCentavos("R$ 1.234,56")).toBe(123456);
    expect(reaisParaCentavos("1234.56")).toBe(123456);
    expect(reaisParaCentavos(88.38)).toBe(8838);
    expect(dataParaISO("05/11/2026 10:00")).toBe("2026-11-05");
  });
});

describe("Infosimples · erros de conta", () => {
  it("token inválido não conta como falha da fonte", () => {
    const r = interpretarResposta(fonte("prf/infracoes"), { code: 601, code_message: "Não foi possível se autenticar com o token informado." });
    expect(r.ok).toBe(false);
    expect(erroDeConta(r)).toBe(true);
    expect(erroDeConta({ codigo: 606, erro: "606 Parâmetros inválidos" })).toBe(false);
  });
});
