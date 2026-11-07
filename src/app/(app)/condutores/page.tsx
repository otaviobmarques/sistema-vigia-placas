import { exigirCliente, noEscopo } from "@/lib/auth";
import { listarCondutores } from "@/lib/services/condutores";
import { CATEGORIAS_CNH, exigeToxicologico } from "@/lib/domain/condutores";
import { dataBR } from "@/lib/domain/dates";
import { Cabecalho, Card, Mensagem, Numero, Vazio } from "@/components/ui";
import { adicionarCondutor, atualizarCondutor } from "../../actions";

export const metadata = { title: "Condutores" };

function Validade({ dias, data, rotulo, masculino = false }: { dias: number | null; data: string | null; rotulo: string; masculino?: boolean }) {
  if (dias === null) return <span className="text-xs text-suave">{rotulo}: {masculino ? "não informado" : "não informada"}</span>;
  const cls = dias < 0 ? "bg-rec text-white" : dias <= 30 ? "bg-ambar text-vigia" : "bg-nevoa text-vigia border border-borda";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{rotulo} {dias < 0 ? `${masculino ? "vencido" : "vencida"} em ${dataBR(data)}` : `até ${dataBR(data)}`}</span>;
}

function Campos({ c }: { c?: Record<string, any> }) {
  return (
    <>
      <div className="lg:col-span-2"><label className="rotulo">Nome</label><input name="nome" required defaultValue={c?.nome} className="campo" /></div>
      <div><label className="rotulo">CPF</label><input name="cpf" defaultValue={c?.cpf ?? ""} className="campo" /></div>
      <div><label className="rotulo">Nº da CNH</label><input name="cnh" defaultValue={c?.cnh ?? ""} className="campo" /></div>
      <div><label className="rotulo">Categoria</label>
        <select name="cnh_categoria" defaultValue={c?.cnh_categoria ?? ""} className="campo"><option value="">—</option>{CATEGORIAS_CNH.map((k) => <option key={k}>{k}</option>)}</select>
      </div>
      <div><label className="rotulo">Validade da CNH</label><input type="date" name="cnh_validade" defaultValue={c?.cnh_validade ?? ""} className="campo" /></div>
      <div><label className="rotulo">Toxicológico válido até</label><input type="date" name="toxicologico_validade" defaultValue={c?.toxicologico_validade ?? ""} className="campo" /></div>
      <div><label className="rotulo">WhatsApp</label><input name="whatsapp" defaultValue={c?.whatsapp ?? ""} placeholder="+55 31 9…" className="campo" /></div>
      <div><label className="rotulo">E-mail</label><input name="email" type="email" defaultValue={c?.email ?? ""} className="campo" /></div>
      <div><label className="rotulo">Pontos já na CNH (fora daqui)</label><input name="pontos_12m" type="number" min={0} max={99} defaultValue={c?.pontos_12m ?? 0} className="campo" /></div>
      <div><label className="rotulo">…dos quais gravíssimas</label><input name="gravissimas_12m" type="number" min={0} max={20} defaultValue={c?.gravissimas_12m ?? 0} className="campo" /></div>
    </>
  );
}

