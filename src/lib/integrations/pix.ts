/** BR Code (Pix copia e cola) estático — usado no modo simulado. */
function campo(id: string, valor: string) {
  return id + String(valor.length).padStart(2, "0") + valor;
}
function crc16(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
export function brCode(opts: { chave: string; valorCentavos: number; nome: string; cidade: string; txid: string }): string {
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", opts.chave);
  const semCrc =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    campo("54", (opts.valorCentavos / 100).toFixed(2)) +
    campo("58", "BR") +
    campo("59", opts.nome.slice(0, 25)) +
    campo("60", opts.cidade.slice(0, 15)) +
    campo("62", campo("05", opts.txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25))) +
    "6304";
  return semCrc + crc16(semCrc);
}
