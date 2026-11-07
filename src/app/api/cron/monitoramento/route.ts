/** Varredura agendada (Vercel Cron ou qualquer agendador). Protegida por CRON_SECRET (Authorization: Bearer). */
import { NextResponse } from "next/server";
import { sistema } from "@/lib/db";
import { varredura } from "@/lib/services/monitoramento";
import { fecharPeriodosEncerrados } from "@/lib/services/faturamento";

export const maxDuration = 300;

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const r = await sistema((db) => varredura(db));
  // Fecha as faturas dos clientes cujo ciclo (diário, semanal, quinzenal, mensal) terminou ontem.
  const faturas = await sistema((db) => fecharPeriodosEncerrados(db));
  return NextResponse.json({ ...r, faturas });
}
