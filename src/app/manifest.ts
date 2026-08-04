import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JK-TECH-CODE AI — AI Assistant & Humanizer",
    short_name: "JK-TECH-CODE",
    description:
      "A modern AI assistant that writes, codes, researches, and answers — with every response crafted to sound naturally human.",
    start_url: "/",
    display: "standalone",
    background_color: "#0F1117",
    theme_color: "#2563EB",
    orientation: "portrait",
    categories: ["productivity", "utilities", "education"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
