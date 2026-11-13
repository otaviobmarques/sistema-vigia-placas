import { exigirSessao, noEscopo } from "@/lib/auth";
import { brl } from "@/lib/domain/money";
import { CampoFrequencia } from "@/components/frequencia";
import { Cabecalho, Card, Mensagem } from "@/components/ui";
import { Vigi } from "@/components/marca";
import { criarCliente } from "../../../actions";
import { DadosCliente } from "@/components/dados-cliente";
import { ehAdminSistema, franquiasAtivas } from "@/lib/acesso";
import { CICLOS } from "@/lib/domain/ciclo";
import { CamposPrecosCliente } from "@/components/precos-cliente";
import { CamposAntt } from "@/components/campos-antt";
import { listarProcuradores } from "@/lib/services/acesso-gov";

export const metadata = { title: "Novo cliente" };

export default async function NovoCliente({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const s = await exigirSessao(["franqueado", "franqueadora"]);
  const sp = await searchParams;
  const procuradores = await listarProcuradores();
  const d = await noEscopo(s, async (db) => ({
    planos: await db.q("select * from planos order by preco_placa nulls last"),
    franqueados: s.nivel === "franqueadora" ? await db.q("select id, nome from franqueados where ativo order by nome") : [],
    cfg: await db.one("select termo_versao from configuracao"),
    grupos: await db.q<{ id: string; nome: string }>("select id, nome from grupos_economicos order by nome"),
  }));
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-4"><Vigi pose="ola" size={80} /><Cabecalho titulo="Novo cliente" sub="Placa e Renavam bastam: sem certificado digital e sem autorização formal. A primeira varredura é gratuita e mostra o dinheiro na mesa." /></div>
      <Mensagem erro={sp.erro} />
      <form action={criarCliente} className="space-y-6">
        <Card titulo="1. Dados">
          <DadosCliente />
          <div className="mt-4 grid gap-3 border-t border-borda pt-4 sm:grid-cols-2">
            <div>
              <label className="rotulo">Grupo econômico (opcional)</label>
              <select name="grupo_id" defaultValue="" className="campo"><option value="">Nenhum</option>{d.grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select>
            </div>
            <div>
              <label className="rotulo">ou crie um grupo novo</label>
              <input name="grupo_novo" placeholder="Ex.: Grupo Raltex" className="campo" />
            </div>
            <p className="text-xs text-suave sm:col-span-2">Use para empresas com vários CNPJs: os relatórios podem somar todos os clientes do grupo.</p>
          </div>
          <div className="mt-4"><CamposAntt procuradores={procuradores} /></div>
          <div className="mt-4"><div className="rounded-xl border border-borda p-3">
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="sne_cadastrado"  className="h-4 w-4 accent-vigia" /> Registrado no SNE</label>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-suave"><span>Desde</span><input type="date" name="sne_desde"  className="campo w-40 py-1" /><span>(em branco = vale para todas as multas)</span></div>
              <p className="mt-1 text-[11px] text-suave">Proprietário com adesão ao Sistema de Notificação Eletrônica: as multas de órgãos aderentes têm direito a 40% de desconto.</p>
            </div></div>
        </Card>
        <Card titulo="2. Plano e cobrança">
          <div className="grid gap-3 sm:grid-cols-3">
            {d.planos.map((p, i) => (
              <label key={p.id} className="cursor-pointer rounded-xl border border-borda p-4 has-[:checked]:border-vigia has-[:checked]:ring-2 has-[:checked]:ring-vigia/10">
                <input type="radio" name="plano" value={p.id} defaultChecked={i === 1} className="accent-vigia" /> <b>{p.nome}</b>
                <div className="num mt-1 text-lg font-extrabold">{p.preco_placa ? `${brl(p.preco_placa)}` : "[DEFINIR]"}<span className="text-xs font-normal text-suave"> /placa/mês</span></div>
                <div className="text-xs text-suave">{p.inclui}</div>
              </label>
            ))}
          </div>
          {s.nivel === "franqueadora" && (
            <details open className="mt-3 rounded-xl border border-dashed border-borda p-4 open:border-vigia">
              <summary className="cursor-pointer text-sm font-semibold">Preços deste cliente: R$ por placa, % do saving, defesa e taxa de conveniência</summary>
              <div className="mt-3"><CamposPrecosCliente /></div>
              <p className="mt-2 text-xs text-suave">Em branco = valor do plano escolhido acima (placa e saving) ou o padrão do sistema (defesa e taxa). Os recursos e a frequência continuam os do plano.</p>
            </details>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {ehAdminSistema(s) ? (
              <div className="sm:col-span-3"><label className="rotulo">Frequência de consulta</label><CampoFrequencia nome="frequencia" valor="adaptativa" /></div>
            ) : (
              <div><div className="rotulo">Frequência de consulta</div><p className="text-sm text-suave">Conforme o plano (o Administrador do Sistema pode ajustar depois).</p></div>
            )}
            <div><label className="rotulo">Forma de pagamento</label><select name="forma_cobranca" className="campo"><option value="pix">Pix</option><option value="boleto">Boleto</option><option value="cartao">Cartão de crédito</option></select></div>
            <div><label className="rotulo">Fechamento da fatura</label><select name="ciclo_fechamento" defaultValue="mensal" className="campo">{Object.entries(CICLOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="rotulo">Vencimento (dias após o fechamento)</label><input name="vencimento_dias" type="number" min={0} max={60} defaultValue={5} className="campo" /></div>
            {s.nivel === "franqueadora" && franquiasAtivas() && <div><label className="rotulo">Franqueado</label><select name="franqueadoId" className="campo"><option value="">Direto (franqueadora)</option>{d.franqueados.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div>}
          </div>
        </Card>
        <Card titulo="3. Placas (opcional)">
          <label className="rotulo">Uma por linha: PLACA;RENAVAM;UF. Para muitas placas, use depois <a href="/placas/importar" className="link">Importar planilha</a> (com modelo pronto).</label>
          <textarea name="placas" rows={4} className="campo font-mono" placeholder={"ABC1D23;01234567897;MG"} />
          <p className="mt-1 text-xs text-suave">Muitas placas? Depois de criar o cliente, use Importar planilha.</p>
        </Card>
        <Card titulo="4. Acesso do cliente (opcional)">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="rotulo">Usuário (e-mail ou nome de usuário)</label><input name="email_admin" autoCapitalize="none" className="campo" /></div>
            <div><label className="rotulo">Senha (mín. 10)</label><input name="senha_admin" type="text" minLength={10} autoComplete="off" className="campo font-mono" /></div>
          </div>
          {s.nivel === "franqueadora" ? (
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" name="senha_definitiva" defaultChecked className="mt-1 accent-vigia" />
              <span>Senha definitiva <span className="block text-xs text-suave">O cliente entra com este usuário e senha sem precisar trocar. Desmarque para obrigar a troca no primeiro acesso.</span></span>
            </label>
          ) : <p className="mt-2 text-xs text-suave">O cliente troca a senha no primeiro acesso.</p>}
        </Card>
        <Card titulo="5. Aceite">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="aceite" required className="mt-1 accent-vigia" />
            <span>O cliente aceita os <b>Termos de Uso (versão {d.cfg!.termo_versao})</b>, autorizando o Vigia Placa a consultar, nas fontes disponíveis, os veículos cadastrados, e a tratar os dados de condutores como operador (LGPD). Data, hora, IP e versão do termo ficam registrados.</span>
          </label>
          <p className="mt-2 text-xs text-suave">A consulta é feita como melhor esforço sobre as fontes disponíveis; a responsabilidade por prazos começa quando a multa entra no sistema.</p>
        </Card>
        <button className="btn-primario w-full">Criar cliente e fazer a primeira varredura</button>
      </form>
    </div>
  );
}
