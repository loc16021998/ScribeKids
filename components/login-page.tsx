import Link from "next/link";
import { Suspense } from "react";
import { AuthForm, type Portal } from "@/components/auth-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PORTALS = {
  admin: {
    icon: "🏫",
    title: "Trung Tâm THEDU",
    subtitle: "Đăng nhập khu vực quản trị",
    switchPrompt: "Bạn là phụ huynh?",
    switchLabel: "Đăng nhập cho phụ huynh",
    switchHref: "/dang-nhap/phu-huynh",
    home: "/admin",
  },
  parent: {
    icon: "🦉",
    title: "Phụ huynh",
    subtitle: "Cùng bé luyện chữ đẹp mỗi ngày",
    switchPrompt: "Bạn thuộc Trung Tâm THEDU?",
    switchLabel: "Đăng nhập cho trung tâm",
    switchHref: "/dang-nhap",
    home: "/",
  },
} as const;

/** Trang đăng nhập dùng chung cho hai cổng; mỗi cổng có nút chuyển sang cổng kia. */
export function LoginPage({ portal, searchParams }: { portal: Portal; searchParams: SearchParams }) {
  const p = PORTALS[portal];
  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="text-center">
        <p aria-hidden className="text-6xl">
          {p.icon}
        </p>
        <p className="mt-3 text-lg font-extrabold text-brand-700">
          Scribe<span className="text-sun-400">Kids</span>
        </p>
        <h1 className="mt-1 text-3xl font-extrabold">{p.title}</h1>
        <p className="mt-2 text-muted">{p.subtitle}</p>
      </div>

      <Suspense fallback={<div className="h-56 animate-pulse rounded-3xl bg-brand-50" />}>
        <Form portal={portal} searchParams={searchParams} />
      </Suspense>

      <div className="border-t border-brand-100 pt-5 text-center">
        <p className="text-sm text-muted">{p.switchPrompt}</p>
        <Link
          href={p.switchHref}
          className="mt-2 flex min-h-13 items-center justify-center rounded-full bg-white font-extrabold text-brand-700 ring-2 ring-brand-100 active:scale-[0.98]"
        >
          {p.switchLabel} →
        </Link>
      </div>
    </main>
  );
}

async function Form({ portal, searchParams }: { portal: Portal; searchParams: SearchParams }) {
  const sp = await searchParams;
  const home = PORTALS[portal].home;
  const raw = typeof sp.next === "string" ? sp.next : "";
  // Chỉ nhận đường dẫn nội bộ và đúng khu vực của cổng này.
  const internal = raw.startsWith("/") && !raw.startsWith("//");
  const inAdminArea = raw === "/admin" || raw.startsWith("/admin/");
  const next = internal && inAdminArea === (portal === "admin") ? raw : home;
  const notice =
    sp.loi === "xac-nhan" ? "Link xác nhận đã hết hạn hoặc không hợp lệ. Bạn đăng nhập lại nhé." : undefined;
  return <AuthForm portal={portal} next={next} notice={notice} />;
}
