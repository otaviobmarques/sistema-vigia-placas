import { normalizarFrequencia } from "./domain/monitoramento";

/** Lê o par select + "nº de dias" do CampoFrequencia. Retorna null quando o usuário escolheu "Padrão". */
export function lerFrequencia(f: FormData, nome: string): string | null {
  const dias = String(f.get(`${nome}__dias`) ?? "").trim();
  if (dias) return normalizarFrequencia(dias);
  const v = String(f.get(nome) ?? "").trim();
  return v ? normalizarFrequencia(v) : null;
}
