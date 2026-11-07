"use client";
import { useState } from "react";

export function CopiarPix({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="btn-primario w-full"
      onClick={async () => {
        try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 2500); } catch { prompt("Copie o código Pix:", texto); }
      }}
    >
      {ok ? "Código copiado!" : "Copiar Pix copia e cola"}
    </button>
  );
}
