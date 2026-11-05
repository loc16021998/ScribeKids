# ScribeKids — Luyện Chữ Đẹp & Viết Sáng Tạo AI

Ứng dụng PWA giúp bé 5–8 tuổi luyện chữ đẹp và viết sáng tạo, có AI chấm điểm & nhận xét.

**Stack:** Next.js 16 (App Router, Turbopack, Cache Components) · Tailwind CSS v4 · Supabase (Auth, Postgres, Storage)

## Bắt đầu

```bash
cp .env.example .env.local      # điền URL + key của dự án Supabase
npm install
npm run dev                     # http://localhost:3000
```

### Khởi tạo database

Cách 1 — Supabase CLI:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Cách 2 — Dán nội dung `supabase/migrations/20261104000000_init_schema.sql` vào SQL Editor trên Dashboard và chạy.

## Cấu trúc thư mục

```
app/
  (main)/                 # nhóm route có tab bar dưới
    layout.tsx            # vỏ app mobile-first (header + bottom nav + safe-area)
    page.tsx              # Trang chủ
    luyen-viet/           # Luyện chữ đẹp
    sang-tao/             # Viết sáng tạo
    tien-bo/              # Tiến bộ
  offline/                # trang dự phòng khi mất mạng (service worker trả về)
  icons/[size]/route.tsx  # icon PWA sinh bằng ImageResponse (192, 512, maskable, apple)
  manifest.ts             # Web App Manifest
  layout.tsx              # root layout: font Nunito (có tiếng Việt), viewport, metadata
components/               # UI dùng chung (bottom-nav, install-prompt, …)
lib/
  supabase.ts             # client trình duyệt + hằng số dùng chung
  supabase-server.ts      # client server (RLS) + admin client (service role)
  supabase-proxy.ts       # refresh phiên đăng nhập trong proxy
  database.types.ts       # kiểu TypeScript cho schema
proxy.ts                  # (Next 16: thay cho middleware.ts)
public/sw.js              # service worker
supabase/migrations/      # SQL migration
```

## Mô hình dữ liệu & phân quyền

| Bảng | Mô tả |
| --- | --- |
| `profiles` | 1-1 với `auth.users`; `role`: `admin` / `parent` / `student`. Tự tạo cùng tài khoản. |
| `students` | Hồ sơ bé (`age` 5–8). `owner_id` = người lớn tạo hồ sơ; `profile_id` = tài khoản riêng của bé (nếu có). |
| `student_guardians` | Chia sẻ một bé cho nhiều người lớn (bố mẹ, cô giáo). |
| `submissions` | Bài nộp: `image_url` (đường dẫn Storage), `score` 0–100, `feedback_json`. |

RLS tóm tắt:

- Người lớn chỉ thấy các bé mình sở hữu hoặc được chia sẻ; bé chỉ thấy hồ sơ của chính mình.
- Ai xem được bé thì nộp được bài cho bé, nhưng **không** tự ghi `score` / `feedback_json` — phần này do backend chấm AI ghi bằng `createAdminClient()` (service role).
- Người dùng không thể tự đổi `role` của mình.
- Storage: bucket `submissions` (riêng tư, đường dẫn `{student_id}/…`), bucket `avatars` (công khai, đường dẫn `{user_id}/…`).

## Hai khu vực: Trung Tâm THEDU và phụ huynh

| | Trung Tâm THEDU (admin) | Phụ huynh |
| --- | --- | --- |
| Đường dẫn | `/admin/*` | `/`, `/hoc-sinh/*`, `/bai-nop/*`, `/luyen-viet`, `/tien-bo` |
| Tài khoản | Tạo bằng `npm run create-admin` | Admin tạo trong `/admin/phu-huynh/moi` |
| Thao tác | Toàn quyền quản lý | Xem kết quả và tiến bộ của con mình, nghe nhận xét, nộp bài (tối đa 5 bài/ngày/bé). Không chấm bài |
| Phạm vi | Toàn bộ phụ huynh, học sinh, bài nộp, ảnh | Chỉ các bé của mình |

