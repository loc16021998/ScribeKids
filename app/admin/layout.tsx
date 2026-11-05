import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { adminSignOut } from "@/app/admin/actions";
import { AdminNav, AdminNavBar } from "@/components/admin/admin-nav";

export const metadata: Metadata = {
  title: { default: "Quản trị", template: "%s · TT THEDU" },
};

/** Khu quản trị của Trung Tâm THEDU — giao diện tách biệt với khu phụ huynh. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-dvh flex-col bg-brand-50/40">
      <header className="pt-safe sticky top-0 z-30 bg-ink text-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <Link href="/admin" className="flex items-center gap-2 font-extrabold">
            <span aria-hidden className="text-xl">
              🏫
            </span>
            Trung Tâm THEDU
            <span className="rounded-full bg-sun-400 px-2 py-0.5 text-[11px] text-ink">Admin</span>
          </Link>
          <form action={adminSignOut}>
            <button type="submit" className="min-h-11 rounded-full px-3 text-sm font-bold text-white/80 active:scale-95">
              Đăng xuất
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+1.5rem)]">
        {children}
      </main>

      <Suspense fallback={<AdminNavBar pathname={null} />}>
        <AdminNav />
      </Suspense>
    </div>
  );
}
