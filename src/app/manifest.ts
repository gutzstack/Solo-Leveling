import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SYSTEM IRL",
    short_name: "SYSTEM",
    description: "Turn real life into an RPG progression system.",
    start_url: "/status",
    display: "standalone",
    orientation: "portrait",
    background_color: "#04060d",
    theme_color: "#04060d",
    categories: ["productivity", "health", "education", "lifestyle"],
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
