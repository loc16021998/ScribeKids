import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DashboardSkeleton, StudentDashboardView } from "@/components/student-dashboard";
import { SetupNotice } from "@/components/ui";
import { getStudentDashboard } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";

export const metadata: Metadata = { title: "Tiến bộ của bé" };

export default function StudentPage({ params }: PageProps<"/hoc-sinh/[id]">) {
  return (
    <div className="space-y-5">
      <Link href="/" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700">
        ← Các bé
      </Link>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard params={params} />
      </Suspense>
    </div>
  );
}

async function Dashboard({ params }: Pick<PageProps<"/hoc-sinh/[id]">, "params">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const { id } = await params;
  const data = await getStudentDashboard(id);
  if (!data) notFound();
  return (
    <StudentDashboardView
      data={data}
      submissionHref={(sid) => `/bai-nop/${sid}`}
      captureHref={`/luyen-viet?hs=${id}`}
      captureLabel="Nộp bài mới cho"
    />
  );
}
