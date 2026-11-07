"use client";
export function BotaoImprimir({ rotulo = "Baixar extrato em PDF" }: { rotulo?: string }) {
  return <button type="button" onClick={() => window.print()} className="btn-primario">{rotulo}</button>;
}
