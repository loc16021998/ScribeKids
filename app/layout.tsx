import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ScribeKids — Luyện Chữ Đẹp & Viết Sáng Tạo AI",
    template: "%s · ScribeKids",
  },
  description:
    "Giúp bé 5–8 tuổi luyện chữ đẹp và viết sáng tạo, có AI chấm điểm & nhận xét.",
  applicationName: "ScribeKids",
  appleWebApp: {
    capable: true,
    title: "ScribeKids",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icons/192", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/icons/apple", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#6d5efc",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
