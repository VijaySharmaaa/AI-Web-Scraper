// the color themes from shadcn/ui. The css for each one is in index.css
// (html[data-color="..."]), these are just the names and the primary color
// in light / dark mode for the preview dots.

export const BASE_COLORS = [
  { name: "neutral", label: "Neutral", swatch: "oklch(0.205 0 0)", swatchDark: "oklch(0.922 0 0)" },
  { name: "zinc", label: "Zinc", swatch: "oklch(0.21 0.006 285.885)", swatchDark: "oklch(0.92 0.004 286.32)" },
  { name: "stone", label: "Stone", swatch: "oklch(0.216 0.006 56.043)", swatchDark: "oklch(0.923 0.003 48.717)" },
  { name: "slate", label: "Slate", swatch: "oklch(0.208 0.042 265.755)", swatchDark: "oklch(0.929 0.013 255.508)" },
  { name: "gray", label: "Gray", swatch: "oklch(0.21 0.034 264.665)", swatchDark: "oklch(0.928 0.006 264.531)" },
] as const;

export const ACCENT_COLORS = [
  { name: "blue", label: "Blue", swatch: "oklch(0.546 0.245 262.881)", swatchDark: "oklch(0.623 0.214 259.815)" },
  { name: "green", label: "Green", swatch: "oklch(0.527 0.154 150.069)", swatchDark: "oklch(0.627 0.194 149.214)" },
  { name: "orange", label: "Orange", swatch: "oklch(0.553 0.195 38.402)", swatchDark: "oklch(0.646 0.222 41.116)" },
  { name: "rose", label: "Rose", swatch: "oklch(0.514 0.222 16.935)", swatchDark: "oklch(0.645 0.246 16.439)" },
  { name: "red", label: "Red", swatch: "oklch(0.577 0.245 27.325)", swatchDark: "oklch(0.637 0.237 25.331)" },
  { name: "yellow", label: "Yellow", swatch: "oklch(0.554 0.135 66.442)", swatchDark: "oklch(0.852 0.199 91.936)" },
] as const;

export type ThemeColor = (typeof BASE_COLORS)[number]["name"] | (typeof ACCENT_COLORS)[number]["name"];

export const DEFAULT_COLOR: ThemeColor = "neutral";

const ALL_NAMES: string[] = [...BASE_COLORS, ...ACCENT_COLORS].map((c) => c.name);

export function isThemeColor(value: unknown): value is ThemeColor {
  return typeof value === "string" && ALL_NAMES.includes(value);
}
