/** Consulta de uma placa numa execução própria (ver lib/services/fila-consultas). Protegida por CRON_SECRET. */
import { after, NextResponse } from "next/server";
import { consultarAgora } from "@/lib/services/fila-consultas";

export const maxDuration = 300;

export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const corpo = await req.json().catch(() => ({}));
  const ids = (Array.isArray(corpo?.ids) ? corpo.ids : []).filter((x: unknown) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 5);
  if (!ids.length) return NextResponse.json({ erro: "sem placas" }, { status: 400 });
  after(() => consultarAgora(ids).then(() => undefined));
  return NextResponse.json({ recebidas: ids.length }, { status: 202 });
}
