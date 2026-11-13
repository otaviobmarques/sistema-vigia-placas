/** Consulta de uma placa numa execução própria (ver lib/services/fila-consultas). Protegida por CRON_SECRET. */
import { after, NextResponse } from "next/server";
import { consultarAgora, consultarAnttAgora } from "@/lib/services/fila-consultas";

export const maxDuration = 300;

export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const corpo = await req.json().catch(() => ({}));
  const uuids = (v: unknown) => (Array.isArray(v) ? v : []).filter((x: unknown): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 5);
  const ids = uuids(corpo?.ids), antt = uuids(corpo?.antt);
  if (!ids.length && !antt.length) return NextResponse.json({ erro: "sem placas" }, { status: 400 });
  after(async () => {
    if (ids.length) await consultarAgora(ids);
    if (antt.length) await consultarAnttAgora(antt);
  });
  return NextResponse.json({ recebidas: ids.length + antt.length }, { status: 202 });
}
