/**
 * Asaas — recebe o Pix único, paga os boletos (Pague Contas) e divide a comissão (Split).
 * Docs: https://docs.asaas.com/docs/split-de-pagamentos · https://docs.asaas.com/docs/pague-contas
 * Sem ASAAS_API_KEY, roda em modo simulado.
 */
import QRCode from "qrcode";
import { brCode } from "./pix";
import { hojeISO } from "../domain/dates";

export const asaasSimulado = () => !process.env.ASAAS_API_KEY;
const base = () => process.env.ASAAS_BASE_URL ?? "https://api-sandbox.asaas.com/v3";

async function api<T = any>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const res = await fetch(base() + caminho, {
    method: metodo,
    headers: { "content-type": "application/json", access_token: process.env.ASAAS_API_KEY!, "user-agent": "VigiaPlaca/0.1" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Asaas ${res.status}: ${json?.errors?.map((e: any) => e.description).join("; ") ?? res.statusText}`);
  return json as T;
}

export async function garantirCliente(c: { nome: string; documento: string; email?: string | null; asaasId?: string | null }): Promise<string> {
  if (c.asaasId) return c.asaasId;
  if (asaasSimulado()) return `cus_sim_${c.documento}`;
  const r = await api<{ id: string }>("POST", "/customers", { name: c.nome, cpfCnpj: c.documento, email: c.email ?? undefined });
  return r.id;
}

export interface CobrancaPix {
  id: string;
  payload: string;
  qrBase64: string;
}

export async function criarCobrancaPix(opts: {
  customerId: string;
  valorCentavos: number;
  descricao: string;
  referencia: string;
  split?: { walletId: string; valorCentavos: number } | null;
}): Promise<CobrancaPix> {
  if (asaasSimulado()) {
    const payload = brCode({ chave: "pix@vigiaplaca.com.br", valorCentavos: opts.valorCentavos, nome: "VIGIA PLACA", cidade: "BELO HORIZONTE", txid: opts.referencia });
    const qr = await QRCode.toDataURL(payload, { margin: 1, width: 320, color: { dark: "#0B2545", light: "#FFFFFF" } });
    return { id: `pay_sim_${opts.referencia.replace(/-/g, "").slice(0, 16)}`, payload, qrBase64: qr };
  }
  const cobranca = await api<{ id: string }>("POST", "/payments", {
    customer: opts.customerId,
    billingType: "PIX",
    value: opts.valorCentavos / 100,
    dueDate: hojeISO(),
    description: opts.descricao,
    externalReference: opts.referencia,
    split: opts.split && opts.split.valorCentavos > 0 ? [{ walletId: opts.split.walletId, fixedValue: opts.split.valorCentavos / 100 }] : undefined,
  });
  const qr = await api<{ encodedImage: string; payload: string }>("GET", `/payments/${cobranca.id}/pixQrCode`);
  return { id: cobranca.id, payload: qr.payload, qrBase64: `data:image/png;base64,${qr.encodedImage}` };
}

/** Pague Contas: paga um boleto de qualquer banco a partir do saldo Asaas. */
export async function pagarBoleto(linhaDigitavel: string, descricao: string): Promise<{ ok: boolean; id?: string; erro?: string }> {
  if (asaasSimulado()) {
    // Simulação: boletos cuja linha termina em "0000" falham (para exercitar a contingência).
    if (linhaDigitavel.endsWith("0000")) return { ok: false, erro: "Boleto recusado (simulado)" };
    return { ok: true, id: `bill_sim_${linhaDigitavel.slice(-8)}` };
  }
  try {
    const r = await api<{ id: string; status: string }>("POST", "/bill", { identificationField: linhaDigitavel, description: descricao });
    return { ok: r.status !== "FAILED", id: r.id };
  } catch (e: any) {
    return { ok: false, erro: e.message };
  }
}

export async function criarCobrancaFatura(opts: { customerId: string; valorCentavos: number; descricao: string; referencia: string; vencimento: string; forma: "pix" | "boleto" | "cartao" }) {
  if (asaasSimulado()) return { id: `pay_sim_fat_${opts.referencia.slice(0, 12)}` };
  const billingType = opts.forma === "cartao" ? "CREDIT_CARD" : opts.forma === "boleto" ? "BOLETO" : "PIX";
  return api<{ id: string }>("POST", "/payments", {
    customer: opts.customerId,
    billingType,
    value: opts.valorCentavos / 100,
    dueDate: opts.vencimento,
    description: opts.descricao,
    externalReference: opts.referencia,
  });
}
