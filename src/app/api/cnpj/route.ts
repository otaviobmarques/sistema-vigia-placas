/** Dados públicos da empresa pelo CNPJ (BrasilAPI → Receita Federal). Só para usuários logados. */
import { NextResponse } from "next/server";
import { sessaoAtual } from "@/lib/auth";
import { somenteDocumento, validarCNPJ } from "@/lib/domain/validators";

export async function GET(req: Request) {
  if (!(await sessaoAtual())) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const doc = somenteDocumento(new URL(req.url).searchParams.get("doc") ?? "");
  if (doc.length !== 14 || !validarCNPJ(doc)) return NextResponse.json({ erro: "CNPJ inválido" }, { status: 400 });
  if (!/^\d{14}$/.test(doc)) return NextResponse.json({ erro: "CNPJ alfanumérico ainda não tem consulta pública" }, { status: 404 });
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`, {
      headers: { "user-agent": "VigiaPlaca/1.0 (+https://vigia-placa.vercel.app)", accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    if (!r.ok) return NextResponse.json({ erro: "CNPJ não encontrado" }, { status: 404 });
    const j: any = await r.json();
    const endereco = [
      [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(" "),
      j.numero, j.complemento, j.bairro, j.municipio && `${j.municipio}/${j.uf}`, j.cep && `CEP ${String(j.cep).replace(/(\d{5})(\d{3})/, "$1-$2")}`,
    ].filter(Boolean).join(", ");
    const tel = String(j.ddd_telefone_1 ?? "").replace(/\D/g, "");
    return NextResponse.json({
      nome: j.razao_social ?? null,
      fantasia: j.nome_fantasia || null,
      endereco: endereco || null,
      telefone: tel.length >= 10 ? `+55${tel}` : null,
      email: j.email ? String(j.email).toLowerCase() : null,
      situacao: j.descricao_situacao_cadastral ?? null,
    });
  } catch {
    return NextResponse.json({ erro: "Consulta indisponível no momento" }, { status: 503 });
  }
}
