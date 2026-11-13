/**
 * SENATRAN / SNE com o acesso gov.br do cliente (procuração ou login próprio):
 * baixa a notificação da multa e emite o boleto com o desconto do SNE. Cada chamada é cobrada pela Infosimples.
 * Não guardamos dados pessoais do proprietário nem do condutor que vêm na resposta.
 */
import type { Db } from "../db";
import { brl } from "../domain/money";
import { dataBR } from "../domain/dates";
import { chamarServico, dataParaISO, modoSimulado, parametrosGov, reaisParaCentavos } from "../integrations/infosimples";
import { acessoDoCliente } from "./acesso-gov";
import { guardarDocumento, pdfDaResposta } from "./documentos";

type MultaSne = { id: string; cliente_id: string; placa_id: string; placa: string; auto_infracao: string; chave_infracao: string | null };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const dados = (json: any) => (Array.isArray(json?.data) ? json.data[0] : json?.data) ?? {};

async function multaComAcesso(db: Db, multaId: string) {
  const m = await db.one<MultaSne>(
    "select m.id, m.cliente_id, m.placa_id, p.placa, m.auto_infracao, m.chave_infracao from multas m join placas p on p.id = m.placa_id where m.id = $1",
    [multaId],
  );
  if (!m) throw new Error("Multa não encontrada.");
  if (!m.chave_infracao) throw new Error("Esta multa não veio do SENATRAN (sem chave da infração). Ela aparece lá quando o cliente tem procuração ou login gov.br.");
  const a = await acessoDoCliente(db, m.cliente_id);
  if (!a.ok) throw new Error(a.erro);
  return { m, params: { ...parametrosGov({ login: a.login, senha: a.senha, cnpj: a.representado }), placa: m.placa, chave_infracao: m.chave_infracao } };
}

async function registrar(db: Db, m: MultaSne, servico: string, nome: string, json: any) {
  const custo = Math.round(Number(json?.header?.price ?? 0) * 100) || 0;
  const ok = Number(json?.code) === 200;
  await db.q("insert into fontes (id, nome, ativa, prioridade, custo) values ($1, $2, true, 1, 24) on conflict (id) do nothing", [`infosimples:${servico}`, nome]);
  await db.q("insert into consultas (placa_id, cliente_id, fonte_id, custo, resultado, erro) values ($1, $2, $3, $4, $5, $6)",
    [m.placa_id, m.cliente_id, `infosimples:${servico}`, custo, ok ? "ok" : "erro", ok ? null : json?.code_message ?? null]);
  if (!ok) throw new Error(`SENATRAN: ${json?.code_message ?? json?.code ?? "erro"}`);
}

async function chamar(servico: string, params: Record<string, string>) {
  if (!modoSimulado()) return (await chamarServico(servico, params)).json;
  if (servico === "senatran/download-infracao") {
    return { code: 200, header: { price: "0" }, data: [{
      autuacao: { numero_ait: "AI10075509", orgao_autuador: "BHTrans", data_notificacao: "12/11/2026", data_limite_defesa: "12/12/2026", data_limite_indicacao_infrator: "12/12/2026" },
      infracao: { codigo_infracao: "5509", descricao: "Parar sobre a faixa de pedestres", valor_multa: "130,16" },
      local_data_hora: { data_infracao: "08/11/2026", hora_infracao: "14:32", local_infracao: "Av. Afonso Pena, 1500", municipio: "Belo Horizonte", uf: "MG" },
      veiculo: { placa: params.placa, marca_modelo_versao: "VW/Delivery", especie: "Carga" },
    }] };
  }
  return { code: 200, header: { price: "0" }, data: [{ codigo_barras: "85890000001 2 30160000000 0 00000000000 1 12345678901 2", normalizado_valor: 130.16, normalizado_valor_a_pagar: 78.1, vencimento_data: "12/12/2026" }] };
}

