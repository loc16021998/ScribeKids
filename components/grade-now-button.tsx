"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestGrading } from "@/lib/ai/client";

/** Nút chấm (hoặc chấm lại) một bài đã nộp, rồi tải lại trang để hiện kết quả. */
export function GradeNowButton({ submissionId, regrade = false }: { submissionId: string; regrade?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await requestGrading(submissionId, { force: regrade });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chấm bài thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={
          regrade
            ? "min-h-11 rounded-full px-4 text-sm font-bold text-brand-700 active:scale-95 disabled:opacity-60"
            : "flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-brand-600 text-lg font-extrabold text-white shadow-lg shadow-brand-600/25 active:scale-[0.98] disabled:opacity-60"
        }
      >
        {busy ? (
          <>
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Cô Cú đang chấm…
          </>
        ) : regrade ? (
          "↻ Chấm lại"
        ) : (
          "✨ Chấm bài ngay"
        )}
      </button>
      {error && <p className="text-center text-sm font-semibold text-[#a33a3a]">{error}</p>}
    </div>
  );
}
