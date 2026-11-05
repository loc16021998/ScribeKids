import { Mascot } from "@/components/gamification/Mascot";
import { mascotLine, moodForStars, starMessage, starsForScore } from "@/lib/gamification/badges";

/** Kết quả dành cho bé: cô Cú và số ngôi sao, thay cho con số điểm khô khan. */
export function StarReward({ score }: { score: number }) {
  const stars = starsForScore(score);
  return (
    <section className="flex flex-col items-center text-center">
      <Mascot mood={moodForStars(stars)} size={120} />
      <p className="mt-3 text-2xl leading-snug font-extrabold">{starMessage(stars)}</p>
      <p className="mt-2 flex gap-1 text-3xl" role="img" aria-label={`${stars} trên 5 ngôi sao`}>
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} aria-hidden className={i < stars ? "" : "opacity-20 grayscale"}>
            ⭐
          </span>
        ))}
      </p>
      <p className="mt-2 font-semibold text-muted">{mascotLine(stars)}</p>
    </section>
  );
}