export default async function Condutores({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const s = await exigirCliente();
  const sp = await searchParams;
  const { condutores, placas } = await noEscopo(s, async (db) => ({
    condutores: await listarCondutores(db, s.clienteId),
    placas: await db.q<{ id: string; placa: string; apelido: string | null; condutor_principal_id: string | null }>(
      "select id, placa, apelido, condutor_principal_id from placas where cliente_id = $1 and status <> 'pausada' order by placa", [s.clienteId]),
  }));
  const ativos = condutores.filter((c) => c.ativo);
  const emRisco = ativos.filter((c) => c.situacao.nivel === "critico" || c.situacao.nivel === "suspensao").length;
  const docs = ativos.filter((c) => (c.situacao.cnhDias !== null && c.situacao.cnhDias <= 30) || (exigeToxicologico(c.cnh_categoria) && (c.situacao.toxicologicoDias === null || c.situacao.toxicologicoDias <= 30))).length;
  const nota = ativos.length ? Math.round(ativos.reduce((a, c) => a + c.situacao.nota, 0) / ativos.length) : null;
  const cor = { ok: "bg-economia", atencao: "bg-ambar", critico: "bg-rec", suspensao: "bg-rec" };

  return (
    <>
      <Cabecalho titulo="Condutores" sub="Pontos dos últimos 12 meses, CNH e exame toxicológico. Os pontos das multas indicadas e aceitas aqui entram sozinhos." />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Condutores ativos" valor={ativos.length} />
        <Numero rotulo="Perto da suspensão" tom={emRisco ? "rec" : "normal"} valor={emRisco} detalhe="75% ou mais do limite de pontos" />
        <Numero rotulo="Documentos a vencer" tom={docs ? "ambar" : "normal"} valor={docs} detalhe="CNH ou toxicológico em até 30 dias" />
        <Numero destaque rotulo="Nota média da equipe" valor={nota ?? "—"} detalhe="0 a 100: pontos, gravíssimas e documentos" />
      </div>

      <Card titulo="Termômetro de pontos (12 meses)" className="mb-6">
        {condutores.length === 0 ? <Vazio>Nenhum condutor cadastrado.</Vazio> : (
          <ul className="divide-y divide-borda">
            {condutores.map((c) => {
              const st = c.situacao;
              return (
                <li key={c.id} className={`py-4 ${c.ativo ? "" : "opacity-50"}`}>
                  <div className="grid items-center gap-3 lg:grid-cols-[1.2fr_2fr_auto]">
                    <div>
                      <div className="font-semibold">{c.nome}{!c.ativo && " (inativo)"}</div>
                      <div className="text-xs text-suave">CNH {c.cnh ?? "—"}{c.cnh_categoria ? ` · cat. ${c.cnh_categoria}` : ""} · {c.indicacoes} indicação(ões){c.placas.length ? ` · ${c.placas.join(", ")}` : ""}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Validade dias={st.cnhDias} data={c.cnh_validade} rotulo="CNH" />
                        {exigeToxicologico(c.cnh_categoria) && <Validade dias={st.toxicologicoDias} data={c.toxicologico_validade} rotulo="Toxicológico" masculino />}
                      </div>
                    </div>
                    <div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-nevoa"><div className={`h-full rounded-full ${cor[st.nivel]}`} style={{ width: `${Math.min(100, st.uso * 100)}%` }} /></div>
                      <div className="mt-1 text-xs text-suave">
                        <b className="text-vigia">{st.pontos} de {st.limite} pontos</b> ({c.pontos_12m} informados + {c.pontos_indicados} de multas indicadas) · limite com {st.gravissimas} gravíssima(s), art. 261
                        {st.nivel === "suspensao" && <b className="text-rec"> · atingiu o limite: risco de suspensão</b>}
                      </div>
                    </div>
                    <div className="text-right"><div className="num text-2xl font-extrabold">{st.nota}</div><div className="text-[11px] text-suave">nota</div></div>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-vigia-600">Editar</summary>
                    <form action={atualizarCondutor} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                      <input type="hidden" name="id" value={c.id} />
                      <Campos c={c} />
                      <div className="sm:col-span-2 lg:col-span-6">
                        <div className="rotulo">Condutor principal das placas</div>
                        <div className="flex flex-wrap gap-2">
                          {placas.map((p) => (
                            <label key={p.id} className="inline-flex items-center gap-1.5 rounded-lg border border-borda px-2 py-1 text-xs">
                              <input type="checkbox" name="placas" value={p.id} defaultChecked={p.condutor_principal_id === c.id} className="accent-vigia" />
                              {p.placa}{p.apelido ? ` · ${p.apelido}` : ""}
                            </label>
                          ))}
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ativo" defaultChecked={c.ativo} className="accent-vigia" /> Ativo</label>
                      <div className="lg:col-span-5 flex justify-end"><button className="btn-primario btn-sm">Salvar</button></div>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card titulo="Novo condutor">
        <form action={adicionarCondutor} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Campos />
          <div className="flex items-end lg:col-span-2"><button className="btn-primario w-full">Cadastrar</button></div>
        </form>
        <p className="mt-2 text-xs text-suave">LGPD: sua empresa é a controladora dos dados dos condutores; o Vigia Placa é operador. Avisamos por e-mail e WhatsApp 30, 15, 7 e 1 dia antes de a CNH ou o toxicológico vencerem.</p>
      </Card>
    </>
  );
}
