import { exigirSessao } from "@/lib/auth";
import { Cabecalho } from "@/components/ui";
import { Importador } from "./importador";

export const metadata = { title: "Importar placas" };

export default async function Importar() {
  const s = await exigirSessao();
  return (
    <>
      <Cabecalho
        titulo="Importar placas em lote"
        sub={s.clienteId && s.nivel === "cliente" ? "Suba a planilha com as suas placas." : "Suba a planilha com as placas de um ou de vários clientes. A coluna “cliente” (CNPJ ou CPF, não o nome) distribui cada placa para a conta certa."}
      />
      <Importador clienteFoco={s.clienteNome} />
    </>
  );
}
