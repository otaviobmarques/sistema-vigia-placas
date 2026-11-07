/** Despacha a fila `outbox`. Hoje: push (web push). E-mail e WhatsApp ficam na fila até haver provedor. */
import type { Db } from "../db";
import { enviarPush, pushAtivo } from "../integrations/push";

export async function despacharOutbox(db: Db, limite = 300) {
  if (!pushAtivo()) return { enviados: 0, semDestino: 0, erros: 0 };
  const fila = await db.q(
    "select * from outbox where canal = 'push' and status = 'pendente' order by criado_em limit $1",
    [limite],
  );
  let enviados = 0, semDestino = 0, erros = 0;
  for (const m of fila) {
    const subs = await db.q<{ id: string; endpoint: string; p256dh: string; auth: string; falhas: number }>("select * from push_assinaturas where cliente_id = $1", [m.cliente_id]);
    if (!subs.length) {
      await db.q("update outbox set status = 'sem_destinatario' where id = $1", [m.id]);
      semDestino++;
      continue;
    }
    let ok = 0, ultimoErro: string | null = null;
    for (const s of subs) {
      const r = await enviarPush(s, { titulo: m.assunto, corpo: m.corpo, url: m.url, tag: m.id });
      if (r.ok) {
        ok++;
        await db.q("update push_assinaturas set ultimo_envio = now(), falhas = 0 where id = $1", [s.id]);
      } else if (r.expirada || s.falhas >= 4) {
        await db.q("delete from push_assinaturas where id = $1", [s.id]);
        ultimoErro = r.erro ?? null;
      } else {
        await db.q("update push_assinaturas set falhas = falhas + 1 where id = $1", [s.id]);
        ultimoErro = r.erro ?? null;
      }
    }
    await db.q("update outbox set status = $2, enviado_em = case when $2 = 'enviado' then now() end, erro = $3 where id = $1", [m.id, ok ? "enviado" : "erro", ok ? null : ultimoErro]);
    ok ? enviados++ : erros++;
  }
  return { enviados, semDestino, erros };
}
