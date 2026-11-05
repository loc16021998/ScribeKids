import Link from "next/link";
import type { ReactNode } from "react";

/** Các mảnh giao diện nhỏ dùng chung. */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-white p-4 shadow-sm ring-1 ring-brand-100 ${className}`}>{children}</section>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-extrabold">{children}</h2>
      {action}
    </div>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-brand-100">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function TrendPill({ trend }: { trend: number | null }) {
  if (trend == null || trend === 0) return null;
  const up = trend > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-extrabold ${
        up ? "bg-mint-400/25 text-[#127055]" : "bg-coral-400/20 text-[#a33a3a]"
      }`}
      aria-label={`${up ? "Tăng" : "Giảm"} ${Math.abs(trend)} điểm`}
    >
      {up ? "▲" : "▼"} {Math.abs(trend)}
    </span>
  );
}

export function PrimaryLink({ href, children, icon }: { href: string; children: ReactNode; icon?: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-brand-600 px-6 text-lg font-extrabold text-white shadow-lg shadow-brand-600/25 active:scale-[0.98]"
    >
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </Link>
  );
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-brand-100 bg-white px-6 py-10 text-center">
      <span aria-hidden className="animate-float text-5xl">
        {icon}
      </span>
      <p className="mt-3 text-lg font-extrabold">{title}</p>
      {children && <div className="mt-2 text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-3xl bg-brand-50 ${className}`} />;
}

export function SetupNotice() {
  return (
    <EmptyState icon="🛠️" title="Chưa kết nối Supabase">
      Sao chép <code>.env.example</code> thành <code>.env.local</code> và điền thông tin dự án Supabase.
    </EmptyState>
  );
}
