"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Tổng quan", icon: "📊" },
  { href: "/admin/phu-huynh", label: "Phụ huynh", icon: "👨‍👩‍👧" },
  { href: "/admin/hoc-sinh", label: "Học sinh", icon: "🎒" },
  { href: "/admin/bai-nop", label: "Bài nộp", icon: "📝" },
  { href: "/admin/cham-bai", label: "Chấm bài", icon: "📸" },
] as const;

export function AdminNav() {
  return <AdminNavBar pathname={usePathname()} />;
}

/** Bản tĩnh (không tab nào sáng) dùng làm fallback khi prerender. */
export function AdminNavBar({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Quản trị" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-white">
      <ul className="mx-auto grid h-tabbar max-w-3xl grid-cols-5">
        {TABS.map((tab) => {
          const active =
            pathname != null && (tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href));
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${
                  active ? "text-brand-700" : "text-muted"
                }`}
              >
                <span
                  aria-hidden
                  className={`grid h-8 w-11 place-items-center rounded-full text-lg ${active ? "bg-brand-100" : ""}`}
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
