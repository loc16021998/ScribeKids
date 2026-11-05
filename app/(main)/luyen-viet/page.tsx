import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PracticeCapture } from "@/components/practice-capture";
import { EmptyState, SetupNotice, Skeleton } from "@/components/ui";
import { createClient } from "@/lib/supabase-server";
import { isSupabaseConfigured } from "@/lib/supabase";

export const metadata: Metadata = { title: "Luyện viết" };

export default function PracticePage({ searchParams }: PageProps<"/luyen-viet">) {
  return (
    <>
      <PageHeader title="Luyện chữ đẹp" subtitle="Chụp ảnh bài viết để gửi Trung Tâm THEDU chấm. Mỗi bé nộp tối đa 5 bài một ngày." />
      <Suspense fallback={<Skeleton className="mt-5 h-64" />}>
        <Practice searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Practice({ searchParams }: Pick<PageProps<"/luyen-viet">, "searchParams">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: students } = await supabase
    .from("students")
    .select("id, name, avatar")
    .order("created_at", { ascending: true });

  if (!students?.length) {
    return (
      <div className="mt-5">
        <EmptyState icon="🐣" title="Chưa có bé nào">
          Trung Tâm THEDU sẽ thêm hồ sơ bé cho bạn. Bạn liên hệ trung tâm nhé.
        </EmptyState>
      </div>
    );
  }

  const withQuota = await Promise.all(
    students.map(async (s) => {
      const { data: left } = await supabase.rpc("submissions_left_today", { sid: s.id });
      return { ...s, left: left ?? undefined };
    }),
  );

  return <PracticeCapture students={withQuota} initialStudentId={typeof sp.hs === "string" ? sp.hs : undefined} />;
}
