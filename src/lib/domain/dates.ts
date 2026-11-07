/** Datas de negócio são strings ISO "AAAA-MM-DD" (sem fuso), para não haver deslocamento de dia. */
export type DataISO = string;

export function hojeISO(agora = new Date()): DataISO {
  // Fuso de Brasília: o dia de negócio é o dia no Brasil.
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  return p;
}

function toUTC(d: DataISO): number {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
}

export function somarDias(d: DataISO, dias: number): DataISO {
  return new Date(toUTC(d) + dias * 86400000).toISOString().slice(0, 10);
}

/** Dias corridos de `de` até `ate` (positivo se `ate` está no futuro). */
export function diasEntre(de: DataISO, ate: DataISO): number {
  return Math.round((toUTC(ate) - toUTC(de)) / 86400000);
}

export function dataBR(d: DataISO | null | undefined): string {
  if (!d) return "—";
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${dd}/${m}/${y}`;
}

export function dataCurta(d: DataISO | null | undefined): string {
  if (!d) return "—";
  const [, m, dd] = d.slice(0, 10).split("-");
  return `${dd}/${m}`;
}

const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
export function nomeMes(mesISO: string): string {
  const [y, m] = mesISO.split("-").map(Number);
  return `${MESES[m - 1]} de ${y}`;
}
export function mesAbrev(mesISO: string): string {
  return MESES[Number(mesISO.split("-")[1]) - 1].slice(0, 3);
}
