"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { createClient } from "@/lib/supabase";

/** Hình mắt; `off` thêm gạch chéo khi mật khẩu đang hiện (bấm để ẩn). */
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      aria-hidden
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

const noSubscribe = () => () => {};

export type Portal = "admin" | "parent";

/**
 * Form đăng nhập của một cổng. Tài khoản sai cổng bị đăng xuất ngay và được chỉ sang
 * đúng trang. Không có đăng ký công khai: tài khoản phụ huynh do Trung Tâm THEDU tạo.
 */
export function AuthForm({ portal, next, notice }: { portal: Portal; next: string; notice?: string }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const busy = signingIn || navigating;
  // Chưa có JavaScript thì trình duyệt tự gửi form: khoá nút tới khi trang sẵn sàng.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [error, setError] = useState<string | null>(notice ?? null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setSigningIn(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (error) {
      setSigningIn(false);
      setError(
        /invalid login/i.test(error.message)
          ? "Email hoặc mật khẩu chưa đúng."
          : /not confirmed/i.test(error.message)
            ? "Email chưa được xác nhận. Bạn liên hệ Trung Tâm THEDU để được hỗ trợ nhé."
            : "Có lỗi xảy ra, bạn thử lại nhé.",
      );
      return;
    }
    const isAdmin = data.user?.app_metadata?.role === "admin";
    if (isAdmin !== (portal === "admin")) {
      await supabase.auth.signOut();
      setSigningIn(false);
      setError(
        isAdmin
          ? "Đây là tài khoản Trung Tâm THEDU. Bạn đăng nhập ở trang của trung tâm nhé."
          : "Đây là tài khoản phụ huynh. Bạn đăng nhập ở trang dành cho phụ huynh nhé.",
      );
      return;
    }
    // Next.js giữ trạng thái component khi điều hướng: phải dọn form, nếu không lúc đăng
    // xuất quay lại, nút vẫn bị khoá và mật khẩu cũ vẫn nằm trong ô nhập.
    formEl.reset();
    setShowPassword(false);
    setSigningIn(false);
    startNavigation(() => {
      router.replace(next);
      router.refresh();
    });
  }

  const input =
    "min-h-13 w-full rounded-2xl border-2 border-brand-100 bg-white px-4 text-base outline-none focus:border-brand-500";

  return (
    <div className="space-y-5">
      {/* method="post": kể cả khi gửi trước lúc JS chạy, mật khẩu không bao giờ lên URL. */}
      <form method="post" onSubmit={onSubmit} className="space-y-3">
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          autoComplete="email"
          inputMode="email"
          className={input}
        />
        <div className="relative">
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            required
            placeholder="Mật khẩu"
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={`${input} pr-14`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-1 grid w-12 place-items-center rounded-2xl text-muted active:scale-90"
          >
            <EyeIcon off={showPassword} />
          </button>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-coral-400/15 px-4 py-3 text-sm font-semibold text-ink">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !hydrated}
          className="min-h-14 w-full rounded-full bg-brand-600 text-lg font-extrabold text-white shadow-lg shadow-brand-600/25 active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
      {portal === "parent" && (
        <p className="text-center text-sm text-muted">
          Chưa có tài khoản hoặc quên mật khẩu? Bạn liên hệ <b className="text-ink">Trung Tâm THEDU</b> nhé.
        </p>
      )}
    </div>
  );
}
