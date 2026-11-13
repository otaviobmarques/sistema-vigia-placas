import Link from "next/link";
import { exigirSessao, noEscopo } from "@/lib/auth";
import { brl } from "@/lib/domain/money";
import { Cabecalho, Card, Mensagem, Numero, Vazio } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { CamposAntt } from "@/components/campos-antt";
import { procuracaoValida, SQL_ACESSO_GOV } from "@/lib/services/acesso-gov";

/** Qual acesso a consulta vai usar (mesma ordem do serviço: procuração → gov.br → SIFAMA). */
function viaAcesso(c: { procuracao_gov: boolean; procuracao_validade: string | null; gov_login: string | null; antt_login: string | null }) {
  if (procuracaoValida(c)) return `Procuração gov.br${c.procuracao_validade ? ` até ${c.procuracao_validade.slice(0, 10).split("-").reverse().join("/")}` : ""}`;
  if (c.procuracao_gov) return "⚠ Procuração vencida";
  if (c.gov_login) return `gov.br do cliente (CPF ${c.gov_login})`;
  return `Login SIFAMA ${c.antt_login ?? "—"}`;
}
import { LogoOrgao } from "@/components/logo-orgao";
import { TabelaMultasAntt } from "@/components/multas-antt";
import { multasAntt } from "@/lib/services/antt";
import { consultarAnttJa, salvarAcessoAntt } from "../../../actions";

export const metadata = { title: "Multas ANTT" };

const quando = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca");

