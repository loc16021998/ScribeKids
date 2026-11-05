import { ImageResponse } from "next/og";

/**
 * Icon PWA sinh tự động: /icons/192, /icons/512, /icons/maskable, /icons/apple.
 * Thay bằng file PNG do designer thiết kế khi có logo chính thức.
 */
const VARIANTS = {
  "192": { size: 192, padding: 0 },
  "512": { size: 512, padding: 0 },
  maskable: { size: 512, padding: 0.1 }, // chừa vùng an toàn cho icon maskable
  apple: { size: 180, padding: 0 },
} as const;

type Variant = keyof typeof VARIANTS;

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((size) => ({ size }));
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/icons/[size]">,
) {
  const { size: key } = await params;
  const variant = VARIANTS[key as Variant];
  if (!variant) return new Response("Not found", { status: 404 });

  const { size, padding } = variant;
  const inner = size * (1 - padding * 2);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#6d5efc",
        }}
      >
        <div
          style={{
            width: inner,
            height: inner,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fffbf3",
            fontSize: inner * 0.62,
            fontWeight: 800,
            fontStyle: "italic",
            letterSpacing: -inner * 0.02,
          }}
        >
          Sk
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
