"use client";
import { useState } from "react";
import { PodeDirigir } from "@/components/condutor";
import { CamposCondutorRapido } from "@/components/condutor-rapido";

type Cliente = { id: string; nome: string; documento: string; placas: number };
type Condutor = { id: string; nome: string; cliente_id: string; pontos: number; limite: number; pode: { pode: boolean; motivos: string[] } };

/** Escolha do cliente e, logo abaixo, os condutores desse cliente para vincular à placa. */
export function ClienteECondutores({ clientes, condutores, inicial }: { clientes: Cliente[]; condutores: Condutor[]; inicial?: string }) {
  const [cliente, setCliente] = useState(inicial ?? "");
  const lista = condutores.filter((c) => c.cliente_id === cliente);
  return (
    <>
      <div className="sm:col-span-3"><label className="rotulo">Cliente</label>
        <select name="clienteId" required value={cliente} onChange={(e) => setCliente(e.target.value)} className="campo">
          <option value="" disabled>Escolha o cliente…</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome} · {c.documento} · {c.placas} placa(s)</option>)}
        </select>
      </div>
      {cliente && (
        <div className="space-y-2 rounded-xl border border-borda p-3 sm:col-span-3">
          <div className="rotulo">Condutores desta placa (um ou mais)</div>
          {lista.length ? (
            <div className="flex flex-wrap gap-2">
              {lista.map((c) => (
                <label key={c.id} className="inline-flex items-center gap-2 rounded-lg border border-borda px-2 py-1 text-sm">
                  <input type="checkbox" name="condutores" value={c.id} className="accent-vigia" />
                  {c.nome} <span className="text-xs text-suave">{c.pontos}/{c.limite} pts</span> <PodeDirigir pode={c.pode} compacto />
                </label>
              ))}
            </div>
          ) : <p className="text-xs text-suave">Este cliente ainda não tem condutores. Cadastre um abaixo.</p>}
          <CamposCondutorRapido />
        </div>
      )}
    </>
  );
}
