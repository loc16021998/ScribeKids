import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mất kết nối" };

/** Trang dự phòng do service worker trả về khi không có mạng. */
export default function OfflinePage() {
  return (
    <main className="pt-safe flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <span aria-hidden className="text-6xl">
        🦉
      </span>
      <h1 className="text-2xl font-extrabold">Ôi, mất mạng rồi!</h1>
      <p className="max-w-xs text-muted">
        Kiểm tra Wi-Fi hoặc 4G rồi mở lại ScribeKids nhé.
      </p>
    </main>
  );
}
