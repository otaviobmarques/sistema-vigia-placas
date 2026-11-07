/**
 * Infosimples — fonte principal do MVP (consultas a Detrans, DERs e órgãos por placa e Renavam).
 * Sem INFOSIMPLES_TOKEN, roda em modo simulado com multas determinísticas por placa.
 *
 * ATENÇÃO: o formato exato do retorno varia por serviço/órgão. O normalizador abaixo
 * aceita os nomes de campo mais comuns; valide com a primeira resposta real da conta.
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

export interface ResultadoConsulta {
  ok: boolean;
  multas: MultaEncontrada[];
  custo: number; // centavos
  erro?: string;
  simulado: boolean;
}

export const modoSimulado = () => !process.env.INFOSIMPLES_TOKEN;

export async function consultarMultas(placa: string, renavam: string, uf: string): Promise<ResultadoConsulta> {
  if (modoSimulado()) return simular(placa, uf);
  const servico = (process.env.INFOSIMPLES_SERVICE ?? "detran/{uf}/veiculo").replace("{uf}", uf.toLowerCase());
  try {
    const res = await fetch(`https://api.infosimples.com/api/v2/consultas/${servico}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: process.env.INFOSIMPLES_TOKEN!, placa, renavam, timeout: "300" }),
      signal: AbortSignal.timeout(320_000),
    });
    const json: any = await res.json();
    const custo = Math.round(Number(json?.header?.price ?? 0.2) * 100);
    if (json.code !== 200) return { ok: false, multas: [], custo, erro: `${json.code} ${json.code_message ?? ""}`.trim(), simulado: false };
    const brutas: any[] = (json.data ?? []).flatMap((d: any) => d.multas ?? d.infracoes ?? d.autuacoes ?? []);
    return { ok: true, multas: brutas.map((b) => normalizar(b, uf)).filter(Boolean) as MultaEncontrada[], custo, simulado: false };
  } catch (e: any) {
    return { ok: false, multas: [], custo: 0, erro: e?.message ?? String(e), simulado: false };
  }
}

function dataBRparaISO(s: any): DataISO | null {
  if (!s) return null;
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const iso = String(s).match(/\d{4}-\d{2}-\d{2}/);
  return iso ? iso[0] : null;
}
function reaisParaCentavos(v: any): number {
  if (typeof v === "number") return Math.round(v * 100);
  const s = String(v ?? "0").replace(/[R$\s.]/g, "").replace(",", ".");
  return Math.round(Number(s) * 100) || 0;
}
function gravidadePorValor(c: number, texto?: string): Gravidade {
  const t = (texto ?? "").toLowerCase();
  if (t.includes("gravíssima") || t.includes("gravissima")) return "gravissima";
  if (t.includes("grave")) return "grave";
  if (t.includes("média") || t.includes("media")) return "media";
  if (t.includes("leve")) return "leve";
  if (c >= GRAVIDADES.gravissima.valor) return "gravissima";
  if (c >= GRAVIDADES.grave.valor) return "grave";
  if (c >= GRAVIDADES.media.valor) return "media";
  return "leve";
}

function normalizar(b: any, uf: string): MultaEncontrada | null {
  const auto = b.auto_infracao ?? b.numero_auto ?? b.ait ?? b.auto;
  if (!auto) return null;
  const valor = reaisParaCentavos(b.valor ?? b.valor_multa ?? b.valor_original);
  const gravidade = gravidadePorValor(valor, b.gravidade);
  const orgaoNome = String(b.orgao_autuador ?? b.orgao ?? `Detran-${uf}`);
  return {
    orgaoId: String(b.codigo_orgao ?? orgaoNome).toUpperCase().replace(/\s+/g, "-").slice(0, 40),
    orgaoNome,
    autoInfracao: String(auto),
    codigoInfracao: String(b.codigo_infracao ?? b.enquadramento ?? b.codigo ?? "0000"),
    descricao: String(b.descricao ?? b.infracao ?? b.descricao_infracao ?? "Infração de trânsito"),
    gravidade,
    pontos: Number(b.pontos ?? GRAVIDADES[gravidade].pontos),
    valor,
    dataInfracao: dataBRparaISO(b.data_infracao ?? b.data ?? b.data_hora) ?? hojeISO(),
    hora: b.hora ?? (String(b.data_hora ?? "").match(/\d{2}:\d{2}/)?.[0] ?? null),
    local: b.local ?? b.local_infracao ?? null,
    notificadaEm: dataBRparaISO(b.data_notificacao ?? b.data_emissao),
    vencimento: dataBRparaISO(b.vencimento ?? b.data_vencimento),
    linhaDigitavel: b.linha_digitavel ?? b.codigo_barras ?? null,
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
function simular(placa: string, uf: string): ResultadoConsulta {
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
