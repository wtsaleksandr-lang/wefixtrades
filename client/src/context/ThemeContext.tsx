/**
 * ThemeContext — day/night theme provider for the admin + portal surfaces.
 *
 * Two states: "light" / "dark". The legacy "system" value is still
 * accepted by the type (so old localStorage entries don't crash) but
 * it's migrated to a concrete "light"/"dark" on first mount — see
 * the migration effect below. User choice persists in localStorage
 * under `wft_theme_preference`. NEVER writes a cookie — pure client-side.
 *
 * The provider toggles `class="dark"` on <html> so Tailwind's
 * `darkMode: "class"` config picks it up and every component that uses
 * `dark:` variants or the semantic `bg-background`/`text-foreground`
 * tokens auto-adapts. The dark palette itself lives in client/src/index.css
 * under the `.dark` selector (Alex requirement: warm grey #1f1f23, NOT
 * pure black).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "wft_theme_preference";

interface ThemeContextValue {
  /** User's stored choice. */
  theme: ThemeChoice;
  /** Effective theme after resolving "system" — what the page actually shows. */
  resolved: ResolvedTheme;
  setTheme: (next: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolved: "light",
  setTheme: () => {},
});

function readStoredChoice(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* private mode / quota — fall through */
  }
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyToDocument(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  /* Also stamp data-theme on <html> so any CSS rules keyed off
   * [data-theme="dark"] resolve to the user's choice at the document
   * root. Page-level data-theme attrs (e.g. invoice templates locked
   * to "light") still win because they're a more specific descendant. */
  root.setAttribute("data-theme", resolved);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(() => readStoredChoice());
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark());

  /* Listen to system preference changes so "system" mode updates live
   * when the OS switches modes (Windows Auto, macOS Auto, etc.). */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved: ResolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  /* Sync to <html> on every change so the rest of the app sees the
   * right class without needing to consume the context. */
  useEffect(() => {
    applyToDocument(resolved);
  }, [resolved]);

  /* One-time migration: if a returning user has the legacy "system"
   * value persisted, snap it to whatever the OS resolves to right now
   * and write that concrete value back. From then on, the binary
   * Sun/Moon toggle just flips between "light" and "dark". */
  useEffect(() => {
    if (theme !== "system") return;
    const concrete: ResolvedTheme = systemDark ? "dark" : "light";
    setThemeState(concrete);
    try {
      window.localStorage.setItem(STORAGE_KEY, concrete);
    } catch {
      /* private mode / quota — non-fatal */
    }
    // run once on mount; we intentionally don't react to later systemDark flips here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode / quota — non-fatal, in-memory state still flips */
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolved, setTheme }),
    [theme, resolved, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
