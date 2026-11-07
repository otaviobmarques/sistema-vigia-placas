"use client";
import { useMemo, useState } from "react";
import type { PlanoSite } from "./planos";

/**
 * Simulação ilustrativa de economia em 12 meses. As premissas ficam visíveis e editáveis:
 * nada aqui é resultado de cliente real.
 */
const VALOR_MEDIO = 180; // R$ por multa (entre média e grave no CTB)
const PERDE_INDICACAO = 0.35; // fatia das multas de PJ que perde o prazo de indicação e gera NIC
const NIC_EXTRA = 1; // NIC: no mínimo mais uma multa de mesmo valor
const COM_SNE = 0.7; // fatia paga com 40% (órgãos no SNE); o resto com 20%
const MIN_POR_MULTA = 25; // tempo da equipe por multa sem automação
const CUSTO_HORA = 45;

const brl = (v: number, casas = 0) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });

function simular(placas: number, multasAno: number, plano: PlanoSite, contarTempo: boolean) {
  const multasMes = (placas * multasAno) / 12;
  const cheioMes = multasMes * VALOR_MEDIO;
  const semMes = cheioMes * (1 + PERDE_INDICACAO * NIC_EXTRA) + (contarTempo ? (multasMes * MIN_POR_MULTA * CUSTO_HORA) / 60 : 0);
  const pagoMes = cheioMes * (COM_SNE * 0.6 + (1 - COM_SNE) * 0.8);
  const economiaBrutaMes = semMes - pagoMes;
  const descontoENic = cheioMes * (1 + PERDE_INDICACAO * NIC_EXTRA) - pagoMes; // base do saving: só o comprovado
  const assinaturaMes = placas * plano.precoPlaca + descontoENic * plano.saving;
  const comMes = pagoMes + assinaturaMes;
  const meses = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, sem: semMes * (i + 1), com: comMes * (i + 1) }));
  const ano = { sem: semMes * 12, com: comMes * 12, liquida: (semMes - comMes) * 12, assinatura: assinaturaMes * 12, bruta: economiaBrutaMes * 12 };
  return { meses, ano, retorno: ano.assinatura > 0 ? ano.bruta / ano.assinatura : 0 };
}

const COR_SEM = "#e63946";
const COR_COM = "#12805c";

