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
      const chave = k.toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      // "cliente (CNPJ ou CPF)", "cnpj", "cpf_cnpj"… tudo vira a coluna "cliente".
      o[/^(cliente|cnpj|cpf)/.test(chave) ? "cliente" : chave] = String(v ?? "").trim();
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
    // O Excel apaga zeros à esquerda quando o documento vira número: tenta também com 11 (CPF) e 14 (CNPJ) dígitos.
    const candidatos = /^\d+$/.test(doc) ? [doc, doc.padStart(11, "0"), doc.padStart(14, "0")] : [doc];
    let cli = doc ? candidatos.map((d) => porDoc.get(d)).find(Boolean) ?? null : null;
    if (doc && !cli) erros.push(/[A-Z]{3}/.test(doc) && !/^[0-9A-Z]{14}$/.test(doc) ? "Use o CNPJ ou CPF do cliente, não o nome" : "CNPJ/CPF não encontrado na sua carteira");
    if (!doc && clientePadraoId) cli = clientes.find((c) => c.id === clientePadraoId) ?? null;
    if (!cli && !doc) erros.push("Informe o CNPJ ou CPF do cliente");

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
    ["cliente (CNPJ ou CPF)", ...COLUNAS.slice(1)],
    ["11.222.333/0001-81", "ABC1D23", "01234567897", "MG", "Caminhão 01", "Frota BH", "Logística", "Carlos Souza"],
    ["123.456.789-09", "BRA2E19", "98765432100", "SP", "Moto 01", "", "", ""],
  ]);
  ws["!cols"] = [{ wch: 24 }, ...COLUNAS.slice(1).map(() => ({ wch: 18 }))];
  const instrucoes = XLSX.utils.aoa_to_sheet([
    ["Coluna", "Obrigatória", "Como preencher"],
    ["cliente (CNPJ ou CPF)", "Sim*", "CNPJ ou CPF do cliente, igual ao do cadastro no Vigia Placa. Com ou sem pontuação. Não use o nome."],
    ["placa", "Sim", "Placa no formato antigo (ABC1234) ou Mercosul (ABC1D23)."],
    ["renavam", "Sim", "Renavam do veículo (até 11 dígitos)."],
    ["uf", "Não", "Estado de emplacamento (ex.: MG, SP). Padrão: MG."],
    ["apelido", "Não", "Como a frota chama o veículo (ex.: Caminhão 01)."],
    ["grupo", "Não", "Agrupamento livre (ex.: Frota BH)."],
    ["centro_custo", "Não", "Centro de custo para os relatórios."],
    ["condutor_principal", "Não", "Nome do condutor principal."],
    [],
    ["* Quando o próprio cliente sobe a planilha no portal, a coluna cliente pode ficar em branco: as placas vão para a frota dele."],
    ["Apague as linhas de exemplo antes de enviar."],
  ]);
  instrucoes["!cols"] = [{ wch: 24 }, { wch: 12 }, { wch: 90 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "placas");
  XLSX.utils.book_append_sheet(wb, instrucoes, "instruções");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
