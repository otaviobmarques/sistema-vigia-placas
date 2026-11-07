import Link from "next/link";
import { Vigi } from "@/components/marca";
export default function NaoEncontrado() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <Vigi pose="alerta" size={140} />
      <h1 className="text-2xl font-extrabold">Não encontrei esta página.</h1>
      <Link href="/" className="btn-primario">Voltar ao início</Link>
    </main>
  );
}
