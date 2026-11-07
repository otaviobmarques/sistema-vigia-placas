import type { MetadataRoute } from "next";

/** App instalável (PWA): Android e iPhone (Adicionar à Tela de Início). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Vigia Placa",
    short_name: "Vigia Placa",
    description: "Multas da frota no seu celular: prazos, avisos e pagamento com desconto.",
    lang: "pt-BR",
    start_url: "/hoje",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B2545",
    theme_color: "#0B2545",
    categories: ["business", "productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icone.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Faça hoje", url: "/hoje", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Multas", url: "/multas", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Enviar notificação", short_name: "Enviar", url: "/enviar", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
