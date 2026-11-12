/**
 * Infosimples — fonte principal do MVP (consultas a Detrans, PRF e prefeituras por placa e Renavam).
 * Cada placa é consultada na fonte do estado dela (quando há uma que funciona só com placa e Renavam)
 * e na PRF, em paralelo. Sem INFOSIMPLES_TOKEN, roda em modo simulado.
 *
 * Catálogo oficial: https://infosimples.com/consultas/ (lista em /consultas/apis.json).
 * A Infosimples não publica exemplos de resposta; o normalizador aceita os nomes de campo
 * documentados para cada serviço. Use "Testar fonte" no backoffice para conferir com um token real.
 */
import { GRAVIDADES, type Gravidade } from "../domain/ctb";
import { somarDias, hojeISO, type DataISO } from "../domain/dates";

export interface MultaEncontrada {
  orgaoId: string;
  orgaoNome: string;
  autoInfracao: string;
  codigoInfracao: string;
  descricao: string;
  gravidade: Gravidade;
  pontos: number;
  valor: number; // centavos
  dataInfracao: DataISO;
  hora: string | null;
  local: string | null;
  notificadaEm: DataISO | null;
  vencimento: DataISO | null;
  linhaDigitavel: string | null;
}

export interface FonteInfosimples {
  /** Caminho do serviço na API (ex.: "prf/infracoes"). */
  servico: string;
  nome: string;
  /** UF do veículo em que a fonte é usada; "*" = todas. */
  uf: string;
  /** Órgão atribuído quando a resposta não diz qual é. */
  orgaoPadrao: { id: string; nome: string };
  /** Parâmetros enviados. "documento" vira cpf ou cnpj conforme o dono. */
  parametros: Array<"placa" | "renavam" | "documento">;
  /** Custo adicional da consulta (R$), além do preço-base da faixa de volume. */
  extra: number;
  /** Fonte que aceita login gov.br/certificado: só placa e Renavam podem não bastar. Confirmar com o teste. */
  aConfirmar?: boolean;
}

/** Fontes que funcionam só com placa e Renavam (sem login gov.br nem certificado do proprietário). */
export const FONTES: FonteInfosimples[] = [
  { servico: "prf/infracoes", nome: "PRF · rodovias federais", uf: "*", orgaoPadrao: { id: "PRF", nome: "Polícia Rodoviária Federal" }, parametros: ["placa", "renavam"], extra: 0.04 },
  { servico: "detran/al/infracoes", nome: "Detran-AL", uf: "AL", orgaoPadrao: { id: "DETRAN-AL", nome: "Detran-AL" }, parametros: ["placa", "renavam"], extra: 0.04 },
  { servico: "detran/am/multas", nome: "Detran-AM", uf: "AM", orgaoPadrao: { id: "DETRAN-AM", nome: "Detran-AM" }, parametros: ["placa", "renavam"], extra: 0.04 },
  { servico: "detran/ce/multas", nome: "Detran-CE", uf: "CE", orgaoPadrao: { id: "DETRAN-CE", nome: "Detran-CE" }, parametros: ["placa", "renavam"], extra: 0 },
  { servico: "detran/ma/multas", nome: "Detran-MA", uf: "MA", orgaoPadrao: { id: "DETRAN-MA", nome: "Detran-MA" }, parametros: ["placa", "renavam"], extra: 0.04 },
  { servico: "detran/ms/multas", nome: "Detran-MS", uf: "MS", orgaoPadrao: { id: "DETRAN-MS", nome: "Detran-MS" }, parametros: ["placa", "renavam"], extra: 0 },
  { servico: "detran/pa/infracoes", nome: "Detran-PA", uf: "PA", orgaoPadrao: { id: "DETRAN-PA", nome: "Detran-PA" }, parametros: ["placa", "renavam"], extra: 0.04 },
  { servico: "detran/pi/multas", nome: "Detran-PI", uf: "PI", orgaoPadrao: { id: "DETRAN-PI", nome: "Detran-PI" }, parametros: ["placa", "renavam"], extra: 0 },
  { servico: "detran/rr/debitos", nome: "Detran-RR", uf: "RR", orgaoPadrao: { id: "DETRAN-RR", nome: "Detran-RR" }, parametros: ["placa", "renavam"], extra: 0.04 },
  { servico: "detran/rj/multas-guias", nome: "Detran-RJ", uf: "RJ", orgaoPadrao: { id: "DETRAN-RJ", nome: "Detran-RJ" }, parametros: ["renavam", "documento"], extra: 0.04 },
  { servico: "detran/mg/multas-extrato", nome: "Detran-MG", uf: "MG", orgaoPadrao: { id: "DETRAN-MG", nome: "Detran-MG" }, parametros: ["placa", "renavam"], extra: 0.08, aConfirmar: true },
];

