/** TOTP (RFC 6238) para a autenticação em dois fatores dos administradores. */
import { createHmac, randomBytes } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function gerarSegredo(): string {
  const bytes = randomBytes(20);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  return bits.match(/.{1,5}/g)!.map((c) => B32[parseInt(c.padEnd(5, "0"), 2)]).join("");
}

function decodificar(s: string): Buffer {
  let bits = "";
  for (const ch of s.replace(/=+$/, "").toUpperCase()) bits += B32.indexOf(ch).toString(2).padStart(5, "0");
  return Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
}

export function codigoTOTP(segredo: string, t = Date.now()): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = createHmac("sha1", decodificar(segredo)).update(contador).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

export function verificarTOTP(segredo: string, codigo: string): boolean {
  const c = codigo.replace(/\D/g, "");
  return [-1, 0, 1].some((d) => codigoTOTP(segredo, Date.now() + d * 30000) === c);
}

export function urlOtpauth(segredo: string, email: string) {
  return `otpauth://totp/Vigia%20Placa:${encodeURIComponent(email)}?secret=${segredo}&issuer=Vigia%20Placa`;
}
