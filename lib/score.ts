/** Tiện ích hiển thị điểm & ngày giờ — dùng được ở cả server và client. */

export type ScoreTier = {
  label: string;
  icon: string;
  stars: number;
  /** Lớp Tailwind cho nền huy hiệu */
  badge: string;
  ring: string;
};

export function scoreTier(score: number): ScoreTier {
  if (score >= 90)
    return { label: "Xuất sắc", icon: "🏆", stars: 5, badge: "from-sun-400 to-[#ff9f43]", ring: "ring-sun-400/40" };
  if (score >= 80)
    return { label: "Giỏi lắm", icon: "🌟", stars: 4, badge: "from-brand-500 to-brand-700", ring: "ring-brand-500/30" };
  if (score >= 65)
    return { label: "Khá lắm", icon: "👍", stars: 3, badge: "from-mint-400 to-[#20a77c]", ring: "ring-mint-400/40" };
  if (score >= 50)
    return { label: "Cố lên nào", icon: "💪", stars: 2, badge: "from-[#ff9f43] to-coral-400", ring: "ring-coral-400/30" };
  return { label: "Mình tập thêm nhé", icon: "🌱", stars: 1, badge: "from-coral-400 to-[#e85d75]", ring: "ring-coral-400/30" };
}

export const TIME_ZONE = "Asia/Ho_Chi_Minh";

/** Khoá ngày theo giờ Việt Nam: "2026-11-04". */
export function dayKey(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

/** Khoá tuần (ngày thứ Hai đầu tuần, giờ Việt Nam). */
export function weekKey(iso: string | Date) {
  const d = new Date(`${dayKey(iso)}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = thứ Hai
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "numeric",
    ...opts,
  }).format(new Date(iso));
}

export function relativeDay(iso: string, now = new Date()) {
  const diff = Math.round(
    (Date.parse(`${dayKey(now)}T00:00:00Z`) - Date.parse(`${dayKey(iso)}T00:00:00Z`)) / 86_400_000,
  );
  if (diff <= 0) return "Hôm nay";
  if (diff === 1) return "Hôm qua";
  if (diff < 7) return `${diff} ngày trước`;
  return formatDate(iso, { year: "numeric" });
}

/**
 * Chuỗi đang còn hiệu lực từ bảng streaks: chuỗi lưu trong database tính tới ngày nộp
 * cuối, nên nếu ngày đó cũ hơn hôm qua (giờ Việt Nam) thì chuỗi đã đứt.
 */
export function activeStreak(row: { current_streak: number; last_practice_date: string | null } | null | undefined, now = new Date()) {
  if (!row?.last_practice_date) return 0;
  const yesterday = new Date(`${dayKey(now)}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return row.last_practice_date >= yesterday.toISOString().slice(0, 10) ? row.current_streak : 0;
}

export const CRITERIA_LABELS = {
  size: { label: "Cỡ chữ vừa ô ly", icon: "📏" },
  alignment: { label: "Ngồi ngay ngắn trên dòng", icon: "➖" },
  slant: { label: "Nét đứng thẳng đều", icon: "📐" },
  spacing: { label: "Khoảng cách đều", icon: "↔️" },
  letter_form: { label: "Nét chữ đúng mẫu", icon: "✍️" },
} as const;

export const AVATARS =["🐯", "🐰", "🐼", "🦊", "🐨", "🐸", "🦁", "🐧", "🐙", "🦄", "🐳", "🐝"] as const;

export function avatarOf(avatar: string | null, seed: string) {
  if (avatar && avatar.startsWith("emoji:")) return avatar.slice(6);
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return AVATARS[Math.abs(h) % AVATARS.length];
}

export function average(values: number[]) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}
