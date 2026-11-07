/** Marca Vigia Placa: símbolo de câmera, logotipo, mascote Vigi e selo de placa. */

export function SimboloCamera({ size = 40, negativo = false }: { size?: number; negativo?: boolean }) {
  const corpo = negativo ? "#FFFFFF" : "#0B2545";
  const faixa = negativo ? "#FFB703" : "#0B2545";
  return (
    <svg width={size * 1.55} height={size} viewBox="0 0 62 40" aria-hidden>
      <rect x="1" y="17" width="5" height="18" rx="2.5" fill={negativo ? "#FFFFFF" : "#0B2545"} />
      <rect x="4" y="22" width="10" height="5" rx="2.5" fill={negativo ? "#FFFFFF" : "#0B2545"} />
      <rect x="12" y="3" width="48" height="33" rx="7" fill={corpo} />
      <rect x="15.5" y="12" width="41" height="20.5" rx="4" fill={negativo ? "#FFFFFF" : "#FFFFFF"} />
      {negativo && <rect x="12" y="3" width="48" height="9" rx="4" fill={faixa} />}
      <circle cx="53" cy="7.5" r="2.4" fill="#E63946" />
      <circle cx="36" cy="22.3" r="8" fill="#0B2545" />
      <circle cx="36" cy="22.3" r="6" fill="#FFB703" />
      <circle cx="36" cy="22.3" r="3" fill="#0B2545" />
      <circle cx="34.6" cy="21" r="1.1" fill="#FFFFFF" />
    </svg>
  );
}

export function SeloPlaca({ texto = "PLACA", negativo = false, className = "" }: { texto?: string; negativo?: boolean; className?: string }) {
  if (negativo) {
    return <span className={`inline-block rounded-md bg-ambar px-2 py-0.5 font-display font-extrabold tracking-wider text-vigia ${className}`}>{texto}</span>;
  }
  return (
    <span className={`inline-flex flex-col overflow-hidden rounded-md border-2 border-vigia bg-white font-display font-extrabold tracking-wider text-vigia ${className}`}>
      <span className="block h-1.5 bg-vigia" />
      <span className="px-2 leading-tight">{texto}</span>
    </span>
  );
}

export function Logo({ negativo = false, tamanho = 28 }: { negativo?: boolean; tamanho?: number }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <SimboloCamera size={tamanho} negativo={negativo} />
      <span className={`font-display font-extrabold ${negativo ? "text-white" : "text-vigia"}`} style={{ fontSize: tamanho * 0.85 }}>
        Vigia
      </span>
      <SeloPlaca negativo={negativo} className="text-[0.95em]" texto="PLACA" />
    </span>
  );
}

/** Placa no padrão Mercosul (faixa superior escura). */
export function Placa({ placa, tamanho = "md" }: { placa: string; tamanho?: "sm" | "md" | "lg" }) {
  const cls = { sm: "text-xs px-1.5 min-w-[4.6rem]", md: "text-sm px-2 min-w-[5.6rem]", lg: "text-3xl px-4 min-w-[11rem]" }[tamanho];
  const faixa = { sm: "h-1", md: "h-1.5", lg: "h-3" }[tamanho];
  return (
    <span className={`inline-flex flex-col overflow-hidden rounded-md border-2 border-vigia bg-white text-center font-display font-extrabold tracking-wider text-vigia ${cls}`}>
      <span className={`-mx-4 block bg-vigia ${faixa}`} />
      <span className="py-0.5 leading-none">{placa}</span>
    </span>
  );
}

export function PlacaVigiada({ placa }: { placa: string }) {
  return (
    <span className="inline-flex flex-col overflow-hidden rounded-lg border-[3px] border-vigia bg-white font-display text-vigia">
      <span className="bg-vigia px-2 py-0.5 text-[9px] font-bold tracking-[0.18em] text-white">VIGIADA PELO VIGIA PLACA</span>
      <span className="px-3 py-1 text-2xl font-extrabold tracking-wider">{placa}</span>
    </span>
  );
}

type Pose = "ola" | "alerta" | "economia";

