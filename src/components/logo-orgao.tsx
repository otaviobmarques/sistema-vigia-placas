/** Logo do órgão autuador quando temos o arquivo (DNIT, ANTT); senão, só o nome. */
/** Logo completo (detalhe) e só a sigla (listas, onde o texto miúdo fica ilegível). */
const LOGOS: Record<string, { completo: string; sigla: string }> = {
  DNIT: { completo: "/orgaos/dnit.png", sigla: "/orgaos/dnit-sigla.png" },
};

export const logoDoOrgao = (id: string | null | undefined) => (id ? LOGOS[id.toUpperCase()] ?? null : null);

export function LogoOrgao({ id, nome, tamanho = "sm" }: { id: string | null | undefined; nome: string; tamanho?: "sm" | "md" }) {
  const logo = logoDoOrgao(id);
  if (!logo) return <>{nome}</>;
  const src = tamanho === "md" ? logo.completo : logo.sigla;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={nome} title={nome} className={`inline-block w-auto align-middle ${tamanho === "md" ? "h-8" : "h-4"}`} />
  );
}
