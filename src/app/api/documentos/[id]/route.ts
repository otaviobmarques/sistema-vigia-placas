/** Download de um documento da multa (boleto, auto da ANTT). Respeita o escopo do usuário (RLS). */
import { NextResponse } from "next/server";
import { noEscopo, sessaoAtual } from "@/lib/auth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ erro: "inválido" }, { status: 400 });
  const d = await noEscopo(s, (db) => db.one<{ nome: string; mime: string; conteudo_base64: string }>(
    "select nome, mime, conteudo_base64 from documentos where id = $1 and expira_em > now()", [id]));
  if (!d) return NextResponse.json({ erro: "Documento não encontrado ou expirado (guardamos por 60 dias)." }, { status: 404 });
  return new Response(new Uint8Array(Buffer.from(d.conteudo_base64, "base64")), {
    headers: { "content-type": d.mime, "content-disposition": `inline; filename="${d.nome.replace(/[^\w.\-]/g, "_")}"`, "cache-control": "private, no-store" },
  });
}
