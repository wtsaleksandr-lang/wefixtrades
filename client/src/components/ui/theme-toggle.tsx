/**
 * ThemeToggle — Light / Dark / System dropdown for the admin + portal
 * top nav. Uses lucide Sun / Moon / Monitor icons. The visible icon
 * reflects the *resolved* theme (so "System" displays Sun or Moon
 * depending on the OS preference), with the dropdown surfacing all
 * three choices and indicating which is selected.
 */

import { Moon, Sun, Monitor, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTheme, type ThemeChoice } from "@/context/ThemeContext";

const CHOICES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolved, setTheme } = useTheme();
  const TriggerIcon = resolved === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
            className
          )}
          aria-label={`Theme: ${theme}. Click to change.`}
          title={`Theme — ${theme}`}
          data-testid="theme-toggle"
        >
          <TriggerIcon className="w-4 h-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {CHOICES.map(({ value, label, icon: Icon }) => {
          const active = theme === value;
          return (
            <DropdownMenuItem
              key={value}
              onClick={() => setTheme(value)}
              data-testid={`theme-toggle-${value}`}
              className={cn("flex items-center gap-2", active && "font-medium")}
            >
              <Icon className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1">{label}</span>
              {active && <Check className="w-3.5 h-3.5 text-brand-blue" aria-hidden="true" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ThemeToggle;
