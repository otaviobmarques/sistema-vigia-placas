import { placasParaReprocessar } from "@/lib/services/reprocessamento";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { exigirSessao, noEscopo } from "@/lib/auth";
import { CreditoDomma, Logo } from "@/components/marca";
import { sair, sairCliente } from "../actions";
import { NavLink } from "@/components/nav-link";
import { rotuloPerfil } from "@/lib/acesso";

type Item = { href: string; rotulo: string; n?: number; novas?: boolean };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await exigirSessao();
  const caminho = (await headers()).get("x-vp-path") ?? "";
  if (s.trocarSenha && caminho !== "/conta") redirect("/conta?primeiro=1");
  const nCarrinho = s.clienteId
    ? Number((await noEscopo(s, (db) => db.one("select count(*) as n from carrinho_itens where cliente_id = $1", [s.clienteId])))?.n ?? 0)
    : 0;

  const nSolicitacoes = s.nivel !== "cliente"
    ? Number((await noEscopo(s, (db) => db.one("select count(*) as n from solicitacoes_placa where status = 'pendente'")))?.n ?? 0)
    : 0;

  // Selo "Novas": multas que chegaram nas últimas 24 h (da carteira, para a equipe; do cliente, para ele).
  const nNovasEquipe = s.nivel !== "cliente"
    ? Number((await noEscopo(s, (db) => db.one("select count(*) as n from multas m join clientes c on c.id = m.cliente_id where m.criado_em > now() - interval '24 hours' and m.estado not in ('paga','cancelada') and c.excluido_em is null")))?.n ?? 0)
    : 0;
  // Placas que precisam de reprocessamento (erro, paradas na fila ou última consulta falhou), para a equipe.
  const nReprocessar = s.nivel !== "cliente"
    ? (await noEscopo(s, (db) => placasParaReprocessar(db))).filter((p) => p.motivo !== "na_fila").length
    : 0;
  const nNovasCliente = s.clienteId
    ? Number((await noEscopo(s, (db) => db.one("select count(*) as n from multas where cliente_id = $1 and criado_em > now() - interval '24 hours' and estado not in ('paga','cancelada')", [s.clienteId])))?.n ?? 0)
    : 0;
  const itensCliente: Item[] = [
    { href: "/hoje", rotulo: "Faça hoje" },
    { href: "/multas", rotulo: "Multas", n: nNovasCliente || undefined, novas: true },
    { href: "/placas", rotulo: "Placas" },
    { href: "/pagamentos", rotulo: "Pagamentos", n: nCarrinho || undefined },
    { href: "/extrato", rotulo: "Extrato de Economia" },
    { href: "/relatorios", rotulo: "Relatórios" },
    { href: "/condutores", rotulo: "Condutores" },
    { href: "/enviar", rotulo: "Enviar notificação" },
    { href: "/configuracoes", rotulo: "Configurações" },
  ];
  const itensFranqueado: Item[] = [
    { href: "/carteira", rotulo: "Carteira" },
    { href: "/solicitacoes", rotulo: "Solicitações de placas", n: nSolicitacoes || undefined },
    { href: "/hoje?todos=1", rotulo: "Faça hoje (todos)" },
    { href: "/placas/importar", rotulo: "Importar placas" },
    { href: "/financeiro", rotulo: "Comissões e repasses" },
    { href: "/usuarios", rotulo: "Usuários" },
  ];
  const itensFranqueadora: Item[] = [
    { href: "/painel", rotulo: "Dashboard" },
    ...(s.perfil === "admin" ? [{ href: "/backoffice", rotulo: "Backoffice" }] : []),
    { href: "/carteira", rotulo: "Clientes" },
    { href: "/gestao/grupos", rotulo: "Grupos econômicos" },
    { href: "/gestao/multas", rotulo: "Multas em aberto", n: nNovasEquipe || undefined, novas: true },
    { href: "/placas/nova", rotulo: "Cadastrar placa" },
    { href: "/placas/importar", rotulo: "Importar placas" },
    { href: "/gestao/reprocessamento", rotulo: "Reprocessamento de placas", n: nReprocessar || undefined },
    { href: "/solicitacoes", rotulo: "Solicitações de placas", n: nSolicitacoes || undefined },
    { href: "/financeiro", rotulo: "Financeiro" },
    { href: "/gestao/relatorios", rotulo: "Relatórios" },
    { href: "/usuarios", rotulo: "Usuários" },
  ];

  const secoes: Array<{ titulo?: string; itens: Item[] }> = [];
  if (s.nivel === "franqueadora") secoes.push({ titulo: "Vigia Placa", itens: itensFranqueadora });
  if (s.nivel === "franqueado") secoes.push({ titulo: "Franqueado", itens: itensFranqueado });
  if (s.clienteId) secoes.push({ titulo: s.nivel === "cliente" ? undefined : "Cliente", itens: itensCliente });

  return (
    <div className="min-h-screen lg:flex">
      <aside className="nao-imprimir sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-vigia px-4 py-6 text-white lg:flex">
        <Link href="/" className="mb-8 px-2"><Logo negativo tamanho={20} /></Link>
        <nav className="flex-1 space-y-6 overflow-y-auto">
          {secoes.map((sec, i) => (
            <div key={i}>
              {sec.titulo && <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">{sec.titulo}</div>}
              {sec.titulo === "Cliente" && (
                <div className="mb-2 rounded-lg bg-white/5 px-3 py-2 text-xs">
                  <div className="truncate font-semibold">{s.clienteNome}</div>
                  <form action={sairCliente}><button className="text-white/60 underline hover:text-white">trocar de cliente</button></form>
                </div>
              )}
              <ul className="space-y-0.5">
                {sec.itens.map((it) => (
                  <li key={it.href}><NavLink href={it.href} n={it.n} novas={it.novas}>{it.rotulo}</NavLink></li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="mt-4 border-t border-white/10 px-3 pt-4 text-xs text-white/60">
          <div className="truncate font-medium text-white">{s.nome}</div>
          <div className="truncate">{s.email}</div>
          <div className="mt-1 inline-block rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/80">{rotuloPerfil(s.nivel, s.perfil)}</div>
          <div className="mt-2 flex gap-3"><Link href="/conta" className="underline hover:text-white">Minha conta</Link><form action={sair}><button className="underline hover:text-white">Sair</button></form></div>
          <CreditoDomma negativo className="mt-4" />
        </div>
      </aside>

      {/* Topo e navegação inferior no celular (PWA) */}
      <header className="nao-imprimir sticky top-0 z-20 flex items-center justify-between bg-vigia px-4 py-3 lg:hidden">
        <Link href="/"><Logo negativo tamanho={16} /></Link>
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-sm text-white">Menu ▾</summary>
          <div className="absolute right-0 mt-2 w-64 rounded-xl bg-white p-2 shadow-xl">
            {secoes.flatMap((sec) => sec.itens).map((it) => (
              <Link key={it.href} href={it.href} className="block rounded-lg px-3 py-2 text-sm hover:bg-nevoa">{it.rotulo}</Link>
            ))}
            {s.nivel !== "cliente" && s.clienteId && <form action={sairCliente}><button className="w-full rounded-lg px-3 py-2 text-left text-sm text-suave hover:bg-nevoa">Trocar de cliente</button></form>}
            <Link href="/conta" className="block rounded-lg px-3 py-2 text-sm hover:bg-nevoa">Minha conta</Link>
            <form action={sair}><button className="w-full rounded-lg px-3 py-2 text-left text-sm text-rec hover:bg-nevoa">Sair</button></form>
          </div>
        </details>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-8 lg:pb-10 lg:pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
        <div className="nao-imprimir mt-10 flex justify-center lg:hidden"><CreditoDomma /></div>
      </main>

      {s.clienteId && (
        <nav className="nao-imprimir fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-borda bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
          {[
            { href: "/hoje", r: "Hoje", i: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" },
            { href: "/multas", r: "Multas", i: "M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4" },
            { href: "/enviar", r: "Enviar", i: "", camera: true },
            { href: "/extrato", r: "Economia", i: "M4 20h16M7 16V10M12 16V6M17 16v-4" },
            { href: "/configuracoes", r: "Perfil", i: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0" },
          ].map((b) => (
            <Link key={b.href} href={b.href} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-suave">
              {b.camera ? (
                <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-ambar text-vigia shadow-md">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
                </span>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={b.i} /></svg>
              )}
              {b.r}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
