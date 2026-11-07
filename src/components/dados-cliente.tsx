"use client";
import { useRef, useState } from "react";

/** Campos de dados do cliente; ao sair do CNPJ, preenche o que estiver vazio com os dados públicos. */
export function DadosCliente() {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  async function buscar(valor: string) {
    const doc = valor.replace(/[^0-9A-Za-z]/g, "");
    if (doc.length !== 14) return setStatus(null);
    setStatus("Buscando dados públicos da empresa…");
    try {
      const r = await fetch(`/api/cnpj?doc=${doc}`);
      const j = await r.json();
      if (!r.ok) return setStatus(j.erro ?? "Não encontrei este CNPJ.");
      const campo = (n: string) => ref.current?.querySelector<HTMLInputElement>(`[name="${n}"]`);
      const preencher = (n: string, v: string | null) => { const c = campo(n); if (c && v && !c.value) c.value = v; };
      preencher("nome", j.nome); preencher("endereco", j.endereco); preencher("whatsapp", j.telefone); preencher("email", j.email);
      setStatus(`Dados da Receita preenchidos${j.situacao ? ` · situação: ${j.situacao}` : ""}. Confira antes de salvar.`);
    } catch {
      setStatus("Consulta indisponível agora; preencha à mão.");
    }
  }
  return (
    <div ref={ref}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="rotulo">CPF ou CNPJ</label><input name="documento" required className="campo" placeholder="CNPJ numérico ou alfanumérico" onBlur={(e) => buscar(e.target.value)} /></div>
        <div><label className="rotulo">Nome / razão social</label><input name="nome" required className="campo" /></div>
        <div><label className="rotulo">E-mail</label><input name="email" type="email" required className="campo" /></div>
        <div><label className="rotulo">WhatsApp</label><input name="whatsapp" required className="campo" placeholder="+55 31 9…" /></div>
        <div className="sm:col-span-2"><label className="rotulo">Endereço</label><input name="endereco" className="campo" /></div>
        <div><label className="rotulo">Segmento</label><select name="segmento" className="campo"><option>Frota</option><option>Lojista</option><option>Locadora</option><option>Pessoa física</option></select></div>
        <div><label className="rotulo">Responsável financeiro</label><input name="resp_financeiro" className="campo" /></div>
      </div>
      <p className="mt-2 text-xs text-suave">{status ?? "Com CNPJ, os dados públicos da empresa são preenchidos automaticamente."}</p>
    </div>
  );
}
