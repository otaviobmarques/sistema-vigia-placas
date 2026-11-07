/** Lê uma foto/PDF de notificação ou CRLV-e e devolve os campos para conferência. Nada é gravado aqui. */
import { NextResponse } from "next/server";
import { noEscopo, sessaoAtual } from "@/lib/auth";
import { leitorAtivo, lerDocumento, TIPOS_ACEITOS } from "@/lib/integrations/leitor";
import { auditar } from "@/lib/services/multas";

export const maxDuration = 60;
const LIMITE_DIARIO = 100;
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const s = await sessaoAtual();
  if (!s?.clienteId) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  if (!leitorAtivo()) return NextResponse.json({ erro: "Leitura automática desligada." }, { status: 501 });
  const form = await req.formData();
  const arq = form.get("arquivo");
  const foco = form.get("foco") === "crlv" ? "crlv" : "notificacao";
  if (!(arq instanceof File) || !arq.size) return NextResponse.json({ erro: "Envie a foto ou o PDF." }, { status: 400 });
  if (arq.size > MAX_BYTES) return NextResponse.json({ erro: "Arquivo maior que 8 MB." }, { status: 413 });
  if (!(TIPOS_ACEITOS as readonly string[]).includes(arq.type)) return NextResponse.json({ erro: "Use JPG, PNG, WEBP ou PDF." }, { status: 415 });

  const clienteId = s.clienteId;
  const hoje = await noEscopo(s, (db) =>
    db.one("select count(*) as n from auditoria where cliente_id = $1 and acao = 'leitura_documento' and data > now() - interval '1 day'", [clienteId]),
  );
  if (Number(hoje?.n) >= LIMITE_DIARIO) return NextResponse.json({ erro: "Limite diário de leituras automáticas atingido." }, { status: 429 });

  try {
    const leitura = await lerDocumento({ base64: Buffer.from(await arq.arrayBuffer()).toString("base64"), tipo: arq.type }, foco);
    await noEscopo(s, (db) => auditar(db, { usuarioId: s.usuarioId, clienteId, acao: "leitura_documento", entidade: foco, dados: { tipo: leitura.tipo_documento } }));
    return NextResponse.json(leitura);
  } catch (e: any) {
    console.error("leitura de documento falhou:", e?.status ?? "", e?.message);
    return NextResponse.json({ erro: e?.status ? "Leitura indisponível agora; preencha à mão." : e.message }, { status: 502 });
  }
}
