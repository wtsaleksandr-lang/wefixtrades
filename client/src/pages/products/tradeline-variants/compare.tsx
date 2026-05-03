/**
 * Compare index — lets you flip between the 5 TradeLine variants side by side.
 * Each card opens the variant in a new tab so you can compare quickly.
 */

import { Link } from "wouter";
import { ArrowRight, ExternalLink } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";

interface Variant {
  slug: string;
  number: string;
  name: string;
  vibe: string;
  matchesHomepage: boolean;
  recommended?: boolean;
  description: string;
  preview: { bg: string; accent: string; text: string; muted: string };
}

const VARIANTS: Variant[] = [
  {
    slug: "v7",
    number: "07",
    name: "Effortel-style",
    vibe: "Numbered cards, dotted bg, mockup-on-top",
    matchesHomepage: true,
    recommended: true,
    description: "Modeled directly on effortel.com/products/ems. Each section is a numbered rounded card with a dotted background, an inner mockup of pastel-colored stat tiles on top, and the section title + description below. Uses Satoshi + Et Mono. Reusable inner-tile primitives live in components/effortel-blocks/.",
    preview: { bg: mkt.bg, accent: mkt.accent, text: mkt.onDark, muted: mkt.onDarkMuted },
  },
  {
    slug: "v6",
    number: "06",
    name: "Ultimate (V1 + V4 merged)",
    vibe: "Dark hero + alternating light/dark sections",
    matchesHomepage: true,
    description: "The merged master. V1's dark chat-mockup hero, V4's light dashboard mockup as the secondary showcase, and deliberately alternating dark/light sections for visual rhythm. This is the template that scales to all 12 products. Demo placeholders are marked for animation replacement (see docs/product-demo-simulations.md).",
    preview: { bg: mkt.bg, accent: mkt.accent, text: mkt.onDark, muted: mkt.onDarkMuted },
  },
  {
    slug: "v1",
    number: "01",
    name: "Linear Dark",
    vibe: "Minimal, technical, dev-tool feel",
    matchesHomepage: true,
    description: "Dark gradient mesh hero with chat mockup. Glass cards. Cyan accent. Closest to your existing homepage aesthetic.",
    preview: { bg: mkt.bg, accent: mkt.accent, text: mkt.onDark, muted: mkt.onDarkMuted },
  },
  {
    slug: "v2",
    number: "02",
    name: "Vercel Geometric",
    vibe: "Black, sharp, monospace accents",
    matchesHomepage: true,
    description: "Pure black with crosshair markers and grid borders. Big italic serif accents on hero. For a more 'platform' feel.",
    preview: { bg: "#0a0a0a", accent: mkt.accent, text: "#fff", muted: "rgba(255,255,255,0.6)" },
  },
  {
    slug: "v3",
    number: "03",
    name: "Bento Grid Dark",
    vibe: "Asymmetric grid, modern SaaS",
    matchesHomepage: true,
    description: "Centered hero followed by an asymmetric bento that shows the product story in cells. Lots of visual variety.",
    preview: { bg: mkt.bg, accent: mkt.accent, text: mkt.onDark, muted: mkt.onDarkMuted },
  },
  {
    slug: "v4",
    number: "04",
    name: "Stripe Light",
    vibe: "White, premium, blue accent",
    matchesHomepage: false,
    description: "Light cream background, soft shadows, floating dashboard mockup. Diverges from your homepage — picks the Stripe / Resend / Linear-marketing playbook.",
    preview: { bg: "#FAFAFA", accent: "#635BFF", text: "#0F172A", muted: "#475569" },
  },
  {
    slug: "v5",
    number: "05",
    name: "Apple Monumental",
    vibe: "Bold, dramatic, full-bleed",
    matchesHomepage: false,
    description: "Massive 200px headlines, full-bleed sections, edge-to-edge storytelling. One big idea per section. Maximum drama.",
    preview: { bg: "#000", accent: mkt.accent, text: "#fff", muted: "rgba(255,255,255,0.7)" },
  },
];

