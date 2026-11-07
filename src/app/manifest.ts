import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vigia Placa",
    short_name: "Vigia Placa",
    description: "A multa chega antes. O desconto também.",
    start_url: "/hoje",
    display: "standalone",
    background_color: "#F7F8FA",
    theme_color: "#0B2545",
    icons: [{ src: "/icone.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
