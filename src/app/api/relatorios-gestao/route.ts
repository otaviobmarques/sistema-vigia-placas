import { NextResponse } from "next/server";
import { noEscopo, sessaoAtual } from "@/lib/auth";
import { hojeISO } from "@/lib/domain/dates";
import { ehRelatorio, gerarRelatorioGestao, PERIODO_DO_RELATORIO, tabelaXlsx } from "@/lib/services/relatorios-gestao";
import { lerPeriodo } from "@/lib/domain/periodo";

/** Excel dos relatórios da equipe Vigia Placa (respeita o escopo do usuário: RLS). */
export async function GET(req: Request) {
  const s = await sessaoAtual();
  if (!s || s.nivel === "cliente") return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const tipo = q.get("tipo") ?? "";
  if (!ehRelatorio(tipo)) return NextResponse.json({ erro: "relatório inválido" }, { status: 400 });
  const cfgP = PERIODO_DO_RELATORIO[tipo];
  const periodo = cfgP ? lerPeriodo(q, cfgP.padrao, hojeISO(), cfgP.aceitaTudo).periodo : null;
  const t = await noEscopo(s, (db) => gerarRelatorioGestao(db, tipo, { ver: q.get("ver"), periodo, cliente: q.get("cliente"), grupo: q.get("cliente") ? null : q.get("grupo"), placa: q.get("placa"), condutor: q.get("condutor"), mes: q.get("mes"), novas: q.get("novas") === "1" }));
  const arquivo = `vigia_${tipo}_${hojeISO()}.xlsx`;
  return new Response(new Uint8Array(tabelaXlsx(t)), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${arquivo}"`,
      "cache-control": "private, no-store",
    },
  });
}
