"use client";
import { useEffect } from "react";

/** Registra o service worker em todas as páginas: deixa o Vigia Placa instalável como app (PWA). */
export function RegistrarSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
