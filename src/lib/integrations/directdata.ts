/**
 * Direct Data · Consulta Veicular Serpro - Multas Radar (nacional, só placa e Renavam).
 * Doc: https://directd.com.br/central-de-ajuda/apis/catalogo/ConsultaVeicularMultasRadar
 * Cobra só consultas com sucesso (termos de uso). Sem DIRECTDATA_TOKEN, a fonte fica desligada.
 *
 * A resposta traz nome e documento do proprietário: o Vigia Placa NÃO guarda esses dados.
 */
import { GRAVIDADES, type Gravidade } from "../domain/ctb";
import { hojeISO } from "../domain/dates";
import { dataParaISO, reaisParaCentavos, type MultaEncontrada, type ResultadoFonte } from "./infosimples";

export const SERVICO_DIRECTDATA = "directdata/multas-radar";
export const directDataAtiva = () => !!process.env.DIRECTDATA_TOKEN;
const CUSTO = 36; // R$ 0,36 por consulta com sucesso

export async function chamarDirectData(placa: string, renavam: string): Promise<any> {
  const url = new URL("https://apiv3.directd.com.br/api/ConsultaVeicularMultasRadar");
  url.searchParams.set("Placa", placa);
  url.searchParams.set("Renavam", renavam);
  url.searchParams.set("TOKEN", process.env.DIRECTDATA_TOKEN!);
  const res = await fetch(url, { headers: { "user-agent": "VigiaPlaca/1.0", accept: "application/json" }, signal: AbortSignal.timeout(90_000) });
  return res.json().catch(() => ({ metaDados: { resultado: `HTTP ${res.status}`, mensagem: "resposta não é JSON" } }));
}

/** Interpreta a resposta (exportado para testes e para "Testar fonte"). */
export function interpretarDirectData(json: any): ResultadoFonte {
  const meta = json?.metaDados ?? {};
  const resultado = String(meta.resultado ?? "");
  const codigo = Number(meta.resultadoId) || null;
  const retorno = json?.retorno;
  if (meta.assincrono && !retorno) {
    return { servico: SERVICO_DIRECTDATA, ok: false, codigo, multas: [], custo: 0, erro: `Consulta assíncrona ainda sem resultado (${resultado})` };
  }
  const sucesso = /sucesso/i.test(resultado) || (!!retorno && !/inv[aá]lid|n[aã]o autorizad|erro|falha|n[aã]o suportad/i.test(resultado));
  const nadaConsta = /nada consta|nenhum|sem registro|n[aã]o (foram )?encontrad/i.test(`${resultado} ${meta.mensagem ?? ""}`);
  if (!sucesso && !nadaConsta) {
    return { servico: SERVICO_DIRECTDATA, ok: false, codigo, multas: [], custo: 0, erro: `${resultado || "erro"}: ${meta.mensagem ?? ""}`.trim() };
  }
  const itens: any[] = Array.isArray(retorno?.infracoes) ? retorno.infracoes : [];
  const vistas = new Map<string, MultaEncontrada>();
  for (const it of itens) {
    const m = normalizar(it, retorno);
    if (m) vistas.set(`${m.autoInfracao}|${m.codigoInfracao}`, m);
  }
  return { servico: SERVICO_DIRECTDATA, ok: true, codigo, multas: [...vistas.values()], custo: sucesso ? CUSTO : 0 };
}

function gravidadeDe(texto: any, pontos: number | null, valor: number): Gravidade {
  const t = String(texto ?? "").toLowerCase();
  if (t.includes("gravíssima") || t.includes("gravissima")) return "gravissima";
  if (t.includes("grave")) return "grave";
  if (t.includes("média") || t.includes("media")) return "media";
  if (t.includes("leve")) return "leve";
  if (pontos === 7) return "gravissima";
  if (pontos === 5) return "grave";
  if (pontos === 4) return "media";
  if (pontos === 3) return "leve";
  if (valor >= GRAVIDADES.gravissima.valor) return "gravissima";
  if (valor >= GRAVIDADES.grave.valor) return "grave";
  if (valor >= GRAVIDADES.media.valor) return "media";
  return "leve";
}

function normalizar(it: any, retorno: any): MultaEncontrada | null {
  const d = it?.detalhes ?? {};
  const auto = String(d.numeroAutoInfracao ?? it.numeroAutoInfracao ?? d.codigoRenainf ?? "").trim();
  if (!auto) return null;
  const situacao = String(it.situacao ?? d.status ?? "").toLowerCase();
  if (/\b(paga|pago|quitad|cancelad|arquivad|baixad)/.test(situacao) && !/a pagar|n[aã]o pag/.test(situacao)) return null;
  const valor = reaisParaCentavos(d.valor ?? it.valor);
  const pontosN = Number(d.pontos);
  const pontos = Number.isFinite(pontosN) && pontosN > 0 ? pontosN : null;
  const gravidade = gravidadeDe(d.gravidade, pontos, valor);
  const orgaoNome = String(d.orgaoAutuador ?? "Órgão não informado").trim();
  const dataHora = d.dataHora ?? it.dataInfracao;
  const local = [d.local, d.municipio, d.ufCometimento].filter(Boolean).join(" · ") || null;
  const radar = d.medicaoConsiderada && d.limitePermitido ? ` (medido ${d.medicaoConsiderada}${d.unidadeMedida ?? ""}, limite ${d.limitePermitido}${d.unidadeMedida ?? ""})` : "";
  return {
    orgaoId: orgaoNome.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "ORGAO-DESCONHECIDO",
    orgaoNome,
    autoInfracao: auto,
    codigoInfracao: String(d.infracao ?? "").replace(/\D/g, "").slice(0, 8) || "0000",
    descricao: String(d.descricao ?? it.descricaoInfracao ?? "Infração de trânsito").trim() + radar,
    gravidade,
    pontos: pontos ?? GRAVIDADES[gravidade].pontos,
    valor,
    dataInfracao: dataParaISO(dataHora) ?? dataParaISO(it.dataInfracao) ?? hojeISO(),
    hora: String(dataHora ?? "").match(/\b(\d{2}:\d{2})/)?.[1] ?? null,
    local,
    notificadaEm: null,
    vencimento: null,
    linhaDigitavel: null,
  };
}

export async function consultarDirectData(placa: string, renavam: string): Promise<ResultadoFonte> {
  try {
    return interpretarDirectData(await chamarDirectData(placa, renavam));
  } catch (e: any) {
    return { servico: SERVICO_DIRECTDATA, ok: false, codigo: null, multas: [], custo: 0, erro: e?.message ?? String(e) };
  }
}
