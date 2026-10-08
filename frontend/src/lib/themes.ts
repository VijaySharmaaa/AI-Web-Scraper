
export const BASE_COLORS = [
  { name: "neutral", label: "Neutral", swatch: "oklch(0.205 0 0)", swatchDark: "oklch(0.922 0 0)" },
  { name: "zinc", label: "Zinc", swatch: "oklch(0.21 0.006 285.885)", swatchDark: "oklch(0.92 0.004 286.32)" },
  { name: "stone", label: "Stone", swatch: "oklch(0.216 0.006 56.043)", swatchDark: "oklch(0.923 0.003 48.717)" },
  { name: "slate", label: "Slate", swatch: "oklch(0.208 0.042 265.755)", swatchDark: "oklch(0.929 0.013 255.508)" },
  { name: "gray", label: "Gray", swatch: "oklch(0.21 0.034 264.665)", swatchDark: "oklch(0.928 0.006 264.531)" },
] as const;

export type ThemeColor = (typeof BASE_COLORS)[number]["name"];

export const DEFAULT_COLOR: ThemeColor = "neutral";

const ALL_NAMES: string[] = BASE_COLORS.map((c) => c.name);

export function isThemeColor(value: unknown): value is ThemeColor {
  return typeof value === "string" && ALL_NAMES.includes(value);
}
