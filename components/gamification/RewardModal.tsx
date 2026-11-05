"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Confetti } from "@/components/confetti";
import { Mascot } from "@/components/gamification/Mascot";
import { badgeById, mascotLine, moodForStars, starMessage, starsForScore } from "@/lib/gamification/badges";
import { isMuted, playSound, setMuted } from "@/lib/gamification/sounds";

const seenKey = (id: string) => `scribekids-reward-seen:${id}`;

function wasSeen(id: string) {
  try {
    return localStorage.getItem(seenKey(id)) === "1";
  } catch {
    return false;
  }
}

function markSeen(id: string) {
  try {
    localStorage.setItem(seenKey(id), "1");
  } catch {
    // Không lưu được thì lần sau mở lại quà một lần nữa — không sao.
  }
}

/**
 * Phần thưởng sau khi bài được chấm: bé chạm "Mở quà", các ngôi sao hiện dần kèm tiếng
 * ding, rồi tới huy hiệu mới và chuỗi ngày. Bước chạm vừa vui vừa cần thiết: trình duyệt
 * chỉ cho phát âm thanh sau một lần chạm của người dùng.
 */
export default function RewardModal({
  submissionId,
  score,
  badgeIds,
  streak,
  autoOpen,
}: {
  submissionId: string;
  score: number;
  badgeIds: string[];
  streak: number;
  /** Phụ huynh: tự hiện một lần cho mỗi bài. Admin: chỉ mở bằng nút. */
  autoOpen: boolean;
}) {
  const stars = starsForScore(score);
  const [phase, setPhase] = useState<"closed" | "gift" | "open">("closed");
  const [shownStars, setShownStars] = useState(0);
  const [muted, setMutedState] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMutedState(isMuted());
      if (autoOpen && !wasSeen(submissionId)) setPhase("gift");
    }, 0);
    return () => clearTimeout(timer);
  }, [autoOpen, submissionId]);

  const open = phase !== "closed";

  const close = useCallback(() => {
    markSeen(submissionId);
    setPhase("closed");
    setShownStars(0);
  }, [submissionId]);

  // Khoá cuộn trang, Esc để đóng, đưa focus vào hộp thoại.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Mỗi bước đưa focus vào nút chính (không phải nút tắt tiếng ở đầu hộp thoại).
  useEffect(() => {
    if (phase !== "closed") dialogRef.current?.querySelector<HTMLElement>("[data-primary]")?.focus();
  }, [phase]);

  // Hiện từng ngôi sao, rồi kết thúc bằng tiếng reo.
  useEffect(() => {
    if (phase !== "open") return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= stars; i++) {
      timers.push(
        setTimeout(() => {
          setShownStars(i);
          playSound("star");
        }, 250 + i * 380),
      );
    }
    timers.push(setTimeout(() => playSound(stars >= 4 ? "fanfare" : "cheer"), 450 + stars * 380));
    return () => timers.forEach(clearTimeout);
  }, [phase, stars]);

  function openGift() {
    markSeen(submissionId);
    setPhase("open");
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

  const badges = badgeIds.map(badgeById).filter((b) => b != null);
  const mood = moodForStars(stars);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setShownStars(0);
          setPhase("open");
        }}
        className="flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-sun-400 font-extrabold text-ink active:scale-[0.98]"
      >
        <span aria-hidden>🎁</span>
        Xem phần thưởng
      </button>

      {open &&
        createPortal(
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Phần thưởng của con"
          className="fixed top-0 left-0 z-50 flex h-dvh w-full items-center justify-center overflow-y-auto bg-ink/70 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-sm animate-pop rounded-[2rem] bg-paper p-6 text-center shadow-2xl">
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? "Bật âm thanh" : "Tắt âm thanh"}
              className="absolute top-3 left-3 grid h-11 w-11 place-items-center rounded-full bg-brand-50 text-xl active:scale-95"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Đóng"
              className="absolute top-3 right-3 grid h-11 w-11 place-items-center rounded-full bg-brand-50 text-xl active:scale-95"
            >
              ✕
            </button>

            {phase === "gift" ? (
              <>
                <div className="mt-8 flex justify-center">
                  <Mascot mood="happy" size={110} />
                </div>
                <h2 className="mt-3 text-2xl font-extrabold">Cô Cú chấm bài xong rồi!</h2>
                <p className="mt-1 text-muted">Cô có một món quà cho con đấy.</p>
                <button
                  type="button"
                  data-primary
                  onClick={openGift}
                  className="mt-6 flex min-h-16 w-full animate-wiggle items-center justify-center gap-3 rounded-full bg-brand-600 text-xl font-extrabold text-white shadow-lg shadow-brand-600/30 active:scale-[0.97]"
                >
                  <span aria-hidden className="text-3xl">
                    🎁
                  </span>
                  Mở quà nào!
                </button>
              </>
            ) : (
              <>
                {stars >= 4 && <Confetti pieces={stars === 5 ? 80 : 45} />}
                <div className="mt-6 flex justify-center">
                  <Mascot mood={mood} size={110} />
                </div>
                <h2 className="mt-3 text-xl leading-snug font-extrabold">{starMessage(stars)}</h2>

                <div
                  className="mt-3 flex justify-center gap-1"
                  role="img"
                  aria-label={`${stars} trên 5 ngôi sao`}
                >
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={i}
                      aria-hidden
                      className={`text-4xl ${i < shownStars ? "animate-star" : "opacity-20 grayscale"}`}
                    >
                      ⭐
                    </span>
                  ))}
                </div>

                <p className="mt-3 font-semibold text-ink">{mascotLine(stars)}</p>

                {badges.length > 0 && (
                  <div className="mt-4 rounded-2xl bg-sun-400/20 p-3">
                    <p className="text-sm font-extrabold">Con vừa nhận được huy hiệu mới!</p>
                    <ul className="mt-2 space-y-1">
                      {badges.map((b) => (
                        <li key={b.id} className="flex animate-rise items-center justify-center gap-2 font-bold">
                          <span aria-hidden className="text-2xl">
                            {b.icon}
                          </span>
                          {b.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {streak >= 2 && (
                  <p className="mt-3 font-bold text-[#c2410c]">🔥 Con đã luyện {streak} ngày liên tiếp!</p>
                )}

                <button
                  type="button"
                  data-primary
                  onClick={close}
                  className="mt-5 min-h-14 w-full rounded-full bg-brand-600 text-lg font-extrabold text-white active:scale-[0.98]"
                >
                  Tuyệt quá!
                </button>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
