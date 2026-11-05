import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { adminDeleteSubmission } from "@/app/admin/actions";
import { DangerForm, ScoreForm } from "@/components/admin/forms";
import { DetailSkeleton, SubmissionDetailView } from "@/components/submission-detail";
import { Card, SectionTitle } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { getSubmissionDetail } from "@/lib/data";

export const metadata: Metadata = { title: "Bài nộp" };

export default function AdminSubmissionPage({ params }: PageProps<"/admin/bai-nop/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: Pick<PageProps<"/admin/bai-nop/[id]">, "params">) {
  await requireAdmin();
  const { id } = await params;
  const sub = await getSubmissionDetail(id);
  if (!sub) notFound();
  return (
    <SubmissionDetailView
      sub={sub}
      studentHref={`/admin/hoc-sinh/${sub.student.id}`}
      submissionHref={(sid) => `/admin/bai-nop/${sid}`}
      adminPanel={
        <div className="space-y-4">
          <Card>
            <SectionTitle>Sửa điểm</SectionTitle>
            <ScoreForm submissionId={sub.id} score={sub.score} />
          </Card>
          <DangerForm
            action={adminDeleteSubmission}
            fieldName="submission_id"
            fieldValue={sub.id}
            label="Xoá bài nộp"
            confirmText="Xoá bài nộp này? Ảnh và kết quả chấm sẽ bị xoá vĩnh viễn."
          />
        </div>
      }
    />
  );
}
