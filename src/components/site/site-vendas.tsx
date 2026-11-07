import Image from "next/image";
import Link from "next/link";
import { Logo, Placa, Vigi } from "@/components/marca";
import type { PlanoSite } from "./planos";
import { Simulador } from "./simulador";
import { Moldura, TelasSistema } from "./telas";

/** Contato comercial: WhatsApp (SITE_WHATSAPP, só dígitos com DDI) ou e-mail (SITE_EMAIL). */
function linkContato() {
  const zap = process.env.SITE_WHATSAPP?.replace(/\D/g, "");
  if (zap) return `https://wa.me/${zap}?text=${encodeURIComponent("Olá! Quero uma demonstração do Vigia Placa para a minha frota.")}`;
  return `mailto:${process.env.SITE_EMAIL || "contato@vigiaplaca.com.br"}?subject=${encodeURIComponent("Demonstração do Vigia Placa")}`;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function SiteVendas({ planos }: { planos: PlanoSite[] }) {
  const contato = linkContato();
  const exemplo = planos.find((p) => p.destaque) ?? planos[0];
  return (
    <div className="overflow-x-clip bg-white text-vigia">
      {/* Topo */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-vigia/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" aria-label="Vigia Placa"><Logo negativo tamanho={24} /></Link>
          <nav className="hidden gap-6 text-sm font-medium text-white/80 md:flex">
            <a href="#como-funciona" className="hover:text-white">Como funciona</a>
            <a href="#bases" className="hover:text-white">Segurança</a>
            <a href="#telas" className="hover:text-white">O sistema</a>
            <a href="#simulador" className="hover:text-white">Simulador</a>
            <a href="#planos" className="hover:text-white">Planos</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn btn-sm text-white hover:bg-white/10">Entrar</Link>
            <a href={contato} className="btn-ambar btn-sm hidden sm:inline-flex">Quero economizar</a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-vigia text-white">
        <div aria-hidden className="pointer-events-none absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-ambar/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute bottom-[-30%] left-[-10%] h-[420px] w-[420px] rounded-full bg-economia/30 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-ambar">
              <span className="h-2 w-2 animate-pulse rounded-full bg-ambar" /> Braço estratégico de redução de custos da sua frota
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
              Multa não é custo fixo. <span className="text-ambar">É dinheiro saindo pela porta.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/80">
              O Vigia Placa vigia todas as placas da sua empresa em bases oficiais redundantes, encontra cada multa antes do prazo,
              garante <b className="text-white">até 40% de desconto</b> e elimina a <b className="text-white">multa NIC</b>.
              E a nossa remuneração depende do quanto você economiza.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#simulador" className="btn-ambar px-6 py-3.5 text-base">Simular minha economia</a>
              <a href={contato} className="btn border border-white/30 px-6 py-3.5 text-base text-white hover:bg-white/10">Falar com um especialista</a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
              <li>✓ Sem instalar nada</li><li>✓ Só placa e Renavam</li><li>✓ Percentual só sobre economia comprovada</li>
            </ul>
          </div>
          <div className="relative">
            <Moldura className="rotate-1 lg:translate-x-6">
              <Image src="/site/hoje.jpg" alt="Tela Faça hoje do Vigia Placa, com economia acumulada e prazos" width={2560} height={1600} priority sizes="(min-width: 1024px) 560px, 100vw" className="h-auto w-full" />
            </Moldura>
            <div className="absolute -bottom-6 -left-2 rounded-2xl bg-white p-4 text-vigia shadow-2xl sm:-left-8">
              <p className="text-xs text-suave">Pago com desconto SNE</p>
              <p className="num text-2xl font-extrabold text-economia">−40%</p>
              <p className="text-xs text-suave"><s>R$ 195,23</s> → <b>R$ 117,14</b></p>
            </div>
            <div className="absolute -top-5 right-0 hidden rounded-2xl bg-ambar p-4 text-vigia shadow-2xl sm:block">
              <p className="text-xs font-semibold">Multa NIC evitada</p>
              <p className="num text-2xl font-extrabold">R$ 586,94</p>
            </div>
          </div>
        </div>
      </section>

      {/* Fatos */}
      <section className="border-b border-borda bg-nevoa">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["40%", "de desconto pagando pelo SNE dentro do prazo"],
            ["2×", "é o mínimo que a multa NIC custa a uma empresa que não indica o condutor"],
            ["30 dias", "é o prazo para indicar o condutor. Depois disso, não tem volta"],
            ["1 Pix", "para pagar todas as multas da frota com o maior desconto"],
          ].map(([n, t]) => (
            <div key={n}><p className="num text-4xl font-extrabold">{n}</p><p className="mt-1 text-sm text-suave">{t}</p></div>
          ))}
        </div>
      </section>

      {/* Problema */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="max-w-3xl">
          <p className="sobretitulo">O problema</p>
          <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Sua empresa paga multa três vezes: no valor cheio, na multa NIC e no tempo da equipe.</h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            ["A notificação chega tarde", "Correio extraviado, endereço antigo, papel esquecido na recepção. Quando alguém vê, o desconto de 40% já passou."],
            ["O prazo de indicação vence", "Sem indicar o motorista em 30 dias, a empresa recebe outra multa, a NIC, que é no mínimo o dobro do prejuízo."],
            ["Ninguém sabe quanto custa", "Multas espalhadas por placas, órgãos e planilhas. Sem número, não há como cobrar o motorista nem cortar o custo."],
          ].map(([t, d], i) => (
            <div key={t} className="card p-6">
              <span className="num inline-flex h-9 w-9 items-center justify-center rounded-full bg-rec-100 font-extrabold text-rec">{i + 1}</span>
              <h3 className="mt-4 text-lg font-extrabold">{t}</h3>
              <p className="mt-2 text-sm text-suave">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="scroll-mt-16 bg-nevoa py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid items-end gap-6 md:grid-cols-[1fr_auto]">
            <div className="max-w-3xl">
              <p className="sobretitulo">Como funciona</p>
              <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Você cadastra as placas. O Vigia cuida do resto.</h2>
            </div>
            <Vigi pose="ola" size={120} />
          </div>
          <ol className="mt-10 grid gap-5 md:grid-cols-4">
            {[
              ["Cadastre a frota", "Placa e Renavam, uma a uma ou por planilha. Em minutos a frota inteira está vigiada."],
              ["Vigiamos todo dia", "Consultas automáticas em bases oficiais, com frequência ajustada ao risco de cada placa."],
              ["Você recebe a ação", "Alerta no celular, WhatsApp e e-mail com o que fazer, o prazo e o valor com desconto."],
              ["Paga com desconto", "Indique o condutor em um clique e pague todas as multas com o maior desconto num Pix só."],
            ].map(([t, d], i) => (
              <li key={t} className="relative rounded-2xl bg-white p-6 shadow-sm">
                <span className="num text-5xl font-extrabold text-ambar">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-3 text-lg font-extrabold">{t}</h3>
                <p className="mt-2 text-sm text-suave">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Bases redundantes */}
      <section id="bases" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-20">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <p className="sobretitulo">Bases redundantes, prevenção de erros</p>
            <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Se uma base cair, outra assume. Sua frota nunca fica no escuro.</h2>
            <p className="mt-4 text-suave">
              Consultamos fontes de informação independentes e cruzamos os resultados. Isso dá cobertura nacional sem ponto cego, e cada
              etapa tem uma trava para evitar o erro que custa caro: o pagamento em dobro, o prazo perdido, a multa que ninguém viu.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Placa placa="ABC1D23" tamanho="lg" />
              <span className="text-2xl text-suave">→</span>
              <div className="space-y-1.5 text-sm font-semibold">
                <p className="rounded-lg bg-economia-100 px-3 py-1.5 text-economia">● Base nacional do Serpro (Radar/SNE)</p>
                <p className="rounded-lg bg-economia-100 px-3 py-1.5 text-economia">● Detrans estaduais</p>
                <p className="rounded-lg bg-economia-100 px-3 py-1.5 text-economia">● Polícia Rodoviária Federal</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Fontes redundantes", "Uma base principal e outra de reserva. Se a principal falhar ou sair do ar, a consulta continua pela outra, automaticamente."],
              ["Sem duplicidade", "A mesma multa vinda de duas bases é reconhecida pelo número do auto. Você nunca paga duas vezes."],
              ["Prazos pelo CTB", "Vencimento, desconto e indicação calculados pelas regras do Código de Trânsito, com alertas antes de cada prazo."],
              ["Dupla aprovação", "Pagamentos acima do limite pedem a aprovação de uma segunda pessoa. Nada sai da conta sem conferência."],
              ["Saúde das fontes 24h", "Cada base é monitorada: falhas, custo e tempo de resposta. Um problema é detectado antes de virar um buraco no monitoramento."],
              ["Dados protegidos", "Acesso separado por empresa e por usuário, e nenhum dado pessoal do proprietário é guardado além do necessário. Em linha com a LGPD."],
            ].map(([t, d]) => (
              <div key={t} className="card p-5">
                <h3 className="font-extrabold">✓ {t}</h3>
                <p className="mt-1.5 text-sm text-suave">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Telas */}
      <section id="telas" className="scroll-mt-16 bg-vigia py-20 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ambar">O sistema</p>
            <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Feito para quem não tem tempo de cuidar de multa</h2>
          </div>
          <div className="mt-10"><TelasSistema /></div>
        </div>
      </section>

      {/* Simulador */}
      <section id="simulador" className="scroll-mt-16 bg-nevoa py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid items-end gap-6 md:grid-cols-[1fr_auto]">
            <div className="max-w-3xl">
              <p className="sobretitulo">Simulador de economia</p>
              <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Quanto a sua empresa deixa na mesa por ano?</h2>
              <p className="mt-3 text-suave">Mova os controles com os números da sua frota. A linha verde já inclui tudo o que você pagaria ao Vigia Placa.</p>
            </div>
            <Vigi pose="economia" size={120} />
          </div>
          <div className="mt-10"><Simulador planos={planos} /></div>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="sobretitulo">Planos</p>
          <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Uma mensalidade pequena por placa. O resto, só se você economizar.</h2>
          <p className="mt-3 text-suave">O percentual incide apenas sobre a economia comprovada no seu Extrato: descontos obtidos e multas NIC evitadas. Mês sem economia, percentual zero.</p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {planos.map((p) => (
            <div key={p.id} className={`relative flex flex-col rounded-3xl p-7 ${p.destaque ? "bg-vigia text-white shadow-2xl shadow-vigia/30 lg:-translate-y-3" : "card"}`}>
              {p.destaque && <span className="absolute -top-3 left-7 rounded-full bg-ambar px-3 py-1 text-xs font-bold text-vigia">Mais escolhido</span>}
              <h3 className="text-xl font-extrabold">{p.nome}</h3>
              <p className={`mt-1 text-sm ${p.destaque ? "text-white/70" : "text-suave"}`}>{p.frase}</p>
              <div className="mt-6 flex items-end gap-1">
                <span className="num text-4xl font-extrabold">{brl(p.precoPlaca)}</span>
                <span className={`pb-1 text-sm ${p.destaque ? "text-white/70" : "text-suave"}`}>/placa/mês</span>
              </div>
              <p className={`mt-1 text-lg font-extrabold ${p.destaque ? "text-ambar" : "text-economia"}`}>+ {Math.round(p.saving * 100)}% do saving gerado</p>
              <p className={`mt-4 rounded-xl px-3 py-2 text-sm font-semibold ${p.destaque ? "bg-white/10" : "bg-nevoa"}`}>{p.frequencia}</p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {p.itens.map((i) => <li key={i} className="flex gap-2"><span className={p.destaque ? "text-ambar" : "text-economia"}>✓</span>{i}</li>)}
              </ul>
              <a href={contato} className={`mt-7 ${p.destaque ? "btn-ambar" : "btn-primario"} py-3`}>Começar com o {p.nome}</a>
            </div>
          ))}
        </div>
        {exemplo && (
          <p className="mt-6 text-center text-xs text-suave">Exemplo: no {exemplo.nome}, 50 placas custam {brl(50 * exemplo.precoPlaca)}/mês. Se o Extrato comprovar R$ 1.000 de economia no mês, o percentual é de {brl(1000 * exemplo.saving)}, e os outros {brl(1000 * (1 - exemplo.saving))} ficam com a sua empresa.</p>
        )}
      </section>

      {/* Perguntas */}
      <section className="bg-nevoa py-20">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-3xl font-extrabold">Perguntas frequentes</h2>
          <div className="mt-8 space-y-3">
            {[
              ["O que é o saving?", "É o percentual sobre a economia que o Vigia Placa gera e comprova no Extrato de Economia: a diferença entre o valor cheio e o valor pago com desconto, mais as multas NIC que deixaram de existir porque o condutor foi indicado a tempo."],
              ["Preciso de senha do gov.br ou certificado digital?", "Não. Para monitorar, basta a placa e o Renavam de cada veículo."],
              ["E se uma base de dados ficar fora do ar?", "A consulta segue pela base de reserva, automaticamente. As fontes são monitoradas o tempo todo, e a mesma multa vinda de duas bases nunca é cobrada duas vezes."],
              ["Funciona em todo o Brasil?", "Sim. Combinamos a base nacional do Serpro com os Detrans e a PRF para cobrir todos os estados."],
            ].map(([q, a]) => (
              <details key={q} className="card group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-extrabold">{q}<span className="text-xl text-suave transition group-open:rotate-45">+</span></summary>
                <p className="mt-3 text-sm text-suave">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section id="contato" className="relative overflow-hidden bg-vigia text-white">
        <div aria-hidden className="pointer-events-none absolute -right-20 top-0 h-80 w-80 rounded-full bg-ambar/20 blur-3xl" />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 py-20 text-center md:flex-row md:text-left">
          <div className="rounded-3xl bg-white p-3"><Vigi pose="alerta" size={130} /></div>
          <div className="flex-1">
            <h2 className="text-3xl font-extrabold sm:text-4xl">Cada dia sem vigiar é desconto perdido.</h2>
            <p className="mt-3 text-white/75">Mostre os números da sua frota a um especialista e receba um diagnóstico de economia sem compromisso.</p>
          </div>
          <a href={contato} className="btn-ambar px-7 py-4 text-base">Quero meu diagnóstico</a>
        </div>
      </section>

      <footer className="bg-[#081b33] text-white/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm">
          <Logo negativo tamanho={20} />
          <p>© {new Date().getFullYear()} Vigia Placa. Monitoramento de multas por placa e Renavam.</p>
          <Link href="/login" className="hover:text-white">Área do cliente</Link>
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-4 text-xs">
            Site desenvolvido pela Agência
            <span aria-label="RedBox" className="font-display text-sm font-extrabold tracking-[0.08em]"><span className="text-[#ff2d33]">RED</span><span className="text-white">BOX</span></span>
          </p>
        </div>
      </footer>
    </div>
  );
}
