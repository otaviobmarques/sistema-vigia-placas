import { describe, expect, it } from "vitest";
import { interpretarDirectData } from "./directdata";

const resposta = (retorno: any, meta: any = {}) => ({ metaDados: { resultado: "Sucesso", resultadoId: 1, assincrono: false, ...meta }, retorno });

describe("Direct Data · Multas Radar", () => {
  it("lê as infrações com detalhes do radar e ignora as pagas", () => {
    const r = interpretarDirectData(resposta({
      placa: "ABC1D23", nomeProprietario: "NÃO GUARDAR", documentoProprietario: "00000000000", quantidadeInfracoes: 2,
      infracoes: [
        { dataInfracao: "03/10/2026", situacao: "Em aberto", descricaoInfracao: "Velocidade", detalhes: {
          numeroAutoInfracao: "SP1234567", orgaoAutuador: "DETRAN-SP", codigoRenainf: "R1", dataHora: "03/10/2026 14:22", municipio: "São Paulo", ufCometimento: "SP",
          local: "Av. Paulista", infracao: "7455-0", descricao: "Transitar em velocidade superior à máxima permitida em até 20%", pontos: "4", gravidade: "Média",
          valor: "R$ 130,16", limitePermitido: "60", medicaoConsiderada: "68", unidadeMedida: "km/h" } },
        { dataInfracao: "01/01/2026", situacao: "Paga", detalhes: { numeroAutoInfracao: "X1", orgaoAutuador: "CET", valor: "88,38" } },
      ],
    }));
    expect(r).toMatchObject({ ok: true, custo: 36 });
    expect(r.multas).toHaveLength(1);
    expect(r.multas[0]).toMatchObject({
      orgaoId: "DETRAN-SP", autoInfracao: "SP1234567", codigoInfracao: "74550", gravidade: "media", pontos: 4, valor: 13016,
      dataInfracao: "2026-10-03", hora: "14:22", local: "Av. Paulista · São Paulo · SP",
    });
    expect(r.multas[0].descricao).toContain("medido 68km/h, limite 60km/h");
    expect(JSON.stringify(r)).not.toContain("NÃO GUARDAR");
  });
  it("mesma multa repetida conta uma vez", () => {
    const it1 = { detalhes: { numeroAutoInfracao: "A1", orgaoAutuador: "PRF", infracao: "5452", valor: 130.16 } };
    expect(interpretarDirectData(resposta({ infracoes: [it1, it1] })).multas).toHaveLength(1);
  });
  it("nada consta não é erro e não é cobrado", () => {
    expect(interpretarDirectData({ metaDados: { resultado: "Nada Consta", resultadoId: 2 }, retorno: null })).toMatchObject({ ok: true, multas: [], custo: 0 });
  });
  it("token inválido e parâmetro faltando são erro", () => {
    expect(interpretarDirectData({ metaDados: { resultado: "Não Autorizado", resultadoId: 3, mensagem: "IP ou Token inválido. Verifique." }, retorno: null })).toMatchObject({ ok: false });
    expect(interpretarDirectData({ metaDados: { resultado: "Parametros Não Suportados", resultadoId: 8 }, retorno: null }).ok).toBe(false);
  });
  it("consulta assíncrona sem retorno ainda não conta", () => {
    expect(interpretarDirectData({ metaDados: { resultado: "Processando", assincrono: true }, retorno: null }).ok).toBe(false);
  });
});
