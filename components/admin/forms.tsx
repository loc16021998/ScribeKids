"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import {
  adminCreateStudent,
  adminUpdateStudent,
  createParent,
  resetParentPassword,
  updateParent,
  updateScore,
  type ActionState,
  type CredentialState,
} from "@/app/admin/actions";
import { AVATARS } from "@/lib/score";

const INPUT =
  "min-h-13 w-full rounded-2xl border-2 border-brand-100 bg-white px-4 text-base outline-none focus:border-brand-500";
const PRIMARY =
  "min-h-13 w-full rounded-full bg-brand-600 font-extrabold text-white active:scale-[0.98] disabled:opacity-60";

function Feedback({ state }: { state: ActionState }) {
  if (state?.error)
    return (
      <p role="alert" className="rounded-xl bg-coral-400/15 px-4 py-3 text-sm font-semibold">
        {state.error}
      </p>
    );
  if (state?.ok)
    return (
      <p role="status" className="rounded-xl bg-mint-400/20 px-4 py-3 text-sm font-semibold">
        ✓ {state.ok}
      </p>
    );
  return null;
}

/** Thông tin đăng nhập chỉ hiện một lần — hệ thống không lưu mật khẩu ở dạng đọc được. */
function CredentialCard({ credentials }: { credentials: NonNullable<NonNullable<CredentialState>["credentials"]> }) {
  const [copied, setCopied] = useState(false);
  const text = `Tài khoản ScribeKids của ${credentials.name}\nEmail: ${credentials.email}\nMật khẩu: ${credentials.password}`;
  return (
    <div role="status" className="space-y-3 rounded-2xl bg-mint-400/15 p-4 ring-2 ring-mint-400/50">
      <p className="font-extrabold">✅ Gửi thông tin này cho phụ huynh</p>
      <dl className="space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-muted">Email</dt>
          <dd className="font-bold break-all">{credentials.email}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-muted">Mật khẩu</dt>
          <dd className="font-mono font-bold break-all">{credentials.password}</dd>
        </div>
      </dl>
      <p className="text-xs font-semibold text-[#a33a3a]">Mật khẩu chỉ hiện một lần. Rời trang này sẽ không xem lại được.</p>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        }}
        className="min-h-11 rounded-full bg-white px-4 text-sm font-extrabold text-brand-700 ring-1 ring-brand-100 active:scale-95"
      >
        {copied ? "✓ Đã sao chép" : "Sao chép"}
      </button>
    </div>
  );
}

export function CreateParentForm() {
  const [state, action, pending] = useActionState(createParent, undefined);
  if (state?.credentials) {
    return (
      <div className="space-y-3">
        <CredentialCard credentials={state.credentials} />
        <Link
          href={`/admin/hoc-sinh/moi?phu-huynh=${state.parentId}`}
          className="flex min-h-13 items-center justify-center rounded-full bg-brand-600 font-extrabold text-white"
        >
          Thêm bé cho phụ huynh này
        </Link>
        <Link href="/admin/phu-huynh" className="flex min-h-11 items-center justify-center text-sm font-bold text-brand-700">
          Về danh sách phụ huynh
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input name="full_name" required maxLength={100} placeholder="Họ và tên phụ huynh" autoComplete="off" className={INPUT} />
      <input name="email" type="email" required placeholder="Email đăng nhập" autoComplete="off" inputMode="email" className={INPUT} />
      <input
        name="password"
        type="text"
        minLength={6}
        maxLength={72}
        placeholder="Mật khẩu (để trống sẽ tự tạo)"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className={INPUT}
      />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? "Đang tạo…" : "Tạo tài khoản"}
      </button>
    </form>
  );
}

export function ParentNameForm({ parentId, fullName }: { parentId: string; fullName: string }) {
  const [state, action, pending] = useActionState(updateParent, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="parent_id" value={parentId} />
      <input name="full_name" required maxLength={100} defaultValue={fullName} aria-label="Họ và tên" className={INPUT} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? "Đang lưu…" : "Lưu tên"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ parentId }: { parentId: string }) {
  const [state, action, pending] = useActionState(resetParentPassword, undefined);
  return (
    <div className="space-y-3">
      {state?.credentials && <CredentialCard credentials={state.credentials} />}
      {state?.error && <Feedback state={{ error: state.error }} />}
      <form
        action={action}
        onSubmit={(e) => {
          if (!confirm("Đặt lại mật khẩu? Mật khẩu cũ của phụ huynh sẽ không dùng được nữa.")) e.preventDefault();
        }}
      >
        <input type="hidden" name="parent_id" value={parentId} />
        <button
          type="submit"
          disabled={pending}
          className="min-h-13 w-full rounded-full bg-sun-400/30 font-extrabold active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Đang đặt lại…" : "🔑 Đặt lại mật khẩu"}
        </button>
      </form>
    </div>
  );
}

