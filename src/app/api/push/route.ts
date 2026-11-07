/** Inscrição de notificações push do usuário logado. POST inscreve, DELETE remove. */
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/auth";
import { sistema } from "@/lib/db";
import { chavePublica, enviarPush, pushAtivo } from "@/lib/integrations/push";

export async function GET() {
  return NextResponse.json({ ativo: pushAtivo(), chave: chavePublica() });
}

export async function POST(req: Request) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  if (!pushAtivo()) return NextResponse.json({ erro: "Notificações desligadas no servidor." }, { status: 501 });
  const corpo = await req.json().catch(() => null);
  const sub = corpo?.inscricao;
  const endpoint = String(sub?.endpoint ?? "");
  if (!/^https:\/\//.test(endpoint) || !sub?.keys?.p256dh || !sub?.keys?.auth) return NextResponse.json({ erro: "Inscrição inválida." }, { status: 400 });
  // Cliente: avisos do próprio cliente. Franqueado/franqueadora: do cliente em foco, se houver.
  const clienteId = s.clienteProprioId ?? s.clienteId ?? null;
  await sistema(async (db) => {
    await db.q(
      `insert into push_assinaturas (usuario_id, cliente_id, endpoint, p256dh, auth, agente) values ($1,$2,$3,$4,$5,$6)
       on conflict (endpoint) do update set usuario_id = excluded.usuario_id, cliente_id = excluded.cliente_id, p256dh = excluded.p256dh, auth = excluded.auth, falhas = 0`,
      [s.usuarioId, clienteId, endpoint, sub.keys.p256dh, sub.keys.auth, (req.headers.get("user-agent") ?? "").slice(0, 200)],
    );
    // Quem ativa o push passa a receber os avisos do cliente também por push.
    if (clienteId) await db.q("update clientes set alertas_canais = array_append(alertas_canais, 'push') where id = $1 and not ('push' = any(alertas_canais))", [clienteId]);
  });
  if (corpo?.teste) {
    await enviarPush({ endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, { titulo: "Olá! Eu sou o Vigi.", corpo: "Notificações ativadas. Eu aviso aqui quando chegar multa nova e antes de cada prazo.", url: "/hoje", tag: "boas-vindas" });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const s = await sessaoAtual();
  if (!s) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const endpoint = String((await req.json().catch(() => null))?.endpoint ?? "");
  await sistema((db) => db.q("delete from push_assinaturas where endpoint = $1 and usuario_id = $2", [endpoint, s.usuarioId]));
  return NextResponse.json({ ok: true });
}
