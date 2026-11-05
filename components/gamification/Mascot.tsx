import type { MascotMood } from "@/lib/gamification/badges";

/**
 * Cô Cú — hướng dẫn viên của ScribeKids, vẽ bằng SVG nên đổi biểu cảm theo số sao:
 * ăn mừng (giơ cánh, mắt cười), vui, cổ vũ (nắm tay), và ân cần (mắt dịu, trái tim).
 */
export function Mascot({ mood, size = 96 }: { mood: MascotMood; size?: number }) {
  const smiling = mood === "celebrate" || mood === "happy";
  const motion = mood === "celebrate" ? "animate-jump" : mood === "gentle" ? "animate-float" : "animate-wiggle";

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden
      className={`shrink-0 overflow-visible ${motion}`}
      data-mood={mood}
    >
      {/* Cánh: giơ cao khi ăn mừng, buông xuôi khi ân cần */}
      {mood === "celebrate" ? (
        <>
          <path d="M26 66 C10 54 8 36 14 26 C24 34 32 48 34 62Z" fill="#5643e6" />
          <path d="M94 66 C110 54 112 36 106 26 C96 34 88 48 86 62Z" fill="#5643e6" />
        </>
      ) : (
        <>
          <path d="M24 58 C12 70 12 88 22 98 C30 92 34 78 32 62Z" fill="#5643e6" />
          <path d="M96 58 C108 70 108 88 98 98 C90 92 86 78 88 62Z" fill="#5643e6" />
        </>
      )}

      {/* Thân và tai */}
      <path d="M30 26 L38 44 L24 44Z" fill="#6d5efc" />
      <path d="M90 26 L82 44 L96 44Z" fill="#6d5efc" />
      <ellipse cx="60" cy="66" rx="38" ry="44" fill="#6d5efc" />
      <ellipse cx="60" cy="80" rx="24" ry="26" fill="#fffbf3" />
      <path d="M48 76 q4 5 8 0 M64 76 q4 5 8 0 M56 88 q4 5 8 0" fill="none" stroke="#e3dfff" strokeWidth="3" strokeLinecap="round" />

      {/* Mắt */}
      <circle cx="44" cy="50" r="15" fill="#fff" />
      <circle cx="76" cy="50" r="15" fill="#fff" />
      {smiling ? (
        <>
          <path d="M36 52 q8 -10 16 0" fill="none" stroke="#1f1d36" strokeWidth="4" strokeLinecap="round" />
          <path d="M68 52 q8 -10 16 0" fill="none" stroke="#1f1d36" strokeWidth="4" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="44" cy="51" r="7" fill="#1f1d36" />
          <circle cx="76" cy="51" r="7" fill="#1f1d36" />
          <circle cx="46.5" cy="48.5" r="2.2" fill="#fff" />
          <circle cx="78.5" cy="48.5" r="2.2" fill="#fff" />
        </>
      )}

      {/* Lông mày ân cần */}
      {mood === "gentle" && (
        <>
          <path d="M34 34 q8 -5 16 -1" fill="none" stroke="#2e2580" strokeWidth="3" strokeLinecap="round" />
          <path d="M86 34 q-8 -5 -16 -1" fill="none" stroke="#2e2580" strokeWidth="3" strokeLinecap="round" />
        </>
      )}

      {/* Mỏ */}
      <path d="M53 60 L67 60 L60 71Z" fill="#ffc93c" stroke="#e8a800" strokeWidth="1.5" strokeLinejoin="round" />

      {/* Má hồng khi vui */}
      {smiling && (
        <>
          <circle cx="30" cy="62" r="5" fill="#ff7a7a" opacity="0.55" />
          <circle cx="90" cy="62" r="5" fill="#ff7a7a" opacity="0.55" />
        </>
      )}

      {/* Phụ kiện theo tâm trạng */}
      {mood === "celebrate" && (
        <path d="M60 2 l3.5 8 8.5 .7 -6.5 5.5 2 8.3 -7.5 -4.4 -7.5 4.4 2 -8.3 -6.5 -5.5 8.5 -.7Z" fill="#ffc93c" stroke="#e8a800" strokeWidth="1" />
      )}
      {mood === "gentle" && (
        <path d="M104 22 c-3 -6 -11 -4 -10 2 c1 5 6 8 10 11 c4 -3 9 -6 10 -11 c1 -6 -7 -8 -10 -2Z" fill="#ff7a7a" />
      )}
      {mood === "cheer" && (
        <text x="100" y="30" fontSize="20" textAnchor="middle">
          💪
        </text>
      )}
    </svg>
  );
}
