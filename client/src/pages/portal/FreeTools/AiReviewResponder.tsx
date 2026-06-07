import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  MessageSquareQuote,
  Copy,
  Check,
  Sparkles,
  AlertCircle,
  Loader2,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  FieldGroupHeader,
  TitleInField,
  TitleInFieldTextarea,
  TitleInFieldSelect,
} from "./_shared";

/**
 * AI Review Responder — interactive Free Tool.
 *
 * Drafts 2-3 on-brand replies to a customer review via the existing
 * QuoteQuick AI service (budget-capped, multi-provider shared Anthropic
 * client). Unlike the embed-snippet tools (Schema, Hours, FAQ) this tool is
 * input → AI output: there is NO copy-paste embed, just draft replies the
 * owner copies (and can tweak inline first).
 *
 * DS compliance: title-in-field + top-left help cue + 2px input-cluster gaps
 * + single .btn-primary-premium (Generate replies). Theme-locked light.
 */

interface SettingsData {
  business_name: string;
  trade_type: string | null;
}

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "apologetic", label: "Apologetic but confident" },
] as const;

const RATINGS = [5, 4, 3, 2, 1] as const;

interface ReplyDraft {
  /** The original AI text — kept so we can show an "edited" marker if needed. */
  original: string;
  /** The user-editable working copy. */
  text: string;
}

interface ErrorState {
  title: string;
  message: string;
}

