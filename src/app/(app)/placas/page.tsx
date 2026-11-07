import Link from "next/link";
import { exigirCliente, noEscopo } from "@/lib/auth";
import { dataBR } from "@/lib/domain/dates";
import { rotuloFrequencia } from "@/lib/domain/monitoramento";
import { CampoFrequencia } from "@/components/frequencia";
import { Cabecalho, Card, Mensagem, Vazio } from "@/components/ui";
import { Placa } from "@/components/marca";
import { adicionarPlaca, alterarStatusPlaca, consultarAgora, salvarFrequenciaPlaca, salvarSne } from "../../actions";
import { LeitorDocumento } from "@/components/leitor-documento";
import { leitorAtivo } from "@/lib/integrations/leitor";

export const metadata = { title: "Placas" };
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
const STATUS: Record<string, string> = { ativa: "Ativa", pausada: "Pausada", aguardando: "Aguardando 1ª consulta", erro: "Erro de dados" };

export default async function Placas({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; q?: string }> }) {
  const s = await exigirCliente();
  const sp = await searchParams;
  const { placas, cli } = await noEscopo(s, async (db) => ({
    placas: await db.q(
      `select p.*, (select count(*) from multas m where m.placa_id = p.id and m.estado not in ('paga','cancelada')) as abertas
       from placas p where p.cliente_id = $1 ${sp.q ? "and (p.placa ilike $2 or p.apelido ilike $2 or p.grupo ilike $2)" : ""} order by p.status = 'pausada', p.placa`,
      sp.q ? [s.clienteId, `%${sp.q}%`] : [s.clienteId],
    ),
    cli: await db.one("select c.frequencia_padrao, c.consultas_avulsas_usadas, pl.consultas_avulsas from clientes c join planos pl on pl.id = c.plano_id where c.id = $1", [s.clienteId]),
  }));
  const semSne = placas.filter((p) => !p.sne_adesao_em && p.status !== "pausada").length;
  return (
    <>
      <Cabecalho
        titulo="Placas"
        sub={`${placas.filter((p) => p.status !== "pausada").length} placas vigiadas · frequência ${rotuloFrequencia(cli!.frequencia_padrao).toLowerCase()} · ${cli!.consultas_avulsas_usadas}/${cli!.consultas_avulsas} consultas avulsas usadas no plano`}
        acoes={<Link href="/placas/importar" className="btn-contorno">Importar planilha</Link>}
      />
      <Mensagem ok={sp.ok} erro={sp.erro} />
      {semSne > 0 && <div className="mb-4 rounded-xl bg-ambar-100 px-4 py-3 text-sm text-[#6b4700]"><b>{semSne} placa(s) sem SNE.</b> Faça a adesão no app Carteira Digital de Trânsito hoje: só multas com infração <i>depois</i> da adesão ganham 40%. Depois, informe a data aqui.</div>}

      <Card titulo="Cadastrar placa" className="mb-6">
        <form action={adicionarPlaca} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
          <div className="sm:col-span-3 lg:col-span-7"><LeitorDocumento foco="crlv" ativo={leitorAtivo()} rotulo="CRLV-e em PDF ou foto (opcional)" /></div>
          <div><label className="rotulo">Placa</label><input name="placa" required placeholder="ABC1D23" className="campo uppercase" /></div>
          <div><label className="rotulo">Renavam</label><input name="renavam" required inputMode="numeric" placeholder="11 dígitos" className="campo" /></div>
          <div><label className="rotulo">UF</label><select name="uf" className="campo" defaultValue="MG">{UFS.map((u) => <option key={u}>{u}</option>)}</select></div>
          <div><label className="rotulo">Apelido</label><input name="apelido" className="campo" /></div>
          <div><label className="rotulo">Grupo</label><input name="grupo" className="campo" /></div>
          <div><label className="rotulo">Adesão ao SNE</label><input name="sne" type="date" className="campo" /></div>
          <div className="flex items-end"><button className="btn-primario w-full">Cadastrar e consultar</button></div>
        </form>
        <p className="mt-2 text-xs text-suave">A primeira varredura é gratuita: mostra as multas em aberto e o dinheiro na mesa. Sem certificado digital, só placa e Renavam.</p>
      </Card>

      <Card titulo="Suas placas" acoes={<form><input name="q" defaultValue={sp.q} placeholder="Buscar placa, apelido ou grupo" className="campo w-64" /></form>}>
        {placas.length === 0 ? <Vazio>Nenhuma placa cadastrada.</Vazio> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="tabela min-w-[900px]">
              <thead><tr><th>Placa</th><th>Grupo / centro de custo</th><th>Status</th><th>Última verificação</th><th>Multas abertas</th><th>Adesão SNE</th><th /></tr></thead>
              <tbody>
                {placas.map((p) => (
                  <tr key={p.id} className={p.status === "pausada" ? "opacity-60" : ""}>
                    <td><Placa placa={p.placa} tamanho="sm" /><div className="mt-1 text-xs text-suave">{p.apelido ?? p.modelo ?? ""} · {p.uf} · Renavam {p.renavam}</div></td>
                    <td className="text-xs">{p.grupo ?? "—"}<div className="text-suave">{p.centro_custo ?? ""}</div></td>
                    <td className="text-xs">{STATUS[p.status]}{p.motivo_pausa ? ` (${p.motivo_pausa})` : ""}<div className="text-suave">{rotuloFrequencia(p.frequencia ?? cli!.frequencia_padrao).split(" (")[0]}{p.frequencia ? " (própria)" : ""}</div>
                      {s.nivel === "franqueadora" && (
                        <form action={salvarFrequenciaPlaca} className="mt-1 flex items-center gap-1">
                          <input type="hidden" name="placaId" value={p.id} />
                          <CampoFrequencia nome="frequencia" valor={p.frequencia} permitirPadrao compacto />
                          <button className="btn-leve btn-sm">OK</button>
                        </form>
                      )}</td>
                    <td className="text-xs">{p.ultima_verificacao ? new Date(p.ultima_verificacao).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}<div className="text-suave">próx.: {dataBR(p.proxima_verificacao)}</div></td>
                    <td>{Number(p.abertas) ? <Link className="link" href={`/multas?placa=${p.placa}`}>{p.abertas}</Link> : "0"}</td>
                    <td>
                      <form action={salvarSne} className="flex items-center gap-1">
                        <input type="hidden" name="placaId" value={p.id} />
                        <input type="date" name="sne" defaultValue={p.sne_adesao_em ?? ""} className={`campo w-36 py-1 text-xs ${p.sne_adesao_em ? "" : "border-ambar"}`} />
                        <button className="btn-leve btn-sm">OK</button>
                      </form>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {p.status !== "pausada" && (
                        <form action={consultarAgora} className="inline"><input type="hidden" name="placaId" value={p.id} /><button className="btn-contorno btn-sm">Consultar agora</button></form>
                      )}{" "}
                      <form action={alterarStatusPlaca} className="inline">
                        <input type="hidden" name="placaId" value={p.id} />
                        <input type="hidden" name="status" value={p.status === "pausada" ? "ativa" : "pausada"} />
                        {p.status !== "pausada" && <input type="hidden" name="motivo" value="pausada pelo cliente" />}
                        <button className="btn-leve btn-sm">{p.status === "pausada" ? "Reativar" : "Pausar"}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
