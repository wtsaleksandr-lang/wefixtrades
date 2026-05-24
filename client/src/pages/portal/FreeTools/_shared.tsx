/**
 * Free Tools — shared input primitives.
 *
 * Locked design-system rules (2026-05-21):
 *   1. Title INSIDE the field — floating label, never <label> above the input.
 *   2. Help cue (?) anchored TOP-LEFT of each field group, never elsewhere.
 *   3. No duplicated titles — single label, lives in the field.
 *   4. Stacked input clusters use a 2px (`gap-0.5`) vertical gap.
 *   5. One `.btn-primary-premium` per page — secondary CTAs use the plain
 *      Button outline variant.
 *
 * Inspired by `FloatingLabelInput` in PortalOnboarding.tsx — that helper is
 * tied to the OnboardingContext step/config plumbing, so we re-stamp the
 * pattern as a tiny standalone module the seven Free Tools pages share.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Top-left anchored ? help cue ─── */
export function FieldHelpCue({
  label,
  help,
  className,
}: {
  label: string;
  help?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!help) return null;
  return (
    <span className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Help: ${label}`}
        aria-expanded={open}
        className="p-0.5 rounded-full text-gray-300 hover:text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
        data-help-cue-anchor="top-left"
      >
        <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={popRef}
          role="tooltip"
          className="absolute left-0 top-5 z-20 w-64 p-2.5 rounded-md border border-gray-200 bg-white shadow-md text-xs text-gray-700"
        >
          <p className="font-semibold text-gray-900 mb-1">{label}</p>
          <p>{help}</p>
        </div>
      )}
    </span>
  );
}

/* ─── Top-left help-cue row used to anchor a section header. ─── */
export function FieldGroupHeader({
  title,
  help,
  right,
  className,
}: {
  title: ReactNode;
  help?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2 mb-1.5", className)}>
      <div className="flex items-center gap-1.5 min-w-0">
        {help && <FieldHelpCue label={typeof title === "string" ? title : "Help"} help={help} />}
        <h2 className="text-sm font-semibold text-gray-900 truncate">{title}</h2>
      </div>
      {right && <div className="flex items-center gap-1 shrink-0">{right}</div>}
    </div>
  );
}

/* ─── Floating-label text input (title-in-field). ─── */
export function TitleInField({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
  maxLength,
  help,
  testid,
  className,
  onKeyDown,
  inputClassName,
  disabled,
  min,
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  maxLength?: number;
  help?: string;
  testid?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputClassName?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <div className={cn("relative pl-5", className)}>
      <span className="absolute top-1 left-0">
        <FieldHelpCue label={label} help={help} />
      </span>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder=" "
          aria-label={label}
          required={required}
          maxLength={maxLength}
          disabled={disabled}
          min={min}
          max={max}
          data-testid={testid}
          className={cn(
            "peer w-full px-3 pt-5 pb-1.5 text-sm border border-gray-200 rounded-lg bg-white",
            "focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors",
            "disabled:opacity-50",
            inputClassName,
          )}
        />
        <label
          htmlFor={id}
          className={cn(
            "absolute left-3 pointer-events-none transition-all duration-150",
            "top-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500",
            "peer-placeholder-shown:top-2.5 peer-placeholder-shown:text-sm peer-placeholder-shown:font-normal",
            "peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-placeholder-shown:text-gray-400",
            "peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-brand-blue",
          )}
        >
          {label}
          {required && <span className="text-red-400 ml-1 normal-case">*</span>}
        </label>
        {placeholder && (
          <span
            aria-hidden="true"
            className="absolute right-3 top-2.5 text-[11px] text-gray-300 peer-focus:hidden peer-[:not(:placeholder-shown)]:hidden pointer-events-none"
          >
            {placeholder}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Floating-label textarea. ─── */
export function TitleInFieldTextarea({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  help,
  testid,
  className,
  textareaClassName,
  rows,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  help?: string;
  testid?: string;
  className?: string;
  textareaClassName?: string;
  rows?: number;
}) {
  return (
    <div className={cn("relative pl-5", className)}>
      <span className="absolute top-1 left-0">
        <FieldHelpCue label={label} help={help} />
      </span>
      <div className="relative">
        <textarea
          id={id}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder=" "
          aria-label={label}
          required={required}
          rows={rows}
          data-testid={testid}
          className={cn(
            "peer w-full px-3 pt-5 pb-1.5 text-sm border border-gray-200 rounded-lg bg-white resize-y",
            "focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors",
            textareaClassName,
          )}
        />
        <label
          htmlFor={id}
          className={cn(
            "absolute left-3 pointer-events-none transition-all duration-150",
            "top-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500",
            "peer-placeholder-shown:top-2.5 peer-placeholder-shown:text-sm peer-placeholder-shown:font-normal",
            "peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-placeholder-shown:text-gray-400",
            "peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-brand-blue",
          )}
        >
          {label}
          {required && <span className="text-red-400 ml-1 normal-case">*</span>}
        </label>
        {placeholder && (
          <span
            aria-hidden="true"
            className="absolute right-3 top-2.5 text-[11px] text-gray-300 peer-focus:hidden peer-[:not(:placeholder-shown)]:hidden pointer-events-none"
          >
            {placeholder}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Floating-label native <select>. ─── */
export function TitleInFieldSelect({
  id,
  label,
  value,
  onChange,
  help,
  testid,
  className,
  children,
}: {
  id: string;
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  help?: string;
  testid?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative pl-5", className)}>
      <span className="absolute top-1 left-0">
        <FieldHelpCue label={label} help={help} />
      </span>
      <div className="relative">
        <label
          htmlFor={id}
          className="absolute left-3 top-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 pointer-events-none"
        >
          {label}
        </label>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testid}
          className="w-full px-3 pt-5 pb-1.5 text-sm border border-gray-200 rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
        >
          {children}
        </select>
      </div>
    </div>
  );
}

/* ─── Tiny generic debounce hook — 300ms suits autosave-on-keystroke. ─── */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number = 300,
) {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { fnRef.current = fn; }, [fn]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return useCallback((...args: TArgs) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      fnRef.current(...args);
    }, delayMs);
  }, [delayMs]);
}
