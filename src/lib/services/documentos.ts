/**
 * Documentos das multas (boleto, auto da ANTT): guardados no banco por 60 dias, porque os links das fontes expiram.
 * Notificações enviadas pelo cliente (notificacoes_capturadas) seguem a mesma retenção: o arquivo é apagado após 60 dias.
 */
import type { Db } from "../db";

export const DIAS_RETENCAO = 60;
const LIMITE_BYTES = 8 * 1024 * 1024;

export type TipoDocumento = "boleto" | "auto_antt" | "boleto_antt" | "notificacao_sne" | "procuracao";

/** Baixa um PDF (ou imagem) da fonte. Devolve null se não for um arquivo de verdade (ex.: página de login). */
export async function baixarArquivo(url: string): Promise<{ base64: string; mime: string } | null> {
  if (!/^https:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { headers: { "user-agent": "VigiaPlaca/1.0", accept: "application/pdf,image/*;q=0.8,*/*;q=0.5" }, signal: AbortSignal.timeout(20_000), redirect: "follow" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > LIMITE_BYTES) return null;
    const tipo = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ehPdf = buf.subarray(0, 5).toString("latin1") === "%PDF-";
    const ehImagem = /^image\/(png|jpe?g|webp|gif)$/.test(tipo);
    if (!ehPdf && !ehImagem) return null;
    return { base64: buf.toString("base64"), mime: ehPdf ? "application/pdf" : tipo };
  } catch {
    return null;
  }
}

export async function guardarDocumento(db: Db, d: { clienteId: string; multaId?: string | null; multaAnttId?: string | null; tipo: TipoDocumento; nome: string; mime: string; base64: string; origemUrl?: string | null; expiraEm?: string | null }) {
  // Um documento vigente por multa e tipo (ou por cliente, quando não é de multa): o novo substitui o anterior.
  if (d.multaId || d.multaAnttId) await db.q("delete from documentos where tipo = $1 and (multa_id = $2 or multa_antt_id = $3)", [d.tipo, d.multaId ?? null, d.multaAnttId ?? null]);
  else await db.q("delete from documentos where tipo = $1 and cliente_id = $2 and multa_id is null and multa_antt_id is null", [d.tipo, d.clienteId]);
  const r = await db.one<{ id: string }>(
    `insert into documentos (cliente_id, multa_id, multa_antt_id, tipo, nome, mime, conteudo_base64, origem_url, expira_em)
     values ($1,$2,$3,$4,$5,$6,$7,$8, coalesce($9::timestamptz, now() + interval '60 days')) returning id`,
    [d.clienteId, d.multaId ?? null, d.multaAnttId ?? null, d.tipo, d.nome, d.mime, d.base64, d.origemUrl ?? null, d.expiraEm ?? null],
  );
  return r!.id;
}

/** Guarda o PDF do boleto de uma multa, se ainda não houver um vigente. Falha silenciosa: o link continua na multa. */
export async function guardarBoletoDaMulta(db: Db, m: { id: string; cliente_id: string; placa: string; auto_infracao: string; boleto_url: string | null }) {
  if (!m.boleto_url) return false;
  const ja = await db.one("select 1 from documentos where multa_id = $1 and tipo = 'boleto' and expira_em > now()", [m.id]);
  if (ja) return false;
  const arq = await baixarArquivo(m.boleto_url);
  if (!arq) return false;
  await guardarDocumento(db, { clienteId: m.cliente_id, multaId: m.id, tipo: "boleto", nome: `boleto-${m.placa}-${m.auto_infracao}.${arq.mime === "application/pdf" ? "pdf" : "img"}`, mime: arq.mime, base64: arq.base64, origemUrl: m.boleto_url });
  return true;
}

/** Primeiro comprovante em PDF que a Infosimples devolve (site_receipts). */
export async function pdfDaResposta(json: any) {
  const urls: string[] = (Array.isArray(json?.site_receipts) ? json.site_receipts : []).filter((u: unknown): u is string => typeof u === "string");
  for (const u of urls) { const a = await baixarArquivo(u); if (a?.mime === "application/pdf") return { ...a, url: u }; }
  return null;
}

/** Retenção de 60 dias: apaga documentos vencidos e o arquivo das notificações enviadas há mais de 60 dias. */
export async function limparDocumentosVencidos(db: Db) {
  const docs = await db.q<{ id: string }>("delete from documentos where expira_em < now() returning id");
  const notif = await db.q<{ id: string }>(
    `update notificacoes_capturadas set arquivo_base64 = null where arquivo_base64 is not null and criado_em < now() - make_interval(days => $1) returning id`,
    [DIAS_RETENCAO],
  );
  return { documentos: docs.length, notificacoes: notif.length };
}

/** Documentos vigentes de uma multa (sem o conteúdo) e as notificações enviadas pelo cliente que ainda têm arquivo. */
export async function documentosDaMulta(db: Db, multaId: string) {
  const docs = await db.q<{ id: string; tipo: TipoDocumento; nome: string; expira_em: string }>(
    "select id, tipo, nome, expira_em from documentos where multa_id = $1 and expira_em > now() order by criado_em desc",
    [multaId],
  );
  const notificacoes = await db.q<{ id: string; arquivo_nome: string | null; criado_em: string }>(
    "select id, arquivo_nome, criado_em from notificacoes_capturadas where multa_id = $1 and arquivo_base64 is not null order by criado_em desc",
    [multaId],
  );
  return { docs, notificacoes };
}
