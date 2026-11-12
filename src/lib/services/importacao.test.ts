import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { lerPlanilha, modeloPlanilha, validarLinhas } from "./importacao";

const clientes = [
  { id: "pj", documento: "04252011000110", nome: "Transportes PJ" },
  { id: "pf", documento: "01234567890", nome: "Fulano PF" },
];
const db = { q: async (sql: string) => (sql.includes("from clientes") ? clientes : []) } as any;
const linha = (cliente: string) => ({ cliente, placa: "ABC1D23", renavam: "01234567897", uf: "MG" });

describe("importação: coluna cliente aceita CNPJ e CPF", () => {
  it("acha o cliente por CNPJ ou CPF, com ou sem pontuação", async () => {
    const r = await validarLinhas(db, [linha("04.252.011/0001-10"), linha("012.345.678-90"), linha("01234567890")], null);
    expect(r.map((l) => l.clienteId)).toEqual(["pj", "pf", "pf"]);
  });
  it("recupera o zero à esquerda que o Excel apaga", async () => {
    const r = await validarLinhas(db, [linha("1234567890"), linha("4252011000110")], null);
    expect(r.map((l) => l.clienteId)).toEqual(["pf", "pj"]);
  });
  it("explica quando puseram o nome no lugar do documento", async () => {
    const [l] = await validarLinhas(db, [linha("Transportes PJ")], null);
    expect(l.erros).toContain("Use o CNPJ ou CPF do cliente, não o nome");
  });
  it("modelo tem cabeçalho 'cliente (CNPJ ou CPF)' e é lido de volta como cliente", () => {
    const buf = modeloPlanilha();
    const wb = XLSX.read(buf);
    expect(wb.SheetNames).toEqual(["placas", "instruções"]);
    const rows = lerPlanilha(new Uint8Array(buf).buffer);
    expect(rows[0].cliente).toBe("11.222.333/0001-81");
    expect(rows[1].cliente).toBe("123.456.789-09");
  });
});
