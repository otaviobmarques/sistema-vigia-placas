"use client";
import { useActionState } from "react";
import { importarPlacas, validarImportacao } from "../../../actions";

export function Importador({ clienteFoco }: { clienteFoco: string | null }) {
  const [estado, acao, pendente] = useActionState(validarImportacao, {});
  const linhas = estado.linhas ?? [];
  const ok = linhas.filter((l) => !l.erros.length);
  const ruins = linhas.filter((l) => l.erros.length);
  const etapa = linhas.length ? 3 : 2;
  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-4 text-sm font-semibold">
        {["Baixar modelo", "Enviar planilha", "Revisar e importar"].map((t, i) => (
          <li key={t} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${i + 1 < etapa ? "bg-economia text-white" : i + 1 === etapa ? "bg-vigia text-white" : "bg-borda"}`}>{i + 1 < etapa ? "✓" : i + 1}</span>
            {t}
          </li>
        ))}
      </ol>

      <div className="grid gap-3 md:grid-cols-3">
        <form action={acao} className="card p-4">
          <div className="text-xs text-suave">Arquivo</div>
          {estado.arquivo && <div className="font-semibold">{estado.arquivo}</div>}
          <input type="file" name="arquivo" accept=".xlsx,.xls,.csv" required className="mt-2 block w-full text-sm" />
          <div className="mt-3 flex items-center gap-3">
            <button className="btn-primario btn-sm" disabled={pendente}>{pendente ? "Lendo…" : "Validar planilha"}</button>
            <a href="/api/placas/modelo" className="link text-xs">Baixar modelo</a>
          </div>
          {clienteFoco && <p className="mt-2 text-xs text-suave">Linhas sem CNPJ/CPF na coluna “cliente” vão para {clienteFoco}.</p>}
        </form>
        <div className="rounded-2xl border border-economia/40 bg-economia-100/60 p-4">
          <div className="text-xs text-economia">Prontas para importar</div>
          <div className="num text-3xl font-extrabold text-economia">{ok.length}</div>
        </div>
        <div className="rounded-2xl border border-rec/30 bg-rec-100/60 p-4">
          <div className="text-xs text-rec">Com erro</div>
          <div className="num text-3xl font-extrabold text-rec">{ruins.length}</div>
        </div>
      </div>
      {estado.erro && <p className="text-sm text-rec">{estado.erro}</p>}

      {ruins.length > 0 && (
        <section className="card p-5">
          <div className="mb-3 flex flex-wrap justify-between gap-2"><h2 className="text-lg font-bold">Linhas com erro</h2><span className="text-xs text-suave">Corrija na planilha e envie de novo, ou importe só as corretas</span></div>
          <div className="-mx-5 overflow-x-auto">
            <table className="tabela min-w-[640px]">
              <thead><tr><th>Linha</th><th>Cliente</th><th>Placa</th><th>Renavam</th><th>Problema</th></tr></thead>
              <tbody>
                {ruins.map((l) => (
                  <tr key={l.linha}>
                    <td>{l.linha}</td><td>{l.clienteNome ?? l.cliente ?? "—"}</td><td className="font-semibold">{l.placa}</td><td>{l.renavam}</td>
                    <td className="font-semibold text-rec">{l.erros.join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {ok.length > 0 && (
        <form action={importarPlacas} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="linhas" value={JSON.stringify(ok)} />
          <button className="btn-primario">Importar {ok.length} placas e fazer a primeira varredura</button>
          <span className="text-xs text-suave">
            {Object.entries(ok.reduce<Record<string, number>>((a, l) => ({ ...a, [l.clienteNome ?? "?"]: (a[l.clienteNome ?? "?"] ?? 0) + 1 }), {})).map(([c, n]) => `${c}: ${n}`).join(" · ")}
          </span>
        </form>
      )}
    </div>
  );
}
