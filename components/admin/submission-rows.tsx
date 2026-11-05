import Link from "next/link";
import { ScoreBadge } from "@/components/score-badge";
import { StudentAvatar } from "@/components/student-avatar";
import { EmptyState } from "@/components/ui";
import type { AdminSubmissionRow } from "@/lib/admin";
import { formatDate, relativeDay } from "@/lib/score";

export function SubmissionRows({ rows }: { rows: AdminSubmissionRow[] }) {
  if (rows.length === 0) return <EmptyState icon="📝" title="Chưa có bài nộp nào" />;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            href={`/admin/bai-nop/${r.id}`}
            className="flex min-h-16 items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-brand-100 active:scale-[0.99]"
          >
            <StudentAvatar avatar={r.studentAvatar} id={r.studentId} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold">{r.studentName}</p>
              <p className="text-xs text-muted">
                {relativeDay(r.created_at)} ·{" "}
                {formatDate(r.created_at, { hour: "2-digit", minute: "2-digit", day: undefined, month: undefined })}
              </p>
            </div>
            {r.score != null ? (
              <ScoreBadge score={r.score} size="sm" />
            ) : (
              <span className="rounded-full bg-sun-400/30 px-3 py-1 text-xs font-bold">Chờ chấm</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
