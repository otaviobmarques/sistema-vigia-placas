"use client";
import Image from "next/image";
import { useState } from "react";

const TELAS = [
  { id: "hoje", rotulo: "Faça hoje", titulo: "O dia começa com o que importa", texto: "Cada multa vira uma ação com prazo e valor: indicar o condutor, pagar com 40% ou avaliar defesa. Nada fica esquecido numa gaveta.", img: "/site/hoje.jpg", h: 1600 },
  { id: "multas", rotulo: "Caixa de Multas", titulo: "Todas as placas numa tela só", texto: "Órgão, infração, pontos, prazo e o melhor valor para pagar hoje, com filtro por centro de custo.", img: "/site/multas.jpg", h: 1600 },
  { id: "extrato", rotulo: "Extrato de Economia", titulo: "Economia comprovada, multa a multa", texto: "Todo mês você recebe o quanto deixou de pagar em descontos e multas NIC evitadas. É sobre esse valor, e só sobre ele, que cobramos o percentual.", img: "/site/extrato.jpg", h: 1220 },
  { id: "relatorios", rotulo: "Relatórios", titulo: "Dados para decidir", texto: "Quais infrações mais pesam, em quais veículos e quanto custaram. Exporte para Excel e leve para a reunião de diretoria.", img: "/site/relatorios.jpg", h: 1600 },
];

export function TelasSistema() {
  const [ativa, setAtiva] = useState(0);
  const t = TELAS[ativa];
  return (
    <div>
      <div className="flex flex-wrap justify-center gap-2" role="tablist">
        {TELAS.map((x, i) => (
          <button key={x.id} role="tab" aria-selected={i === ativa} onClick={() => setAtiva(i)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${i === ativa ? "bg-ambar text-vigia" : "bg-white/10 text-white/80 hover:bg-white/20"}`}>{x.rotulo}</button>
        ))}
      </div>
      <div className="mt-8 grid items-center gap-8 lg:grid-cols-[1fr_2fr]">
        <div>
          <h3 className="text-2xl font-extrabold text-white sm:text-3xl">{t.titulo}</h3>
          <p className="mt-3 text-white/75">{t.texto}</p>
        </div>
        <Moldura><Image key={t.id} src={t.img} alt={`Tela ${t.rotulo} do Vigia Placa`} width={2560} height={t.h} sizes="(min-width: 1024px) 760px, 100vw" className="h-auto w-full" /></Moldura>
      </div>
    </div>
  );
}

/** Janela de navegador em volta de uma captura de tela. */
export function Moldura({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-white/15 bg-white shadow-2xl shadow-black/40 ${className}`}>
      <div className="flex items-center gap-1.5 bg-[#e9edf3] px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#e63946]" /><span className="h-2.5 w-2.5 rounded-full bg-[#ffb703]" /><span className="h-2.5 w-2.5 rounded-full bg-[#12805c]" />
        <span className="ml-3 truncate rounded-md bg-white px-3 py-0.5 text-[11px] text-suave">www.vigiaplaca.com.br</span>
      </div>
      {children}
    </div>
  );
}