export default async function MultasAnttEquipe({ searchParams }: { searchParams: Promise<{ cliente?: string; grupo?: string; todas?: string; editar?: string; ok?: string; erro?: string }> }) {
  const s = await exigirSessao(["franqueadora", "franqueado"]);
  const sp = await searchParams;
  const d = await noEscopo(s, async (db) => ({
    multas: await multasAntt(db, { cliente: sp.cliente || null, grupo: sp.cliente ? null : sp.grupo || null, todas: sp.todas === "1" }),
    clientes: await db.q<{ id: string; nome: string; documento: string; antt_ativo: boolean; antt_login: string | null; antt_cnpj_representado: string | null; tem_senha_antt: boolean; antt_ultima_consulta: string | null; antt_ultimo_erro: string | null; antt_resumo: any;
      procuracao_gov: boolean; procuracao_validade: string | null; gov_login: string | null; tem_senha_gov: boolean; gov_multas_ativo: boolean; gov_ultimo_erro: string | null; doc_procuracao: string | null }>(
      `select c.id, c.nome, c.documento, c.antt_ativo, c.antt_login, c.antt_cnpj_representado, (c.antt_senha_cifrada is not null) as tem_senha_antt, c.antt_ultima_consulta, c.antt_ultimo_erro, c.antt_resumo,
              ${SQL_ACESSO_GOV}
         from clientes c where c.excluido_em is null order by c.antt_ativo desc, c.nome`,
    ),
    grupos: await db.q<{ id: string; nome: string }>("select id, nome from grupos_economicos order by nome"),
  }));
  const abertas = d.multas.filter((m) => m.aberta);
  const imped = abertas.filter((m) => m.impeditiva);
  const soma = (l: typeof abertas) => l.reduce((a, m) => a + Number(m.valor), 0);
  const ativos = d.clientes.filter((c) => c.antt_ativo);
  const comErro = ativos.filter((c) => c.antt_ultimo_erro);
  const editar = d.clientes.find((c) => c.id === sp.editar);
  return (
    <>
      <Cabecalho titulo={<span className="flex items-center gap-3"><LogoOrgao id="ANTT" nome="ANTT" tamanho="md" /> Multas ANTT</span>}
        sub="Multas regulatórias de transporte (RNTRC, vale-pedágio, frete/CIOT, produtos perigosos). A ANTT multa o CNPJ/CPF do transportador, não a placa: a consulta usa a procuração gov.br, o gov.br do cliente ou o login dele no SIFAMA." />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Em aberto" valor={abertas.length} tom={abertas.length ? "rec" : "economia"} detalhe={brl(soma(abertas))} />
        <Numero rotulo="Impeditivas" valor={imped.length} tom={imped.length ? "rec" : "normal"} detalhe={`${brl(soma(imped))} · travam o RNTRC`} />
        <Numero rotulo="Clientes monitorados" valor={ativos.length} detalhe={`de ${d.clientes.length} clientes`} />
        <Numero rotulo="Acesso com problema" valor={comErro.length} tom={comErro.length ? "ambar" : "normal"} detalhe="login, senha ou SIFAMA fora" />
      </div>

      <Card titulo="Multas" className="mb-6">
        <form className="mb-4 flex flex-wrap items-end gap-2">
          {d.grupos.length > 0 && <div><label className="rotulo">Grupo econômico</label><select name="grupo" defaultValue={sp.grupo ?? ""} className="campo w-56"><option value="">Todos os grupos</option>{d.grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select></div>}
          <div><label className="rotulo">Cliente</label><select name="cliente" defaultValue={sp.cliente ?? ""} className="campo w-64"><option value="">Todos os clientes</option>{ativos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="todas" value="1" defaultChecked={sp.todas === "1"} className="accent-vigia" /> Incluir pagas/encerradas</label>
          <button className="btn-contorno">Filtrar</button>
          {(sp.cliente || sp.grupo || sp.todas) && <Link href="?" className="btn-leve">Limpar</Link>}
        </form>
        <TabelaMultasAntt linhas={d.multas} mostrarCliente volta="/gestao/antt" />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card titulo="Acesso ao SIFAMA por cliente" className="lg:col-span-2">
          {!ativos.length ? <Vazio>Nenhum cliente com a ANTT ativa. Configure o acesso ao lado ou no cadastro do cliente.</Vazio> : (
            <ul className="divide-y divide-borda">
              {ativos.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{c.nome}</div>
                    <div className="text-xs text-suave">{viaAcesso(c)} · última consulta {quando(c.antt_ultima_consulta)}{c.antt_resumo?.debitoTotal ? ` · débito no SIFAMA ${brl(Number(c.antt_resumo.debitoTotal))}` : ""}</div>
                    {c.antt_ultimo_erro && <div className="mt-1 text-xs font-semibold text-rec">⚠ {c.antt_ultimo_erro}</div>}
                    {!c.procuracao_gov && !c.gov_login && !c.tem_senha_antt && <div className="mt-1 text-xs font-semibold text-ambar">Falta a senha do SIFAMA.</div>}
                  </div>
                  <Link href={`?editar=${c.id}#acesso`} className="btn-leve btn-sm">Editar acesso</Link>
                  <form action={consultarAnttJa}><input type="hidden" name="clienteId" value={c.id} /><BotaoEnviar className="btn-contorno btn-sm" enviando="Enviando…">Consultar agora</BotaoEnviar></form>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card titulo={editar ? `Acesso de ${editar.nome}` : "Configurar acesso"} className="h-fit">
          <div id="acesso" />
          <form key={editar?.id ?? "novo"} action={salvarAcessoAntt} className="space-y-3">
            {editar ? <input type="hidden" name="clienteId" value={editar.id} /> : (
              <div><label className="rotulo">Cliente</label><select name="clienteId" required defaultValue="" className="campo"><option value="" disabled>Escolha…</option>{d.clientes.filter((c) => !c.antt_ativo).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
            )}
            <CamposAntt c={editar ?? { antt_ativo: true }} compacto />
            <BotaoEnviar className="btn-primario w-full" enviando="Salvando…">Salvar e consultar</BotaoEnviar>
            {editar && <Link href="?" className="block text-center text-xs text-suave underline">Cancelar</Link>}
          </form>
        </Card>
      </div>
    </>
  );
}
