import Link from "next/link";
import type { ReactNode } from "react";
import { CriteriaBars } from "@/components/criteria-bars";
import { FeedbackBubble } from "@/components/feedback-bubble";
import RewardModal from "@/components/gamification/RewardModal";
import { StarReward } from "@/components/gamification/star-reward";
import { GradeNowButton } from "@/components/grade-now-button";
import { ScoreBadge } from "@/components/score-badge";
import SubmissionCanvas from "@/components/SubmissionCanvas";
import { Card, SectionTitle, Skeleton } from "@/components/ui";
import type { CriterionKey } from "@/lib/ai/standards";
import type { SubmissionDetail } from "@/lib/data";
import { moodForStars, starsForScore } from "@/lib/gamification/badges";
import { formatDate } from "@/lib/score";

const ORDER: CriterionKey[] = ["size", "alignment", "slant", "spacing", "letter_form"];

/** Kết quả chấm một bài — dùng chung cho khu phụ huynh và khu admin. */
export function SubmissionDetailView({
  sub,
  studentHref,
  submissionHref,
  adminPanel,
}: {
  sub: SubmissionDetail;
  studentHref: string;
  submissionHref: (id: string) => string;
  /** Công cụ riêng của admin (sửa điểm, xoá bài). */
  adminPanel?: ReactNode;
}) {
  const { result, student } = sub;

  return (
    <div className="space-y-5">
      <nav className="flex items-center justify-between gap-2">
        <Link href={studentHref} className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700">
          ← {student.name}
        </Link>
        <div className="flex gap-2">
          <NavArrow href={sub.prevId ? submissionHref(sub.prevId) : null} label="Bài trước" icon="‹" />
          <NavArrow href={sub.nextId ? submissionHref(sub.nextId) : null} label="Bài sau" icon="›" />
        </div>
      </nav>

      <p className="text-center text-sm font-semibold text-muted">
        Bài ngày {formatDate(sub.created_at, { weekday: "long", day: "numeric", month: "numeric", year: "numeric" })}
      </p>

      {result && sub.score != null ? (
        <>
          {adminPanel ? <ScoreBadge score={sub.score} /> : <StarReward score={sub.score} />}
          <RewardModal
            submissionId={sub.id}
            score={sub.score}
            badgeIds={sub.rewardBadges}
            streak={sub.streak}
            autoOpen={!adminPanel}
          />
          <FeedbackBubble text={result.encouraging_feedback} mood={moodForStars(starsForScore(sub.score))} />

          {sub.imageUrl && (
            <SubmissionCanvas
              imageUrl={sub.imageUrl}
              originalUrl={sub.originalUrl}
              issues={result.bounding_boxes}
              highlights={result.highlight_boxes ?? []}
            />
          )}

          {result.strengths.length > 0 && (
            <Card className="bg-mint-400/10">
              <SectionTitle>🌟 Con đã làm rất tốt</SectionTitle>
              <ul className="space-y-2">
                {result.strengths.map((s) => (
                  <li key={s} className="flex gap-2">
                    <span aria-hidden>✅</span>
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <details className="group rounded-3xl bg-white shadow-sm ring-1 ring-brand-100 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex min-h-14 cursor-pointer items-center justify-between px-4 font-extrabold">
              👨‍👩‍👧 Dành cho phụ huynh &amp; Trung Tâm THEDU
              <span aria-hidden className="transition-transform group-open:rotate-180">
                ⌄
              </span>
            </summary>
            <div className="space-y-5 px-4 pb-5">
              <p className="font-extrabold">Điểm của bài: {sub.score}/100</p>
              <CriteriaBars
                rows={ORDER.map((key) => ({
                  key,
                  value: result.criteria[key]?.score >= 0 ? result.criteria[key].score : null,
                  comment: result.criteria[key]?.comment,
                }))}
              />
              {result.parent_tip && (
                <p className="rounded-2xl bg-brand-50 p-4 text-sm">
                  <b>Gợi ý luyện tập:</b> {result.parent_tip}
                </p>
              )}
              {result.transcription && (
                <p className="text-sm text-muted">
                  <b className="text-ink">Nội dung đọc được:</b> “{result.transcription}”
                </p>
              )}
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                <span>
                  {result.meta.letter_size} · {result.meta.writing_style}
                  {result.meta.mode === "cv_only" && " · chấm bằng số đo (chưa có AI nhận xét)"}
                </span>
                {adminPanel && <GradeNowButton submissionId={sub.id} regrade />}
              </div>
            </div>
          </details>
        </>
      ) : (
        <>
          {sub.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL
            <img src={sub.imageUrl} alt="Bài viết của bé" className="w-full rounded-3xl bg-white ring-1 ring-brand-100" />
          )}
          <div className="rounded-3xl bg-sun-400/20 p-5 text-center">
            <p className="text-lg font-extrabold">{adminPanel ? "Bài này chưa được chấm" : "Đã gửi bài rồi nhé! ✅"}</p>
            <p className="mt-1 text-sm text-muted">
              {adminPanel
                ? "Bấm nút bên dưới để chấm ngay."
                : "Trung Tâm THEDU sẽ chấm bài. Có kết quả, con vào đây nghe Cô Cú nhận xét nhé."}
            </p>
          </div>
          {adminPanel && <GradeNowButton submissionId={sub.id} />}
        </>
      )}

      {adminPanel}
    </div>
  );
}

function NavArrow({ href, label, icon }: { href: string | null; label: string; icon: string }) {
  const cls = "grid h-11 w-11 place-items-center rounded-full text-2xl font-bold";
  return href ? (
    <Link href={href} aria-label={label} className={`${cls} bg-white text-brand-700 ring-1 ring-brand-100 active:scale-95`}>
      {icon}
    </Link>
  ) : (
    <span aria-hidden className={`${cls} text-brand-100`}>
      {icon}
    </span>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-11 w-32" />
      <div className="flex justify-center">
        <Skeleton className="h-40 w-40 rounded-full" />
      </div>
      <Skeleton className="h-28" />
      <Skeleton className="h-96" />
    </div>
  );
}
