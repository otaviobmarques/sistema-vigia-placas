import { exigirCliente, noEscopo } from "@/lib/auth";
import { limitePontos } from "@/lib/domain/ctb";
import { Cabecalho, Card, Mensagem, Vazio } from "@/components/ui";
import { adicionarCondutor } from "../../actions";

export const metadata = { title: "Condutores" };

export default async function Condutores({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await exigirCliente();
  const sp = await searchParams;
  const condutores = await noEscopo(s, (db) =>
    db.q(`select c.*, (select count(*) from multas m where m.condutor_id = c.id) as indicacoes,
            (select string_agg(p.placa, ', ') from placas p where p.condutor_principal_id = c.id) as placas
          from condutores c where c.cliente_id = $1 order by c.nome`, [s.clienteId]),
  );
  return (
    <>
      <Cabecalho titulo="Condutores" sub="Quem dirige os veículos. O Vigia Placa envia o link de aceite da indicação por WhatsApp e acompanha os pontos." />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <Card titulo="Novo condutor" className="mb-6">
        <form action={adicionarCondutor} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2"><label className="rotulo">Nome</label><input name="nome" required className="campo" /></div>
          <div><label className="rotulo">CPF</label><input name="cpf" className="campo" /></div>
          <div><label className="rotulo">CNH</label><input name="cnh" className="campo" /></div>
          <div><label className="rotulo">WhatsApp</label><input name="whatsapp" placeholder="+55 31 9…" className="campo" /></div>
          <div className="flex items-end"><button className="btn-primario w-full">Cadastrar</button></div>
        </form>
        <p className="mt-2 text-xs text-suave">LGPD: sua empresa é a controladora dos dados dos condutores; o Vigia Placa é operador. CPF e CNH ficam visíveis só para quem gerencia a conta.</p>
      </Card>
      <Card titulo="Termômetro de pontos (12 meses)">
        {condutores.length === 0 ? <Vazio>Nenhum condutor cadastrado.</Vazio> : (
          <ul className="divide-y divide-borda">
            {condutores.map((c) => {
              const lim = limitePontos(c.gravissimas_12m);
              const pct = Math.min(100, (c.pontos_12m / lim) * 100);
              return (
                <li key={c.id} className="grid items-center gap-2 py-3 sm:grid-cols-[1fr_2fr_auto]">
                  <div><div className="font-semibold">{c.nome}</div><div className="text-xs text-suave">CNH {c.cnh ?? "—"} · {c.indicacoes} indicação(ões){c.placas ? ` · ${c.placas}` : ""}</div></div>
                  <div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-nevoa"><div className={`h-full rounded-full ${pct >= 75 ? "bg-rec" : pct >= 50 ? "bg-ambar" : "bg-economia"}`} style={{ width: `${pct}%` }} /></div>
                    <div className="mt-1 text-xs text-suave">{c.pontos_12m} de {lim} pontos (limite com {c.gravissimas_12m} gravíssima(s), art. 261)</div>
                  </div>
                  <div className="text-xs text-suave">{c.whatsapp ?? ""}</div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
