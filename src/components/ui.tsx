import Link from "next/link";
import type { ReactNode } from "react";
import { brl } from "@/lib/domain/money";
import { ESTADOS, type EstadoMulta } from "@/lib/domain/ctb";

export function Cabecalho({ sobre, titulo, acoes, sub }: { sobre?: ReactNode; titulo: ReactNode; acoes?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {sobre && <div className="mb-1 text-xs text-suave">{sobre}</div>}
        <h1 className="text-2xl font-extrabold text-vigia sm:text-[28px]">{titulo}</h1>
        {sub && <p className="mt-1 max-w-2xl text-sm text-suave">{sub}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Numero({ rotulo, valor, detalhe, tom = "normal", destaque = false }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; tom?: "normal" | "economia" | "rec" | "ambar"; destaque?: boolean }) {
  const cor = destaque ? "text-ambar" : { normal: "text-vigia", economia: "text-economia", rec: "text-rec", ambar: "text-ambar" }[tom];
  return (
    <div className={`rounded-2xl p-4 ${destaque ? "bg-vigia text-white" : "card"}`}>
      <div className={`text-xs ${destaque ? "text-white/75" : "text-suave"}`}>{rotulo}</div>
      <div className={`num mt-1 text-2xl font-extrabold sm:text-[28px] ${cor}`}>{valor}</div>
      {detalhe && <div className={`mt-1 text-xs ${destaque ? "text-white/75" : "text-suave"}`}>{detalhe}</div>}
    </div>
  );
}

/** Chip de prazo: vermelho até 3 dias, âmbar até 7, neutro depois. */
export function ChipPrazo({ dias, prefixo = "" }: { dias: number | null; prefixo?: string }) {
  if (dias === null) return <span className="text-xs text-suave">—</span>;
  const cls = dias < 0 ? "bg-rec text-white" : dias <= 3 ? "bg-[#b3261e] text-white" : dias <= 7 ? "bg-ambar text-vigia" : "bg-nevoa text-vigia border border-borda";
  const txt = dias < 0 ? `vencida há ${-dias}d` : dias === 0 ? "hoje" : `${dias} ${dias === 1 ? "dia" : "dias"}`;
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{prefixo}{txt}</span>;
}

export function ChipEstado({ estado }: { estado: EstadoMulta }) {
  const cls: Record<EstadoMulta, string> = {
    detectada: "bg-nevoa text-vigia border border-borda",
    notificada: "bg-ambar-100 text-[#8a5a00]",
    condutor_indicado: "bg-[#e6eefb] text-vigia-600",
    reconhecida_sne: "bg-economia-100 text-economia",
    em_defesa: "bg-[#efe7fb] text-[#5b2a9a]",
    penalidade: "bg-ambar-100 text-[#8a5a00]",
    paga: "bg-economia-100 text-economia",
    vencida: "bg-rec-100 text-rec",
    cancelada: "bg-nevoa text-suave border border-borda",
  };
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${cls[estado]}`}>{ESTADOS[estado].rotulo}</span>;
}

export function ChipDesconto({ d }: { d: "40" | "20" | null }) {
  if (d === "40") return <span className="rounded-full bg-economia px-2 py-0.5 text-xs font-bold text-white">40% SNE</span>;
  if (d === "20") return <span className="rounded-full bg-ambar px-2 py-0.5 text-xs font-bold text-vigia">20%</span>;
  return <span className="rounded-full bg-nevoa px-2 py-0.5 text-xs text-suave">sem desconto</span>;
}

export function Card({ titulo, acoes, children, className = "" }: { titulo?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card min-w-0 p-5 ${className}`}>
      {(titulo || acoes) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {titulo && <h2 className="text-lg font-bold">{titulo}</h2>}
          {acoes}
        </div>
      )}
      {children}
    </section>
  );
}

export function Reais({ c, className = "" }: { c: number; className?: string }) {
  return <span className={`num ${className}`}>{brl(c)}</span>;
}

export function Aviso({ tom = "info", children }: { tom?: "info" | "economia" | "rec" | "ambar"; children: ReactNode }) {
  const cls = { info: "bg-[#eef3fb] text-vigia", economia: "bg-economia-100 text-[#0b5c42]", rec: "bg-rec-100 text-[#8f1d27]", ambar: "bg-ambar-100 text-[#6b4700]" }[tom];
  return <div className={`rounded-xl px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function Abas({ itens, ativo }: { itens: Array<{ id: string; rotulo: string; href: string; n?: number }>; ativo: string }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-borda [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {itens.map((a) => (
        <Link
          key={a.id}
          href={a.href}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${a.id === ativo ? "border-vigia text-vigia" : "border-transparent text-suave hover:text-vigia"}`}
        >
          {a.rotulo}
          {a.n !== undefined && <span className="ml-1.5 rounded-full bg-nevoa px-1.5 text-xs">{a.n}</span>}
        </Link>
      ))}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-borda p-8 text-center text-sm text-suave">{children}</div>;
}

export function Mensagem({ ok, erro }: { ok?: string; erro?: string }) {
  if (erro) return <div className="mb-4"><Aviso tom="rec">{erro}</Aviso></div>;
  if (ok) return <div className="mb-4"><Aviso tom="economia">{ok}</Aviso></div>;
  return null;
}
