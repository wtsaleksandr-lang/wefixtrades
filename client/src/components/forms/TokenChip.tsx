/**
 * TokenChip — a click-to-swap inline chip for AI-prefilled tokens.
 *
 * Used by ContentFlow Phase 2 (per Alex's "every prefilled token must be
 * an interactive chip with 4-6 alternatives the user can click to swap"
 * requirement). The component is generic enough to be reused by any
 * future form that wants AI-driven, swap-able field values:
 *
 *   <TokenChip
 *     label="Business name"
 *     value="Pipefitters of Hamilton"
 *     alternatives={["Pipefitters of Hamilton", "PoH Plumbing", ...]}
 *     onChange={(next) => ...}
 *     onRegenerate={async () => fetchFreshAlternatives()}
 *   />
 *
 * Behaviour:
 *   - Visual chip shows the current value + chevron.
 *   - Click → popover with the 4-6 alternatives as a radio-like list.
 *   - "Custom..." opens a free-text input that becomes the new value.
 *   - "Regenerate alternatives" button at the bottom calls the
 *     onRegenerate callback (parent decides whether that's an extra
 *     /prefill round-trip or a cached pool).
 *
 * Conforms to the project's input-field design rules: help cue / label
 * sits top-left of the chip block; chip itself is the clickable surface.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, RefreshCw, Pencil } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface TokenChipProps {
  /** Help cue label rendered top-left of the chip (NOT inside it). */
  label: string;
  /** Currently-selected value. */
  value: string;
  /** 4-6 AI-generated alternatives. The current value should appear in
   *  this list when feasible so the popover renders a clean radio set. */
  alternatives: string[];
  onChange: (next: string) => void;
  /** Optional: regenerate fresh alternatives (parent owns the call). */
  onRegenerate?: () => Promise<void> | void;
  /** Optional: tone the chip differently for color-valued tokens etc. */
  variant?: "default" | "color";
  /** Optional: data-testid prefix for the chip + popover. */
  testId?: string;
  /** Optional placeholder for the empty state. */
  placeholder?: string;
  /** Optional: render disabled (e.g. while parent is loading). */
  disabled?: boolean;
}

export function TokenChip({
  label,
  value,
  alternatives,
  onChange,
  onRegenerate,
  variant = "default",
  testId,
  placeholder = "Tap to pick a value",
  disabled = false,
}: TokenChipProps) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [regenLoading, setRegenLoading] = useState(false);
  const customInputRef = useRef<HTMLInputElement | null>(null);

  /* Reset custom-mode state when popover closes. */
  useEffect(() => {
    if (!open) {
      setCustomMode(false);
      setCustomDraft("");
    }
  }, [open]);

  /* Focus the custom input as soon as it opens. */
  useEffect(() => {
    if (customMode) customInputRef.current?.focus();
  }, [customMode]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  async function handleRegenerate() {
    if (!onRegenerate || regenLoading) return;
    setRegenLoading(true);
    try {
      await onRegenerate();
    } finally {
      setRegenLoading(false);
    }
  }

  const displayValue = value && value.trim().length > 0 ? value : placeholder;
  const isPlaceholder = !value || value.trim().length === 0;

  return (
    <div className="flex flex-col gap-1" data-testid={testId ? `${testId}-root` : undefined}>
      {/* Help cue: top-left of the chip block, per the global input
       * field rules in DESIGN-SYSTEM.md / feedback_input_field_rules.md */}
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Popover open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            data-testid={testId ? `${testId}-trigger` : undefined}
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
              "border-primary/40 bg-primary/5 text-primary hover:border-primary hover:bg-primary/10",
              isPlaceholder && "border-dashed border-muted-foreground/40 bg-muted/40 text-muted-foreground",
              disabled && "cursor-not-allowed opacity-60",
              variant === "color" && "pl-1.5",
            )}
          >
            {variant === "color" && !isPlaceholder && (
              <span
                aria-hidden
                className="inline-block h-3.5 w-3.5 rounded-full border border-border"
                style={{ backgroundColor: /^#[0-9A-Fa-f]{3,8}$/.test(value) ? value : undefined }}
              />
            )}
            <span className="truncate max-w-[220px]">{displayValue}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-72 p-2"
          data-testid={testId ? `${testId}-popover` : undefined}
        >
          {!customMode ? (
            <>
              <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pick {label.toLowerCase()}
              </div>
              <ul className="space-y-0.5">
                {alternatives.map((alt, i) => {
                  const isSelected = alt === value;
                  return (
                    <li key={`${alt}-${i}`}>
                      <button
                        type="button"
                        onClick={() => pick(alt)}
                        data-testid={testId ? `${testId}-alt-${i}` : undefined}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs leading-snug",
                          "hover:bg-muted",
                          isSelected && "bg-primary/10 text-primary",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          {variant === "color" && (
                            <span
                              aria-hidden
                              className="inline-block h-3 w-3 rounded-full border border-border"
                              style={{ backgroundColor: /^#[0-9A-Fa-f]{3,8}$/.test(alt) ? alt : undefined }}
                            />
                          )}
                          <span className="break-words">{alt}</span>
                        </span>
                        {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setCustomDraft(value);
                    setCustomMode(true);
                  }}
                  data-testid={testId ? `${testId}-custom` : undefined}
                >
                  <Pencil className="mr-1 h-3 w-3" /> Custom…
                </Button>
                {onRegenerate && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={handleRegenerate}
                    disabled={regenLoading}
                    data-testid={testId ? `${testId}-regenerate` : undefined}
                  >
                    {regenLoading ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-3 w-3" />
                    )}
                    Regenerate
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Custom {label.toLowerCase()}
              </div>
              <Input
                ref={customInputRef}
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (customDraft.trim()) pick(customDraft.trim());
                  } else if (e.key === "Escape") {
                    setCustomMode(false);
                  }
                }}
                placeholder={placeholder}
                maxLength={300}
                data-testid={testId ? `${testId}-custom-input` : undefined}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setCustomMode(false)}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!customDraft.trim()}
                  onClick={() => pick(customDraft.trim())}
                  data-testid={testId ? `${testId}-custom-save` : undefined}
                >
                  Use this
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default TokenChip;
