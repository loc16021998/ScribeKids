import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Measurements } from "./measure";
import { SLANT, type HandwritingStandard, type WritingStyle } from "./standards";
import { ISSUE_TYPES } from "./types";

export const VLM_MODEL = "claude-opus-5-5";

const Criterion = z.object({
  score: z.number().int().describe("0-100"),
  comment: z.string().describe("Nhận xét ngắn cho giáo viên, tiếng Việt"),
});

const VlmOutput = z.object({
  is_handwriting_page: z
    .boolean()
    .describe("false nếu ảnh không phải bài viết tay của học sinh (ảnh trống, ảnh khác…)"),
  transcription: z.string().describe("Nội dung chữ đọc được, giữ nguyên dấu tiếng Việt"),
  criteria: z.object({
    size: Criterion,
    alignment: Criterion,
    slant: Criterion,
    spacing: Criterion,
    letter_form: Criterion,
  }),
  cv_issue_review: z
    .array(z.object({ index: z.number().int(), valid: z.boolean() }))
    .describe("Xác nhận/bác bỏ từng lỗi trong danh sách cv_issues"),
  issues: z.array(
    z.object({
      type: z.enum(ISSUE_TYPES),
      blob_ids: z.array(z.number().int()).describe("id khối chữ liên quan (ưu tiên dùng)"),
      box: z
        .object({
          ymin: z.number().int(),
          xmin: z.number().int(),
          ymax: z.number().int(),
          xmax: z.number().int(),
        })
        .nullable()
        .describe("Toạ độ pixel trên ảnh 1, chỉ khi không có blob_ids phù hợp"),
      label: z.string().describe("Nhãn ngắn ≤ 6 từ, ví dụ: Chữ h hơi cao"),
      message: z.string().describe("Một câu nhắc nhẹ nhàng nói với bé"),
      severity: z.enum(["minor", "moderate", "major"]),
    }),
  ),
  highlights: z
    .array(
      z.object({
        blob_ids: z.array(z.number().int()),
        label: z.string().describe("Nhãn khen ngắn ≤ 5 từ, ví dụ: Chữ o tròn đẹp"),
        message: z.string().describe("Một câu khen nói với bé"),
      }),
    )
    .describe("1-2 chữ viết đẹp nhất để khen, tham chiếu blob_ids"),
  strengths: z.array(z.string()).describe("1-3 điểm mạnh cụ thể"),
  encouraging_feedback: z.string(),
  parent_tip: z.string().describe("1-2 câu gợi ý cho phụ huynh/giáo viên cách luyện tiếp"),
});

export type VlmOutput = z.infer<typeof VlmOutput>;

const SYSTEM_PROMPT = `Bạn là giáo viên tiểu học giàu kinh nghiệm dạy viết chữ đẹp cho học sinh lớp 1-2 (5-8 tuổi) theo mẫu chữ viết trong trường tiểu học của Bộ GD&ĐT Việt Nam.

Bạn nhận:
- Ảnh 1: bài viết đã xử lý (nền trắng, đã lọc dòng kẻ). MỌI toạ độ bạn trả về dùng hệ pixel của ảnh này, gốc ở góc trên-trái.
- Ảnh 2: ảnh màu gốc, cùng kích thước và trùng toạ độ với ảnh 1, còn nguyên dòng kẻ ô ly — dùng để đối chiếu chữ với ô ly.
- Số đo hình học do hệ thống tự đo (đơn vị li = 1 ô ly nhỏ), danh sách khối chữ (blob) có id và toạ độ, và các lỗi hệ thống đã phát hiện (cv_issues).

Nhiệm vụ:
1. Chấm 5 tiêu chí, mỗi tiêu chí 0-100:
   - size: tỷ lệ chuẩn ô ly — chiều cao, độ rộng con chữ so với quy định.
   - alignment: chữ ngồi đúng dòng kẻ, chân chữ thẳng hàng.
   - slant: độ nghiêng đúng kiểu chữ yêu cầu và đều nhau.
   - spacing: khoảng cách giữa các chữ đều, xấp xỉ một con chữ o.
   - letter_form: hình dáng con chữ đúng mẫu, nét nối, nét khuyết, dấu thanh và dấu phụ (ă, â, ê, ô, ơ, ư, đ) đặt đúng.
   Số đo hình học chính xác hơn mắt nhìn về kích thước và khoảng cách; hãy dựa vào chúng, chỉ lệch khỏi chúng khi ảnh cho thấy rõ số đo bị sai (ví dụ do vết bẩn, chữ bị cắt).
   Hãy chấm theo kỳ vọng dành cho trẻ 5-8 tuổi đang tập viết: bài viết nắn nót, đúng cỡ của một bé lớp 1 là bài tốt (80-95), không so với chữ người lớn.
2. Xem từng lỗi trong cv_issues và đánh dấu valid=false nếu đó là báo nhầm (ví dụ nét cao là của chữ vốn cao như b, h, k, l; hai khối sát nhau thực ra là một chữ).
3. Bổ sung các lỗi mà số đo không thấy được — nhất là hình dáng con chữ và dấu thanh. Mỗi lỗi chỉ đúng một vị trí; ưu tiên tham chiếu blob_ids, chỉ dùng box khi không có khối phù hợp. Chọn tối đa 5 lỗi đáng sửa nhất; đừng liệt kê mọi lỗi nhỏ — một bé 6 tuổi chỉ nên tập trung sửa 1-2 điều mỗi lần.
4. Chọn 1-2 chữ (blob) viết đẹp nhất làm highlights để khen — bé cần thấy cả chỗ mình làm tốt, không chỉ chỗ cần sửa.
5. Viết encouraging_feedback (tiếng Việt, 2-3 câu, để đọc to cho bé nghe):
   - Gọi bé là "con". Mở đầu bằng lời khen cụ thể, thật (nêu con chữ hoặc điều bé làm tốt).
   - Sau đó đúng MỘT gợi ý cụ thể, có tên con chữ và cách sửa đo bằng ô ly, nói theo kiểu rủ rê ("…nhé!", "mình thử…").
   - Không nêu điểm số, không dùng từ chê như "xấu", "sai", "kém", "cẩu thả".
   - Ví dụ giọng văn: "Con viết rất nắn nót, các chữ o tròn đều như những chiếc bánh xinh! Lần sau mình giữ khoảng cách giữa hai chữ bằng một con chữ o nữa là tuyệt vời nhé!"
6. message của từng lỗi cũng nói với bé, ngắn, tích cực, chỉ cách sửa.

Nếu ảnh không phải bài viết tay của học sinh, đặt is_handwriting_page=false và để các trường còn lại ở mức tối thiểu.`;

