import { NextResponse } from "next/server";
import { noEscopo, sessaoAtual } from "@/lib/auth";
import { gerarRelatorio, relatorioXlsx } from "@/lib/services/relatorios";
import { hojeISO, somarDias } from "@/lib/domain/dates";

export async function GET(req: Request) {
  const s = await sessaoAtual();
  if (!s?.clienteId) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const ok = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const ate = ok(q.get("ate")) ?? hojeISO();
  const de = ok(q.get("de")) ?? somarDias(ate, -365);
  const clienteId = s.clienteId;
  const { r, nome } = await noEscopo(s, async (db) => ({
    r: await gerarRelatorio(db, clienteId, de, ate),
    nome: (await db.one("select nome from clientes where id = $1", [clienteId]))?.nome ?? "cliente",
  }));
  const arquivo = `relatorio_${nome.normalize("NFD").replace(/[^\w]+/g, "_").toLowerCase()}_${de}_${ate}.xlsx`;
  return new Response(new Uint8Array(relatorioXlsx(r, nome)), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${arquivo}"`,
      "cache-control": "private, no-store",
    },
  });
}
