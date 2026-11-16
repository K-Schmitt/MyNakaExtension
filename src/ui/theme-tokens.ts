export const THEME = {
  color: {
    bg: "#0F0D0A",
    surface: "#1D1915",
    surfaceRaised: "#252019",
    surfaceHover: "#2D2720",
    border: "#C8B49621",
    text: "#EDE9E2",
    textSecondary: "#A8A098",
    textTertiary: "#8F877D",
    accent: "#C8A468",
    accentHover: "#B89352",
    accentSelected: "#C8A4681F",
    accentText: "#C8A468",
    onAccent: "#0F0D0A",
    starEmpty: "#7A7269",
    starFilled: "#C8A468",
    warningText: "#D4A843",
    warningBg: "#2A2210",
    errorText: "#E58F8F",
    errorBg: "#2B1817",
    successText: "#5EBD8A",
    successBg: "#132619",
  },
  radius: { sm: 6, lg: 12, pill: 999 },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24 },
  text: { body: "14px/20px", title: "16px/24px", small: "12px/18px" },
  font: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  shadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
  surfaceAlpha: 0.96,
  motion: "150ms",
} as const;

const NAKA_VARS: Readonly<Partial<Record<keyof typeof THEME.color, string>>> = {
  bg: "--color-bg-primary",
  surface: "--color-bg-card",
  surfaceRaised: "--color-bg-elevated",
  surfaceHover: "--color-bg-hover",
  border: "--color-border",
  text: "--color-text-primary",
  textSecondary: "--color-text-secondary",
  accent: "--color-accent",
  accentHover: "--color-naka-500",
  accentSelected: "--color-accent-soft",
  accentText: "--color-accent",
  onAccent: "--color-accent-foreground",
  starEmpty: "--color-text-muted",
  starFilled: "--color-accent",
  warningText: "--color-rating-mid",
  successText: "--color-rating-good",
};

const NAKA_FONT = `var(--font-sans, Inter), ${THEME.font.replace(/^Inter, /, "")}`;

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function group(
  prefix: string,
  tokens: Readonly<Record<string, string | number>>,
  unit: string,
): string[] {
  return Object.entries(tokens).map(
    ([key, value]) => `--mn-${prefix}-${kebab(key)}:${value}${unit};`,
  );
}

function colors(scope: ":host" | ":root"): string[] {
  return Object.entries(THEME.color).map(([key, value]) => {
    const naka = NAKA_VARS[key as keyof typeof THEME.color];
    const shown = scope === ":host" && naka ? `var(${naka},${value})` : value;
    return `--mn-color-${kebab(key)}:${shown};`;
  });
}

export function themeCss(scope: ":host" | ":root"): string {
  const font = scope === ":host" ? NAKA_FONT : THEME.font;
  const declarations = [
    ...colors(scope),
    ...group("radius", THEME.radius, "px"),
    ...group("space", THEME.space, "px"),
    ...group("text", THEME.text, ""),
    `--mn-font:${font};`,
    `--mn-shadow:${THEME.shadow};`,
    `--mn-motion:${THEME.motion};`,
    `--mn-surface-alpha:${THEME.surfaceAlpha};`,
  ];
  return `${scope}{${declarations.join("")}}`;
}
