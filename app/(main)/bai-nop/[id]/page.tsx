import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DetailSkeleton, SubmissionDetailView } from "@/components/submission-detail";
import { SetupNotice } from "@/components/ui";
import { getSubmissionDetail } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";

export const metadata: Metadata = { title: "Kết quả chấm bài" };

export default function SubmissionPage({ params }: PageProps<"/bai-nop/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: Pick<PageProps<"/bai-nop/[id]">, "params">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const { id } = await params;
  const sub = await getSubmissionDetail(id);
  if (!sub) notFound();
  return (
    <SubmissionDetailView
      sub={sub}
      studentHref={`/hoc-sinh/${sub.student.id}`}
      submissionHref={(sid) => `/bai-nop/${sid}`}
    />
  );
}
