"use client";
import { useEffect, useState } from "react";

type Estado = "carregando" | "sem-suporte" | "ios-instalar" | "desligado-servidor" | "bloqueado" | "inativo" | "ativo";

function chaveParaBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Botão para ativar as notificações push neste aparelho. `compacto` esconde quando já está ativo. */
export function Notificacoes({ compacto = false }: { compacto?: boolean }) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [chave, setChave] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const instalado = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setEstado(ios && !instalado ? "ios-instalar" : "sem-suporte");
      const cfg = await fetch("/api/push").then((r) => r.json()).catch(() => ({ ativo: false }));
      if (!cfg.ativo) return setEstado("desligado-servidor");
      setChave(cfg.chave);
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setEstado(sub ? "ativo" : "inativo");
    })().catch(() => setEstado("sem-suporte"));
  }, []);

  async function ativar() {
    setMsg(null);
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setEstado(perm === "denied" ? "bloqueado" : "inativo");
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave!) });
    const r = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ inscricao: sub.toJSON(), teste: true }) });
    if (!r.ok) return setMsg((await r.json().catch(() => ({}))).erro ?? "Não consegui ativar agora.");
    setEstado("ativo");
    setMsg("Pronto! Mandei uma notificação de teste.");
  }

  async function desativar() {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setEstado("inativo");
    setMsg("Notificações desligadas neste aparelho.");
  }

  if (compacto && (estado === "ativo" || estado === "carregando" || estado === "sem-suporte" || estado === "desligado-servidor")) return null;
  const textos: Record<Estado, string> = {
    carregando: "Verificando…",
    "sem-suporte": "Este navegador não recebe notificações push.",
    "ios-instalar": "No iPhone, toque em Compartilhar › Adicionar à Tela de Início e abra o Vigia Placa por lá para ativar as notificações.",
    "desligado-servidor": "Notificações ainda não configuradas no servidor.",
    bloqueado: "As notificações estão bloqueadas para este site. Libere nas configurações do navegador.",
    inativo: "Receba aqui, na hora, cada multa nova e os avisos de prazo (D-15, D-7, D-3, D-1).",
    ativo: "Notificações ativas neste aparelho.",
  };
  return (
    <div className={compacto ? "card mb-6 flex flex-wrap items-center justify-between gap-3 p-4" : "space-y-2"}>
      <p className="text-sm text-suave">{textos[estado]}</p>
      {estado === "inativo" && <button type="button" onClick={ativar} className="btn-ambar btn-sm">Ativar notificações</button>}
      {estado === "ativo" && !compacto && <button type="button" onClick={desativar} className="btn-leve btn-sm">Desligar neste aparelho</button>}
      {msg && <p className="text-xs text-economia">{msg}</p>}
    </div>
  );
}
