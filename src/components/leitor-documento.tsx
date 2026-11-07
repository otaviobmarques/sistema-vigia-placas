"use client";
import { useRef, useState } from "react";

type Foco = "notificacao" | "crlv";

/**
 * Campo de arquivo que, ao escolher a foto/PDF, pede a leitura automática e preenche
 * os campos vazios do formulário em volta. O arquivo continua indo junto no envio do formulário.
 */
export function LeitorDocumento({ foco, ativo, rotulo }: { foco: Foco; ativo: boolean; rotulo: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<{ tom: "info" | "ok" | "erro"; texto: string } | null>(null);

  async function ler(arquivo: File) {
    if (!ativo) return;
    setStatus({ tom: "info", texto: "O Vigi está lendo o documento…" });
    const corpo = new FormData();
    corpo.set("arquivo", arquivo);
    corpo.set("foco", foco);
    try {
      const r = await fetch("/api/ocr", { method: "POST", body: corpo });
      const d = await r.json();
      if (!r.ok) return setStatus({ tom: "erro", texto: d.erro ?? "Não consegui ler. Preencha à mão." });
      const form = ref.current?.closest("form");
      if (!form) return;
      let n = 0;
      const pôr = (nome: string, valor: string | number | null | undefined) => {
        if (valor === null || valor === undefined || valor === "") return;
        const el = form.elements.namedItem(nome) as HTMLInputElement | HTMLSelectElement | null;
        if (!el) return;
        if (el instanceof HTMLSelectElement) {
          if ([...el.options].some((o) => o.value === String(valor))) { el.value = String(valor); n++; }
          return;
        }
        if (!el.value) { el.value = String(valor); n++; }
      };
      if (foco === "notificacao") {
        pôr("placa", d.placa);
        pôr("auto", d.auto_infracao);
        pôr("orgao", d.orgao_autuador);
        pôr("codigo", d.codigo_infracao);
        pôr("descricao", d.descricao);
        pôr("gravidade", d.gravidade);
        pôr("valor", d.valor_reais !== null ? d.valor_reais.toFixed(2).replace(".", ",") : null);
        pôr("data_infracao", d.data_infracao);
        pôr("notificada_em", d.data_notificacao);
        pôr("vencimento", d.vencimento);
        pôr("local", d.local);
        pôr("origem", arquivo.type === "application/pdf" ? "pdf" : "foto");
      } else {
        pôr("placa", d.placa);
        pôr("renavam", d.renavam);
        pôr("uf", d.uf);
        pôr("apelido", d.modelo);
      }
      const aviso = foco === "notificacao" && d.tipo_documento === "crlv" ? " Parece um CRLV, não uma notificação." : foco === "crlv" && d.tipo_documento !== "crlv" ? " Parece não ser um CRLV-e." : "";
      setStatus({ tom: n ? "ok" : "erro", texto: n ? `Preenchi ${n} campo(s). Confira com o documento antes de enviar.${aviso}` : `Não encontrei dados legíveis.${aviso} Tente uma foto mais nítida.` });
    } catch {
      setStatus({ tom: "erro", texto: "Leitura indisponível agora; preencha à mão." });
    }
  }

  const cor = { info: "text-suave", ok: "text-economia", erro: "text-rec" };
  return (
    <div ref={ref}>
      <label className="rotulo">{rotulo}</label>
      <input
        type="file"
        name="arquivo"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        capture="environment"
        onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])}
        className="block w-full rounded-xl border border-dashed border-borda bg-nevoa p-4 text-sm"
      />
      <p className={`mt-1 text-xs ${status ? cor[status.tom] : "text-suave"}`}>
        {status?.texto ?? (ativo ? "Ao escolher o arquivo, os campos são preenchidos automaticamente para você conferir." : "Leitura automática desligada: preencha os campos.")}
      </p>
    </div>
  );
}
