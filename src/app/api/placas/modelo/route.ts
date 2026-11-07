import { modeloPlanilha } from "@/lib/services/importacao";

export async function GET() {
  return new Response(new Uint8Array(modeloPlanilha()), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="modelo_placas_vigia_placa.xlsx"',
    },
  });
}
