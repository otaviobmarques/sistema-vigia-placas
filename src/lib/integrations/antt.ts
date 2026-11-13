/**
 * ANTT / SIFAMA via Infosimples ("ANTT / SIFAMA / Consultar Multas"). Multas regulatórias de transporte
 * (RNTRC, vale-pedágio, frete/CIOT, produtos perigosos, excesso de peso fiscalizado pela ANTT), lançadas
 * contra o CNPJ/CPF do transportador. Exige o login e a senha do SIFAMA do próprio cliente.
 * Doc: https://infosimples.com/consultas/antt-sifama-consultar-multas/
 *
 * A documentação pública não detalha os campos de cada infração; a leitura abaixo aceita os nomes usuais
 * e guarda o item original em `dados` para conferência.
 */
import { chamarServico, dataParaISO, erroDeConta, modoSimulado, reaisParaCentavos } from "./infosimples";
import { hojeISO, somarDias, type DataISO } from "../domain/dates";

export const SERVICO_ANTT = "antt/sifama/consultar-multas";
export const FONTE_ANTT = `infosimples:${SERVICO_ANTT}`;

export interface MultaAntt {
  auto: string;
  processo: string | null;
  codigo: string | null;
  descricao: string | null;
  tipoFiscalizacao: string | null;
  orgao: string | null;
  placa: string | null;
  dataInfracao: DataISO | null;
  vencimento: DataISO | null;
  valor: number;
  situacao: string | null;
  impeditiva: boolean | null;
  dados: Record<string, unknown>;
}

export interface ResumoAntt {
  impeditivas: { qtd: number; valor: number };
  naoImpeditivas: { qtd: number; valor: number };
  suspensaoJudicial: { qtd: number; valor: number };
  debitoTotal: number;
}

export interface ResultadoAntt {
  ok: boolean;
  codigo: number | null;
  custo: number;
  multas: MultaAntt[];
  resumo: ResumoAntt | null;
  erro?: string;
  contaInvalida?: boolean;
}