export function Simulador({ planos }: { planos: PlanoSite[] }) {
  const [placas, setPlacas] = useState(50);
  const [multasAno, setMultasAno] = useState(2.5);
  const [planoId, setPlanoId] = useState((planos.find((p) => p.destaque) ?? planos[0])?.id);
  const [contarTempo, setContarTempo] = useState(true);
  const [foco, setFoco] = useState<number | null>(null);
  const plano = planos.find((p) => p.id === planoId) ?? planos[0];
  const sim = useMemo(() => (plano ? simular(placas, multasAno, plano, contarTempo) : null), [placas, multasAno, plano, contarTempo]);
  if (!sim || !plano) return null;
  const r = sim;

  // Geometria do gráfico
  const W = 720, H = 320, M = { t: 20, r: 128, b: 32, l: 64 };
  const max = Math.max(...r.meses.map((m) => m.sem)) * 1.08;
  const x = (i: number) => M.l + (i / 11) * (W - M.l - M.r);
  const y = (v: number) => H - M.b - (v / max) * (H - M.t - M.b);
  const linha = (k: "sem" | "com") => r.meses.map((m, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(m[k]).toFixed(1)}`).join("");
  const faixa = `${linha("sem")}${[...r.meses].reverse().map((m, j) => `L${x(11 - j).toFixed(1)},${y(m.com).toFixed(1)}`).join("")}Z`;
  const passo = max > 400_000 ? 100_000 : max > 200_000 ? 50_000 : max > 80_000 ? 20_000 : max > 40_000 ? 10_000 : max > 16_000 ? 5_000 : 2_000;
  const grade = Array.from({ length: Math.floor(max / passo) + 1 }, (_, i) => i * passo);
  const f = foco ?? 11;
  const fim = r.meses[11];
  const positiva = r.ano.liquida > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="card space-y-5 p-6">
        <div>
          <label className="rotulo" htmlFor="sim-placas">Placas na frota</label>
          <div className="flex items-baseline justify-between"><span className="num text-3xl font-extrabold">{placas}</span><span className="text-xs text-suave">veículos</span></div>
          <input id="sim-placas" type="range" min={5} max={1000} step={5} value={placas} onChange={(e) => setPlacas(+e.target.value)} className="w-full accent-[#0b2545]" />
        </div>
        <div>
          <label className="rotulo" htmlFor="sim-multas">Multas por veículo, por ano</label>
          <div className="flex items-baseline justify-between"><span className="num text-3xl font-extrabold">{multasAno.toLocaleString("pt-BR")}</span><span className="text-xs text-suave">≈ {Math.round(placas * multasAno)} multas/ano</span></div>
          <input id="sim-multas" type="range" min={0.5} max={8} step={0.5} value={multasAno} onChange={(e) => setMultasAno(+e.target.value)} className="w-full accent-[#0b2545]" />
        </div>
        <div>
          <span className="rotulo">Plano</span>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-nevoa p-1">
            {planos.map((p) => (
              <button key={p.id} type="button" onClick={() => setPlanoId(p.id)} aria-pressed={p.id === planoId} className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${p.id === planoId ? "bg-vigia text-white shadow" : "text-suave hover:text-vigia"}`}>{p.nome}</button>
            ))}
          </div>
          <p className="mt-2 text-xs text-suave">{brl(plano.precoPlaca, 2)} por placa/mês + {Math.round(plano.saving * 100)}% da economia comprovada</p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={contarTempo} onChange={(e) => setContarTempo(e.target.checked)} className="mt-1 accent-[#0b2545]" />
          <span>Contar o tempo da equipe <span className="block text-xs text-suave">{MIN_POR_MULTA} min por multa a {brl(CUSTO_HORA)}/h</span></span>
        </label>
        <details className="text-xs text-suave">
          <summary className="cursor-pointer font-semibold text-vigia">Premissas da simulação</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Multa média de {brl(VALOR_MEDIO)}.</li>
            <li>Sem monitoramento, {Math.round(PERDE_INDICACAO * 100)}% das multas perdem o prazo de indicação do condutor e geram multa NIC (no mínimo mais uma multa de mesmo valor).</li>
            <li>Com o Vigia Placa, {Math.round(COM_SNE * 100)}% são pagas com 40% de desconto (órgãos no SNE) e o restante com 20%. Nenhuma NIC.</li>
            <li>O percentual do plano incide só sobre descontos e NIC evitadas, nunca sobre o tempo da equipe.</li>
            <li>Simulação ilustrativa: o resultado real depende da sua frota.</li>
          </ul>
        </details>
      </div>

      <div className="card overflow-hidden p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="sobretitulo">Economia líquida em 12 meses</p>
            <p className={`num text-4xl font-extrabold sm:text-5xl ${positiva ? "text-economia" : "text-rec"}`}>{brl(r.ano.liquida)}</p>
            <p className="mt-1 text-sm text-suave">já descontados a mensalidade e o percentual do plano</p>
          </div>
          <div className="flex gap-6 text-right">
            <div><p className="text-xs text-suave">Corte no custo com multas</p><p className="num text-2xl font-extrabold">{r.ano.sem ? Math.round((r.ano.liquida / r.ano.sem) * 100) : 0}%</p></div>
            <div><p className="text-xs text-suave">Retorno por R$ 1 investido</p><p className="num text-2xl font-extrabold">{brl(r.retorno, 2)}</p></div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-xs text-suave" aria-hidden>
          <span className="inline-flex items-center gap-2"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={COR_SEM} strokeWidth="2" strokeDasharray="5 3" /></svg>Sem Vigia Placa</span>
          <span className="inline-flex items-center gap-2"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={COR_COM} strokeWidth="2" /></svg>Com Vigia Placa (com mensalidade)</span>
          <span className="inline-flex items-center gap-2"><span className="h-3 w-4 rounded-sm bg-economia-100" />Economia</span>
        </div>

        <div className="relative mt-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Custo acumulado em 12 meses: ${brl(fim.sem)} sem o Vigia Placa e ${brl(fim.com)} com o Vigia Placa.`} onMouseLeave={() => setFoco(null)}>
            {grade.map((v) => (
              <g key={v}>
                <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="#e3e7ee" strokeWidth="1" />
                <text x={M.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#5b6b82">{v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR")} mil` : v}</text>
              </g>
            ))}
            {r.meses.map((m, i) => <text key={m.mes} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="#5b6b82">{i % 2 === 0 || i === 11 ? `${m.mes}º` : ""}</text>)}
            <path d={faixa} fill={positiva ? "#e3f4ec" : "#fde8ea"} />
            <path d={linha("sem")} fill="none" stroke={COR_SEM} strokeWidth="2" strokeDasharray="6 4" strokeLinejoin="round" />
            <path d={linha("com")} fill="none" stroke={COR_COM} strokeWidth="2.5" strokeLinejoin="round" />
            {/* rótulos diretos no fim das linhas */}
            <text x={x(11) + 10} y={y(fim.sem) + 4} fontSize="12" fontWeight="600" fill="#0b2545">Sem: {brl(fim.sem)}</text>
            <text x={x(11) + 10} y={Math.max(y(fim.com) + 4, y(fim.sem) + 22)} fontSize="12" fontWeight="600" fill="#0b2545">Com: {brl(fim.com)}</text>
            {foco !== null && (
              <g>
                <line x1={x(f)} x2={x(f)} y1={M.t} y2={H - M.b} stroke="#0b2545" strokeOpacity=".25" />
                <circle cx={x(f)} cy={y(r.meses[f].sem)} r="5" fill={COR_SEM} stroke="#fff" strokeWidth="2" />
                <circle cx={x(f)} cy={y(r.meses[f].com)} r="5" fill={COR_COM} stroke="#fff" strokeWidth="2" />
              </g>
            )}
            {r.meses.map((m, i) => (
              <rect key={m.mes} x={x(i) - (W - M.l - M.r) / 22} y={M.t} width={(W - M.l - M.r) / 11} height={H - M.t - M.b} fill="transparent" onMouseEnter={() => setFoco(i)} onTouchStart={() => setFoco(i)} />
            ))}
          </svg>
          {foco !== null && (
            <div className="pointer-events-none absolute top-2 rounded-xl border border-borda bg-white px-3 py-2 text-xs shadow-lg" style={{ left: `${(x(f) / W) * 100}%`, transform: `translateX(${f > 6 ? "-105%" : "5%"})` }}>
              <p className="font-semibold">Até o {r.meses[f].mes}º mês</p>
              <p className="mt-1 flex justify-between gap-4"><span className="text-suave">Sem Vigia</span><span className="num font-semibold">{brl(r.meses[f].sem)}</span></p>
              <p className="flex justify-between gap-4"><span className="text-suave">Com Vigia</span><span className="num font-semibold">{brl(r.meses[f].com)}</span></p>
              <p className="mt-1 flex justify-between gap-4 border-t border-borda pt-1"><span>Economia</span><span className="num font-bold text-economia">{brl(r.meses[f].sem - r.meses[f].com)}</span></p>
            </div>
          )}
        </div>

        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-semibold text-vigia">Ver em tabela</summary>
          <table className="tabela mt-2">
            <thead><tr><th>Mês</th><th className="text-right">Sem Vigia</th><th className="text-right">Com Vigia</th><th className="text-right">Economia</th></tr></thead>
            <tbody>{r.meses.map((m) => <tr key={m.mes}><td>{m.mes}º mês</td><td className="num text-right">{brl(m.sem)}</td><td className="num text-right">{brl(m.com)}</td><td className="num text-right">{brl(m.sem - m.com)}</td></tr>)}</tbody>
          </table>
        </details>
      </div>
    </div>
  );
}
