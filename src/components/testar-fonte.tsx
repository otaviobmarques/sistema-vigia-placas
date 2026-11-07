"use client";
import { useActionState } from "react";
import { testarFonteInfosimples } from "@/app/actions";

export function TestarFonte({ fontes, ativo }: { fontes: Array<{ servico: string; nome: string; uf: string; aConfirmar?: boolean }>; ativo: boolean }) {
  const [estado, acao, pendente] = useActionState(testarFonteInfosimples, {});
  return (
    <div>
      <form action={acao} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2"><label className="rotulo">Fonte</label>
          <select name="servico" className="campo">{fontes.map((f) => <option key={f.servico} value={f.servico}>{f.nome} ({f.servico}){f.aConfirmar ? " · a confirmar" : ""}</option>)}</select>
        </div>
        <div><label className="rotulo">Placa</label><input name="placa" className="campo uppercase" placeholder="ABC1D23" /></div>
        <div><label className="rotulo">Renavam</label><input name="renavam" inputMode="numeric" className="campo" /></div>
        <div><label className="rotulo">CPF/CNPJ do dono (só RJ)</label><input name="documento" className="campo" /></div>
        <div className="lg:col-span-5 flex items-center gap-3">
          <button className="btn-primario btn-sm" disabled={!ativo || pendente}>{pendente ? "Consultando (pode levar 1 min)…" : "Testar consulta real"}</button>
          <span className="text-xs text-suave">{ativo ? "Cobra uma consulta da sua conta Infosimples. Nada é gravado no sistema." : "Configure INFOSIMPLES_TOKEN para usar."}</span>
        </div>
      </form>
      {estado.erro && <p className="mt-3 text-sm text-rec">{estado.erro}</p>}
      {estado.resumo && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold">{estado.servico}: {estado.resumo}</p>
          {!!estado.multas?.length && (
            <div className="overflow-x-auto"><table className="tabela min-w-[640px]">
              <thead><tr><th>Auto</th><th>Órgão</th><th>Infração</th><th>Valor</th><th>Data</th><th>Vencimento</th><th>Pontos</th></tr></thead>
              <tbody>{estado.multas.map((m, i) => <tr key={i}>{["auto", "orgao", "descricao", "valor", "data", "vencimento", "pontos"].map((k) => <td key={k} className="text-xs">{String(m[k] ?? "—")}</td>)}</tr>)}</tbody>
            </table></div>
          )}
          <details><summary className="cursor-pointer text-xs font-semibold text-vigia-600">Resposta crua da Infosimples</summary>
            <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-nevoa p-3 text-[11px]">{estado.bruto}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
