/**
 * Webhook do Asaas. Configure no painel: URL {APP_URL}/api/webhooks/asaas e o token de autenticação
 * igual a ASAAS_WEBHOOK_TOKEN (enviado no header asaas-access-token). Idempotente.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sistema } from "@/lib/db";
import { confirmarPagamento } from "@/lib/services/pagamentos";

function tokenOk(recebido: string | null) {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido), b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!tokenOk(req.headers.get("asaas-access-token"))) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const ev = await req.json().catch(() => null);
  if (!ev?.event) return NextResponse.json({ erro: "evento inválido" }, { status: 400 });
  if (["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(ev.event) && ev.payment?.id) {
    const pg = await sistema((db) => db.one("select id from pagamentos where asaas_id = $1", [ev.payment.id]));
    if (pg) await sistema((db) => confirmarPagamento(db, pg.id));
    else await sistema((db) => db.q("update faturas set status = 'paga' where asaas_id = $1", [ev.payment.id]));
  }
  if (["PAYMENT_REFUNDED", "PAYMENT_DELETED"].includes(ev.event) && ev.payment?.id) {
    await sistema((db) => db.q("update pagamentos set status = 'cancelado' where asaas_id = $1 and status = 'aguardando'", [ev.payment.id]));
  }
  // Sempre 200 para eventos conhecidos ou ignorados: o Asaas pausa a fila em respostas de erro.
  return NextResponse.json({ ok: true });
}
