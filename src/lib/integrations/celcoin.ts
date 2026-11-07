/**
 * Celcoin — contingência para boletos que o Asaas não conseguir pagar.
 * Integração real pendente de proposta comercial (preço sob consulta); por ora, simulada.
 */
export async function pagarBoletoCelcoin(linhaDigitavel: string): Promise<{ ok: boolean; id?: string; erro?: string }> {
  if (!process.env.CELCOIN_CLIENT_ID) {
    if (linhaDigitavel.endsWith("00000")) return { ok: false, erro: "Recusado também pela Celcoin (simulado)" };
    return { ok: true, id: `celcoin_sim_${linhaDigitavel.slice(-8)}` };
  }
  return { ok: false, erro: "Integração Celcoin ainda não configurada" };
}
