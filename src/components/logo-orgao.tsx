/** Logo do órgão autuador quando temos o arquivo (DNIT, ANTT); senão, só o nome. */
/** Logo completo (detalhe) e só a sigla (listas, onde o texto miúdo fica ilegível). */
const LOGOS: Record<string, { completo: string; sigla: string }> = {
  DNIT: { completo: "/orgaos/dnit.png", sigla: "/orgaos/dnit-sigla.png" },
  ANTT: { completo: "/orgaos/antt.png", sigla: "/orgaos/antt.png" },
};

export const logoDoOrgao = (id: string | null | undefined) => (id ? LOGOS[id.toUpperCase()] ?? null : null);

/** Enquanto não houver arquivo do logo, a ANTT aparece como selo verde com a sigla. */
const SELOS_TEXTO: Record<string, string> = { ANTT: "bg-[#0b7a3b] text-white" };

export function LogoOrgao({ id, nome, tamanho = "sm" }: { id: string | null | undefined; nome: string; tamanho?: "sm" | "md" }) {
  const logo = logoDoOrgao(id);
  const selo = id ? SELOS_TEXTO[id.toUpperCase()] : undefined;
  if (!logo && selo) return <span title={nome} className={`inline-block rounded font-black italic tracking-tight ${selo} ${tamanho === "md" ? "px-2 py-0.5 text-xl" : "px-1 text-[10px]"}`}>{id!.toUpperCase()}</span>;
  if (!logo) return <>{nome}</>;
  const src = tamanho === "md" ? logo.completo : logo.sigla;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={nome} title={nome} className={`inline-block w-auto align-middle ${tamanho === "md" ? "h-8" : "h-4"}`} />
  );
}
