/** Cadastro de placas em lote (T09): planilha .xlsx/.csv com pré-visualização de erros linha a linha. */
import * as XLSX from "xlsx";
import type { Db } from "../db";
import { somenteDocumento, validarPlaca, validarRenavam } from "../domain/validators";

export const COLUNAS = ["cliente", "placa", "renavam", "uf", "apelido", "grupo", "centro_custo", "condutor_principal"] as const;
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

export interface LinhaImport {
  linha: number;
  cliente: string;
  clienteId: string | null;
  clienteNome: string | null;
  placa: string;
  renavam: string;
  uf: string;
  apelido: string;
  grupo: string;
  centro_custo: string;
  condutor_principal: string;
  erros: string[];
}

export function lerPlanilha(buf: ArrayBuffer): Record<string, string>[] {
  const wb = XLSX.read(buf, { type: "array", raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
  return rows.map((r) => {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      o[k.toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_")] = String(v ?? "").trim();
    }
    return o;
  });
}

export async function validarLinhas(db: Db, rows: Record<string, string>[], clientePadraoId: string | null): Promise<LinhaImport[]> {
  const clientes = await db.q<{ id: string; documento: string; nome: string }>("select id, documento, nome from clientes");
  const porDoc = new Map(clientes.map((c) => [c.documento, c]));
  const ativas = await db.q<{ placa: string; cliente_id: string }>("select placa, cliente_id from placas where status <> 'pausada'");
  const ativasMap = new Map(ativas.map((a) => [a.placa, a.cliente_id]));
  const vistas = new Set<string>();

  return rows.map((r, i) => {
    const erros: string[] = [];
    const doc = somenteDocumento(r.cliente ?? r.cpf_cnpj ?? "");
    let cli = doc ? porDoc.get(doc) ?? null : null;
    if (doc && !cli) erros.push("Cliente não encontrado na sua carteira");
    if (!doc && clientePadraoId) cli = clientes.find((c) => c.id === clientePadraoId) ?? null;
    if (!cli && !doc) erros.push("Informe o CPF/CNPJ do cliente");

    const pv = validarPlaca(r.placa ?? "");
    const placa = pv.ok ? pv.placa : (r.placa ?? "").toUpperCase();
    if (!pv.ok) erros.push(pv.erro);
    const rv = validarRenavam(r.renavam ?? "");
    if (!rv.ok) erros.push(rv.erro);
    const uf = (r.uf ?? "").toUpperCase();
    if (!UFS.includes(uf)) erros.push("UF inválida");
    if (pv.ok) {
      const dono = ativasMap.get(placa);
      if (dono && cli && dono === cli.id) erros.push("Placa já ativa neste cliente");
      else if (dono) erros.push("Placa já ativa em outro cliente");
      if (vistas.has(placa)) erros.push("Placa repetida na planilha");
      vistas.add(placa);
    }
    return {
      linha: i + 2, // linha 1 é o cabeçalho
      cliente: doc,
      clienteId: cli?.id ?? null,
      clienteNome: cli?.nome ?? null,
      placa,
      renavam: rv.ok ? rv.renavam : r.renavam ?? "",
      uf,
      apelido: r.apelido ?? "",
      grupo: r.grupo ?? "",
      centro_custo: r.centro_custo ?? r.centro_de_custo ?? "",
      condutor_principal: r.condutor_principal ?? "",
      erros,
    };
  });
}

export function modeloPlanilha(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    [...COLUNAS],
    ["11.222.333/0001-81", "ABC1D23", "01234567897", "MG", "Caminhão 01", "Frota BH", "Logística", "Carlos Souza"],
  ]);
  ws["!cols"] = COLUNAS.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "placas");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
