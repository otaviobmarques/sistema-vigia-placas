/** Selo "pode / não pode dirigir" de um condutor (regra em lib/domain/condutores › podeDirigir). */
export function PodeDirigir({ pode, compacto = false }: { pode: { pode: boolean; motivos: string[] }; compacto?: boolean }) {
  const impedimentos = pode.motivos.filter((m) => m !== "validade da CNH não informada");
  return pode.pode
    ? <span className="inline-flex rounded-full bg-economia-100 px-2 py-0.5 text-xs font-bold text-economia" title={pode.motivos.join(", ") || "em dia"}>✓ {compacto ? "pode" : "Pode dirigir"}</span>
    : <span className="inline-flex rounded-full bg-rec px-2 py-0.5 text-xs font-bold text-white" title={impedimentos.join(", ")}>✕ {compacto ? "não pode" : `Não pode dirigir: ${impedimentos.join(", ")}`}</span>;
}
