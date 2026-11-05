/**
 * Danh mục huy hiệu để hiển thị. Luật mở khoá nằm trong database (trigger trong
 * supabase/migrations/20261106000000_gamification.sql) — id ở đây phải khớp với đó.
 */
import { scoreTier } from "@/lib/score";

export type BadgeDef = {
  id: string;
  name: string;
  icon: string;
  /** Câu nói với bé: làm thế nào để có huy hiệu này. */
  hint: string;
};

export const BADGES: BadgeDef[] = [
  { id: "first_submission", name: "Cây Bút Đầu Tiên", icon: "✏️", hint: "Nộp bài đầu tiên" },
  { id: "golden_pen", name: "Bút Vàng Nhí Nhảnh", icon: "🖊️", hint: "Có một bài từ 90 điểm" },
  { id: "golden_trio", name: "Ba Bút Vàng", icon: "🏅", hint: "Có ba bài từ 90 điểm" },
  { id: "diamond_pen", name: "Bút Kim Cương", icon: "💎", hint: "Có một bài từ 98 điểm" },
  { id: "big_improver", name: "Tiến Bộ Vượt Bậc", icon: "🚀", hint: "Hơn bài trước 10 điểm" },
  { id: "streak_3", name: "Chăm Ngoan", icon: "🌱", hint: "Nộp bài 3 ngày liền" },
  { id: "streak_5", name: "Siêu Chăm Chỉ", icon: "🔥", hint: "Nộp bài 5 ngày liền" },
  { id: "streak_10", name: "Chiến Binh Bền Bỉ", icon: "🏆", hint: "Nộp bài 10 ngày liền" },
  { id: "submissions_10", name: "Mười Trang Vở", icon: "📒", hint: "Nộp đủ 10 bài" },
  { id: "submissions_30", name: "Nhà Văn Nhí", icon: "📚", hint: "Nộp đủ 30 bài" },
];

export const badgeById = (id: string) => BADGES.find((b) => b.id === id);

export type MascotMood = "celebrate" | "happy" | "cheer" | "gentle";

export function moodForStars(stars: number): MascotMood {
  if (stars >= 4) return "celebrate";
  if (stars === 3) return "happy";
  if (stars === 2) return "cheer";
  return "gentle";
}

export function starsForScore(score: number) {
  return scoreTier(score).stars;
}

/** Thông điệp thay cho điểm số: bé thấy số sao thu thập được, không thấy "75/100". */
export function starMessage(stars: number) {
  return stars === 1
    ? "Con đã có Ngôi Sao Vàng đầu tiên! 🌟"
    : `Con đã thu thập được ${stars} Ngôi Sao Vàng! 🌟`;
}

/** Lời cô Cú theo số sao: ăn mừng khi cao, cổ vũ ân cần khi thấp. */
export function mascotLine(stars: number) {
  if (stars >= 5) return "Tuyệt vời quá! Cô Cú tự hào về con lắm!";
  if (stars === 4) return "Giỏi lắm! Con viết đẹp hơn rồi đấy!";
  if (stars === 3) return "Con làm tốt lắm, cố thêm chút nữa nhé!";
  if (stars === 2) return "Con đã rất cố gắng! Mình cùng tập thêm nhé!";
  return "Không sao đâu con, viết nhiều sẽ đẹp dần. Cô Cú luôn ở đây!";
}
