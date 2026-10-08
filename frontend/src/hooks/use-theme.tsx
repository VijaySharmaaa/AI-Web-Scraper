import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { DEFAULT_COLOR, isThemeColor, type ThemeColor } from "@/lib/themes";

export type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  color: ThemeColor;
  setColor: (color: ThemeColor) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function systemPrefersDark() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function readSavedTheme(): Theme {
  const saved = read("theme");
  return saved === "light" || saved === "dark" ? saved : "system";
}

function readSavedColor(): ThemeColor {
  const saved = read("theme-color");
  return isThemeColor(saved) ? saved : DEFAULT_COLOR;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readSavedTheme);
  const [color, setColorState] = useState<ThemeColor>(readSavedColor);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  useEffect(() => {
    const root = document.documentElement;
    if (color === DEFAULT_COLOR) root.removeAttribute("data-color");
    else root.setAttribute("data-color", color);
  }, [color]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    write("theme", next);
  }, []);

  const setColor = useCallback((next: ThemeColor) => {
    setColorState(next);
    write("theme-color", next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, color, setColor }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
