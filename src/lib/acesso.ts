/**
 * Perfis de acesso do Vigia Placa.
 *
 * - Administrador do Sistema (franqueadora + admin): tudo, inclusive a parte técnica
 *   (gateways, APIs, fontes de dados, regras e tempo de consulta).
 * - Gestor do Vigia Placa (franqueadora + gestor): opera o negócio (clientes, placas, planos,
 *   financeiro, solicitações), sem a parte técnica.
 * - Cliente Responsável (cliente + admin): vê e age nas próprias placas e multas; SOLICITA
 *   inclusão e remoção de placas.
 * - Cliente Visualizador (cliente + leitura): só vê.
 * - Franqueado: escondido enquanto VIGIA_FRANQUIAS não for "1" (o código continua no lugar).
 */
type Quem = { nivel: string; perfil: string };

export const franquiasAtivas = () => process.env.VIGIA_FRANQUIAS === "1";

export const ehAdminSistema = (s: Quem) => s.nivel === "franqueadora" && s.perfil === "admin";
export const ehEquipeVigia = (s: Quem) => s.nivel === "franqueadora";
export const ehClienteResponsavel = (s: Quem) => s.nivel === "cliente" && s.perfil !== "leitura";

export const PERFIS_FRANQUEADORA = { admin: "Administrador do Sistema", gestor: "Gestor do Vigia Placa" } as const;
export const PERFIS_CLIENTE = { admin: "Responsável", leitura: "Visualizador" } as const;
const PERFIS_FRANQUEADO = { admin: "Administrador", gestor: "Gestor", financeiro: "Financeiro", leitura: "Leitura" } as const;

export function perfisDoNivel(nivel: string): Record<string, string> {
  return nivel === "franqueadora" ? PERFIS_FRANQUEADORA : nivel === "cliente" ? PERFIS_CLIENTE : PERFIS_FRANQUEADO;
}

export function rotuloPerfil(nivel: string, perfil: string): string {
  return perfisDoNivel(nivel)[perfil] ?? (nivel === "cliente" ? PERFIS_CLIENTE.admin : perfil);
}

/** Perfis que quem está logado pode atribuir em cada nível. Só o Administrador do Sistema cria a equipe Vigia Placa. */
export function perfisAtribuiveis(quem: Quem, nivel: string): string[] {
  if (nivel === "franqueadora") return ehAdminSistema(quem) ? ["admin", "gestor"] : [];
  if (nivel === "cliente") return ["admin", "leitura"];
  return ["admin", "gestor", "financeiro", "leitura"];
}

/** Níveis que quem está logado pode criar. O banco (RLS 0006) é a regra definitiva. */
export function niveisCriaveis(quem: Quem): string[] {
  if (quem.nivel === "franqueadora") {
    const n = ehAdminSistema(quem) ? ["franqueadora", "cliente"] : ["cliente"];
    return franquiasAtivas() ? [...n.slice(0, -1), "franqueado", "cliente"] : n;
  }
  if (quem.nivel === "franqueado") return ["franqueado", "cliente"];
  return [];
}
