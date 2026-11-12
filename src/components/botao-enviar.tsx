"use client";
import { useFormStatus } from "react-dom";

/** Botão de envio que trava e mostra o andamento enquanto o servidor responde (evita "clico e nada acontece"). */
export function BotaoEnviar({ children, enviando = "Enviando…", className = "btn-primario" }: { children: React.ReactNode; enviando?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${className} disabled:cursor-wait disabled:opacity-70`}>
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          {enviando}
        </span>
      ) : children}
    </button>
  );
}
