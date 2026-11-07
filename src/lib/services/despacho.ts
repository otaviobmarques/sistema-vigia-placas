/**
 * Despacha a fila `outbox`: push (web push / app) e e-mail. WhatsApp fica na fila até haver provedor.
 * Push com destino "equipe" vai para os aparelhos da equipe Vigia Placa (Administrador e Gestor).
 */
import type { Db } from "../db";
import { enviarPush, pushAtivo } from "../integrations/push";
import { emailAtivo, enviarEmail } from "../integrations/email";

type Assinatura = { id: string; endpoint: string; p256dh: string; auth: string; falhas: number };

async function despacharPush(db: Db, limite: number) {
  let enviados = 0, semDestino = 0, erros = 0;
  if (!pushAtivo()) return { enviados, semDestino, erros };
  const fila = await db.q("select * from outbox where canal = 'push' and status = 'pendente' order by criado_em limit $1", [limite]);
  for (const m of fila) {
    const subs = m.destino === "equipe"
      ? await db.q<Assinatura>("select ps.* from push_assinaturas ps join usuarios u on u.id = ps.usuario_id where u.nivel = 'franqueadora' and u.ativo and ps.cliente_id is null")
      : await db.q<Assinatura>("select * from push_assinaturas where cliente_id = $1", [m.cliente_id]);
    if (!subs.length) {
      await db.q("update outbox set status = 'sem_destinatario' where id = $1", [m.id]);
      semDestino++;
      continue;
    }
    let ok = 0, ultimoErro: string | null = null;
    for (const s of subs) {
      const r = await enviarPush(s, { titulo: m.assunto, corpo: m.corpo, url: m.url, tag: m.destino === "equipe" ? `equipe-${m.cliente_id ?? "geral"}` : m.id });
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

async function despacharEmail(db: Db, limite: number) {
  let enviados = 0, erros = 0;
  if (!emailAtivo()) return { enviados, erros };
  const fila = await db.q("select * from outbox where canal = 'email' and status = 'pendente' order by criado_em limit $1", [limite]);
  for (const m of fila) {
    const r = await enviarEmail(m.destino, m.assunto, m.corpo, m.url);
    await db.q("update outbox set status = $2, enviado_em = case when $2 = 'enviado' then now() end, erro = $3 where id = $1", [m.id, r.ok ? "enviado" : "erro", r.ok ? null : r.erro ?? null]);
    r.ok ? enviados++ : erros++;
  }
  return { enviados, erros };
}

export async function despacharOutbox(db: Db, limite = 300) {
  const push = await despacharPush(db, limite);
  const email = await despacharEmail(db, limite);
  return { enviados: push.enviados + email.enviados, semDestino: push.semDestino, erros: push.erros + email.erros, emails: email.enviados };
}
