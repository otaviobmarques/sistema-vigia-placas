import QRCode from "qrcode";
import { exigirCliente, noEscopo } from "@/lib/auth";
import { urlOtpauth } from "@/lib/totp";
import { brl } from "@/lib/domain/money";
import { FREQUENCIAS } from "@/lib/domain/monitoramento";
import { Abas, Cabecalho, Card, Mensagem } from "@/components/ui";
import { confirmar2fa, convidarUsuario, iniciar2fa, salvarConfiguracoes } from "../../actions";

export const metadata = { title: "Configurações" };

const ABAS = [
  ["monitoramento", "Monitoramento"], ["alertas", "Alertas"], ["aprovacoes", "Aprovações"], ["pagamento", "Pagamento"],
  ["condutores", "Condutores"], ["centros", "Centros de custo"], ["usuarios", "Usuários"], ["plano", "Plano e faturas"],
] as const;

export default async function Configuracoes({ searchParams }: { searchParams: Promise<{ aba?: string; ok?: string; erro?: string; segredo?: string }> }) {
  const s = await exigirCliente();
  const sp = await searchParams;
  const aba = ABAS.some(([id]) => id === sp.aba) ? sp.aba! : "monitoramento";
  const d = await noEscopo(s, async (db) => ({
    c: await db.one("select c.*, pl.nome as plano_nome, pl.preco_placa, pl.inclui, pl.consultas_avulsas from clientes c join planos pl on pl.id = c.plano_id where c.id = $1", [s.clienteId]),
    grupos: await db.q("select coalesce(grupo,'') as grupo, count(*) as n, max(frequencia) as frequencia from placas where cliente_id = $1 and status <> 'pausada' group by 1 order by 1", [s.clienteId]),
    usuarios: await db.q("select nome, email, perfil, totp_secret is not null as dois from usuarios where cliente_id = $1 order by nome", [s.clienteId]),
    faturas: await db.q("select * from faturas where cliente_id = $1 order by mes desc limit 12", [s.clienteId]),
    cfg: await db.one("select saving_bps from configuracao"),
    ccs: await db.q("select centro_custo, count(*) as n from placas where cliente_id = $1 and centro_custo is not null group by 1 order by 1", [s.clienteId]),
  }));
  const c = d.c!;
  const reais = (v: number | null) => (v === null || v === undefined ? "" : (v / 100).toFixed(2).replace(".", ","));
  const qr = sp.segredo ? await QRCode.toDataURL(urlOtpauth(sp.segredo, s.email), { margin: 1, width: 200 }) : null;

  const Salvar = () => <div className="mt-4"><button className="btn-primario">Salvar</button></div>;
  return (
    <>
      <Cabecalho titulo="Configurações" sub="Tudo já vem com padrões sensatos. Mude só o que quiser." />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      <Abas ativo={aba} itens={ABAS.map(([id, r]) => ({ id, rotulo: r, href: `?aba=${id}` }))} />
      <Card>
        {aba === "monitoramento" && (
          <form action={salvarConfiguracoes} className="space-y-4">
            <input type="hidden" name="aba" value="monitoramento" />
            <div className="max-w-sm"><label className="rotulo">Frequência padrão</label>
              <select name="frequencia" defaultValue={c.frequencia_padrao} className="campo">{Object.entries(FREQUENCIAS).map(([k, f]) => <option key={k} value={k}>{f.rotulo}</option>)}</select>
            </div>
            <div>
              <div className="rotulo">Por grupo de placas</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {d.grupos.map((g) => (
                  <label key={g.grupo} className="flex items-center justify-between gap-2 rounded-xl border border-borda p-3 text-sm">
                    <span>{g.grupo || "Sem grupo"} <span className="text-suave">· {g.n} placas</span></span>
                    <select name={`freq_grupo:${g.grupo}`} defaultValue={g.frequencia ?? ""} className="campo w-40 py-1.5"><option value="">Padrão</option>{Object.entries(FREQUENCIAS).map(([k, f]) => <option key={k} value={k}>{f.rotulo.split(" ")[0]}</option>)}</select>
                  </label>
                ))}
              </div>
            </div>
            <p className="text-xs text-suave">Adaptativa: semanal, e diária quando a placa teve multa nos últimos 30 dias ou tem prazo nos próximos 10. Pausar e reativar placas: tela Placas.</p>
            <Salvar />
          </form>
        )}
        {aba === "alertas" && (
          <form action={salvarConfiguracoes} className="grid max-w-2xl gap-4 sm:grid-cols-2">
            <input type="hidden" name="aba" value="alertas" />
            <div className="sm:col-span-2"><div className="rotulo">Canais</div>
              {["whatsapp", "email", "push"].map((k) => (
                <label key={k} className="mr-4 inline-flex items-center gap-2 text-sm"><input type="checkbox" name="canais" value={k} defaultChecked={c.alertas_canais.includes(k)} className="accent-vigia" />{{ whatsapp: "WhatsApp", email: "E-mail", push: "Push" }[k]}</label>
              ))}
            </div>
            <div><label className="rotulo">E-mail para alertas</label><input name="email" defaultValue={c.email ?? ""} className="campo" /></div>
            <div><label className="rotulo">WhatsApp para alertas</label><input name="whatsapp" defaultValue={c.whatsapp ?? ""} className="campo" /></div>
            <div><label className="rotulo">Antecedência dos avisos (dias)</label><input name="antecedencias" defaultValue={c.alertas_antecedencias.join(", ")} className="campo" /></div>
            <div><label className="rotulo">Resumo</label><select name="resumo" defaultValue={c.resumo} className="campo"><option value="diario">Diário</option><option value="semanal">Semanal</option><option value="nenhum">Sem resumo</option></select></div>
            <p className="text-xs text-suave sm:col-span-2">Se ninguém agir até o último aviso, o franqueado responsável também é avisado (escalonamento).</p>
            <Salvar />
          </form>
        )}
        {aba === "aprovacoes" && (
          <form action={salvarConfiguracoes} className="max-w-xl space-y-4">
            <input type="hidden" name="aba" value="aprovacoes" />
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="franqueado_pode_agir" defaultChecked={c.franqueado_pode_agir} disabled={s.nivel === "franqueado"} className="mt-1 accent-vigia" />
              <span><b>O franqueado pode agir por mim</b> (pagar, indicar e pedir defesa) sem a minha aprovação.</span></label>
            <div className="max-w-xs"><label className="rotulo">Exigir segunda aprovação acima de (R$)</label><input name="aprovacao_dupla_acima" defaultValue={reais(c.aprovacao_dupla_acima)} className="campo" placeholder="sem limite" /></div>
            <p className="text-xs text-suave">Perfis: administrador faz tudo; gestor paga, indica e pede defesa; financeiro só paga; leitura só vê.</p>
            {s.nivel === "franqueado" ? <p className="text-sm text-suave">Só o próprio cliente altera esta aba.</p> : <Salvar />}
          </form>
        )}
        {aba === "pagamento" && (
          <form action={salvarConfiguracoes} className="grid max-w-2xl gap-4 sm:grid-cols-2">
            <input type="hidden" name="aba" value="pagamento" />
            <div><label className="rotulo">Cobrança da mensalidade</label><select name="forma_cobranca" defaultValue={c.forma_cobranca} className="campo"><option value="pix">Pix</option><option value="boleto">Boleto</option><option value="cartao">Cartão</option></select></div>
            <div><label className="rotulo">Responsável financeiro</label><input name="resp_financeiro" defaultValue={c.resp_financeiro ?? ""} className="campo" /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="pagamento_auto" defaultChecked={c.pagamento_auto} className="accent-vigia" /> Colocar automaticamente no carrinho as multas com desconto até:</label>
            <div><input name="pagamento_auto_ate" defaultValue={reais(c.pagamento_auto_ate)} placeholder="R$ 200,00" className="campo" /></div>
            <Salvar />
          </form>
        )}
        {aba === "condutores" && (
          <form action={salvarConfiguracoes} className="space-y-4">
            <input type="hidden" name="aba" value="condutores" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="envio_auto" defaultChecked={c.envio_auto_link_condutor} className="accent-vigia" /> Enviar automaticamente o link de aceite da indicação ao condutor por WhatsApp</label>
            <p className="text-xs text-suave">Lista de condutores e vínculo com placas: tela Condutores.</p>
            <Salvar />
          </form>
        )}
        {aba === "centros" && (
          <form action={salvarConfiguracoes} className="max-w-xl space-y-4">
            <input type="hidden" name="aba" value="centros" />
            <div><label className="rotulo">Rateio das multas</label><select name="rateio" defaultValue={c.rateio} className="campo"><option value="nenhum">Sem rateio</option><option value="placa">Por placa (centro de custo da placa)</option><option value="condutor">Por condutor</option></select></div>
            <ul className="text-sm">{d.ccs.map((cc) => <li key={cc.centro_custo}>{cc.centro_custo} · {cc.n} placas</li>)}</ul>
            <Salvar />
          </form>
        )}
        {aba === "usuarios" && (
          <div className="space-y-6">
            <table className="tabela">
              <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Dois fatores</th></tr></thead>
              <tbody>{d.usuarios.map((u) => <tr key={u.email}><td>{u.nome}</td><td>{u.email}</td><td>{u.perfil}</td><td>{u.dois ? "Ativo" : "—"}</td></tr>)}</tbody>
            </table>
            <form action={convidarUsuario} className="grid gap-3 sm:grid-cols-4">
              <input name="nome" placeholder="Nome" className="campo" />
              <input name="email" type="email" required placeholder="E-mail" className="campo" />
              <select name="perfil" className="campo"><option value="gestor">Gestor</option><option value="financeiro">Financeiro</option><option value="leitura">Leitura</option><option value="admin">Administrador</option></select>
              <button className="btn-contorno">Convidar</button>
            </form>
            <div className="rounded-xl border border-borda p-4">
              <h3 className="font-bold">Autenticação em dois fatores</h3>
              {s.doisFatores ? <p className="text-sm text-economia">Ativa para a sua conta.</p> : sp.segredo ? (
                <form action={confirmar2fa} className="mt-2 flex flex-wrap items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr!} alt="QR do autenticador" className="h-36 w-36" />
                  <div className="space-y-2"><p className="text-sm text-suave">Leia o QR no Google Authenticator ou similar e digite o código.</p>
                    <input type="hidden" name="segredo" value={sp.segredo} /><input name="codigo" inputMode="numeric" maxLength={6} className="campo w-40" required /><button className="btn-primario ml-2">Confirmar</button></div>
                </form>
              ) : <form action={iniciar2fa} className="mt-2"><p className="mb-2 text-sm text-suave">Recomendado para administradores.</p><button className="btn-contorno">Ativar dois fatores</button></form>}
            </div>
          </div>
        )}
        {aba === "plano" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-borda p-4"><div className="text-xs text-suave">Plano</div><div className="text-xl font-extrabold">{c.plano_nome}</div><div className="text-xs text-suave">{c.inclui}</div></div>
              <div className="rounded-xl border border-borda p-4"><div className="text-xs text-suave">Preço por placa/mês</div><div className="num text-xl font-extrabold">{c.preco_placa ? brl(c.preco_placa) : "[DEFINIR]"}</div></div>
              <div className="rounded-xl border border-borda p-4"><div className="text-xs text-suave">Saving vigente</div><div className="num text-xl font-extrabold">{d.cfg!.saving_bps / 100}%</div><div className="text-xs text-suave">sobre a economia comprovada{c.saving_teto ? ` · teto ${brl(c.saving_teto)}` : ""}</div></div>
            </div>
            <table className="tabela">
              <thead><tr><th>Mês</th><th className="text-right">Mensalidades</th><th className="text-right">Saving</th><th className="text-right">Defesa</th><th className="text-right">Total</th><th>Status</th></tr></thead>
              <tbody>{d.faturas.length ? d.faturas.map((f) => <tr key={f.id}><td>{f.mes}</td><td className="num text-right">{brl(f.mensalidades)}</td><td className="num text-right">{brl(f.saving)}</td><td className="num text-right">{brl(f.defesa)}</td><td className="num text-right font-semibold">{brl(f.total)}</td><td>{f.status}</td></tr>) : <tr><td colSpan={6} className="text-center text-suave">Nenhuma fatura fechada ainda. Veja a prévia no Extrato de Economia.</td></tr>}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
