import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth";
import { SiteVendas } from "@/components/site/site-vendas";
import { carregarPlanosSite } from "@/components/site/planos";

export const metadata: Metadata = {
  title: "Vigia Placa · Redução de custos com multas de frota",
  description: "Monitoramento de multas por placa e Renavam em bases oficiais redundantes. Até 40% de desconto, zero multa NIC e saving só sobre a economia comprovada.",
};

/** Visitante vê o site de vendas; quem está logado vai direto para o sistema. */
export default async function Inicio() {
  const s = await sessaoAtual();
  if (!s) return <SiteVendas planos={await carregarPlanosSite()} />;
  if (s.nivel === "cliente" || s.clienteId) redirect("/hoje");
  redirect(s.nivel === "franqueadora" ? (s.perfil === "admin" ? "/backoffice" : "/painel") : "/carteira");
}