export default function AiReviewResponder() {
  usePageTitle("AI Review Responder");
  const { toast } = useToast();

  const { data: profile } = useQuery<SettingsData>({
    queryKey: ["/api/portal/settings"],
    queryFn: async () => {
      const res = await fetch("/api/portal/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });

  const [reviewText, setReviewText] = useState("");
  const [rating, setRating] = useState<string>("5");
  const [businessName, setBusinessName] = useState("");
  const [tone, setTone] = useState<string>("professional");
  const [keyPoint, setKeyPoint] = useState("");

  const [drafts, setDrafts] = useState<ReplyDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Prefer the typed-in name; fall back to the profile business name so the
  // owner doesn't have to retype it on every visit.
  const effectiveBusinessName = (businessName || profile?.business_name || "").trim();

  // Wire Copilot form-fill — the assistant can pre-fill the business name,
  // tone, and key point. Review text + rating stay user-driven (they're the
  // specific review being answered).
  useCopilotForm({
    formLabel: "AI Review Responder",
    fields: [
      { key: "businessName", label: "Business name", required: false },
      { key: "tone", label: "Reply tone (professional / friendly / apologetic)", required: false },
      { key: "keyPoint", label: "Key point to mention", required: false },
    ],
    values: { businessName, tone, keyPoint },
    onApply: (fills) => {
      for (const f of fills) {
        const v = String(f.value ?? "");
        switch (f.field_key) {
          case "businessName":
            setBusinessName(v);
            break;
          case "tone": {
            const norm = v.toLowerCase();
            const match = TONES.find((t) => norm.includes(t.value));
            if (match) setTone(match.value);
            break;
          }
          case "keyPoint":
            setKeyPoint(v);
            break;
        }
      }
    },
    enabled: true,
  });

  const canGenerate = reviewText.trim().length > 0 && effectiveBusinessName.length > 0 && !loading;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    setDrafts([]);
    setCopiedIdx(null);
    try {
      const res = await fetch("/api/portal/free-tools/review-reply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewText: reviewText.trim(),
          rating: Number(rating),
          businessName: effectiveBusinessName,
          trade: profile?.trade_type ?? "",
          tone,
          keyPoint: keyPoint.trim(),
        }),
      });

      if (!res.ok) {
        let payload: any = null;
        try {
          payload = await res.json();
        } catch {
          /* non-JSON error body */
        }
        if (res.status === 403 && payload?.error === "budget_exceeded") {
          setError({
            title: "AI limit reached",
            message:
              "You've hit your AI usage limit for now. It resets daily — please try again later.",
          });
        } else if (res.status === 429) {
          setError({
            title: "Too many requests",
            message: "Please wait a moment and try again.",
          });
        } else if (res.status === 503) {
          setError({
            title: "AI temporarily unavailable",
            message: "The AI service isn't reachable right now. Please try again shortly.",
          });
        } else if (res.status === 401) {
          setError({
            title: "Session expired",
            message: "Please sign in again to use this tool.",
          });
        } else {
          setError({
            title: "Couldn't generate replies",
            message:
              payload?.message ||
              "Something went wrong drafting replies. Please try again.",
          });
        }
        return;
      }

      const data = await res.json();
      const replies: string[] = Array.isArray(data?.replies) ? data.replies : [];
      if (replies.length === 0) {
        setError({
          title: "No replies returned",
          message: "The AI couldn't draft replies for that review. Try rephrasing or try again.",
        });
        return;
      }
      setDrafts(replies.map((r) => ({ original: r, text: r })));
    } catch {
      setError({
        title: "Network error",
        message: "Couldn't reach the server. Check your connection and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (idx: number) => {
    const draft = drafts[idx];
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.text);
      setCopiedIdx(idx);
      toast({ title: "Copied", description: "Reply copied to clipboard." });
      setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the text and copy manually.",
        variant: "destructive",
      });
    }
  };

  const updateDraft = (idx: number, text: string) => {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, text } : d)));
  };

  return (
    <PortalLayout
      breadcrumb={
        <span className="flex items-center gap-1.5">
          <Link href="/portal/free-tools" className="hover:text-brand-blue">
            Free Tools
          </Link>
          <span className="text-gray-400">/</span>
          <span>AI Review Responder</span>
        </span>
      }
    >
      <div data-theme="light" className="qq-paper-surface space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <MessageSquareQuote className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-gray-900">AI Review Responder</h1>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            Paste a customer review and get instant, on-brand reply drafts. Replying
            to every review — good or bad — builds trust and is a proven local-SEO
            signal to Google. Tweak any draft, then copy it straight into your Google
            Business Profile.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Input column */}
          <div className="lg:col-span-1 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="The review"
                  help="Paste the exact text of the customer's review and pick how many stars they left."
                />
                <div className="space-y-0.5">
                  <TitleInFieldTextarea
                    id="rr-review"
                    label="Customer review"
                    value={reviewText}
                    onChange={setReviewText}
                    required
                    rows={5}
                    placeholder="Paste the review here…"
                    help="The exact words the customer wrote. We never post anything automatically — you stay in control."
                    testid="review-text"
                  />
                  <TitleInFieldSelect
                    id="rr-rating"
                    label="Star rating"
                    value={rating}
                    onChange={setRating}
                    help="How many stars the customer gave. This shapes the tone of the reply."
                    testid="review-rating"
                  >
                    {RATINGS.map((r) => (
                      <option key={r} value={String(r)}>
                        {r} star{r === 1 ? "" : "s"}
                      </option>
                    ))}
                  </TitleInFieldSelect>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Your details"
                  help="Used so the replies sound like they come from your business. The name defaults to your account profile."
                />
                <div className="space-y-0.5">
                  <TitleInField
                    id="rr-business"
                    label="Business name"
                    value={businessName}
                    onChange={setBusinessName}
                    required={!profile?.business_name}
                    maxLength={120}
                    placeholder={profile?.business_name || "Your business name"}
                    help="The name the reply should sign off as. Pre-filled from your profile when available."
                    testid="business-name"
                  />
                  <TitleInFieldSelect
                    id="rr-tone"
                    label="Tone"
                    value={tone}
                    onChange={setTone}
                    help="Pick the voice for the replies. 'Apologetic but confident' suits a tricky negative review."
                    testid="tone"
                  >
                    {TONES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </TitleInFieldSelect>
                  <TitleInField
                    id="rr-keypoint"
                    label="Key point to mention (optional)"
                    value={keyPoint}
                    onChange={setKeyPoint}
                    maxLength={300}
                    placeholder="e.g. mention our 12-month guarantee"
                    help="Anything you'd like each reply to naturally work in — a guarantee, an offer to call, a specific service."
                    testid="key-point"
                  />
                </div>

                {/* DS rule 5 — the single .btn-primary-premium on this page. */}
                <Button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="btn-primary-premium w-full"
                  data-testid="generate-replies"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" />
                      Drafting replies…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-1.5" aria-hidden="true" />
                      Generate replies
                    </>
                  )}
                </Button>
                <p className="text-[11px] text-gray-400 text-center">
                  Drafts only — nothing is posted. Always review before publishing.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Output column */}
          <div className="lg:col-span-2 space-y-3">
            {error && (
              <div
                className="flex items-start gap-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-900"
                role="alert"
                data-testid="rr-error"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1">
                  <p className="font-medium">{error.title}</p>
                  <p className="text-xs mt-0.5">{error.message}</p>
                </div>
              </div>
            )}

            {loading && drafts.length === 0 && (
              <Card>
                <CardContent className="p-8 flex flex-col items-center justify-center text-center gap-3">
                  <Loader2 className="w-6 h-6 text-brand-blue animate-spin" aria-hidden="true" />
                  <p className="text-sm text-gray-600">
                    Writing a few reply options for you…
                  </p>
                </CardContent>
              </Card>
            )}

            {!loading && drafts.length === 0 && !error && (
              <Card>
                <CardContent className="p-8 flex flex-col items-center justify-center text-center gap-2">
                  <MessageSquareQuote
                    className="w-8 h-8 text-gray-300"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium text-gray-700">
                    Your draft replies will appear here
                  </p>
                  <p className="text-xs text-gray-500 max-w-sm">
                    Paste a review, add your business name, and hit{" "}
                    <strong>Generate replies</strong>. You'll get a few options to
                    choose from and edit.
                  </p>
                </CardContent>
              </Card>
            )}

            {drafts.length > 0 && (
              <div className="space-y-3" data-testid="rr-drafts">
                {drafts.map((draft, idx) => (
                  <Card key={idx}>
                    <CardContent className="p-5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-gray-900">
                          Reply option {idx + 1}
                        </h2>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-11 sm:min-h-0"
                          onClick={() => handleCopy(idx)}
                          aria-label={`Copy reply option ${idx + 1}`}
                          data-testid={`copy-reply-${idx}`}
                        >
                          {copiedIdx === idx ? (
                            <>
                              <Check className="w-4 h-4 mr-1.5" aria-hidden="true" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4 mr-1.5" aria-hidden="true" />
                              Copy
                            </>
                          )}
                        </Button>
                      </div>
                      <textarea
                        value={draft.text}
                        onChange={(e) => updateDraft(idx, e.target.value)}
                        rows={4}
                        aria-label={`Editable reply option ${idx + 1}`}
                        data-testid={`reply-textarea-${idx}`}
                        className="w-full px-3 py-2 text-sm text-gray-800 border border-gray-200 rounded-lg bg-white resize-y focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
                      />
                      <p className="text-[11px] text-gray-400">
                        Edit anything above, then copy. Nothing is posted for you.
                      </p>
                    </CardContent>
                  </Card>
                ))}
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-600">
                      <strong className="text-gray-800">Tip:</strong> paste your chosen
                      reply into your Google Business Profile under the review. Replying
                      within 24-48 hours has the biggest impact on trust and rankings.
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
