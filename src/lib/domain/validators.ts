/** Normaliza placa: maiúsculas, sem hífen nem espaços. */
export function normalizarPlaca(p: string): string {
  return (p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Aceita o padrão antigo (ABC1234) e o Mercosul (ABC1D23). */
export function validarPlaca(p: string): { ok: true; placa: string; padrao: "antigo" | "mercosul" } | { ok: false; erro: string } {
  const placa = normalizarPlaca(p);
  if (placa.length !== 7) return { ok: false, erro: placa.length < 7 ? "Placa incompleta" : "Placa com caracteres a mais" };
  if (/^[A-Z]{3}[0-9]{4}$/.test(placa)) return { ok: true, placa, padrao: "antigo" };
  if (/^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(placa)) return { ok: true, placa, padrao: "mercosul" };
  return { ok: false, erro: "Formato de placa inválido" };
}

export function normalizarRenavam(r: string): string {
  const d = (r ?? "").replace(/\D/g, "");
  // Faltando dígito (Renavam antigo de 9 dígitos, ou zero à esquerda apagado pelo Excel): completa com zeros.
  return d.length > 0 && d.length < 11 ? d.padStart(11, "0") : d;
}

export function digitoRenavam(base10: string): number {
  const pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = base10.split("").reduce((acc, ch, i) => acc + Number(ch) * pesos[i], 0);
  const dv = (soma * 10) % 11;
  return dv === 10 ? 0 : dv;
}

export function validarRenavam(r: string): { ok: true; renavam: string } | { ok: false; erro: string } {
  const renavam = normalizarRenavam(r);
  if (!renavam) return { ok: false, erro: "Informe o Renavam" };
  if (renavam.length > 11) return { ok: false, erro: "Renavam com dígitos a mais" };
  if (digitoRenavam(renavam.slice(0, 10)) !== Number(renavam[10])) return { ok: false, erro: "Renavam com dígito verificador inválido" };
  return { ok: true, renavam };
}

/** Gera um Renavam válido a partir de uma base de 10 dígitos (útil para testes e dados de exemplo). */
export function gerarRenavam(base10: string): string {
  const b = base10.replace(/\D/g, "").padStart(10, "0").slice(-10);
  return b + digitoRenavam(b);
}

export function somenteDocumento(d: string): string {
  return (d ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function validarCPF(c: string): boolean {
  const d = c.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** CNPJ numérico e alfanumérico (IN RFB 2.229/2024, a partir de julho de 2026). */
export function validarCNPJ(c: string): boolean {
  const d = somenteDocumento(c);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const val = (ch: string) => ch.charCodeAt(0) - 48;
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((acc, p, i) => acc + val(d[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function tipoDocumento(doc: string): "PF" | "PJ" | null {
  const d = somenteDocumento(doc);
  if (d.length === 11 && validarCPF(d)) return "PF";
  if (d.length === 14 && validarCNPJ(d)) return "PJ";
  return null;
}

export function formatarDocumento(doc: string): string {
  const d = somenteDocumento(doc);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/, "$1.$2.$3/$4-$5");
  return doc;
}

export function formatarPlaca(p: string): string {
  return normalizarPlaca(p);
}

/** Completa os dígitos verificadores de um CNPJ (base de 12 caracteres). */
export function gerarCNPJ(base12: string): string {
  const b = somenteDocumento(base12).slice(0, 12);
  const val = (ch: string) => ch.charCodeAt(0) - 48;
  const dv = (s: string, pesos: number[]) => {
    const r = pesos.reduce((acc, p, i) => acc + val(s[i]) * p, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(b, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(b + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return b + d1 + d2;
}

export function gerarCPF(base9: string): string {
  const d = base9.replace(/\D/g, "").slice(0, 9);
  const dv = (s: string) => {
    const n = s.length;
    const soma = s.split("").reduce((acc, ch, i) => acc + Number(ch) * (n + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(d);
  return d + d1 + dv(d + d1);
}
