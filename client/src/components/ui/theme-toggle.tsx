/**
 * ThemeToggle — binary Sun/Moon button for the admin + portal top nav.
 *
 * UX: one button that flips between explicit "light" and "dark". The
 * icon cross-fades — Sun visible in light mode, Moon visible in dark
 * mode. No "System" option (removed 2026-05; Alex feedback that the
 * 3-option dropdown was over-engineered for the actual user need).
 *
 * The underlying ThemeContext still accepts "system" as a legacy value
 * (and will migrate any stored "system" to a concrete light/dark on
 * first mount), but this UI only ever sets "light" or "dark".
 */

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/context/ThemeContext";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, setTheme } = useTheme();
  const isDark = resolved === "dark";
  const nextLabel = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "relative inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
        className
      )}
      aria-label={nextLabel}
      title={nextLabel}
      data-testid="theme-toggle"
    >
      {/* Both icons stacked; the inactive one fades + rotates out. */}
      <Sun
        className={cn(
          "absolute w-4 h-4 transition-all duration-200",
          isDark ? "opacity-0 -rotate-90 scale-75" : "opacity-100 rotate-0 scale-100"
        )}
        aria-hidden="true"
      />
      <Moon
        className={cn(
          "absolute w-4 h-4 transition-all duration-200",
          isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-75"
        )}
        aria-hidden="true"
      />
    </button>
  );
}

export default ThemeToggle;
