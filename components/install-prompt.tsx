"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Gợi ý "Thêm vào màn hình chính".
 * - Android/Chrome: dùng sự kiện beforeinstallprompt.
 * - iOS Safari: không có API, nên hiện hướng dẫn bấm nút Chia sẻ.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone);
    if (standalone) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const timer = isIos ? setTimeout(() => setShowIosHint(true), 0) : undefined;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  if (!deferred && !showIosHint) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-100">
      <span aria-hidden className="text-2xl">📲</span>
      <p className="flex-1">
        {deferred ? (
          "Cài ScribeKids lên màn hình chính để bé mở nhanh hơn."
        ) : (
          <>
            Trên iPhone: bấm <b>Chia sẻ</b> rồi chọn <b>Thêm vào MH chính</b>.
          </>
        )}
      </p>
      {deferred && (
        <button
          type="button"
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice;
            setDeferred(null);
          }}
          className="min-h-11 rounded-full bg-brand-600 px-4 font-semibold text-white active:scale-95"
        >
          Cài đặt
        </button>
      )}
    </div>
  );
}