/** Página imprimível da notificação quando a fonte devolve os dados e não o PDF. Sem dados do proprietário/condutor. */
function htmlNotificacao(auto: string, d: any): string {
  const linha = (r: string, v: unknown) => (v === null || v === undefined || v === "" ? "" : `<tr><th>${esc(r)}</th><td>${esc(v)}</td></tr>`);
  const bloco = (t: string, o: any, campos: Array<[string, string]>) => {
    const rows = campos.map(([k, r]) => linha(r, o?.[k])).join("");
    return rows ? `<h2>${esc(t)}</h2><table>${rows}</table>` : "";
  };
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Notificação ${esc(auto)}</title>
<style>body{font-family:Arial,sans-serif;color:#0b2545;max-width:780px;margin:24px auto;padding:0 16px}h1{font-size:20px}h2{font-size:14px;margin:18px 0 6px;color:#1d4ed8;text-transform:uppercase;letter-spacing:.06em}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;width:38%;color:#5b6b82;font-weight:normal;padding:4px 8px;border-bottom:1px solid #e3e7ee}td{padding:4px 8px;border-bottom:1px solid #e3e7ee}.nota{font-size:11px;color:#5b6b82;margin-top:24px}</style></head><body>
<h1>Notificação de autuação · AIT ${esc(d?.autuacao?.numero_ait ?? auto)}</h1>
${bloco("Autuação", d?.autuacao, [["numero_ait", "Auto de infração"], ["orgao_autuador", "Órgão autuador"], ["codigo_orgao_autuador", "Código do órgão"], ["data_notificacao", "Data da notificação"], ["data_limite_defesa", "Prazo para defesa"], ["data_limite_indicacao_infrator", "Prazo para indicar o condutor"]])}
${bloco("Infração", d?.infracao, [["codigo_infracao", "Código"], ["desdobramento", "Desdobramento"], ["descricao", "Descrição"], ["valor_multa", "Valor"], ["limite_regulamentado", "Limite regulamentado"], ["medicao_realizada", "Medição realizada"], ["valor_considerado", "Valor considerado"], ["renainf", "RENAINF"]])}
${bloco("Local, data e hora", d?.local_data_hora, [["data_infracao", "Data"], ["hora_infracao", "Hora"], ["local_infracao", "Local"], ["municipio", "Município"], ["uf", "UF"]])}
${bloco("Veículo", d?.veiculo, [["placa", "Placa"], ["marca_modelo_versao", "Marca/modelo"], ["especie", "Espécie"]])}
<p class="nota">Dados obtidos no SENATRAN (SNE) pelo Vigia Placa. Documento guardado por 60 dias.</p></body></html>`;
}

/** Baixa a notificação da multa no SNE e guarda por 60 dias; atualiza a data da notificação. */
export async function baixarNotificacaoSne(db: Db, multaId: string) {
  const { m, params } = await multaComAcesso(db, multaId);
  const json = await chamar("senatran/download-infracao", params);
  await registrar(db, m, "senatran/download-infracao", "SENATRAN · notificação (SNE)", json);
  const d = dados(json);
  const notificada = dataParaISO(d?.autuacao?.data_notificacao);
  if (notificada) {
    await db.q("update multas set notificada_em = coalesce(notificada_em, $2), estado = case when estado = 'detectada' then 'notificada' else estado end where id = $1", [m.id, notificada]);
  }
  const pdf = await pdfDaResposta(json);
  const doc = pdf
    ? { mime: pdf.mime, base64: pdf.base64, nome: `notificacao-${m.placa}-${m.auto_infracao}.pdf`, origemUrl: pdf.url }
    : { mime: "text/html; charset=utf-8", base64: Buffer.from(htmlNotificacao(m.auto_infracao, d)).toString("base64"), nome: `notificacao-${m.placa}-${m.auto_infracao}.html`, origemUrl: null };
  return guardarDocumento(db, { clienteId: m.cliente_id, multaId: m.id, tipo: "notificacao_sne", ...doc });
}

/** Boleto pelo SNE, já com o desconto quando o órgão e o proprietário aderiram. Grava a linha digitável e guarda o PDF. */
export async function boletoSne(db: Db, multaId: string) {
  const { m, params } = await multaComAcesso(db, multaId);
  const json = await chamar("senatran/boleto-infracao", { ...params, obter_desconto: "1" });
  await registrar(db, m, "senatran/boleto-infracao", "SENATRAN · boleto (SNE)", json);
  const d = dados(json);
  const codigo = String(d?.codigo_barras ?? "").replace(/\D/g, "") || null;
  if (codigo) await db.q("update multas set linha_digitavel = $2 where id = $1", [m.id, codigo]);
  const pdf = await pdfDaResposta(json);
  if (pdf) await guardarDocumento(db, { clienteId: m.cliente_id, multaId: m.id, tipo: "boleto", mime: pdf.mime, base64: pdf.base64, nome: `boleto-sne-${m.placa}-${m.auto_infracao}.pdf`, origemUrl: pdf.url });
  const aPagar = reaisParaCentavos(d?.normalizado_valor_a_pagar ?? d?.valor_a_pagar);
  const vence = dataParaISO(d?.vencimento_data);
  return { codigo, temPdf: !!pdf, texto: [aPagar ? `valor a pagar ${brl(aPagar)}` : null, vence ? `vence em ${dataBR(vence)}` : null].filter(Boolean).join(", ") };
}
