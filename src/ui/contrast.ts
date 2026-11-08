function channel(hex: string, start: number): number {
  const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  return (
    0.2126 * channel(color, 1) +
    0.7152 * channel(color, 3) +
    0.0722 * channel(color, 5)
  );
}

// WCAG 2 contrast ratio between two `#RRGGBB` colours, from 1 to 21.
export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
