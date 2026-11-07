import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegistrarSW } from "@/components/registrar-sw";

const descricao = "Monitoramento de multas da frota por placa e Renavam em bases oficiais. Até 40% de desconto, zero multa NIC e saving só sobre a economia comprovada.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://www.vigiaplaca.com.br"),
  title: { default: "Vigia Placa · Redução de custos com multas de frota", template: "%s · Vigia Placa" },
  description: descricao,
  applicationName: "Vigia Placa",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icone.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Vigia Placa", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website", locale: "pt_BR", siteName: "Vigia Placa", url: "/",
    title: "Vigia Placa · Multa não é custo fixo. É dinheiro saindo pela porta.",
    description: descricao,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Vigia Placa: monitoramento de multas da frota com até 40% de desconto" }],
  },
  twitter: { card: "summary_large_image", title: "Vigia Placa · Redução de custos com multas de frota", description: descricao, images: ["/og.png"] },
};
export const viewport: Viewport = { themeColor: "#0B2545", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}<RegistrarSW /></body>
    </html>
  );
}
