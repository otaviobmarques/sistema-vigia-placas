/** Multa que chegou nas últimas 24 horas. */
export const ehNova = (criadoEm: string | Date | null | undefined) => !!criadoEm && Date.now() - new Date(criadoEm).getTime() < 24 * 3600 * 1000;

export function SeloNova() {
  return <span className="ml-1 inline-flex rounded-full bg-ambar px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-vigia">Nova</span>;
}
