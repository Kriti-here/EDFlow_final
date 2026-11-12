import { useCallback, useState } from "react";

/** The two themes the workspace can render. */
export type ThemeMode = "light" | "dark";

/**
 * `localStorage` key holding the operator's choice. The same key is read by the
 * pre-paint script in `index.html`, which is why it is exported.
 */
export const THEME_STORAGE_KEY = "edflow-theme";

/** Is the stored or system-preferred theme "dark"? */
function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/**
 * Resolve the theme to render: the saved choice wins, otherwise the OS setting.
 * Reading storage can throw in a sandboxed frame, so it is guarded.
 */
export function readTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage unavailable — fall through to the system preference.
  }

  return prefersDark() ? "dark" : "light";
}

/** Apply a theme by toggling `.dark` on `<html>`, where the CSS tokens live. */
function applyTheme(mode: ThemeMode): void {
  document.documentElement.classList.toggle("dark", mode === "dark");
}

/**
 * Read, apply and persist the workspace theme.
 * Persistence is best-effort: a blocked `localStorage` must not break the UI.
 */
export function useTheme(): { theme: ThemeMode; toggleTheme: () => void } {
  const [theme, setTheme] = useState<ThemeMode>(readTheme);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: ThemeMode = current === "dark" ? "light" : "dark";
      applyTheme(next);

      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Preference will not survive a reload; the session is unaffected.
      }

      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
