import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ScribeKids — Luyện Chữ Đẹp & Viết Sáng Tạo AI",
    short_name: "ScribeKids",
    description:
      "Giúp bé 5–8 tuổi luyện chữ đẹp và viết sáng tạo, có AI chấm điểm & nhận xét.",
    lang: "vi",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fffbf3",
    theme_color: "#6d5efc",
    categories: ["education", "kids"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
