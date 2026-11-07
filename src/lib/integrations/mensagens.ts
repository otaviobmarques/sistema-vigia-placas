/**
 * Mensagens (WhatsApp Business, e-mail, push). No MVP tudo passa pela tabela `outbox`;
 * um despachante (WhatsApp Cloud API / e-mail transacional) consome a fila.
 */
import type { Db } from "../db";

export async function enfileirar(db: Db, m: { clienteId: string | null; canal: "whatsapp" | "email" | "push"; destino: string | null; assunto: string; corpo: string; url?: string | null }) {
  if (!m.destino) return;
  await db.q("insert into outbox (cliente_id, canal, destino, assunto, corpo, url) values ($1,$2,$3,$4,$5,$6)", [m.clienteId, m.canal, m.destino, m.assunto, m.corpo, m.url ?? null]);
}
