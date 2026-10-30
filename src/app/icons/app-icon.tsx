import { ImageResponse } from "next/og";

/**
 * The app icon: the original "XI" mark on Blaugrana stripes (no club crest). `maskable`
 * keeps the mark inside the safe zone so Android can crop it to any shape.
 */
export function appIcon(size: number, { maskable = false } = {}) {
  const mark = Math.round(size * (maskable ? 0.42 : 0.56));
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f2f6b 0%, #1f4fa3 38%, #a50044 62%, #4a001f 100%)",
        borderRadius: maskable ? 0 : Math.round(size * 0.22),
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: mark,
          fontWeight: 900,
          letterSpacing: -Math.round(mark * 0.06),
          color: "#f6c94c",
          fontFamily: "sans-serif",
          lineHeight: 1,
        }}
      >
        XI
      </div>
    </div>,
    { width: size, height: size },
  );
}
