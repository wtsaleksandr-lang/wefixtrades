/**
 * BackButton — shared "return to parent" affordance.
 *
 * Wave W-AU-4. Used across admin + portal detail / sub-pages so every
 * page that isn't a top-level sidebar entry has an explicit way back.
 *
 * Pass `to` for an explicit destination; otherwise the button calls
 * `history.back()` via wouter's navigate(-1).
 */

import { ChevronLeft } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface BackButtonProps {
  /** Explicit parent route; if omitted, falls back to history.back() */
  to?: string;
  /** Override the visible label. Defaults to "Back". */
  label?: string;
  className?: string;
}

export default function BackButton({ to, label = "Back", className }: BackButtonProps) {
  const [, navigate] = useLocation();

  const handleClick = () => {
    if (to) {
      navigate(to);
    } else if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      navigate("/");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors -ml-1",
        className,
      )}
      data-testid="back-button"
    >
      <ChevronLeft className="w-4 h-4" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
