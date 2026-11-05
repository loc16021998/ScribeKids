"use client";

import { useEffect, useState } from "react";

/**
 * Lời nhận xét trong bong bóng thoại của "Cô Cú". Có nút đọc to (Web Speech API,
 * giọng tiếng Việt nếu máy có) — bé 5–6 tuổi chưa đọc thạo vẫn nghe được lời khen.
 */
export function FeedbackBubble({ text }: { text: string }) {
  const [canSpeak, setCanSpeak] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const timer = setTimeout(() => setCanSpeak(true), 0);
    return () => {
      clearTimeout(timer);
      window.speechSynthesis.cancel();
    };
  }, []);

  function speak() {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "vi-VN";
    u.rate = 0.9;
    u.pitch = 1.1;
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("vi"));
    if (voice) u.voice = voice;
    u.onend = u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  }

  return (
    <div className="flex items-end gap-3">
      <span aria-hidden className="animate-float pb-1 text-5xl">
        🦉
      </span>
      <div className="relative flex-1 rounded-3xl rounded-bl-md bg-white p-4 shadow-sm ring-2 ring-brand-100">
        <p className="text-lg leading-relaxed font-semibold text-ink">{text}</p>
        {canSpeak && (
          <button
            type="button"
            onClick={speak}
            aria-pressed={speaking}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-50 px-4 text-sm font-extrabold text-brand-700 active:scale-95"
          >
            <span aria-hidden>{speaking ? "⏹️" : "🔊"}</span>
            {speaking ? "Dừng" : "Nghe cô Cú đọc"}
          </button>
        )}
      </div>
    </div>
  );
}