export type ParentOption = { id: string; label: string };

/** Form bé dùng cho cả tạo mới (không có `student`) và chỉnh sửa. */
export function AdminStudentForm({
  parents,
  defaultParentId,
  student,
}: {
  parents: ParentOption[];
  defaultParentId?: string;
  student?: { id: string; name: string; age: number; avatar: string; ownerId: string };
}) {
  const [state, action, pending] = useActionState(student ? adminUpdateStudent : adminCreateStudent, undefined);
  const [age, setAge] = useState(student?.age ?? 6);
  const [avatar, setAvatar] = useState<string>(student?.avatar ?? AVATARS[0]);

  if (parents.length === 0) {
    return (
      <Link href="/admin/phu-huynh/moi" className="flex min-h-13 items-center justify-center rounded-full bg-brand-600 font-extrabold text-white">
        Tạo tài khoản phụ huynh trước
      </Link>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {student && <input type="hidden" name="student_id" value={student.id} />}
      <Labeled label="Phụ huynh">
        <select name="owner_id" required defaultValue={student?.ownerId ?? defaultParentId ?? ""} className={INPUT}>
          <option value="" disabled>
            Chọn phụ huynh…
          </option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Labeled>
      <Labeled label="Tên của bé">
        <input name="name" required maxLength={60} defaultValue={student?.name} autoComplete="off" className={INPUT} />
      </Labeled>
      <fieldset>
        <legend className="mb-2 text-sm font-extrabold">Tuổi</legend>
        <input type="hidden" name="age" value={age} />
        <div className="grid grid-cols-4 gap-2">
          {[5, 6, 7, 8].map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={age === a}
              onClick={() => setAge(a)}
              className={`min-h-12 rounded-2xl border-2 text-lg font-extrabold active:scale-95 ${
                age === a ? "border-brand-600 bg-brand-600 text-white" : "border-brand-100 bg-white"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-extrabold">Hình đại diện</legend>
        <input type="hidden" name="avatar" value={avatar} />
        <div className="grid grid-cols-6 gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              aria-label={`Chọn ${a}`}
              aria-pressed={avatar === a}
              onClick={() => setAvatar(a)}
              className={`grid aspect-square place-items-center rounded-2xl text-2xl active:scale-90 ${
                avatar === a ? "bg-sun-400/40 ring-2 ring-sun-400" : "bg-white ring-1 ring-brand-100"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </fieldset>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={PRIMARY}>
        {pending ? "Đang lưu…" : student ? "Lưu thay đổi" : "Thêm bé"}
      </button>
    </form>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-extrabold">{label}</span>
      {children}
    </label>
  );
}

export function ScoreForm({ submissionId, score }: { submissionId: string; score: number | null }) {
  const [state, action, pending] = useActionState(updateScore, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="submission_id" value={submissionId} />
      <div className="flex gap-2">
        <input
          name="score"
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          required
          defaultValue={score ?? undefined}
          aria-label="Điểm từ 1 đến 100"
          placeholder="1–100"
          className={`${INPUT} w-28 flex-none`}
        />
        <button type="submit" disabled={pending} className={`${PRIMARY} flex-1`}>
          {pending ? "Đang lưu…" : "Lưu điểm"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

/** Nút xoá có hỏi lại, vì dữ liệu và ảnh bị xoá không khôi phục được. */
export function DangerForm({
  action,
  fieldName,
  fieldValue,
  label,
  confirmText,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fieldName: string;
  fieldValue: string;
  label: string;
  confirmText: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name={fieldName} value={fieldValue} />
      <button
        type="submit"
        className="min-h-13 w-full rounded-full bg-white font-extrabold text-[#a33a3a] ring-2 ring-coral-400/40 active:scale-[0.98]"
      >
        {label}
      </button>
    </form>
  );
}
