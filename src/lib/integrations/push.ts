/** Web push (VAPID). Sem VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY, o recurso fica desligado. */
import * as webpush from "web-push";
import { urlApp } from "../url";

export const pushAtivo = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const chavePublica = () => process.env.VAPID_PUBLIC_KEY ?? null;

let configurado = false;
function configurar() {
  if (configurado) return;
  // O padrão VAPID exige um contato https: ou mailto:.
  const url = urlApp();
  const contato = process.env.VAPID_SUBJECT ?? (url.startsWith("https://") ? url : "mailto:suporte@vigiaplaca.com.br");
  webpush.setVapidDetails(contato, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configurado = true;
}

export interface Inscricao { endpoint: string; p256dh: string; auth: string }
export interface Aviso { titulo: string; corpo: string; url?: string | null; tag?: string }

/** Envia um aviso. `expirada` = o navegador cancelou a inscrição (apagar do banco). */
export async function enviarPush(i: Inscricao, a: Aviso): Promise<{ ok: boolean; expirada: boolean; erro?: string }> {
  if (!pushAtivo()) return { ok: false, expirada: false, erro: "push desligado" };
  try {
    configurar();
    await webpush.sendNotification(
      { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
      JSON.stringify({ titulo: a.titulo, corpo: a.corpo.slice(0, 300), url: a.url ?? "/hoje", tag: a.tag }),
      { TTL: 60 * 60 * 24, urgency: "high" },
    );
    return { ok: true, expirada: false };
  } catch (e: any) {
    const status = e?.statusCode as number | undefined;
    return { ok: false, expirada: status === 404 || status === 410, erro: `${status ?? ""} ${e?.body ?? e?.message ?? e}`.trim().slice(0, 300) };
  }
}
