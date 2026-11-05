import type { Metadata } from "next";
import { Suspense } from "react";
import { signOut } from "@/app/(main)/actions";
import { SoundToggle } from "@/components/gamification/sound-effects";
import { PageHeader } from "@/components/page-header";
import { Card, SetupNotice, Skeleton } from "@/components/ui";
import { getViewer } from "@/lib/data";

export const metadata: Metadata = { title: "Tài khoản" };

const ROLE_LABEL = { parent: "Phụ huynh", admin: "Trung Tâm THEDU", student: "Học sinh" } as const;

export default function AccountPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Tài khoản" />
      <Suspense fallback={<Skeleton className="h-40" />}>
        <Account />
      </Suspense>
    </div>
  );
}

async function Account() {
  const viewer = await getViewer();
  if (!viewer) return <SetupNotice />;
  return (
    <>
      <Card className="flex items-center gap-4">
        <span aria-hidden className="grid h-16 w-16 place-items-center rounded-full bg-brand-100 text-4xl">
          {viewer.profile?.role === "admin" ? "🏫" : "👨‍👩‍👧"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold">{viewer.profile?.full_name || "Chưa đặt tên"}</p>
          <p className="truncate text-sm text-muted">{viewer.email}</p>
          {viewer.profile && (
            <span className="mt-1 inline-block rounded-full bg-brand-50 px-3 py-0.5 text-xs font-bold text-brand-700">
              {ROLE_LABEL[viewer.profile.role]}
            </span>
          )}
        </div>
      </Card>
      <SoundToggle />
      <form action={signOut}>
        <button
          type="submit"
          className="min-h-14 w-full rounded-full bg-white text-lg font-extrabold text-[#a33a3a] ring-2 ring-coral-400/40 active:scale-[0.98]"
        >
          Đăng xuất
        </button>
      </form>
    </>
  );
}
