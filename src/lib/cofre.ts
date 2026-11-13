/**
 * Cofre de credenciais de terceiros (ex.: senha do SIFAMA/ANTT do cliente). AES-256-GCM.
 * Chave: COFRE_CHAVE, ou derivada da SESSION_SECRET/DATABASE_URL (como a sessão). Trocar a origem da chave
 * invalida as senhas guardadas: o cliente precisa digitá-las de novo.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function chave(): Buffer {
  const base = process.env.COFRE_CHAVE || process.env.SESSION_SECRET || process.env.DATABASE_URL;
  if (!base) {
    if (process.env.NODE_ENV === "production") throw new Error("Defina COFRE_CHAVE, SESSION_SECRET ou DATABASE_URL em produção");
    return createHash("sha256").update("vigia-placa:cofre:dev").digest();
  }
  return createHash("sha256").update("vigia-placa:cofre:" + base).digest();
}

/** Cifra um texto: "v1.<iv>.<tag>.<dados>" em base64url. */
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), dados.toString("base64url")].join(".");
}

/** Decifra; null se o texto foi alterado ou a chave mudou. */
export function decifrar(cifrado: string | null | undefined): string | null {
  if (!cifrado) return null;
  const [v, iv, tag, dados] = cifrado.split(".");
  if (v !== "v1" || !iv || !tag || !dados) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(dados, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
