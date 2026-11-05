import type { GradingResult } from "./types";
import type { LetterSize, WritingStyle } from "./standards";

/** Gọi API chấm bài từ Client Component (sau khi uploadSubmission() trả về id). */
export async function requestGrading(
  submissionId: string,
  options: { letterSize?: LetterSize; writingStyle?: WritingStyle; force?: boolean } = {},
): Promise<GradingResult> {
  const res = await fetch("/api/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      submission_id: submissionId,
      letter_size: options.letterSize,
      writing_style: options.writingStyle,
      force: options.force,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Chấm bài thất bại");
  return data as GradingResult;
}
