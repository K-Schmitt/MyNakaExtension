export const THEME = {
  color: {
    bg: "#070A12",
    surface: "#161B26",
    surfaceRaised: "#1F242F",
    surfaceHover: "#333741",
    border: "#333741",
    text: "#F5F5F6",
    textSecondary: "#CECFD2",
    textTertiary: "#94969C",
    accent: "#1959D7",
    accentHover: "#144BB5",
    accentSelected: "#1C3049",
    accentText: "#76B6FE",
    onAccent: "#FFFFFF",
    starEmpty: "#85888E",
    starFilled: "#76B6FE",
    warningText: "#FEC84B",
    warningBg: "#4E1D09",
    errorText: "#FDA29B",
    errorBg: "#55160C",
    successText: "#75E0A7",
    successBg: "#053321",
  },
  radius: { sm: 6, lg: 12, pill: 999 },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24 },
  text: { body: "14px/20px", title: "16px/24px", small: "12px/18px" },
  font: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  shadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
  surfaceAlpha: 0.96,
  motion: "120ms",
} as const;

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

export function themeCss(scope: ":host" | ":root"): string {
  const declarations = [
    ...group("color", THEME.color, ""),
    ...group("radius", THEME.radius, "px"),
    ...group("space", THEME.space, "px"),
    ...group("text", THEME.text, ""),
    `--mn-font:${THEME.font};`,
    `--mn-shadow:${THEME.shadow};`,
    `--mn-motion:${THEME.motion};`,
    `--mn-surface-alpha:${THEME.surfaceAlpha};`,
  ];
  return `${scope}{${declarations.join("")}}`;
}
