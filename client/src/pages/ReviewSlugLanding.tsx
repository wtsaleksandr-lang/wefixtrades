import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Loader2, Star, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Public review-funnel landing page — /r/:slug
 *
 * Free-tools batch 2. Mobile-first; most visitors arrive via QR scan from a
 * printed business card.
 *
 * Flow:
 *   1. Load config from /api/r/:slug/config (also logs landing event).
 *   2. Render business name + 5 star buttons.
 *   3. Click star → POST /api/r/:slug/click → either redirect to external
 *      review URL (≥ threshold) or render the private feedback form.
 *   4. Feedback submit → POST /api/r/:slug/feedback → thanks screen.
 *
 * No PortalLayout / no logged-in chrome — this is the public funnel page.
 */

interface ConfigResponse {
  slug: string;
  businessName: string;
  logoUrl: string | null;
  heading: string | null;
  threshold: number;
  hasGoogle: boolean;
  hasFacebook: boolean;
  hasYelp: boolean;
}

type Stage = "loading" | "error" | "stars" | "feedback" | "submitting" | "thanks";

export default function ReviewSlugLanding() {
  const [, params] = useRoute("/r/:slug");
  const slug = params?.slug || "";

  const [cfg, setCfg] = useState<ConfigResponse | null>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!slug) {
      setErrorMsg("This review link looks incomplete.");
      setStage("error");
      return;
    }
    fetch(`/api/r/${encodeURIComponent(slug)}/config`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Review link not found");
        return r.json();
      })
      .then((data: ConfigResponse) => {
        setCfg(data);
        setStage("stars");
        document.title = `Review ${data.businessName}`;
      })
      .catch((e: Error) => {
        setErrorMsg(e.message || "We couldn't load this review link.");
        setStage("error");
      });
  }, [slug]);

  const handleStarClick = async (n: number) => {
    setRating(n);
    setStage("submitting");
    try {
      const r = await fetch(`/api/r/${encodeURIComponent(slug)}/click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: n }),
      });
      const data = await r.json();
      if (!r.ok) {
        setErrorMsg(data.error || "Couldn't record your rating.");
        setStage("error");
        return;
      }
      if (data.mode === "external" && data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      // mode === "feedback"
      setStage("feedback");
    } catch (e: any) {
      setErrorMsg(e?.message || "Network error.");
      setStage("error");
    }
  };

  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;
    setStage("submitting");
    try {
      const r = await fetch(`/api/r/${encodeURIComponent(slug)}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: rating ?? undefined,
          feedback: feedback.trim(),
          name: name.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErrorMsg(data.error || "Couldn't submit feedback.");
        setStage("error");
        return;
      }
      setStage("thanks");
    } catch (e: any) {
      setErrorMsg(e?.message || "Network error.");
      setStage("error");
    }
  };

  return (
    <div
      data-theme="light"
      className="min-h-screen bg-slate-50 flex flex-col items-center justify-start sm:justify-center px-4 py-8"
    >
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-gray-100 p-6 sm:p-8">
          {/* Brand block */}
          {cfg && (
            <div className="flex flex-col items-center text-center mb-6">
              {cfg.logoUrl && (
                <img
                  src={cfg.logoUrl}
                  alt={`${cfg.businessName} logo`}
                  style={{ width: 64, height: 64 }}
                  className="rounded-xl object-cover mb-3 border border-gray-100"
                />
              )}
              <h1 className="text-xl font-bold text-gray-900">{cfg.businessName}</h1>
            </div>
          )}

          {stage === "loading" && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="w-6 h-6 text-brand-blue animate-spin" aria-hidden="true" />
              <p className="mt-3 text-sm text-gray-600">Loading…</p>
            </div>
          )}

          {stage === "error" && (
            <div className="flex flex-col items-center text-center py-6">
              <AlertCircle className="w-8 h-8 text-amber-500" aria-hidden="true" />
              <p className="mt-3 text-sm text-gray-700">{errorMsg}</p>
            </div>
          )}

          {stage === "submitting" && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="w-6 h-6 text-brand-blue animate-spin" aria-hidden="true" />
              <p className="mt-3 text-sm text-gray-600">One sec…</p>
            </div>
          )}

          {stage === "stars" && cfg && (
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 text-center mb-5">
                {cfg.heading || "How was your experience?"}
              </h2>
              <div
                className="flex items-center justify-center gap-1 sm:gap-2"
                role="radiogroup"
                aria-label="Rate from 1 to 5 stars"
              >
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = (hoverRating ?? rating ?? 0) >= n;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={rating === n}
                      aria-label={`${n} star${n === 1 ? "" : "s"}`}
                      onClick={() => handleStarClick(n)}
                      onMouseEnter={() => setHoverRating(n)}
                      onMouseLeave={() => setHoverRating(null)}
                      className={cn(
                        "p-2 sm:p-2.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue/40",
                        "hover:bg-amber-50 active:bg-amber-100",
                      )}
                      data-testid={`star-${n}`}
                    >
                      <Star
                        className={cn(
                          "w-8 h-8 transition-colors",
                          active ? "fill-amber-400 text-amber-400" : "text-gray-300",
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 text-center mt-4">
                Tap a star to leave your rating.
              </p>
            </div>
          )}

          {stage === "feedback" && cfg && (
            <form onSubmit={submitFeedback} className="space-y-4">
              <h2 className="text-base font-semibold text-gray-900 text-center">
                Sorry to hear that — what went wrong?
              </h2>
              <p className="text-sm text-gray-600 text-center">
                Your note goes straight to {cfg.businessName}. It's private — not posted publicly.
              </p>
              <div>
                <label htmlFor="rs-feedback" className="block text-xs font-medium text-gray-600 mb-1">
                  Your feedback
                </label>
                <textarea
                  id="rs-feedback"
                  required
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
                  placeholder="Tell them what could be better…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rs-name" className="block text-xs font-medium text-gray-600 mb-1">
                    Name (optional)
                  </label>
                  <input
                    id="rs-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
                  />
                </div>
                <div>
                  <label htmlFor="rs-email" className="block text-xs font-medium text-gray-600 mb-1">
                    Email (optional)
                  </label>
                  <input
                    id="rs-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={!feedback.trim()}
                className="btn-primary-premium w-full px-4 py-2.5 text-sm font-semibold rounded-lg disabled:opacity-60"
              >
                Send feedback
              </button>
            </form>
          )}

          {stage === "thanks" && cfg && (
            <div className="flex flex-col items-center text-center py-4">
              <CheckCircle2 className="w-8 h-8 text-green-500" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-semibold text-gray-900">Thanks for letting us know.</h2>
              <p className="mt-1 text-sm text-gray-600">{cfg.businessName} will be in touch.</p>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          Powered by{" "}
          <a
            href="https://wefixtrades.com?utm_source=review-funnel&utm_medium=public-page"
            target="_blank"
            rel="noopener"
            className="underline underline-offset-2 hover:text-gray-600"
          >
            WeFixTrades
          </a>
        </p>
      </div>
    </div>
  );
}