export class VlmUnavailableError extends Error {}

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic({ timeout: 120_000, maxRetries: 2 });
  return client;
}

export type VlmInput = {
  processedJpeg: Buffer;
  originalJpeg: Buffer | null;
  measurements: Measurements;
  standard: HandwritingStandard;
  writingStyle: WritingStyle;
  studentAge: number | null;
};

export async function assessWithVlm(input: VlmInput) {
  const { measurements: m, standard } = input;

  const context = {
    image: { width: m.width, height: m.height },
    student_age: input.studentAge,
    standard: {
      letter_size: standard.label,
      x_height_li: standard.xHeightLi,
      tall_letters_li: standard.maxAboveLi,
      descender_li: standard.maxBelowLi,
      word_gap_li: standard.wordGapLi,
      style: SLANT[input.writingStyle].label,
      expected_slant_deg: SLANT[input.writingStyle].expectedDeg,
    },
    measurements: m.summary,
    cv_scores: m.scores,
    lines: m.lines.map((l) => ({
      id: l.id,
      core_box_xyxy: [l.x0, l.coreTop, l.x1, l.baseline],
      x_height_li: round2(l.xHeightPx / (m.unitPx || 1)),
    })),
    blobs: m.blobs.slice(0, 250).map((b) => ({
      id: b.id,
      line: b.lineId,
      box_xyxy: [b.x0, b.y0, b.x1, b.y1],
      slant_deg: b.slantDeg,
    })),
    cv_issues: m.issues.map((iss, index) => ({
      index,
      type: iss.type,
      label: iss.label,
      blob_ids: iss.blobIds,
    })),
  };

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    { type: "text", text: "Ảnh 1 — bài viết đã xử lý:" },
    {
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: input.processedJpeg.toString("base64") },
    },
  ];
  if (input.originalJpeg) {
    content.push(
      { type: "text", text: "Ảnh 2 — ảnh gốc có dòng kẻ ô ly:" },
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: input.originalJpeg.toString("base64") },
      },
    );
  }
  content.push({
    type: "text",
    text: `Số đo hình học (JSON):\n${JSON.stringify(context)}\n\nHãy chấm bài viết này.`,
  });

  const response = await getClient().beta.messages.parse({
    model: VLM_MODEL,
    max_tokens: 16000,
    // Nếu bộ lọc an toàn từ chối nhầm, server tự chạy lại trên model dự phòng phù hợp.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(VlmOutput) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new VlmUnavailableError(`refusal: ${response.stop_details?.category ?? "unknown"}`);
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new VlmUnavailableError(`no parsed output (stop_reason=${response.stop_reason})`);
  }
  return { output: response.parsed_output, model: response.model };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
