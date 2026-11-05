import type { CriterionKey } from "@/lib/ai/standards";
import { CRITERIA_LABELS } from "@/lib/score";

type Row = { key: CriterionKey; value: number | null; before?: number | null; comment?: string };

/** Thanh điểm từng tiêu chí; nếu có `before` thì hiện mức thay đổi so với trước. */
export function CriteriaBars({ rows }: { rows: Row[] }) {
  return (
    <ul className="space-y-4">
      {rows.map((r) => {
        const meta = CRITERIA_LABELS[r.key];
        const delta = r.value != null && r.before != null ? Math.round(r.value - r.before) : null;
        return (
          <li key={r.key}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 font-bold">
                <span aria-hidden>{meta.icon}</span>
                {meta.label}
              </span>
              <span className="flex items-center gap-2 tabular-nums">
                {delta != null && delta !== 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      delta > 0 ? "bg-mint-400/25 text-[#127055]" : "bg-coral-400/20 text-[#a33a3a]"
                    }`}
                  >
                    {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}
                  </span>
                )}
                <span className="font-extrabold">{r.value == null ? "—" : Math.round(r.value)}</span>
              </span>
            </div>
            <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-brand-50">
              <div
                className="h-full rounded-full bg-brand-600 transition-[width] duration-700"
                style={{ width: `${Math.max(0, Math.min(100, r.value ?? 0))}%` }}
              />
            </div>
            {r.comment && <p className="mt-1 text-xs text-muted">{r.comment}</p>}
          </li>
        );
      })}
    </ul>
  );
}
