"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { StudentAvatar } from "@/components/student-avatar";
import { requestGrading } from "@/lib/ai/client";
import type { ProcessedCapture } from "@/lib/image/capture";
import { uploadSubmission } from "@/lib/image/upload";

// Chỉ tải code camera + xử lý ảnh khi phụ huynh thực sự mở camera.
const CameraCapture = dynamic(() => import("@/components/CameraCapture"), { ssr: false });

type StudentLite = {
  id: string;
  name: string;
  avatar: string | null;
  /** Số bài còn được nộp hôm nay; không có = không giới hạn (admin). */
  left?: number;
};
type Phase = "idle" | "uploading" | "grading";

const WAIT_LINES = [
  "Cô Cú đang đeo kính xem bài…",
  "Đang đo từng con chữ với ô ly…",
  "Đang xem chữ có thẳng hàng không…",
  "Đang tìm chữ đẹp nhất để khen…",
  "Sắp xong rồi, chờ cô một chút nhé!",
];

export function PracticeCapture({
  students,
  initialStudentId,
  resultBase = "/bai-nop",
  gradeAfterUpload = false,
}: {
  students: StudentLite[];
  initialStudentId?: string;
  /** Trang kết quả sau khi chấm — khu admin dùng đường dẫn riêng. */
  resultBase?: string;
  /** Chấm ngay sau khi nộp — chỉ khu admin dùng; phụ huynh nộp xong là chờ trung tâm chấm. */
  gradeAfterUpload?: boolean;
}) {
  const router = useRouter();
  const [studentId, setStudentId] = useState(
    students.find((s) => s.id === initialStudentId)?.id ?? (students.length === 1 ? students[0].id : null),
  );
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [navigating, startNavigation] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const student = students.find((s) => s.id === studentId) ?? null;
  const outOfQuota = student?.left === 0;

  async function handleConfirm(capture: ProcessedCapture) {
    if (!studentId) return;
    setOpen(false);
    setError(null);
    setPhase("uploading");
    try {
      const submission = await uploadSubmission(studentId, capture);
      if (gradeAfterUpload) {
        setPhase("grading");
        try {
          await requestGrading(submission.id);
        } catch {
          // Chấm lỗi vẫn sang trang bài nộp — ở đó có nút "Chấm bài ngay" để thử lại.
        }
      }
      // Next.js giữ trạng thái khi điều hướng: phải trả về "idle", nếu không lúc quay lại
      // trang này màn hình chờ vẫn che kín. Transition giữ màn hình chờ tới khi chuyển xong.
      setPhase("idle");
      startNavigation(() => {
        router.push(`${resultBase}/${submission.id}`);
        router.refresh();
      });
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : "Nộp bài thất bại, bạn thử lại nhé.");
    }
  }

  return (
    <div className="mt-5 space-y-5">
      <fieldset>
        <legend className="mb-3 font-extrabold">Bài của bé nào?</legend>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
          {students.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={studentId === s.id}
              onClick={() => setStudentId(s.id)}
              className={`flex min-h-24 w-24 shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-3xl border-2 px-2 font-bold active:scale-95 ${
                studentId === s.id ? "border-brand-600 bg-brand-50" : "border-brand-100 bg-white"
              }`}
            >
              <StudentAvatar avatar={s.avatar} id={s.id} size="sm" />
              <span className="w-full truncate text-sm">{s.name}</span>
              {s.left != null && <span className="text-xs font-semibold text-muted">Còn {s.left} bài</span>}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        disabled={!student || outOfQuota}
        onClick={() => setOpen(true)}
        className="flex min-h-20 w-full items-center justify-center gap-3 rounded-3xl bg-brand-600 text-xl font-extrabold text-white shadow-lg shadow-brand-600/25 active:scale-[0.98] disabled:bg-brand-100 disabled:text-muted disabled:shadow-none"
      >
        <span aria-hidden className="text-3xl">
          📸
        </span>
        {!student
          ? "Chọn bé trước nhé"
          : outOfQuota
            ? `${student.name} đã nộp đủ 5 bài hôm nay`
            : `Chụp bài của ${student.name}`}
      </button>

      {error && (
        <p role="alert" className="rounded-2xl bg-coral-400/15 p-4 text-sm font-semibold">
          {error}
        </p>
      )}

      <ul className="space-y-1 rounded-2xl bg-white p-4 text-sm text-muted ring-1 ring-brand-100">
        <li>💡 Chụp nơi đủ sáng, tránh bóng tay che trang vở.</li>
        <li>📐 Giữ máy song song mặt bàn — khung chuyển xanh là chuẩn.</li>
        <li>✂️ App tự cắt gọn và làm mờ đường kẻ ô ly.</li>
      </ul>

      {open && <CameraCapture onClose={() => setOpen(false)} onConfirm={handleConfirm} />}
      {(phase !== "idle" || navigating) && (
        <GradingScreen phase={phase === "idle" ? "uploading" : phase} name={student?.name ?? ""} />
      )}
    </div>
  );
}

function GradingScreen({ phase, name }: { phase: Phase; name: string }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLine((l) => (l + 1) % WAIT_LINES.length), 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-brand-600 px-8 text-center text-white"
    >
      <div className="relative">
        <span aria-hidden className="block animate-float text-8xl">
          🦉
        </span>
        <span aria-hidden className="absolute -right-6 bottom-0 animate-bounce text-4xl">
          ✏️
        </span>
      </div>
      <div>
        <p className="text-2xl font-extrabold">
          {phase === "uploading" ? `Đang gửi bài của ${name}…` : "Cô Cú đang chấm bài"}
        </p>
        <p key={line} className="mt-2 animate-rise text-lg opacity-90">
          {phase === "uploading" ? "Giữ màn hình mở một chút nhé!" : WAIT_LINES[line]}
        </p>
      </div>
      <div className="flex gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-3 w-3 animate-bounce rounded-full bg-sun-400" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    </div>
  );
}
