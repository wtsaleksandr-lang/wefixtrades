/**
 * AiResponseRating — message-level 👍 / 👎 feedback widget for any AI
 * response shown in the admin UI. Drop in next to the response and pass
 * the stable identifier the surface uses for that response.
 *
 *   <AiResponseRating
 *     responseId={`call-${call.id}`}
 *     surface="tradeline_voice"
 *     clientId={call.client_id}
 *   />
 *
 * Persists via POST /api/admin/ai/ratings (upserts on
 * rated_by + response_id). 👎 opens an inline textarea — the comment is
 * what the nightly conversation→KB sweep picks up to spawn a
 * tradeline_learning_candidates row.
 *
 * Source: PR #669 audit — the conversation→KB pipeline scaffolded in
 * tradeline_learning_candidates had no source of feedback until now.
 */

import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, Loader2, Check, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface AiResponseRatingProps {
  /** Stable identifier for the AI response being rated. */
  responseId: string;
  /** Must match a surface in server/services/aiSurfaces.ts. */
  surface: string;
  /** Optional client scope for per-client analytics. */
  clientId?: number | null;
  /** Compact mode uses smaller icons + tighter spacing. Default true. */
  compact?: boolean;
  /** Optional className for the outer wrapper. */
  className?: string;
}

type RatingValue = -1 | 1 | null;

export default function AiResponseRating({
  responseId,
  surface,
  clientId,
  compact = true,
  className,
}: AiResponseRatingProps) {
  const { toast } = useToast();
  const [rating, setRating] = useState<RatingValue>(null);
  const [comment, setComment] = useState<string>("");
  const [submitting, setSubmitting] = useState<RatingValue>(null);
  const [showCommentBox, setShowCommentBox] = useState<boolean>(false);
  const [commentSubmitted, setCommentSubmitted] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState<boolean>(false);

  /* Hydrate prior rating (if this admin has rated this response before). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/ai/ratings/by-response?response_id=${encodeURIComponent(responseId)}`,
          { credentials: "include" },
        );
        if (!res.ok) return;
        const body = await res.json().catch(() => null);
        if (cancelled || !body?.rating) return;
        setRating(body.rating.rating === -1 ? -1 : body.rating.rating === 1 ? 1 : null);
        if (typeof body.rating.comment === "string") {
          setComment(body.rating.comment);
          setCommentSubmitted(Boolean(body.rating.comment));
        }
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [responseId]);

  async function submit(next: -1 | 1, withComment?: string) {
    setSubmitting(next);
    try {
      await apiRequest("POST", "/api/admin/ai/ratings", {
        response_id: responseId,
        surface,
        rating: next,
        comment: withComment ?? (next === -1 ? comment.trim() || null : null),
        client_id: clientId ?? null,
      });
      setRating(next);
      if (next === -1) {
        setShowCommentBox(true);
        if (withComment !== undefined) {
          setCommentSubmitted(Boolean(withComment.trim()));
        }
      } else {
        // 👍 — clear the inline comment UI.
        setShowCommentBox(false);
        setCommentSubmitted(false);
      }
    } catch (err: any) {
      toast({
        title: "Couldn't save feedback",
        description: err?.message ?? "Try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(null);
    }
  }

  const iconSize = compact ? "w-3.5 h-3.5" : "w-4 h-4";
  const btnBase =
    "inline-flex items-center justify-center rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const btnPad = compact ? "h-6 w-6" : "h-7 w-7";

  const upActive = rating === 1;
  const downActive = rating === -1;

  return (
    <div
      className={`flex flex-col gap-1.5 ${className ?? ""}`}
      data-testid={`ai-rating-${responseId}`}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Helpful response"
          title="Helpful response"
          disabled={submitting !== null || !hydrated}
          onClick={() => submit(1)}
          className={[
            btnBase,
            btnPad,
            upActive
              ? "border-brand-blue-200 bg-brand-blue-50 text-brand-blue-700"
              : "border-gray-200 bg-white text-gray-500 hover:border-brand-blue-200 hover:bg-brand-blue-50 hover:text-brand-blue-700",
          ].join(" ")}
          data-testid={`ai-rating-up-${responseId}`}
        >
          {submitting === 1 ? (
            <Loader2 className={`${iconSize} animate-spin`} />
          ) : (
            <ThumbsUp className={iconSize} />
          )}
        </button>
        <button
          type="button"
          aria-label="Unhelpful response"
          title="Unhelpful response"
          disabled={submitting !== null || !hydrated}
          onClick={() => {
            setShowCommentBox(true);
            // Record the 👎 immediately so it counts even if the admin
            // never sends a comment — the sweep just won't pick it up
            // for the KB without a comment.
            if (rating !== -1) submit(-1);
          }}
          className={[
            btnBase,
            btnPad,
            downActive
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-gray-200 bg-white text-gray-500 hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive",
          ].join(" ")}
          data-testid={`ai-rating-down-${responseId}`}
        >
          {submitting === -1 ? (
            <Loader2 className={`${iconSize} animate-spin`} />
          ) : (
            <ThumbsDown className={iconSize} />
          )}
        </button>
        {rating !== null && commentSubmitted && (
          <span className="text-[10px] text-gray-400 ml-1">Feedback saved</span>
        )}
      </div>

      {showCommentBox && rating === -1 && !commentSubmitted && (
        <div className="flex flex-col gap-1.5 max-w-md">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional — what was wrong? (feeds the KB)"
            rows={2}
            maxLength={2000}
            className="w-full text-xs rounded-md border border-gray-200 bg-card px-2 py-1.5 text-gray-700 placeholder:text-gray-400 focus:border-brand-blue-400 focus:outline-none focus:ring-1 focus:ring-brand-blue-200"
            data-testid={`ai-rating-comment-${responseId}`}
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={submitting !== null}
              onClick={() => submit(-1, comment.trim())}
              className="inline-flex items-center gap-1 rounded-md border border-brand-blue-200 bg-brand-blue-50 px-2 py-1 text-[11px] font-medium text-brand-blue-700 hover:bg-brand-blue-100 disabled:opacity-50"
              data-testid={`ai-rating-comment-submit-${responseId}`}
            >
              {submitting === -1 ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Send
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCommentBox(false);
                setComment("");
              }}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-card px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
              data-testid={`ai-rating-comment-cancel-${responseId}`}
            >
              <X className="w-3 h-3" />
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