export default function CompareIndex() {
  return (
    <MarketingLayout>
      <div style={{ background: mkt.bg, color: mkt.onDark, minHeight: "100vh" }}>
        <section style={{ padding: "100px 24px 60px", textAlign: "center", borderBottom: `1px solid ${mkt.onDarkBorder}` }}>
          <div style={{ maxWidth: 800, margin: "0 auto" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: "rgba(102,232,250,0.10)", border: `1px solid rgba(102,232,250,0.24)`, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: mkt.accent, marginBottom: 24 }}>
              Internal · Pick one
            </div>
            <h1 style={{ fontSize: "clamp(40px, 5vw, 64px)", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.05, marginBottom: 20 }}>
              TradeLine variants.<br />Pick the one you want to scale.
            </h1>
            <p style={{ fontSize: 17, color: mkt.onDarkMuted, lineHeight: 1.55, marginBottom: 16 }}>
              Same content, multiple visual treatments. The chosen one becomes the master template — we apply it across all 12 products with one bespoke animated demo per product.
            </p>
            <p style={{ fontSize: 13, color: mkt.onDarkFaint, marginBottom: 8 }}>
              <strong style={{ color: mkt.accent }}>★ V7 (Effortel-style)</strong> is the latest — modeled on effortel.com/products/ems. Numbered cards, dotted bg, pastel inner tiles. Open it first.
            </p>
            <p style={{ fontSize: 12, color: mkt.onDarkFaint }}>
              The static demo mockups in V6 are placeholders. See <code style={{ background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace" }}>docs/product-demo-simulations.md</code> for the per-product animated demo spec.
            </p>
          </div>
        </section>

        <section style={{ padding: "80px 24px 120px" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 24 }}>
            {VARIANTS.map(v => (
              <VariantCard key={v.slug} v={v} />
            ))}
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}

function VariantCard({ v }: { v: Variant }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${mkt.onDarkBorder}`,
      borderRadius: 20, overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      {/* Mini preview */}
      <a href={`/products/tradeline/${v.slug}`} target="_blank" rel="noreferrer" style={{
        display: "block", aspectRatio: "16/10",
        background: v.preview.bg, color: v.preview.text,
        position: "relative", padding: 32, overflow: "hidden",
        borderBottom: `1px solid ${mkt.onDarkBorder}`,
        textDecoration: "none",
      }}>
        <div style={{ fontSize: 9, letterSpacing: "0.2em", color: v.preview.accent, marginBottom: 14, textTransform: "uppercase", fontWeight: 600 }}>
          24/7 TradeLine
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.04em", marginBottom: 12 }}>
          Never miss a lead<br /><span style={{ color: v.preview.accent }}>again.</span>
        </div>
        <div style={{ fontSize: 11, color: v.preview.muted, lineHeight: 1.5, maxWidth: "85%" }}>
          AI answers calls and chats 24/7. Quotes, books, follows up.
        </div>
        <div style={{ position: "absolute", bottom: 14, right: 14, fontSize: 10, color: v.preview.muted, display: "flex", alignItems: "center", gap: 4 }}>
          Open <ExternalLink size={11} />
        </div>
      </a>

      {/* Meta */}
      <div style={{ padding: 24, flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontFamily: "monospace", fontSize: 12, color: mkt.onDarkFaint }}>{v.number}</span>
            <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{v.name}</h2>
          </div>
          {v.recommended ? (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: mkt.accent, color: mkt.dark, letterSpacing: "0.04em", textTransform: "uppercase" }}>★ Master</span>
          ) : v.matchesHomepage ? (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "rgba(102,232,250,0.10)", color: mkt.accent, letterSpacing: "0.04em", textTransform: "uppercase" }}>Match</span>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "rgba(247,180,48,0.10)", color: mkt.orange, letterSpacing: "0.04em", textTransform: "uppercase" }}>Diverge</span>
          )}
        </div>
        <p style={{ fontSize: 13, color: mkt.accent, marginBottom: 12, fontWeight: 500 }}>{v.vibe}</p>
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.55, marginBottom: 24, flex: 1 }}>{v.description}</p>
        <Link href={`/products/tradeline/${v.slug}`} style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "10px 16px", borderRadius: 8,
          background: mkt.accent, color: mkt.dark, fontSize: 13, fontWeight: 700,
          textDecoration: "none", justifyContent: "center",
        }}>
          View full page <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