Mỗi bên có trang đăng nhập riêng, có nút chuyển qua lại: `/dang-nhap` (trung tâm, mở ra đầu tiên khi vào app) và `/dang-nhap/phu-huynh`. Tài khoản đăng nhập sai cổng sẽ bị từ chối.

**Tài khoản admin đầu tiên:** chạy `npm run create-admin` trong terminal (nhập email + mật khẩu). Nếu email đã có tài khoản, lệnh sẽ hỏi nâng quyền.

**Đóng đăng ký công khai:** tắt **Allow new users to sign up** trong Supabase Dashboard → Authentication → Sign In / Providers. Admin vẫn tạo được tài khoản khi đã tắt.

**Phân quyền:** vai trò nằm ở `profiles.role`; tài khoản mới luôn là `parent`, chỉ service role đổi được. Ba lớp bảo vệ: RLS (`is_admin()`), `requireAdmin()` đầu mọi trang và Server Action của admin ([lib/admin.ts](lib/admin.ts)), và điều hướng ở proxy (đọc `app_metadata.role` trong JWT, chỉ để điều hướng).

## Chấm điểm nét chữ (AI/CV)

`POST /api/grade` với `{ "submission_id": "<uuid>" }` (hoặc `{ "image_url": "<signed URL Supabase>" }` để chấm thử, không lưu).

```
ảnh xử lý + ảnh gốc (trùng toạ độ, từ bucket submissions)
  → lib/ai/measure.ts   đo hình học: lưới ô ly (li_px), dòng, chiều cao thân chữ,
                        chân chữ, độ nghiêng (shear), khoảng cách chữ → lỗi + điểm CV
  → lib/ai/vlm.ts       Claude Opus 5.5 (structured output): xác nhận/bác bỏ lỗi CV,
                        thêm lỗi hình dáng chữ & dấu thanh, chấm 5 tiêu chí, viết nhận xét
  → lib/ai/scoring.ts   gộp: 60% số đo + 40% VLM mỗi tiêu chí → điểm tổng 1–100
```

Kết quả (`lib/ai/types.ts`, được lưu vào `submissions.feedback_json`):

```json
{
  "score": 86,
  "bounding_boxes": [
    { "box": [300, 515, 465, 678], "type": "too_close", "label": "Hai chữ hơi sát",
      "message": "Con để cách nhau bằng một con chữ o nhé!", "severity": "moderate", "source": "cv+vlm" }
  ],
  "encouraging_feedback": "Con viết rất nắn nót, …",
  "criteria": { "size": { "score": 74, "cv_score": 70, "vlm_score": 80, "comment": "…" }, "…": {} },
  "meta": { "coordinate_system": "normalized_1000_yxyx", "mode": "hybrid", "…": "…" }
}
```

- `box` = `[ymin, xmin, ymax, xmax]` **chuẩn hoá 0–1000** theo ảnh đã xử lý → frontend vẽ bằng phần trăm (`components/GradingOverlay.tsx`).
- Mọi ngưỡng & trọng số nằm ở `lib/ai/standards.ts` (cỡ chữ vừa/nhỏ, chữ đứng/nghiêng).
- Không có `ANTHROPIC_API_KEY` hoặc Claude lỗi → tự chuyển sang `mode: "cv_only"` (vẫn có điểm, khung lỗi và nhận xét mẫu).

## Ghi chú Next.js 16

- `cacheComponents` đang bật: component nào gọi `createClient()` từ `lib/supabase-server.ts` (đọc cookie) phải nằm trong `<Suspense>`.
- Service worker chỉ đăng ký ở production (`npm run build && npm start`) để tránh cache nhầm khi dev.
- Cài lên điện thoại: Android/Chrome hiện nút "Cài đặt"; iPhone dùng Safari → Chia sẻ → Thêm vào MH chính. PWA cần HTTPS (localhost là ngoại lệ).
