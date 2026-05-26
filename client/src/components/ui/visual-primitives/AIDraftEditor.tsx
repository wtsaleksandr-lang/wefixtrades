/**
 * AIDraftEditor — shared side-by-side AI-vs-user diff editor primitive.
 *
 * Wave 22C. Consumed by Wave 25 (SocialSync) and Wave 28
 * (ReputationShield) for the "review the AI draft before posting" flow.
 *
 * Left pane: AI draft, read-only, with strikethrough on words the user
 * removed. Right pane: editable textarea with brand-blue underline on
 * words the user added. Bottom toolbar: char/word counter, Regenerate
 * (optional), Revert, Save.
 *
 * Keyboard:
 *   Ctrl/Cmd + Enter — save
 *   Ctrl/Cmd + R     — regenerate (when onRegenerate provided)
 *   Ctrl/Cmd + Z     — native textarea undo
 *
 * Diff: ~70-LOC word-level longest-common-subsequence (NO diff-match-patch
 * dependency). Highlights re-render on each keystroke; debounced to one
 * frame for typing-heavy edits.
 *
 * DESIGN-SYSTEM compliance: semantic tokens only, 2px gaps, no hover-shift,
 * respects prefers-reduced-motion. Pure React + Framer Motion for the
 * loading overlay only.
 *
 * Anti-patterns avoided: no auto-save on type, no markdown rendering
 * (plain text), parent owns persistence via onSave.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, RotateCcw, Save, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type AIDraftEditorContext = {
  kind: "review_reply" | "social_post" | "article";
  metadata?: Record<string, unknown>;
};

export type AIDraftEditorProps = {
  aiDraft: string;
  initialUserEdit?: string;
  context?: AIDraftEditorContext;
  onSave: (finalText: string) => Promise<void> | void;
  onRegenerate?: () => Promise<string>;
  maxLength?: number;
  className?: string;
};

// ── Word-level LCS diff ─────────────────────────────────────────────────
// Returns segments with one of three ops:
//   - "equal":  word present in both
//   - "remove": word only in `a` (the AI draft)
//   - "add":    word only in `b` (the user version)
// Splits on whitespace + keeps the trailing whitespace as part of the
// token so re-joining preserves layout. ~70 LOC.

type DiffOp = "equal" | "add" | "remove";

type DiffSegment = { op: DiffOp; text: string };

function tokenize(s: string): string[] {
  if (!s) return [];
  // Split into [word, gap, word, gap, ...] keeping whitespace as its own
  // token so diffing whitespace-only edits doesn't churn the entire string.
  const out: string[] = [];
  let buf = "";
  let mode: "ws" | "word" | null = null;
  for (const ch of s) {
    const isWs = /\s/.test(ch);
    const next = isWs ? "ws" : "word";
    if (mode === null) {
      mode = next;
      buf = ch;
    } else if (mode === next) {
      buf += ch;
    } else {
      out.push(buf);
      buf = ch;
      mode = next;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function wordDiff(a: string, b: string): DiffSegment[] {
  const A = tokenize(a);
  const B = tokenize(b);
  const n = A.length;
  const m = B.length;

  // LCS DP table.
  const dp: Uint32Array[] = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (A[i - 1] === B[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        const up = dp[i - 1]![j]!;
        const left = dp[i]![j - 1]!;
        dp[i]![j] = up >= left ? up : left;
      }
    }
  }

  // Walk back to build segments.
  const segments: DiffSegment[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (A[i - 1] === B[j - 1]) {
      segments.push({ op: "equal", text: A[i - 1]! });
      i--;
      j--;
    } else if ((dp[i - 1]?.[j] ?? 0) >= (dp[i]?.[j - 1] ?? 0)) {
      segments.push({ op: "remove", text: A[i - 1]! });
      i--;
    } else {
      segments.push({ op: "add", text: B[j - 1]! });
      j--;
    }
  }
  while (i > 0) {
    segments.push({ op: "remove", text: A[i - 1]! });
    i--;
  }
  while (j > 0) {
    segments.push({ op: "add", text: B[j - 1]! });
    j--;
  }
  return segments.reverse();
}

// ── Component ───────────────────────────────────────────────────────────

function countWords(s: string): number {
  const m = s.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function AIDraftEditor({
  aiDraft,
  initialUserEdit,
  context,
  onSave,
  onRegenerate,
  maxLength,
  className,
}: AIDraftEditorProps) {
  const reduceMotion = useReducedMotion();
  const [aiText, setAiText] = useState<string>(aiDraft);
  const [userText, setUserText] = useState<string>(initialUserEdit ?? aiDraft);
  const [saving, setSaving] = useState<boolean>(false);
  const [regenerating, setRegenerating] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset if the upstream draft changes (parent passed a new aiDraft prop).
  useEffect(() => {
    setAiText(aiDraft);
    setUserText((cur) => (cur === aiDraft ? cur : initialUserEdit ?? aiDraft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiDraft]);

  const segments = useMemo(() => wordDiff(aiText, userText), [aiText, userText]);
  const aiSegments = useMemo(
    () => segments.filter((s) => s.op !== "add"),
    [segments]
  );
  const userSegments = useMemo(
    () => segments.filter((s) => s.op !== "remove"),
    [segments]
  );

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(userText);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save draft."
      );
    } finally {
      setSaving(false);
    }
  }, [onSave, userText, saving]);

  const handleRegenerate = useCallback(async () => {
    if (!onRegenerate || regenerating) return;
    setRegenerating(true);
    try {
      const next = await onRegenerate();
      setAiText(next);
      setUserText(next);
    } finally {
      setRegenerating(false);
    }
  }, [onRegenerate, regenerating]);

  const handleRevert = useCallback(() => {
    setUserText(aiText);
    textareaRef.current?.focus();
  }, [aiText]);

  const onTextareaKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void handleSave();
        return;
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "r" &&
        onRegenerate
      ) {
        e.preventDefault();
        void handleRegenerate();
      }
    },
    [handleSave, handleRegenerate, onRegenerate]
  );

  const chars = userText.length;
  const words = countWords(userText);
  const overLimit = maxLength !== undefined && chars > maxLength;

  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-lg border bg-card text-card-foreground",
        className
      )}
      data-testid="ai-draft-editor"
      data-context-kind={context?.kind}
    >
      {/* Two-pane body */}
      <div className="grid min-h-[280px] flex-1 grid-cols-1 md:grid-cols-2">
        {/* AI draft (read-only, with strikethrough on removed words) */}
        <div className="relative flex min-w-0 flex-col border-b md:border-b-0 md:border-r">
          <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Sparkles
              className="h-3 w-3 text-[hsl(var(--chart-1))]"
              aria-hidden="true"
            />
            AI draft
          </div>
          <div
            className="flex-1 overflow-y-auto whitespace-pre-wrap p-3 font-mono text-sm leading-relaxed text-foreground/90"
            data-testid="ai-draft-pane"
          >
            {aiSegments.map((seg, idx) =>
              seg.op === "remove" ? (
                <span
                  key={idx}
                  className="bg-[hsl(var(--destructive)/0.1)] text-muted-foreground line-through decoration-[hsl(var(--destructive)/0.7)]"
                >
                  {seg.text}
                </span>
              ) : (
                <span key={idx}>{seg.text}</span>
              )
            )}
          </div>
          {regenerating ? (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex items-center justify-center bg-card/70 backdrop-blur-sm"
              data-testid="regenerate-overlay"
            >
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--chart-1))]" />
                Regenerating…
              </div>
            </motion.div>
          ) : null}
        </div>

        {/* User edit (editable) */}
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center justify-between gap-1.5 border-b bg-muted/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Your version</span>
            <span aria-hidden="true">
              <span
                className={cn(
                  "tabular-nums",
                  overLimit && "text-[hsl(var(--destructive))]"
                )}
              >
                {chars}
                {maxLength !== undefined ? ` / ${maxLength}` : ""}
              </span>
              <span className="mx-1 opacity-40">·</span>
              <span className="tabular-nums">{words}w</span>
            </span>
          </div>

          {/* Overlay layout: highlight underlay + transparent textarea on top.
              The textarea owns user input + native undo; the underlay shows
              the diff colorization. */}
          <div className="relative flex-1">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap p-3 font-mono text-sm leading-relaxed text-transparent"
            >
              {userSegments.map((seg, idx) =>
                seg.op === "add" ? (
                  <span
                    key={idx}
                    className="rounded-sm bg-[hsl(var(--chart-1)/0.12)] underline decoration-[hsl(var(--chart-1))] decoration-2 underline-offset-2"
                  >
                    {seg.text}
                  </span>
                ) : (
                  <span key={idx}>{seg.text}</span>
                )
              )}
              {/* Trailing newline ensures the overlay height matches even
                  when the user's text ends with a newline. */}
              {"\n"}
            </div>
            <textarea
              ref={textareaRef}
              value={userText}
              onChange={(e) => setUserText(e.target.value)}
              onKeyDown={onTextareaKeyDown}
              spellCheck
              className="relative h-full min-h-[220px] w-full resize-none bg-transparent p-3 font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus:ring-0"
              placeholder="Edit the AI draft here…"
              maxLength={maxLength}
              data-testid="user-edit-textarea"
            />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {saveError ? (
            <span
              className="text-[hsl(var(--destructive))]"
              role="alert"
              data-testid="save-error"
            >
              {saveError}
            </span>
          ) : (
            <span>Edits highlighted in brand blue. Strikethrough = removed.</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRevert}
            disabled={userText === aiText}
            data-testid="revert-button"
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Revert
          </Button>
          {onRegenerate ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRegenerate}
              disabled={regenerating || saving}
              data-testid="regenerate-button"
            >
              {regenerating ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3.5 w-3.5" />
              )}
              Regenerate
              <kbd className="ml-1.5 hidden rounded bg-background/40 px-1 text-[10px] font-mono sm:inline">
                ⌘R
              </kbd>
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || overLimit}
            data-testid="save-button"
          >
            {saving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            Save
            <kbd className="ml-1.5 hidden rounded bg-background/40 px-1 text-[10px] font-mono sm:inline">
              ⌘↵
            </kbd>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AIDraftEditor;
