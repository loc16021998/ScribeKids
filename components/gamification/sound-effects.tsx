"use client";

import { useEffect, useState } from "react";
import { isMuted, playSound, setMuted } from "@/lib/gamification/sounds";

/** Tiếng "tích" nhẹ khi chạm nút trong khu vực của bé. */
export function TapSounds() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.("button, a")) playSound("tap");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}

/** Công tắc âm thanh ở trang tài khoản. */
export function SoundToggle() {
  const [muted, setMutedState] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setMutedState(isMuted()), 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <button
      type="button"
      aria-pressed={!muted}
      onClick={() => {
        const next = !muted;
        setMuted(next);
        setMutedState(next);
        if (!next) playSound("success");
      }}
      className="flex min-h-14 w-full items-center justify-between rounded-full bg-white px-5 font-extrabold ring-2 ring-brand-100 active:scale-[0.98]"
    >
      <span>
        <span aria-hidden>{muted ? "🔇" : "🔊"}</span> Âm thanh
      </span>
      <span className="text-sm text-muted">{muted ? "Đang tắt" : "Đang bật"}</span>
    </button>
  );
}