/** UFs cujas fontes de multas exigem login gov.br ou certificado do proprietário (fora do padrão do produto). */
export const UFS_EXIGEM_LOGIN = ["SP", "PR", "BA", "DF", "GO", "RS", "SC"];

export function fontesParaUf(uf: string): FonteInfosimples[] {
  return FONTES.filter((f) => f.uf === "*" || f.uf === uf.toUpperCase());
}

export interface ResultadoFonte {
  servico: string;
  ok: boolean;
  /** Código de retorno da Infosimples (200 = ok; 612 = consulta sem dados). */
  codigo: number | null;
  multas: MultaEncontrada[];
  custo: number; // centavos
  erro?: string;
}

export interface ResultadoConsulta {
  ok: boolean;
  multas: MultaEncontrada[];
  custo: number; // centavos
  erro?: string;
  simulado: boolean;
  detalhes: ResultadoFonte[];
}

export const modoSimulado = () => !process.env.INFOSIMPLES_TOKEN;

/** Códigos que significam "consultou e não há nada": não são erro da fonte. */
const SEM_DADOS = new Set([612]);
/** Problemas da conta (token inválido, sem saldo): não são culpa da fonte e não a desligam. */
export function erroDeConta(r: Pick<ResultadoFonte, "codigo" | "erro">): boolean {
  return r.codigo === 601 || /saldo|cr[ée]dito insuficiente|token/i.test(r.erro ?? "");
}

