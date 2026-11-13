/** Varredura agendada (Vercel Cron ou qualquer agendador). Protegida por CRON_SECRET (Authorization: Bearer). */
import { NextResponse } from "next/server";
import { sistema } from "@/lib/db";
import { varredura } from "@/lib/services/monitoramento";
import { enfileirarAntt, enfileirarConsultas, filaSeparada } from "@/lib/services/fila-consultas";
import { clientesComAntt } from "@/lib/services/antt";
import { limparDocumentosVencidos } from "@/lib/services/documentos";
import { fecharPeriodosEncerrados } from "@/lib/services/faturamento";

export const maxDuration = 300;

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  // Em produção cada placa é consultada numa execução própria; aqui só se escolhe quem consultar.
  const r = await sistema((db) => (filaSeparada() ? varredura(db, 1000, { enfileirar: enfileirarConsultas, custoEstimado: 36 }) : varredura(db)));
  // ANTT/SIFAMA: uma consulta por cliente com acesso cadastrado.
  const antt = await enfileirarAntt(await sistema((db) => clientesComAntt(db)));
  // Fecha as faturas dos clientes cujo ciclo (diário, semanal, quinzenal, mensal) terminou ontem.
  const faturas = await sistema((db) => fecharPeriodosEncerrados(db));
  // Retenção: boletos e notificações ficam 60 dias no banco.
  const limpeza = await sistema((db) => limparDocumentosVencidos(db));
  return NextResponse.json({ ...r, antt: antt.enviadas, faturas, limpeza });
}
