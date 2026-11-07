"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function NavLink({ href, children, n, novas = false }: { href: string; children: React.ReactNode; n?: number; novas?: boolean }) {
  const path = usePathname();
  const qs = useSearchParams();
  const [base, query] = href.split("?");
  const mesmaRota = path === base || (["/multas", "/pagamentos"].includes(base) && path.startsWith(base + "/"));
  const ativo = mesmaRota && (query ? qs.toString() === query : !qs.get("todos"));
  return (
    <Link href={href} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${ativo ? "bg-white/10 font-semibold text-white" : "text-white/75 hover:bg-white/5 hover:text-white"}`}>
      {children}
      {n ? <span className="rounded-full bg-ambar px-1.5 text-xs font-bold text-vigia" title={novas ? "chegaram nas últimas 24 horas" : undefined}>{novas ? `${n} ${n === 1 ? "nova" : "novas"}` : n}</span> : null}
    </Link>
  );
}
