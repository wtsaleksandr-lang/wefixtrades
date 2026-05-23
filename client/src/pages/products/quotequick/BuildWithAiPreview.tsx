/**
 * BI-1 — Anonymous AI calculator demo: preview + signup gate.
 *
 * Route: /products/quickquotepro/build-with-ai/preview?session=<id>
 * (tools-consolidation: relocated from /tools/build-with-ai/preview;
 * legacy path 301s to this route).
 *
 * The page tries three sources for the generated template, in order:
 *   1. sessionStorage (set by BuildWithAi.tsx) — instant render on the
 *      navigation that just succeeded.
 *   2. /api/ai/demo/session/:id — covers hard refreshes and inbound links.
 *   3. Bail to /products/quickquotepro/build-with-ai if both miss (expired
 *      or invalid).
 *
 * The template is converted into an `AdvancedConfigShape` via the shared
 * `buildCalculatorFromDemoTemplate()` helper and rendered through
 * `QuoteWidget`, identical to the auth'd hosted page. CTAs gate the
 * persistent version behind signup — `/signup?source=ai-demo&demo=<id>`.
 *
 * Privacy strip: "Your data is private. We don't keep your image." — the
 * backend already deleted the buffer; this is just trust signalling.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import QuoteWidget from "@/components/quote-widget/QuoteWidget";
import { mkt, colors } from "@/theme/tokens";
import { usePageMeta } from "@/lib/usePageMeta";
import {
  buildCalculatorFromDemoTemplate,
  type DemoImageTemplate,
} from "@shared/aiDemoTemplate";
import type { CalculatorData } from "@/components/quote-widget/types";
import { Sparkles, ShieldCheck, ArrowRight, RotateCw } from "lucide-react";
import { BI1_DEMO_STORAGE_KEY } from "./BuildWithAi";

interface DemoState {
  template: DemoImageTemplate;
  demoSessionId: string;
}

function readFromStorage(sessionId: string): DemoState | null {
  try {
    const raw = sessionStorage.getItem(BI1_DEMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoState> & { ts?: number };
    if (parsed.demoSessionId !== sessionId) return null;
    if (!parsed.template) return null;
    return { template: parsed.template, demoSessionId: parsed.demoSessionId };
  } catch {
    return null;
  }
}

export default function BuildWithAiPreview() {
  usePageMeta({
    title: "Your AI-Generated Calculator — Preview | WeFixTrades",
    description:
      "Preview the calculator AI just built from your invoice. Sign up free to save and customize it.",
    canonicalPath: "/products/quickquotepro/build-with-ai/preview",
  });

  const [, navigate] = useLocation();
  const sessionId = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("session") || "";
  }, []);

  const [state, setState] = useState<DemoState | null>(() =>
    sessionId ? readFromStorage(sessionId) : null,
  );
  const [loading, setLoading] = useState<boolean>(!state && !!sessionId);
  const [loadError, setLoadError] = useState<string | null>(null);

  // If we don't have it from storage, fetch from server.
  useEffect(() => {
    if (!sessionId) {
      navigate("/products/quickquotepro/build-with-ai");
      return;
    }
    if (state) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ai/demo/session/${encodeURIComponent(sessionId)}`);
        if (!res.ok) {
          if (!cancelled) {
            setLoadError("Your demo session expired. Start a new one below.");
            setLoading(false);
          }
          return;
        }
        const body = await res.json();
        if (cancelled) return;
        setState({ template: body.template, demoSessionId: body.demoSessionId });
        setLoading(false);
      } catch {
        if (!cancelled) {
          setLoadError("Couldn't load your demo. Try again.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, state, navigate]);

  const demoCalculator = useMemo<CalculatorData | null>(() => {
    if (!state) return null;
    const bundle = buildCalculatorFromDemoTemplate(
      state.template,
      state.template.title?.trim() || "Your business",
    );
    return {
      id: 0,
      slug: "ai-demo-preview",
      business_name: bundle.business_name,
      tagline: "AI-generated preview · sign up to save",
      primary_color: bundle.primary_color,
      pricing_config: null,
      calculator_settings: bundle.calculator_settings as any,
    };
  }, [state]);

  return (
    <MarketingLayout>
      <section
        style={{
          background: mkt.bg,
          minHeight: "100vh",
          padding: "clamp(100px, 12vw, 140px) clamp(16px, 5vw, 40px) clamp(48px, 8vw, 80px)",
        }}
      >
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          {/* Trust-strip header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              marginBottom: 12,
              color: mkt.accent,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <Sparkles size={14} strokeWidth={2} />
            <span>Preview only · Sign up to save</span>
          </div>

          <h1
            style={{
              fontSize: "clamp(24px, 4vw, 36px)",
              fontWeight: 700,
              color: colors.effortel.n300,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              margin: "0 0 12px",
              textAlign: "center",
            }}
          >
            Your AI-generated calculator
          </h1>
          <p
            style={{
              fontSize: 15,
              color: mkt.onDarkMuted,
              textAlign: "center",
              lineHeight: 1.55,
              maxWidth: 540,
              margin: "0 auto clamp(28px, 5vw, 40px)",
            }}
          >
            Try it as if you were a customer. Then save it to your account to
            customize, brand, and publish — takes about 60 seconds.
          </p>

          {/* Loading / error / widget */}
          {loading && (
            <div
              style={{
                textAlign: "center",
                padding: "60px 20px",
                color: mkt.onDarkMuted,
                fontSize: 14,
              }}
            >
              Loading your calculator…
            </div>
          )}

          {!loading && loadError && (
            <div
              style={{
                textAlign: "center",
                padding: "40px 20px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 12,
                color: mkt.onDarkMuted,
                fontSize: 14,
              }}
            >
              <div style={{ marginBottom: 16, color: mkt.onDark }}>{loadError}</div>
              <Link
                href="/products/quickquotepro/build-with-ai"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 18px",
                  borderRadius: 10,
                  background: "#0D3CFC",
                  color: "#D5E1E7",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                <RotateCw size={14} strokeWidth={2} />
                Try another image
              </Link>
            </div>
          )}

          {!loading && !loadError && demoCalculator && (
            <>
              {/* The widget itself — read-only interaction, can't be saved. */}
              <div
                aria-label="Generated calculator preview"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${mkt.onDarkBorder}`,
                  borderRadius: 18,
                  padding: "clamp(16px, 4vw, 28px)",
                  marginBottom: "clamp(24px, 4vw, 32px)",
                }}
              >
                <QuoteWidget
                  calculator={demoCalculator}
                  isEmbed={false}
                  hideBrandBadge
                />
              </div>

              {/* CTAs — primary signup + secondary "try another" */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: 12,
                  marginBottom: 28,
                }}
              >
                <a
                  href={`/signup?source=ai-demo&demo=${encodeURIComponent(sessionId)}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "14px 24px",
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#D5E1E7",
                    background: "#0D3CFC",
                    borderRadius: 12,
                    textDecoration: "none",
                    letterSpacing: "0.02em",
                  }}
                >
                  Sign up free to save & customize
                  <ArrowRight size={16} strokeWidth={2} />
                </a>
                <Link
                  href="/products/quickquotepro/build-with-ai"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "14px 24px",
                    fontSize: 15,
                    fontWeight: 600,
                    color: mkt.onDark,
                    background: "transparent",
                    border: `1px solid ${mkt.onDarkBorder}`,
                    borderRadius: 12,
                    textDecoration: "none",
                  }}
                >
                  <RotateCw size={14} strokeWidth={2} />
                  Try another image
                </Link>
              </div>

              {/* Trust strip */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  color: mkt.onDarkMuted,
                  fontSize: 12,
                  letterSpacing: "0.02em",
                }}
              >
                <ShieldCheck size={14} strokeWidth={2} />
                <span>Your data is private. We don't keep your image.</span>
              </div>
            </>
          )}
        </div>
      </section>
    </MarketingLayout>
  );
}