/** Vigi: a câmera que nunca pisca. Aparece para avisar e para comemorar, nunca para assustar. */
export function Vigi({ pose = "ola", size = 140 }: { pose?: Pose; size?: number }) {
  const navy = "#0B2545";
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={`Vigi, mascote do Vigia Placa (${pose})`}>
      <ellipse cx="100" cy="188" rx="46" ry="7" fill="#0B2545" opacity="0.08" />
      {/* pedestal */}
      <rect x="92" y="138" width="16" height="34" fill={navy} />
      <rect x="64" y="166" width="72" height="16" rx="8" fill={navy} />
      {/* braços */}
      {pose === "ola" && (
        <>
          <path d="M44 112 C30 116 26 128 24 138" stroke={navy} strokeWidth="5" fill="none" strokeLinecap="round" />
          <circle cx="23" cy="143" r="8" fill="white" stroke={navy} strokeWidth="5" />
          <path d="M156 108 C170 100 174 84 172 72" stroke={navy} strokeWidth="5" fill="none" strokeLinecap="round" />
          <circle cx="172" cy="66" r="8" fill="white" stroke={navy} strokeWidth="5" />
          <path d="M150 44 l8 -6 M162 50 l4 -10" stroke="#FFB703" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {pose === "alerta" && (
        <>
          <path d="M44 100 C30 96 26 80 28 66" stroke={navy} strokeWidth="5" fill="none" strokeLinecap="round" />
          <circle cx="28" cy="60" r="8" fill="white" stroke={navy} strokeWidth="5" />
          <path d="M156 100 C170 96 174 80 172 66" stroke={navy} strokeWidth="5" fill="none" strokeLinecap="round" />
          <circle cx="172" cy="60" r="8" fill="white" stroke={navy} strokeWidth="5" />
          <circle cx="100" cy="20" r="14" fill="#E63946" />
          <rect x="97.5" y="10" width="5" height="12" rx="2.5" fill="white" />
          <circle cx="100" cy="27" r="2.8" fill="white" />
        </>
      )}
      {pose === "economia" && (
        <>
          <path d="M44 112 C30 116 26 128 24 138" stroke={navy} strokeWidth="5" fill="none" strokeLinecap="round" />
          <circle cx="23" cy="143" r="8" fill="white" stroke={navy} strokeWidth="5" />
          <circle cx="160" cy="60" r="18" fill="#12805C" stroke={navy} strokeWidth="4" />
          <text x="160" y="66" textAnchor="middle" fontFamily="Sora, sans-serif" fontWeight="800" fontSize="15" fill="white">R$</text>
          <path d="M156 104 C166 98 168 88 166 80" stroke={navy} strokeWidth="5" fill="none" strokeLinecap="round" />
          <circle cx="168" cy="84" r="8" fill="white" stroke={navy} strokeWidth="5" />
          <path d="M128 24 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" fill="#FFB703" />
          <path d="M150 18 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2z" fill="#FFB703" />
        </>
      )}
      {/* corpo */}
      <rect x="44" y="44" width="112" height="96" rx="20" fill="white" stroke={navy} strokeWidth="6" />
      <path d="M44 64 a20 20 0 0 1 20 -20 h72 a20 20 0 0 1 20 20 v6 h-112z" fill={navy} />
      <text x="62" y="64" fontFamily="Sora, sans-serif" fontWeight="800" fontSize="13" letterSpacing="3" fill="white">VIGI</text>
      <circle cx="140" cy="58" r={pose === "alerta" ? 6 : 4.5} fill={pose === "economia" ? "#12805C" : "#E63946"} />
      {pose === "alerta" && <circle cx="140" cy="58" r="10" fill="#E63946" opacity="0.25" />}
      {/* bochechas */}
      {pose !== "alerta" && (
        <>
          <circle cx="66" cy="108" r="8" fill="#FFB703" opacity="0.6" />
          <circle cx="134" cy="108" r="8" fill="#FFB703" opacity="0.6" />
        </>
      )}
      {/* lente/olho */}
      <circle cx="100" cy="104" r="27" fill={navy} />
      <circle cx="100" cy="104" r="21" fill="#FFB703" />
      {pose === "economia" ? (
        <path d="M88 108 Q100 92 112 108" stroke={navy} strokeWidth="5" fill="none" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="100" cy={pose === "alerta" ? 100 : 104} r={pose === "alerta" ? 8 : 11} fill={navy} />
          <circle cx="96" cy={pose === "alerta" ? 97 : 100} r="3" fill="white" />
          {pose === "ola" && <circle cx="106" cy="110" r="1.8" fill="white" />}
        </>
      )}
      {pose === "ola" && <path d="M93 134 Q100 138 107 134" stroke={navy} strokeWidth="3" fill="none" strokeLinecap="round" />}
    </svg>
  );
}

/** Selo "Desenvolvido por Domma Tecnologia" (sistema e app). */
export function CreditoDomma({ negativo = false, className = "" }: { negativo?: boolean; className?: string }) {
  const escuro = negativo ? "#FFFFFF" : "#1C1238";
  return (
    <span aria-label="Desenvolvido por Domma Tecnologia" className={`inline-flex items-center gap-2 text-[10px] ${negativo ? "text-white/50" : "text-suave"} ${className}`}>
      <span>Desenvolvido por</span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="30" height="20" viewBox="0 0 120 80" aria-hidden>
          <path d="M10 62 C 24 40, 30 26, 38 26 C 48 26, 52 64, 60 64 C 68 64, 72 26, 82 26 C 90 26, 96 40, 110 62" fill="none" stroke="#7161F5" strokeWidth="14" strokeLinecap="round" />
          <circle cx="60" cy="13" r="10" fill={escuro} />
        </svg>
        <span className="flex flex-col leading-none">
          <span className="font-sans text-[13px] font-extrabold tracking-tight" style={{ color: escuro }}>Domma</span>
          <span className="text-[6.5px] font-bold tracking-[0.32em] text-[#7161F5]">TECNOLOGIA</span>
        </span>
      </span>
    </span>
  );
}
