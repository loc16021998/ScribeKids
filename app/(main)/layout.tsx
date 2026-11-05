import Link from "next/link";
import { Suspense } from "react";
import { BottomNav, NavBar } from "@/components/bottom-nav";

/** Vỏ ứng dụng mobile-first: thanh tiêu đề trên + nội dung + tab bar dưới. */
export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pt-safe sticky top-0 z-30 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <Link href="/" className="text-xl font-extrabold text-brand-700">
            Scribe<span className="text-sun-400">Kids</span>
          </Link>
          <Link
            href="/tai-khoan"
            aria-label="Tài khoản"
            className="grid h-11 w-11 place-items-center rounded-full bg-brand-100 text-xl active:scale-95"
          >
            🦉
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-2 pb-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+1.5rem)]">
        {children}
      </main>

      <Suspense fallback={<NavBar pathname={null} />}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
