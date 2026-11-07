import { exigirSessao, noEscopo } from "@/lib/auth";
import { brl } from "@/lib/domain/money";
import { FREQUENCIAS } from "@/lib/domain/monitoramento";
import { Cabecalho, Card, Mensagem } from "@/components/ui";
import { Vigi } from "@/components/marca";
import { criarCliente } from "../../../actions";
import { DadosCliente } from "@/components/dados-cliente";

export const metadata = { title: "Novo cliente" };

export default async function NovoCliente({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const s = await exigirSessao(["franqueado", "franqueadora"]);
  const sp = await searchParams;
  const d = await noEscopo(s, async (db) => ({
    planos: await db.q("select * from planos order by preco_placa nulls last"),
    franqueados: s.nivel === "franqueadora" ? await db.q("select id, nome from franqueados where ativo order by nome") : [],
    cfg: await db.one("select termo_versao from configuracao"),
  }));
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-4"><Vigi pose="ola" size={80} /><Cabecalho titulo="Novo cliente" sub="Placa e Renavam bastam: sem certificado digital e sem autorização formal. A primeira varredura é gratuita e mostra o dinheiro na mesa." /></div>
      <Mensagem erro={sp.erro} />
      <form action={criarCliente} className="space-y-6">
        <Card titulo="1. Dados">
          <DadosCliente />
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
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div><label className="rotulo">Frequência padrão</label><select name="frequencia" defaultValue="adaptativa" className="campo">{Object.entries(FREQUENCIAS).map(([k, f]) => <option key={k} value={k}>{f.rotulo}</option>)}</select></div>
            <div><label className="rotulo">Mensalidade via</label><select name="forma_cobranca" className="campo"><option value="pix">Pix</option><option value="boleto">Boleto</option><option value="cartao">Cartão</option></select></div>
            {s.nivel === "franqueadora" && <div><label className="rotulo">Franqueado</label><select name="franqueadoId" className="campo"><option value="">Direto (franqueadora)</option>{d.franqueados.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div>}
          </div>
        </Card>
        <Card titulo="3. Placas (opcional)">
          <label className="rotulo">Uma por linha: PLACA;RENAVAM;UF</label>
          <textarea name="placas" rows={4} className="campo font-mono" placeholder={"ABC1D23;01234567897;MG"} />
          <p className="mt-1 text-xs text-suave">Muitas placas? Depois de criar o cliente, use Importar planilha.</p>
        </Card>
        <Card titulo="4. Acesso do cliente (opcional)">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="rotulo">Login do administrador (e-mail ou usuário)</label><input name="email_admin" autoCapitalize="none" className="campo" /></div>
            <div><label className="rotulo">Senha provisória (mín. 10)</label><input name="senha_admin" type="password" minLength={10} autoComplete="new-password" className="campo" /></div>
          </div>
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
