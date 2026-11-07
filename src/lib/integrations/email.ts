/**
 * E-mail transacional (Resend). Sem RESEND_API_KEY, os e-mails ficam na fila (outbox) até o envio ser configurado.
 * Remetente: EMAIL_REMETENTE (padrão "Vigia Placa <alerta@vigiaplaca.com.br>"), com o domínio verificado no provedor.
 */
import { urlApp } from "../url";

export const emailAtivo = () => !!process.env.RESEND_API_KEY;
export const ehEmail = (v: string | null | undefined) => !!v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** HTML simples com a marca: título, texto e botão para abrir o sistema. */
export function htmlEmail(titulo: string, corpo: string, url?: string | null) {
  const link = url ? `${urlApp()}${url.startsWith("/") ? url : `/${url}`}` : urlApp();
  return `<!doctype html><html><body style="margin:0;background:#f7f8fa;font-family:Arial,Helvetica,sans-serif;color:#0b2545">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#0b2545;border-radius:16px 16px 0 0;padding:18px 24px;color:#fff;font-weight:800;font-size:20px">Vigia <span style="background:#ffb703;color:#0b2545;border-radius:6px;padding:2px 8px">PLACA</span></div>
    <div style="background:#fff;border:1px solid #e3e7ee;border-top:0;border-radius:0 0 16px 16px;padding:24px">
      <h1 style="font-size:20px;margin:0 0 12px">${esc(titulo)}</h1>
      <p style="font-size:15px;line-height:1.5;margin:0 0 20px;white-space:pre-line">${esc(corpo)}</p>
      <a href="${link}" style="display:inline-block;background:#12805c;color:#fff;text-decoration:none;font-weight:700;border-radius:12px;padding:12px 20px">Abrir o Vigia Placa</a>
    </div>
    <p style="font-size:11px;color:#5b6b82;text-align:center;margin-top:16px">Você recebe este aviso porque monitora placas no Vigia Placa.</p>
  </div></body></html>`;
}

export async function enviarEmail(para: string, assunto: string, corpo: string, url?: string | null): Promise<{ ok: boolean; erro?: string }> {
  if (!emailAtivo()) return { ok: false, erro: "envio de e-mail não configurado" };
  if (!ehEmail(para)) return { ok: false, erro: "e-mail inválido" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_REMETENTE || "Vigia Placa <alerta@vigiaplaca.com.br>", to: [para], subject: assunto, html: htmlEmail(assunto, corpo, url), text: `${corpo}\n\n${urlApp()}${url ?? ""}` }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, erro: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, erro: e?.message ?? String(e) };
  }
}
