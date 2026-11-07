import { sistema } from "@/lib/db";
import { normalizarFrequencia } from "@/lib/domain/monitoramento";

/** Plano como aparece no site. Tudo vem da tabela planos (editável em Backoffice › Planos e percentuais). */
export interface PlanoSite {
  id: string;
  nome: string;
  precoPlaca: number; // reais
  saving: number; // fração (0.2 = 20%)
  frase: string;
  frequencia: string;
  itens: string[];
  destaque: boolean;
}

function textoFrequencia(v: string): string {
  const f = normalizarFrequencia(v);
  if (f === "adaptativa") return "Consulta adaptativa: diária quando há risco";
  const n = Number(f);
  return n === 1 ? "Consulta diária em todas as placas" : n === 7 ? "Consulta semanal" : n === 15 ? "Consulta quinzenal" : `Consulta a cada ${n} dias`;
}

/** Planos com preço definido, do mais barato ao mais caro. */
export async function carregarPlanosSite(): Promise<PlanoSite[]> {
  return sistema(async (db) => {
    const cfg = await db.one<{ saving_bps: number }>("select saving_bps from configuracao");
    const linhas = await db.q("select * from planos where preco_placa is not null order by preco_placa");
    return linhas.map((p: any) => ({
      id: p.id,
      nome: p.nome,
      precoPlaca: p.preco_placa / 100,
      saving: (p.saving_bps ?? cfg?.saving_bps ?? 0) / 10000,
      frase: p.frase_site ?? "",
      frequencia: textoFrequencia(p.frequencia),
      itens: String(p.itens_site || p.inclui || "").split(/\n|,\s*/).map((s: string) => s.trim()).filter(Boolean),
      destaque: !!p.destaque_site,
    }));
  });
}