export async function chamarServico(servico: string, params: Record<string, string>): Promise<{ status: number; json: any }> {
  const res = await fetch(`https://api.infosimples.com/api/v2/consultas/${servico}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "VigiaPlaca/1.0" },
    body: new URLSearchParams({ token: process.env.INFOSIMPLES_TOKEN!, timeout: "150", ...params }),
    signal: AbortSignal.timeout(170_000),
  });
  return { status: res.status, json: await res.json().catch(() => ({ code: res.status, code_message: "resposta não é JSON" })) };
}

export function montarParametros(f: FonteInfosimples, v: { placa: string; renavam: string; documento?: string | null }) {
  const p: Record<string, string> = {};
  for (const k of f.parametros) {
    if (k === "placa") p.placa = v.placa;
    if (k === "renavam") p.renavam = v.renavam;
    if (k === "documento" && v.documento) p[v.documento.length === 14 ? "cnpj" : "cpf"] = v.documento;
  }
  return p;
}

/** Interpreta a resposta de um serviço (exportado para testes e para a tela "Testar fonte"). */
export function interpretarResposta(f: FonteInfosimples, json: any): ResultadoFonte {
  const codigo = typeof json?.code === "number" ? json.code : Number(json?.code) || null;
  const custo = Math.round(Number(json?.header?.price ?? 0) * 100) || 0;
  if (codigo === 200 || (codigo !== null && SEM_DADOS.has(codigo))) {
    const multas = codigo === 200 ? extrairMultas(json?.data ?? [], f) : [];
    return { servico: f.servico, ok: true, codigo, multas, custo };
  }
  const detalhe = [json?.code_message, ...(Array.isArray(json?.errors) ? json.errors : [])].filter(Boolean).join(" · ");
  return { servico: f.servico, ok: false, codigo, multas: [], custo, erro: `${codigo ?? "?"} ${detalhe}`.trim() };
}

export async function consultarMultas(
  placa: string,
  renavam: string,
  uf: string,
  opts: { documento?: string | null; desligadas?: Set<string> } = {},
): Promise<ResultadoConsulta> {
  if (modoSimulado()) {
    const r = simular(placa, uf);
    return { ...r, detalhes: [{ servico: "simulado", ok: true, codigo: 200, multas: r.multas, custo: r.custo }] };
  }
  const fontes = fontesParaUf(uf).filter((f) => !opts.desligadas?.has(f.servico));
  const detalhes = await Promise.all(
    fontes.map(async (f): Promise<ResultadoFonte> => {
      try {
        const { json } = await chamarServico(f.servico, montarParametros(f, { placa, renavam, documento: opts.documento }));
        return interpretarResposta(f, json);
      } catch (e: any) {
        return { servico: f.servico, ok: false, codigo: null, multas: [], custo: 0, erro: e?.message ?? String(e) };
      }
    }),
  );
  // Mesma multa vinda de duas fontes conta uma vez (chave: órgão + auto + código).
  const vistas = new Map<string, MultaEncontrada>();
  for (const m of detalhes.flatMap((d) => d.multas)) vistas.set(`${m.orgaoId}|${m.autoInfracao}|${m.codigoInfracao}`, m);
  const algumaOk = detalhes.some((d) => d.ok);
  return {
    ok: algumaOk,
    multas: [...vistas.values()],
    custo: detalhes.reduce((a, d) => a + d.custo, 0),
    erro: algumaOk ? undefined : detalhes.map((d) => `${d.servico}: ${d.erro}`).join(" | ") || "Nenhuma fonte disponível para esta UF",
    simulado: false,
    detalhes,
  };
}

// ---------------- Normalização ----------------

const CHAVES_LISTA = /multa|infrac|autuac|penalidade|debito|lista_aits/i;
const primeiro = (o: any, ...ks: string[]) => {
  for (const k of ks) if (o?.[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return null;
};

/** Percorre a resposta e devolve tudo que parece uma multa (tem número de auto de infração). */
export function extrairMultas(data: any, f: FonteInfosimples): MultaEncontrada[] {
  const itens: any[] = [];
  const visitar = (v: any, profundidade: number) => {
    if (profundidade > 4 || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x) => visitar(x, profundidade + 1));
    if (primeiro(v, "ait", "auto_infracao", "numero_auto", "numero_ait", "auto", "boleto_ait")) itens.push(v);
    for (const [k, filho] of Object.entries(v)) if (CHAVES_LISTA.test(k) && typeof filho === "object") visitar(filho, profundidade + 1);
  };
  visitar(data, 0);
  const out = new Map<string, MultaEncontrada>();
  for (const b of itens) {
    const m = normalizar(b, f);
    if (m) out.set(`${m.autoInfracao}|${m.codigoInfracao}`, m);
  }
  return [...out.values()];
}

export function dataParaISO(s: any): DataISO | null {
  if (!s) return null;
  const br = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = String(s).match(/\d{4}-\d{2}-\d{2}/);
  return iso ? iso[0] : null;
}

export function reaisParaCentavos(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Math.round(v * 100);
  const s = String(v).replace(/[R$\s]/g, "");
  // "1.234,56" (BR) ou "1234.56"
  const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function gravidadeDe(c: number, texto?: any, pontos?: number | null): Gravidade {
  const t = String(texto ?? "").toLowerCase();
  if (t.includes("gravíssima") || t.includes("gravissima")) return "gravissima";
  if (t.includes("grave")) return "grave";
  if (t.includes("média") || t.includes("media")) return "media";
  if (t.includes("leve")) return "leve";
  if (pontos === 7) return "gravissima";
  if (pontos === 5) return "grave";
  if (pontos === 4) return "media";
  if (pontos === 3) return "leve";
  if (c >= GRAVIDADES.gravissima.valor) return "gravissima";
  if (c >= GRAVIDADES.grave.valor) return "grave";
  if (c >= GRAVIDADES.media.valor) return "media";
  return "leve";
}

/** Multa já paga ou cancelada na fonte não entra como nova. */
function encerrada(b: any): boolean {
  const s = String(primeiro(b, "pagamento_situacao", "situacao", "status", "infracao_status", "fase") ?? "").toLowerCase();
  return /\b(paga|pago|quitad|cancelad|arquivad|baixad)/.test(s) && !/a pagar|não pag|nao pag/.test(s);
}

function normalizar(b: any, f: FonteInfosimples): MultaEncontrada | null {
  const auto = primeiro(b, "ait", "auto_infracao", "numero_auto", "numero_ait", "auto", "boleto_ait");
  if (!auto || encerrada(b)) return null;
  const valor = reaisParaCentavos(primeiro(b, "normalizado_valor", "normalizado_valor_devido", "valor", "valor_multa", "normalizado_boleto_valor", "boleto_valor", "valor_devido", "valor_total"));
  const pontosBrutos = Number(primeiro(b, "pontos", "pontuacao"));
  const pontos = Number.isFinite(pontosBrutos) && pontosBrutos > 0 ? pontosBrutos : null;
  const gravidade = gravidadeDe(valor, primeiro(b, "gravidade", "natureza", "tipo_infracao"), pontos);
  const orgaoNome = String(primeiro(b, "orgao_autuador", "orgao", "nome_orgao", "autuador") ?? f.orgaoPadrao.nome).trim();
  const codigoOrgao = primeiro(b, "codigo_orgao_autuador", "codigo_orgao");
  const dataHora = primeiro(b, "data_infracao", "datahora", "data_hora", "data_hora_infracao", "data");
  return {
    orgaoId: (orgaoNome === f.orgaoPadrao.nome ? f.orgaoPadrao.id : String(codigoOrgao ?? orgaoNome))
      .toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40),
    orgaoNome,
    autoInfracao: String(auto).trim(),
    codigoInfracao: String(primeiro(b, "codigo_infracao", "infracao_codigo", "codigo", "enquadramento", "amparo") ?? "0000").replace(/\D/g, "").slice(0, 8) || "0000",
    descricao: String(primeiro(b, "descricao", "infracao_descricao", "descricao_infracao", "infracao") ?? "Infração de trânsito").trim(),
    gravidade,
    pontos: pontos ?? GRAVIDADES[gravidade].pontos,
    valor,
    dataInfracao: dataParaISO(dataHora) ?? hojeISO(),
    hora: String(dataHora ?? "").match(/\b(\d{2}:\d{2})/)?.[1] ?? primeiro(b, "hora", "hora_infracao"),
    local: primeiro(b, "local", "local_infracao", "endereco"),
    notificadaEm: dataParaISO(primeiro(b, "data_notificacao", "expedicao", "data_emissao", "emissao", "data_expedicao")),
    vencimento: dataParaISO(primeiro(b, "boleto_vencimento", "vencimento", "data_vencimento")),
    linhaDigitavel: (primeiro(b, "boleto_linha_digitavel", "linha_digitavel", "boleto_codigo_barras", "codigo_barras") ?? "").toString().replace(/\D/g, "") || null,
  };
}

// ---------------- Modo simulado ----------------

const CATALOGO: Array<{ codigo: string; descricao: string; gravidade: Gravidade }> = [
  { codigo: "5452", descricao: "Estacionar em local proibido", gravidade: "media" },
  { codigo: "7455", descricao: "Excesso de velocidade até 20%", gravidade: "media" },
  { codigo: "7463", descricao: "Excesso de velocidade de 20% a 50%", gravidade: "grave" },
  { codigo: "6050", descricao: "Avançar sinal vermelho", gravidade: "gravissima" },
  { codigo: "5185", descricao: "Transitar em faixa exclusiva", gravidade: "media" },
  { codigo: "7366", descricao: "Usar celular ao volante", gravidade: "gravissima" },
  { codigo: "5185", descricao: "Deixar de dar preferência ao pedestre", gravidade: "gravissima" },
];
const ORGAOS_SIM: Record<string, Array<{ id: string; nome: string }>> = {
  MG: [{ id: "BHTRANS", nome: "BHTrans" }, { id: "DETRAN-MG", nome: "Detran-MG" }, { id: "DER-MG", nome: "DER-MG" }],
  SP: [{ id: "CET-SP", nome: "CET São Paulo" }, { id: "DETRAN-SP", nome: "Detran-SP" }],
  PR: [{ id: "DETRAN-PR", nome: "Detran-PR" }],
};

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** A cada janela de 21 dias, ~1 em 4 placas ganha uma multa nova. Determinístico por placa e janela. */
function simular(placa: string, uf: string): Omit<ResultadoConsulta, "detalhes"> {
  const hoje = hojeISO();
  const janela = Math.floor(Date.parse(hoje) / (21 * 86400000));
  const multas: MultaEncontrada[] = [];
  for (let j = janela - 2; j <= janela; j++) {
    const h = hash(`${placa}:${j}`);
    if (h % 4 !== 0) continue;
    const item = CATALOGO[h % CATALOGO.length];
    const orgaos = ORGAOS_SIM[uf] ?? [{ id: `DETRAN-${uf}`, nome: `Detran-${uf}` }];
    const orgao = orgaos[(h >>> 3) % orgaos.length];
    const inicioJanela = new Date(j * 21 * 86400000).toISOString().slice(0, 10);
    const dataInfracao = somarDias(inicioJanela, h % 7);
    if (dataInfracao > hoje) continue;
    const notificadaEm = somarDias(dataInfracao, 8 + (h % 5));
    const valor = GRAVIDADES[item.gravidade].valor;
    multas.push({
      orgaoId: orgao.id,
      orgaoNome: orgao.nome,
      autoInfracao: `S${(h % 100000000).toString().padStart(8, "0")}`,
      codigoInfracao: item.codigo,
      descricao: item.descricao,
      gravidade: item.gravidade,
      pontos: GRAVIDADES[item.gravidade].pontos,
      valor,
      dataInfracao,
      hora: `${String(7 + (h % 12)).padStart(2, "0")}:${String(h % 60).padStart(2, "0")}`,
      local: ["Av. Afonso Pena, 1500", "Av. do Contorno, 3200", "Rua da Bahia, 900", "Anel Rodoviário, km 12"][h % 4],
      notificadaEm: notificadaEm <= hoje ? notificadaEm : null,
      vencimento: notificadaEm <= hoje ? somarDias(notificadaEm, 40) : null,
      linhaDigitavel: null,
    });
  }
  return { ok: true, multas, custo: 20, simulado: true };
}
