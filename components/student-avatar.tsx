import { avatarOf } from "@/lib/score";

const SIZES = {
  sm: "h-10 w-10 text-2xl",
  md: "h-14 w-14 text-3xl",
  lg: "h-20 w-20 text-5xl",
} as const;

const TONES = ["bg-sun-400/30", "bg-mint-400/30", "bg-coral-400/25", "bg-brand-100"];

export function StudentAvatar({
  avatar,
  id,
  size = "md",
}: {
  avatar: string | null;
  id: string;
  size?: keyof typeof SIZES;
}) {
  const tone = TONES[id.charCodeAt(0) % TONES.length];
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full ${SIZES[size]} ${tone}`}>
      {avatarOf(avatar, id)}
    </span>
  );
}
