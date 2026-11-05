"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Trang chủ", icon: "🏠", match: ["/tai-khoan"] },
  { href: "/luyen-viet", label: "Luyện viết", icon: "✏️", match: [] },
  { href: "/sang-tao", label: "Sáng tạo", icon: "🌈", match: [] },
  { href: "/tien-bo", label: "Tiến bộ", icon: "⭐", match: ["/hoc-sinh/", "/bai-nop/"] },
] as const;

function isActive(tab: (typeof TABS)[number], pathname: string) {
  if (tab.href === "/") return pathname === "/" || tab.match.some((m) => pathname.startsWith(m));
  return pathname.startsWith(tab.href) || tab.match.some((m) => pathname.startsWith(m));
}

/** Thanh tab có trạng thái đang chọn — đọc pathname nên phải nằm trong <Suspense>. */
export function BottomNav() {
  return <NavBar pathname={usePathname()} />;
}

/** Bản tĩnh (không tab nào sáng) dùng làm fallback khi prerender. */
export function NavBar({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Điều hướng chính"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-brand-100 bg-white/95 backdrop-blur"
    >
      <ul className="mx-auto grid h-tabbar max-w-md grid-cols-4">
        {TABS.map((tab) => {
          const active = pathname != null && isActive(tab, pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors ${
                  active ? "text-brand-700" : "text-muted"
                }`}
              >
                <span
                  aria-hidden
                  className={`grid h-8 w-12 place-items-center rounded-full text-xl transition-all ${
                    active ? "scale-110 bg-brand-100" : ""
                  }`}
                >
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
