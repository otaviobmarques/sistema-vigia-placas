/** Arquivo da notificação enviada pelo cliente (foto/PDF). Guardado por 60 dias. Respeita o escopo do usuário (RLS). */
import { NextResponse } from "next/server";
import { noEscopo, sessaoAtual } from "@/lib/auth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ erro: "inválido" }, { status: 400 });
  const n = await noEscopo(s, (db) => db.one<{ arquivo_nome: string | null; arquivo_tipo: string | null; arquivo_base64: string | null }>(
    "select arquivo_nome, arquivo_tipo, arquivo_base64 from notificacoes_capturadas where id = $1", [id]));
  if (!n?.arquivo_base64) return NextResponse.json({ erro: "Arquivo não encontrado ou expirado (guardamos por 60 dias)." }, { status: 404 });
  const dataUrl = /^data:([^;,]+)/.exec(n.arquivo_base64)?.[1];
  const buf = Buffer.from(n.arquivo_base64.replace(/^data:[^,]*,/, ""), "base64");
  const magia = buf.subarray(0, 4).toString("hex");
  const mime = n.arquivo_tipo || dataUrl || (magia === "25504446" ? "application/pdf" : magia.startsWith("ffd8") ? "image/jpeg" : magia === "89504e47" ? "image/png" : magia === "52494646" ? "image/webp" : "application/octet-stream");
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": mime, "content-disposition": `inline; filename="${(n.arquivo_nome ?? "notificacao").replace(/[^\w.\-]/g, "_")}"`, "cache-control": "private, no-store" },
  });
}
