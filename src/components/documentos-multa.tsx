"use client";
import { useState } from "react";

/** Copia um texto (PIX, linha digitável, código de barras) e confirma na tela. */
export function BotaoCopiar({ texto, rotulo, className = "btn-leve btn-sm" }: { texto: string; rotulo: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className={className} onClick={async () => { try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 2000); } catch { window.prompt("Copie:", texto); } }}>
      {ok ? "✓ Copiado" : rotulo}
    </button>
  );
}