const primeiro = (o: any, ...ks: string[]) => {
  for (const k of ks) if (o?.[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return null;
};
const num = (v: any) => (v === null || v === undefined || v === "" ? 0 : Number(String(v).replace(/\D/g, "")) || 0);
const texto = (v: any) => (v === null || v === undefined || v === "" ? null : String(v).trim());

function lerMulta(b: any, tipoPadrao: string | null): MultaAntt | null {
  const auto = texto(primeiro(b, "nr_doc", "numero_auto", "auto_infracao", "auto", "ait", "numero_ait", "nr_auto", "numero"));
  if (!auto) return null;
  const situacao = texto(primeiro(b, "situacao", "status", "fase", "situacao_debito"));
  const impTexto = String(primeiro(b, "impeditiva", "tipo_multa", "classificacao") ?? situacao ?? "").toLowerCase();
  const impeditiva = typeof b?.impeditiva === "boolean" ? b.impeditiva
    : /n[ãa]o[\s-]*impeditiv/.test(impTexto) ? false
    : /impeditiv/.test(impTexto) ? true
    : null;
  return {
    auto,
    processo: texto(primeiro(b, "nr_processo", "processo", "numero_processo")),
    codigo: texto(primeiro(b, "codigo", "codigo_infracao", "enquadramento_codigo")),
    descricao: texto(primeiro(b, "descricao", "infracao", "descricao_infracao", "enquadramento", "resolucao")),
    tipoFiscalizacao: texto(primeiro(b, "tipo_fiscalizacao", "fiscalizacao", "tipo")) ?? tipoPadrao,
    orgao: texto(primeiro(b, "orgao", "orgao_autuador")) ?? "ANTT",
    placa: texto(primeiro(b, "placa", "placa_veiculo"))?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null,
    dataInfracao: dataParaISO(primeiro(b, "data_ocorrencia", "data_infracao", "data_autuacao", "data")),
    vencimento: dataParaISO(primeiro(b, "vencimento", "data_vencimento", "boleto_vencimento")),
    valor: reaisParaCentavos(primeiro(b, "normalizado_valor", "valor_multa", "valor_reais", "valor", "valor_atualizado", "valor_original")),
    situacao,
    impeditiva,
    dados: b,
  };
}

/** Multa paga, cancelada, arquivada ou com débito quitado não está mais em aberto. */
export const anttEncerrada = (m: MultaAntt) => /\b(paga|pago|quitad[ao]s?|cancelad[ao]s?|arquivad[ao]s?|baixad[ao]s?|extint[ao]s?)\b/i.test(m.situacao ?? "") && !/a pagar|n[ãa]o pag/i.test(m.situacao ?? "");

/** Interpreta a resposta do serviço (exportado para testes e para o "Testar acesso"). */
export function interpretarAntt(json: any): ResultadoAntt {
  const codigo = typeof json?.code === "number" ? json.code : Number(json?.code) || null;
  const custo = Math.round(Number(json?.header?.price ?? 0) * 100) || 0;
  if (codigo === 612) return { ok: true, codigo, custo, multas: [], resumo: { impeditivas: { qtd: 0, valor: 0 }, naoImpeditivas: { qtd: 0, valor: 0 }, suspensaoJudicial: { qtd: 0, valor: 0 }, debitoTotal: 0 } };
  if (codigo !== 200) {
    const erro = `${codigo ?? "?"} ${[json?.code_message, ...(Array.isArray(json?.errors) ? json.errors : [])].filter(Boolean).join(" · ")}`.trim();
    return { ok: false, codigo, custo, multas: [], resumo: null, erro, contaInvalida: /senha|login|usu[aá]rio|credencia|acesso negado|autentica/i.test(erro) || erroDeConta({ codigo, erro }) };
  }
  const blocos: any[] = (Array.isArray(json?.data) ? json.data : [json?.data]).filter(Boolean);
  const multas = new Map<string, MultaAntt>();
  const resumo: ResumoAntt = { impeditivas: { qtd: 0, valor: 0 }, naoImpeditivas: { qtd: 0, valor: 0 }, suspensaoJudicial: { qtd: 0, valor: 0 }, debitoTotal: 0 };
  for (const d of blocos) {
    const reps: any[] = Array.isArray(d?.cnpj_representados) ? d.cnpj_representados : [d];
    for (const r of reps) {
      resumo.impeditivas.qtd += num(r?.qtd_multas_impeditivas);
      resumo.impeditivas.valor += reaisParaCentavos(r?.normalizado_multas_impeditivas_reais ?? r?.multas_impeditivas_reais);
      resumo.naoImpeditivas.qtd += num(r?.qtd_multas_nao_impeditivas);
      resumo.naoImpeditivas.valor += reaisParaCentavos(r?.normalizado_multas_nao_impeditivas_reais ?? r?.multas_nao_impeditivas_reais);
      resumo.suspensaoJudicial.qtd += num(r?.qtd_multas_suspensao_judicial);
      resumo.suspensaoJudicial.valor += reaisParaCentavos(r?.normalizado_multas_suspensao_judicial_reais ?? r?.multas_suspensao_judicial);
      resumo.debitoTotal += reaisParaCentavos(r?.normalizado_total_debito_reais ?? r?.total_debito_reais);
      const lista: any[] = Array.isArray(r?.infracoes) ? r.infracoes : [];
      for (const item of lista) {
        // As infrações podem vir agrupadas por tipo (impeditivas / não impeditivas) com a lista dentro.
        const filhos = Object.values(item ?? {}).find((v) => Array.isArray(v)) as any[] | undefined;
        const tipo = texto(primeiro(item, "tipo", "classificacao", "titulo"));
        for (const b of filhos && !lerMulta(item, null) ? filhos : [item]) {
          const m = lerMulta(b, null);
          if (!m) continue;
          if (m.impeditiva === null && tipo) m.impeditiva = /n[ãa]o[\s-]*impeditiv/i.test(tipo) ? false : /impeditiv/i.test(tipo) ? true : null;
          multas.set(m.auto, m);
        }
      }
    }
  }
  return { ok: true, codigo, custo, multas: [...multas.values()], resumo };
}

export function parametrosAntt(login: string, senha: string, cnpjRepresentado: string | null) {
  const l = login.replace(/\D/g, "");
  const p: Record<string, string> = { login_senha: senha };
  if (l.length === 14) p.login_cnpj = l;
  else p.login_cpf = l;
  if (cnpjRepresentado) p.cnpj_representado = cnpjRepresentado.replace(/\D/g, "");
  return p;
}

export async function consultarAntt(login: string, senha: string, cnpjRepresentado: string | null): Promise<ResultadoAntt> {
  if (modoSimulado()) return simularAntt(cnpjRepresentado ?? login);
  try {
    const { json } = await chamarServico(SERVICO_ANTT, parametrosAntt(login, senha, cnpjRepresentado));
    return interpretarAntt(json);
  } catch (e: any) {
    return { ok: false, codigo: null, custo: 0, multas: [], resumo: null, erro: e?.message ?? String(e) };
  }
}

/** Sem token da Infosimples (ambiente local): duas multas de exemplo para ver as telas. */
function simularAntt(semente: string): ResultadoAntt {
  const h = hojeISO();
  const n = [...semente].reduce((a, c) => a + c.charCodeAt(0), 0);
  const multas: MultaAntt[] = [
    { auto: `ANTT${(n % 9000) + 1000}01`, processo: "50500.012345/2026-11", codigo: "5.0001", descricao: "Transportar carga sem inscrição válida no RNTRC", tipoFiscalizacao: "Cargas", orgao: "ANTT", placa: null, dataInfracao: somarDias(h, -40), vencimento: somarDias(h, 12), valor: 500000, situacao: "Aguardando pagamento", impeditiva: true, dados: {} },
    { auto: `ANTT${(n % 9000) + 1000}02`, processo: null, codigo: "1.0204", descricao: "Deixar de antecipar o vale-pedágio obrigatório", tipoFiscalizacao: "Vale-pedágio", orgao: "ANTT", placa: null, dataInfracao: somarDias(h, -75), vencimento: somarDias(h, -5), valor: 55000, situacao: "Em cobrança", impeditiva: false, dados: {} },
  ];
  return { ok: true, codigo: 200, custo: 0, multas, resumo: { impeditivas: { qtd: 1, valor: 500000 }, naoImpeditivas: { qtd: 1, valor: 55000 }, suspensaoJudicial: { qtd: 0, valor: 0 }, debitoTotal: 555000 } };
}
