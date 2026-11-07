import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth";

export default async function Inicio() {
  const s = await sessaoAtual();
  if (!s) redirect("/login");
  if (s.nivel === "cliente" || s.clienteId) redirect("/hoje");
  redirect(s.nivel === "franqueado" ? "/carteira" : "/backoffice");
}
