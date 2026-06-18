// BG-1 — /templates/:slug per-template SEO landing page.
//
// One SEO landing page per canonical preset. Renders the actual QuoteQuick
// widget (QuoteWidget → AdvancedCalculator) pre-loaded with the template
// via the same `toAdvancedConfig` bridge the wizard + /products/quickquotepro/demo
// use, so visitors can poke the live calculator before going to /wizard.
//
// Includes:
//  - Unique <title>, meta description, canonical URL, OG/Twitter tags
//  - JSON-LD: BreadcrumbList + SoftwareApplication
//  - Live preview widget (sample BusinessProfile so trust signals render)
//  - CTA to /wizard?template=<slug>
//
// Unknown slug → redirect to /templates index (avoids dead-end SEO).

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useRoute, useLocation, Redirect } from "wouter";
import { ArrowRight, ArrowLeft, ChevronLeft, ChevronDown, Check, Zap, Clock, TrendingUp, ShieldCheck, Monitor, Smartphone, SlidersHorizontal, Calculator, Palette, UserPlus, Code2, Wand2, Globe } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import QuoteWidget from "@/components/quote-widget/QuoteWidget";
import { mkt } from "@/theme/tokens";
import { PageMeta } from "@/components/seo/PageMeta";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import {
  getTemplatePreset,
  toAdvancedConfig,
  TEMPLATE_PRESETS,
  collapseLayoutVariants,
  THEME_COMBOS,
  defaultThemeForTemplate,
  type AdvStyle,
  type BusinessProfile,
  type TemplateConfig,
  type ThemeCombo,
} from "@shared/templatePresets";
import type { CalculatorData } from "@/components/quote-widget/types";
import PhoneMockup from "@/components/marketing/PhoneMockup";
import PreviewChatBubbleSim from "@/components/wizard/elfsight/PreviewChatBubbleSim";
import { getCategoryStyle } from "@/lib/categoryStyles";
import { getQuoteQuickIcon } from "@/data/quoteQuickIcons";
import { V7PageShell, V7FinalCta } from "@/components/marketing/v7";
import { MONO, SANS } from "@/components/effortel-blocks";

const BASE = "https://wefixtrades.com";

/* Bright cool-grey panel — the Case Studies "great company" slate, reused here
   so the template page adopts the same V7 layout (dark hero → light slate
   rounded panel → dark CTA). Solid inks hold WCAG AA on the #C2D0D6 ground. */
const CS_LIGHT = {
  bg: "#C2D0D6",
  ink: "#0F1418",
  inkMuted: "#3F4549",
  inkFaint: "#4A5258",
} as const;

/* ─── Sample business profile for the preview. License # and insured amount
   are intentionally omitted: they synthesise a "Licensed #…" trust chip + a
   bottom trust strip that clutter the clean Elfsight-style preview. ─── */
const SAMPLE_BUSINESS_PROFILE: BusinessProfile = {
  googleRating: 4.8,
  googleReviewCount: 187,
  yearsInBusiness: 9,
  serviceArea: "Sample Service Area",
};

/* The Elfsight-clean style token set (car_towing's reference, generalised).
   Applied to EVERY template preview so the whole catalogue reads light + airy
   regardless of the template's own (often dark, category-derived) theme.
   Live customer widgets keep their own style — this is preview-only. */
const ELFSIGHT_LIGHT_STYLE = {
  accent: "#0d3cfc",
  background: "rgba(255,255,255,1)",
  surface: "#f8fafc",
  border: "#e2e8f0",
  text: "#0f172a",
  resultsBg: "#f1f5f9",
  success: "#10b981",
  error: "#ef4444",
  fontFamily: "inter",
  fieldStyle: "filled",
  radius: 12,
  headingWeight: 700,
  bodyWeight: 400,
  fontSize: "medium",
  logoPlacement: "top-left",
  logoSize: "medium",
  bgMode: "solid",
  resultPanel: { emphasis: "normal", border: "subtle", range_mode: { enabled: false, band_pct: 8 } },
  animations: { step_transition: "slide-fade", duration_ms: 220, reduced_motion_respect: true },
  labelLayout: "stacked",
} satisfies AdvStyle;

/* Mix a hex accent toward white to produce a soft, opaque tint — used to wash
   the whole widget background in the chosen accent (premium, not garish). */
function tintToward(hex: string, strength: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (ch: number) => Math.round(ch * strength + 255 * (1 - strength));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/* ─── Build a CalculatorData wrapper around a real preset ─── */
function buildPreviewCalculator(
  template: TemplateConfig,
  accent?: string,
  forceLayout?: "single-column",
  combo?: ThemeCombo,
): CalculatorData {
  const base = toAdvancedConfig(template);
  // The standalone accent swatch overrides the combo's accent when set; with no
  // accent and no combo, fall back to the Elfsight-light default accent.
  const acc = accent ?? combo?.accent ?? ELFSIGHT_LIGHT_STYLE.accent;
  // Combo present → drive the preview from the full pre-balanced palette
  // (bg / text / surface / border / resultsBg). Dark bg (luminance < 0.5) →
  // the widget renders its dark theme; light bg → light theme.
  const comboIsDark = combo ? comboLuminance(combo.bg) < 0.5 : false;
  const styleOverrides = combo
    ? {
        background: combo.bg,
        text: combo.text,
        surface: combo.surface,
        border: combo.border,
        resultsBg: combo.resultsBg,
        // Colour A — the CTA-only colour. For single-colour combos this equals
        // the accent (no visible change); for the two-zone black-yellow combo
        // this is the distinct yellow CTA (the widget renders dark text on it),
        // while `accent` (Colour B) drives the left accents + the dark panel.
        ctaColor: combo.ctaColor,
      }
    : // No combo → keep the EXACT prior light behaviour: full-contrast white
      // body, with the field surfaces + result panel tinted toward the accent
      // (only when an explicit accent is set) so a colour change is felt.
      accent
      ? {
          background: "rgba(255,255,255,1)",
          surface: tintToward(accent, 0.07),
          resultsBg: tintToward(accent, 0.11),
        }
      : {};
  const advanced = {
    ...base,
    // Force the Elfsight-clean treatment on EVERY template preview, overriding
    // the template's own (often dark) theme/layout so the whole catalogue reads
    // consistent: light, single-screen, inputs stacked left + result right.
    // With a combo, the theme follows the combo's background luminance.
    theme: (combo ? (comboIsDark ? "dark" : "light") : "light") as "dark" | "light",
    stepLayout: "single" as const,
    // forceLayout (mobile fold) → single-column; otherwise inputs-left/result-right.
    layout: forceLayout ?? ("two-column" as const),
    // colSpan 2 = every input is full-width so they stack vertically (the
    // Elfsight column), instead of pairing into a crowded 2-up grid.
    fields: (base.fields ?? []).map((f) => ({ ...f, colSpan: 2 as const })),
    // Drop the subtitle + the trust-badge row in the preview — the clean
    // Elfsight layout is title + inputs + result only.
    header: { ...(base.header ?? {}), subtitle: "" },
    trustBadges: [],
    // Disable auto Good/Better/Best tiers in the preview: the 3 tier cards make
    // the result panel much taller than the form (CTA then collides with the
    // sticky bottom nav). A single total + breakdown matches the car_towing
    // reference and keeps the CTA high-right, clear of the footer.
    tiered: { enabled: false },
    businessProfile: SAMPLE_BUSINESS_PROFILE,
    // Uniform clean style + the chosen accent + the combo (or accent-wash)
    // colour overrides. labelLayout 'stacked' = the Elfsight title-above +
    // help-below field style. Preview-only; live customer widgets keep the
    // template's own style.
    style: { ...ELFSIGHT_LIGHT_STYLE, accent: acc, ...styleOverrides },
  };
  return {
    id: 0,
    slug: `preview-${template.id}`,
    business_name: template.header.title.split(" — ")[0] || template.name,
    tagline: template.header.subtitle,
    pricing_config: null,
    calculator_settings: {
      advanced,
    },
  };
}

/* ─── Mobile pinch-zoom + drag gesture layer for the preview widget ───
   Resolves the classic "embedded interactive element inside a scrolling page"
   conflict the way the big apps do:
     • Pinch (2 fingers) → zoom 1×–4× (always).
     • At 1×, a QUICK one-finger swipe scrolls the PAGE (we don't claim it).
     • Once zoomed in, one finger pans the zoomed widget (Apple-Photos pattern).
     • A ~400ms long-press at 1× "picks up" the widget (lift cue + haptic) so
       you can drag-to-move from anywhere on a deliberate hold.
   A touch starting on a form control is left alone so the calculator stays
   usable. Inert on desktop. Non-passive listeners + preventDefault only during
   an actually-engaged gesture, so a plain scroll is never trapped. */
const GESTURE_LONGPRESS_MS = 400;
const GESTURE_MOVE_CANCEL_PX = 8;
function PreviewGestureLayer({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [tf, setTf] = useState({ z: 1, x: 0, y: 0 });
  const [lifted, setLifted] = useState(false);
  const tfRef = useRef(tf);
  tfRef.current = tf;
  const transformed = tf.z !== 1 || tf.x !== 0 || tf.y !== 0;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const isControl = (t: EventTarget | null) =>
      t instanceof Element &&
      !!t.closest('input, select, textarea, button, a, label, [role="slider"], [contenteditable]');
    const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    let mode: "pan" | "pinch" | "control" | null = null;
    let pending = false; // z=1: armed, waiting for the long-press to "pick up"
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sx = 0, sy = 0, bx = 0, by = 0, pd = 0, pz = 1;
    const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const beginPan = (t: Touch) => {
      mode = "pan"; sx = t.clientX; sy = t.clientY; bx = tfRef.current.x; by = tfRef.current.y;
    };
    const onStart = (e: TouchEvent) => {
      clearTimer(); pending = false;
      if (e.touches.length === 2) {
        mode = "pinch"; pd = dist(e.touches[0], e.touches[1]); pz = tfRef.current.z;
        return;
      }
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (isControl(t.target)) { mode = "control"; return; }
      // Zoomed in → pan immediately (Apple-Photos pattern: navigate the zoom).
      if (tfRef.current.z > 1) { beginPan(t); return; }
      // At 1×: DON'T claim the gesture — a quick swipe must scroll the page.
      // Arm a ~400ms long-press; holding still "picks up" the widget to move it.
      mode = null; pending = true;
      sx = t.clientX; sy = t.clientY; bx = tfRef.current.x; by = tfRef.current.y;
      timer = setTimeout(() => {
        if (!pending) return;
        pending = false; mode = "pan"; setLifted(true);
        try { (navigator as Navigator & { vibrate?: (n: number) => void }).vibrate?.(12); } catch { /* no haptics */ }
      }, GESTURE_LONGPRESS_MS);
    };
    const onMove = (e: TouchEvent) => {
      if (mode === "control") return;
      if (mode === "pinch" && e.touches.length >= 2) {
        e.preventDefault();
        const z = clamp(pz * (dist(e.touches[0], e.touches[1]) / (pd || 1)), 1, 4);
        setTf((p) => ({ ...p, z }));
        return;
      }
      if (mode === "pan" && e.touches.length === 1) {
        e.preventDefault();
        const t = e.touches[0];
        setTf((p) => ({ ...p, x: bx + (t.clientX - sx), y: by + (t.clientY - sy) }));
        return;
      }
      if (pending && e.touches.length === 1) {
        const t = e.touches[0];
        // Moved before the long-press fired → it's a page scroll: release
        // (do NOT preventDefault) so the page scrolls normally.
        if (Math.hypot(t.clientX - sx, t.clientY - sy) > GESTURE_MOVE_CANCEL_PX) {
          pending = false; clearTimer();
        }
      }
    };
    const onEnd = (e: TouchEvent) => {
      clearTimer(); pending = false;
      if (e.touches.length === 0) { mode = null; setLifted(false); return; }
      // A finger lifted from a pinch → keep panning if we're still zoomed.
      if (e.touches.length === 1 && !isControl(e.touches[0].target) && tfRef.current.z > 1) {
        beginPan(e.touches[0]);
      } else if (e.touches.length === 1) {
        mode = null;
      }
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onEnd, { passive: false });
    return () => {
      clearTimer();
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <div ref={hostRef} data-testid="preview-gesture-layer" style={{ position: "relative" }}>
      <div
        data-lifted={lifted ? "1" : undefined}
        style={{
          transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.z})`,
          transformOrigin: "center top",
          transition: lifted ? "box-shadow 140ms ease" : "none",
          boxShadow: lifted ? "0 16px 44px rgba(13,60,252,0.30)" : "none",
          willChange: "transform",
        }}
      >
        {children}
      </div>
      {lifted && (
        <div
          aria-hidden
          style={{
            position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 7,
            padding: "5px 12px", borderRadius: 999, pointerEvents: "none",
            background: "rgba(13,60,252,0.92)", color: "rgba(255,255,255,1)",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", whiteSpace: "nowrap",
          }}
        >
          Drag to move
        </div>
      )}
      {transformed && (
        <button
          type="button"
          onClick={() => setTf({ z: 1, x: 0, y: 0 })}
          data-testid="preview-reset-view"
          aria-label="Reset preview view"
          style={{
            position: "absolute", top: 10, left: 10, zIndex: 6,
            padding: "6px 11px", borderRadius: 999, border: "none", cursor: "pointer",
            background: "rgba(15,20,24,0.72)", color: "rgba(255,255,255,1)",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.03em",
          }}
        >
          Reset view
        </button>
      )}
    </div>
  );
}

/* ─── JSON-LD SoftwareApplication schema ─── */
function useTemplateJsonLd(template: TemplateConfig) {
  const url = `${BASE}/templates/${template.id}`;
  useEffect(() => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: `${template.name} Calculator Template — QuoteQuick`,
      description: template.description,
      url,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        ratingCount: "187",
      },
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.templateJsonLd = template.id;
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [template.id, template.name, template.description, url]);
}

/* ─── Theme combinations now come from the shared source of truth
   (`@shared/templatePresets`): `THEME_COMBOS` (the 13 selectable themes),
   `DEFAULT_THEME_COMBO` (mortgage / Sky Tint), and `defaultThemeForTemplate(id)`
   (per-template default — so every template shows its OWN category theme, and
   the website preview, the wizard thumbnail, and the live widget all agree).
   The previous LOCAL combo data + the car_towing/sky-tint hardcode lived here;
   they were deleted in favour of the shared exports. `ThemeCombo` has the
   identical field names (resultsBg / ctaColor / accent / bg / text / surface /
   border), so `buildPreviewCalculator` + the swatch rail keep working. ─── */

/* Relative luminance of a colour token (hex or rgba(...) literal). Used to
   pick light vs dark widget theme + readable chip text. < 0.5 ⇒ dark. */
function comboLuminance(color: string): number {
  let r = 255, g = 255, b = 255;
  const rgba = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgba) {
    r = parseInt(rgba[1], 10);
    g = parseInt(rgba[2], 10);
    b = parseInt(rgba[3], 10);
  } else {
    const h = color.replace("#", "");
    const hx = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    r = parseInt(hx.slice(0, 2), 16);
    g = parseInt(hx.slice(2, 4), 16);
    b = parseInt(hx.slice(4, 6), 16);
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/* ─── Real template thumbnail — a scaled-down live render of the actual
   widget (Elfsight cards show the real calculator, not an icon). Memoised on
   the template so it only mounts once per card. ─── */
const TemplateThumb = memo(function TemplateThumb({
  template,
  combo,
}: {
  template: TemplateConfig;
  /** When set (the currently-selected card) the thumbnail live-recolours to the
      user's chosen theme; otherwise it renders in the template's OWN default
      combo so the catalogue keeps its variety. */
  combo?: ThemeCombo;
}) {
  // Selected card → the chosen combo (live theme sync); every other card →
  // its OWN default combo (car_towing → Black · Yellow, others → Sky Tint).
  const calc = useMemo(
    () => buildPreviewCalculator(template, undefined, undefined, combo ?? defaultThemeForTemplate(template.id, template.category)),
    [template, combo],
  );
  return (
    <div className="tpl-thumb" aria-hidden>
      <div className="tpl-thumb-scale">
        <QuoteWidget calculator={calc} isEmbed={false} />
      </div>
    </div>
  );
});

/* ─── Template picker rail (Elfsight "Select a Template") ───
   Left column on desktop, horizontal strip at the bottom on mobile. Holds the
   colour selector (top), a paginated 2×2 grid of real thumbnails, a category
   filter, and the Continue CTA (bottom). Clicking a card swaps the live
   preview to that template in place. */
const PER_PAGE = 4;
function TemplateRail({
  selectedSlug,
  onSelect,
  accent,
  combo,
  setCombo,
}: {
  selectedSlug: string;
  onSelect: (slug: string) => void;
  accent: string;
  combo: ThemeCombo;
  setCombo: (combo: ThemeCombo) => void;
}) {
  const [category, setCategory] = useState<string>("All");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [category]);

  // Categories scroll affordance: the fade + down-chevron show only while the
  // list overflows AND is not yet scrolled to the bottom. Recomputed on scroll,
  // on category change (the list length changes), and on resize.
  const catsListRef = useRef<HTMLDivElement | null>(null);
  const [catsHasMore, setCatsHasMore] = useState(false);
  // Theme swatch row — ref so the left/right arrows can scroll it on click.
  const colorRowRef = useRef<HTMLDivElement | null>(null);
  const scrollColorRow = (dir: -1 | 1) =>
    colorRowRef.current?.scrollBy({ left: dir * 132, behavior: "smooth" });

  // Click-and-DRAG to TURN PAGES on the template grid (the arrows stay too).
  // The grid is paginated for performance — each thumbnail is a live widget —
  // so instead of free-scrolling all of them, a deliberate horizontal drag
  // flips to the next/prev page. Mouse only; touch keeps its native swipe.
  const gridDrag = useRef({ active: false, moved: false, startX: 0 });

  // Click-and-DRAG to pan the theme swatch row horizontally with the mouse
  // cursor (not just the scrollbar / arrows). Mirrors the Build-tab template
  // strip: pointerdown grabs, pointermove translates scrollLeft, grab/grabbing
  // cursor. Only mouse/pen drags here — touch keeps native momentum swipe. A
  // small movement threshold means a real click on a swatch still selects it
  // (the swatch's onClick fires; only a deliberate drag suppresses it).
  useEffect(() => {
    const el = colorRowRef.current;
    if (!el) return;
    let isDown = false;
    let moved = false;
    let startX = 0;
    let scrollLeft = 0;
    const DRAG_THRESHOLD = 4;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // native swipe owns touch
      isDown = true;
      moved = false;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
    };
    const onMove = (e: PointerEvent) => {
      if (!isDown) return;
      const x = e.pageX - el.offsetLeft;
      const walk = x - startX;
      if (!moved && Math.abs(walk) > DRAG_THRESHOLD) {
        moved = true;
        el.classList.add("is-dragging");
        try { el.setPointerCapture(e.pointerId); } catch {}
      }
      if (moved) {
        e.preventDefault();
        el.scrollLeft = scrollLeft - walk;
      }
    };
    const endDrag = (e: PointerEvent) => {
      if (!isDown) return;
      isDown = false;
      el.classList.remove("is-dragging");
      try { el.releasePointerCapture(e.pointerId); } catch {}
      // Swallow the click that follows a real drag so it doesn't select a
      // swatch the cursor happened to land on at release.
      if (moved) {
        const swallow = (ce: MouseEvent) => { ce.stopPropagation(); ce.preventDefault(); };
        el.addEventListener("click", swallow, { capture: true, once: true });
        // Safety: if no click fires, drop the one-shot listener next tick.
        window.setTimeout(() => el.removeEventListener("click", swallow, true), 0);
      }
      moved = false;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
    el.addEventListener("pointerleave", endDrag);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", endDrag);
      el.removeEventListener("pointercancel", endDrag);
      el.removeEventListener("pointerleave", endDrag);
    };
  }, []);

  // Click-and-DRAG to pan the CATEGORIES list VERTICALLY with the mouse cursor
  // (grab/grabbing), mirroring the theme strip above but on the Y axis. Only
  // mouse/pen drags — touch keeps native momentum scroll. A small movement
  // threshold means a real click on a category still selects it; only a
  // deliberate drag suppresses the click (so drag-to-scroll never fires a
  // category-select).
  useEffect(() => {
    const el = catsListRef.current;
    if (!el) return;
    let isDown = false;
    let moved = false;
    let startY = 0;
    let scrollTop = 0;
    const DRAG_THRESHOLD = 4;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // native swipe owns touch
      isDown = true;
      moved = false;
      startY = e.pageY - el.offsetTop;
      scrollTop = el.scrollTop;
    };
    const onMove = (e: PointerEvent) => {
      if (!isDown) return;
      const y = e.pageY - el.offsetTop;
      const walk = y - startY;
      if (!moved && Math.abs(walk) > DRAG_THRESHOLD) {
        moved = true;
        el.classList.add("is-dragging");
        try { el.setPointerCapture(e.pointerId); } catch {}
      }
      if (moved) {
        e.preventDefault();
        el.scrollTop = scrollTop - walk;
      }
    };
    const endDrag = (e: PointerEvent) => {
      if (!isDown) return;
      isDown = false;
      el.classList.remove("is-dragging");
      try { el.releasePointerCapture(e.pointerId); } catch {}
      // Swallow the click that follows a real drag so it doesn't select a
      // category the cursor happened to land on at release.
      if (moved) {
        const swallow = (ce: MouseEvent) => { ce.stopPropagation(); ce.preventDefault(); };
        el.addEventListener("click", swallow, { capture: true, once: true });
        // Safety: if no click fires, drop the one-shot listener next tick.
        window.setTimeout(() => el.removeEventListener("click", swallow, true), 0);
      }
      moved = false;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
    el.addEventListener("pointerleave", endDrag);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", endDrag);
      el.removeEventListener("pointercancel", endDrag);
      el.removeEventListener("pointerleave", endDrag);
    };
  }, []);

  // Collapse per-layout variants (…_single_col/_two_col/_multi_col sharing a
  // display name) to ONE representative card per template. Layout is chosen
  // in-editor, not in this rail, so the same title must never appear 2–3×.
  // Counts, filtering and pagination all operate on this collapsed catalogue
  // (matches the /templates index page, which already collapses).
  const presets = useMemo(() => collapseLayoutVariants(TEMPLATE_PRESETS), []);

  // `selectedSlug` may be a layout-variant id (…_single_col) that the collapsed
  // catalogue dropped in favour of its representative. Match the active card by
  // display name so the representative still highlights for any variant slug.
  const selectedName = useMemo(
    () => getTemplatePreset(selectedSlug)?.name ?? "",
    [selectedSlug],
  );

  const categories = useMemo<[string, number][]>(() => {
    const counts = new Map<string, number>();
    for (const t of presets) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return [["All", presets.length], ...entries];
  }, [presets]);
  const shown = useMemo(
    () =>
      category === "All"
        ? presets
        : presets.filter((t) => t.category === category),
    [category, presets],
  );
  const pageCount = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PER_PAGE;
  const pageItems = shown.slice(start, start + PER_PAGE);

  // Detect whether the categories list overflows + has room left to scroll.
  const syncCatsOverflow = () => {
    const el = catsListRef.current;
    if (!el) return;
    const overflows = el.scrollHeight > el.clientHeight + 1;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    setCatsHasMore(overflows && !atBottom);
  };
  useEffect(() => {
    syncCatsOverflow();
    const el = catsListRef.current;
    if (!el) return;
    window.addEventListener("resize", syncCatsOverflow);
    return () => window.removeEventListener("resize", syncCatsOverflow);
    // Re-run when the list contents change (category count list is stable, but
    // the categories array identity changes with the memo).
  }, [categories]);

  return (
    <aside className="tpl-rail" data-testid="template-rail">
      {/* Theme-combination selector — the sole colour control. Each entry is a
          minimal dual-colour swatch (no visible text): left half = Colour B
          (combo.accent / panel + left accents), right half = Colour A
          (combo.ctaColor / CTA). The combo name lives in title + aria-label
          only. Selecting a swatch swaps the whole palette. */}
      <div className="tpl-rail-block">
        <div className="tpl-cats-head">Theme</div>
        <div className="tpl-color-scroll">
        <button type="button" className="tpl-scroll-arrow tpl-scroll-arrow-l" aria-label="Scroll themes left" onClick={() => scrollColorRow(-1)}>‹</button>
        <div className="tpl-color-row" data-testid="template-combo-tabs" ref={colorRowRef}>
          {THEME_COMBOS.map((c) => {
            const sel = combo.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-label={c.name}
                aria-pressed={sel}
                title={c.name}
                onClick={() => setCombo(c)}
                data-testid={`template-combo-${c.id}`}
                className="tpl-swatch tpl-swatch-split"
                style={{
                  // Dual-colour 50/50 split: left = the PANEL colour
                  // (resultsBg), right = the CTA colour (ctaColor). Using panel
                  // (not accent) guarantees a true dual for every theme, since
                  // panel !== CTA in all combos (e.g. Onyx = black|red, Navy =
                  // navy|blue) — whereas accent often equals the CTA.
                  background: `linear-gradient(90deg, ${c.resultsBg} 0 50%, ${c.ctaColor} 50% 100%)`,
                  boxShadow: sel
                    ? `0 0 0 2px ${CS_LIGHT.bg}, 0 0 0 4px ${mkt.accent}`
                    : "0 0 0 1px rgba(15,20,24,0.12)",
                }}
              >
                {sel && <Check size={14} color="rgba(255,255,255,1)" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
        <button type="button" className="tpl-scroll-arrow tpl-scroll-arrow-r" aria-label="Scroll themes right" onClick={() => scrollColorRow(1)}>›</button>
        </div>
      </div>

      <div className="tpl-rail-head">
        <span style={{ opacity: 0.4 }}>(</span> Select a template{" "}
        <span style={{ opacity: 0.4 }}>)</span>
      </div>

      {/* 2×2 grid of real thumbnails — also grab-and-drag to turn pages. */}
      <div
        className="tpl-rail-grid"
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || e.button !== 0) return;
          gridDrag.current = { active: true, moved: false, startX: e.clientX };
        }}
        onPointerMove={(e) => {
          if (!gridDrag.current.active) return;
          if (Math.abs(e.clientX - gridDrag.current.startX) > 5) gridDrag.current.moved = true;
        }}
        onPointerUp={(e) => {
          if (!gridDrag.current.active) return;
          const { moved, startX } = gridDrag.current;
          gridDrag.current.active = false;
          if (!moved) return;
          const dx = e.clientX - startX;
          // Swallow the trailing click so a drag never selects a card.
          const el = e.currentTarget;
          const suppress = (c: Event) => { c.preventDefault(); c.stopPropagation(); };
          el.addEventListener("click", suppress, { capture: true, once: true });
          requestAnimationFrame(() => el.removeEventListener("click", suppress, { capture: true } as EventListenerOptions));
          if (dx <= -45 && safePage < pageCount - 1) setPage(safePage + 1);
          else if (dx >= 45 && safePage > 0) setPage(safePage - 1);
        }}
        onPointerLeave={() => { gridDrag.current.active = false; }}
      >
        {pageItems.map((t) => {
          const active = t.id === selectedSlug || t.name === selectedName;
          return (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              data-testid={`template-rail-card-${t.id}`}
              aria-pressed={active}
              title={t.name}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(t.id);
                }
              }}
              className="tpl-card"
              style={{
                boxShadow: active
                  ? `0 0 0 2px ${mkt.accent}`
                  : "0 0 0 1px rgba(15,20,24,0.10)",
                background: active ? "rgba(13,60,252,0.05)" : "rgba(255,255,255,0.55)",
              }}
            >
              <span className="tpl-card-thumb-wrap">
                <TemplateThumb template={t} combo={active ? combo : undefined} />
                {active && (
                  <span className="tpl-card-check">
                    <Check size={12} strokeWidth={3} color="rgba(255,255,255,1)" />
                  </span>
                )}
              </span>
              <span className="tpl-card-name">{t.name}</span>
            </div>
          );
        })}
      </div>

      {/* Pagination — N–M of total */}
      <div className="tpl-pager">
        <span className="tpl-pager-count">
          {start + 1}–{Math.min(start + PER_PAGE, shown.length)} of {shown.length}
        </span>
        <div className="tpl-pager-btns">
          <button
            type="button"
            aria-label="Previous templates"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className="tpl-pager-btn"
          >
            <ArrowLeft size={14} />
          </button>
          <button
            type="button"
            aria-label="More templates"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
            className="tpl-pager-btn"
          >
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Categories filter (Elfsight) */}
      <div className="tpl-cats">
        <div className="tpl-cats-head">Categories</div>
        {/* Relative wrapper holds the scrollable list plus a bottom fade + a
            down-chevron hint. Both overlays are pointer-events:none and shown
            only while the list overflows and isn't scrolled to the bottom, so
            the cut-off last row reads as "more below", not broken. */}
        <div className="tpl-cats-scroll">
          <div
            ref={catsListRef}
            className="tpl-cats-list"
            onScroll={syncCatsOverflow}
            data-lenis-prevent
          >
            {categories.map(([name, count]) => {
              const on = category === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setCategory(name)}
                  aria-pressed={on}
                  className="tpl-cat"
                  style={{
                    background: on ? "rgba(13,60,252,0.07)" : "transparent",
                    boxShadow: on
                      ? `inset 0 0 0 1px ${mkt.accent}66`
                      : "inset 0 0 0 1px rgba(15,20,24,0.10)",
                  }}
                >
                  <span className="tpl-cat-name">{name}</span>
                  <span className="tpl-cat-count">{count}</span>
                </button>
              );
            })}
          </div>
          {catsHasMore && (
            <>
              <div className="tpl-cats-fade" aria-hidden="true" />
              <span className="tpl-cats-chevron" aria-hidden="true">
                <ChevronDown size={14} />
              </span>
            </>
          )}
        </div>
      </div>

      {/* Continue with this template (Elfsight bottom CTA) */}
      <Link
        href={`/wizard?template=${selectedSlug}&accent=${encodeURIComponent(accent)}`}
        className="tpl-rail-cta wft-hover-border-white"
        data-testid="rail-continue"
      >
        Continue with this template <ArrowRight size={16} />
      </Link>
    </aside>
  );
}

/* ─── Page ─── */

export default function TemplateDetailPage() {
  const [, params] = useRoute("/templates/:slug");
  const slug = params?.slug ?? "";
  const template = getTemplatePreset(slug);

  if (!template) {
    return <Redirect to="/templates" />;
  }

  return <TemplateDetailInner template={template} />;
}

function TemplateDetailInner({ template }: { template: TemplateConfig }) {
  // Elfsight "Edit Widget" template picker: the rail swaps the live preview to
  // any other template in place. The page's SEO (meta/canonical/breadcrumb/
  // JSON-LD) stays anchored to the URL `template`; the VISIBLE hero + preview
  // follow the selected one.
  const [, navigate] = useLocation();
  const [selectedSlug, setSelectedSlug] = useState<string>(template.id);
  useEffect(() => setSelectedSlug(template.id), [template.id]);
  // Selecting a template in the rail drives the URL (single source of truth):
  // the route param `:slug` change re-derives `template`, which in turn updates
  // PageMeta (title/canonical), breadcrumbs and JSON-LD — keeping SEO in sync
  // with the visible preview. `setSelectedSlug` gives instant preview feedback;
  // the rail may hand us a layout-variant id, so resolve to the canonical preset
  // id before putting it in the URL. navigate fires only from this user handler
  // (never an effect), so there is no navigation loop.
  const handleSelect = (nextSlug: string) => {
    setSelectedSlug(nextSlug);
    const preset = getTemplatePreset(nextSlug);
    const canonicalId = preset?.id ?? nextSlug;
    if (canonicalId === template.id) return;
    navigate(`/templates/${canonicalId}`, { replace: true });
  };
  const activeTemplate = useMemo(
    () => getTemplatePreset(selectedSlug) ?? template,
    [selectedSlug, template],
  );
  const cat = getCategoryStyle(activeTemplate.category);
  const Icon = getQuoteQuickIcon(activeTemplate.defaultIcon);

  useTemplateJsonLd(template);

  const breadcrumbs = useMemo(
    () => [
      { name: "Home", url: `${BASE}/` },
      { name: "Templates", url: `${BASE}/templates` },
      { name: template.name, url: `${BASE}/templates/${template.id}` },
    ],
    [template.id, template.name],
  );
  useBreadcrumbSchema(breadcrumbs);

  // Full theme combination for the preview. Defaults per-template to that
  // template's OWN category theme (via the shared `defaultThemeForTemplate`)
  // and re-derives when the selected template changes, so swapping templates
  // resets to the newly-shown template's combo.
  const [selectedCombo, setSelectedCombo] = useState<ThemeCombo>(() =>
    defaultThemeForTemplate(template.id, template.category),
  );
  // Accent defaults to the active combo's accent. A manual swatch pick overrides
  // it (and persists until the combo changes). Picking a combo chip re-syncs the
  // accent to that combo's accent via setCombo below.
  const [accent, setAccent] = useState<string>(selectedCombo.accent);
  const setCombo = (c: ThemeCombo) => {
    setSelectedCombo(c);
    setAccent(c.accent);
  };
  useEffect(() => {
    const next = defaultThemeForTemplate(
      selectedSlug,
      getTemplatePreset(selectedSlug)?.category,
    );
    setSelectedCombo(next);
    setAccent(next.accent);
  }, [selectedSlug]);
  // Elfsight-style in-place desktop↔mobile fold for the live preview.
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  // On a real phone the desktop/mobile toggle is pointless (you're already on
  // mobile) — hide it below the widget's own 560px breakpoint.
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 559px)");
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const effectiveMode: "desktop" | "mobile" = isMobileViewport ? "mobile" : previewMode;
  // The phone-frame chrome (padding, rounded frame, shadow) only makes sense
  // when previewing mobile FROM a desktop screen. On a real phone we render the
  // widget plainly at full width.
  const showPhoneFrame = !isMobileViewport && previewMode === "mobile";
  const previewCalculator = useMemo(
    () =>
      buildPreviewCalculator(
        activeTemplate,
        accent,
        effectiveMode === "mobile" ? "single-column" : undefined,
        selectedCombo,
      ),
    [activeTemplate, accent, effectiveMode, selectedCombo],
  );

  return (
    <MarketingLayout>
      <PageMeta
        title={`${template.name} calculator template`}
        description={`${template.description} Free-to-use calculator template — try the live widget, then customize in our setup wizard.`}
        canonical={`/templates/${template.id}`}
      />
      <V7PageShell>
      <div data-theme="dark">
        {/* Hero / Intro */}
        <div
          style={{
            padding: "56px 28px 24px",
            background: `linear-gradient(180deg, ${cat.heroBg}1F 0%, transparent 100%)`,
          }}
        >
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>
            <Link
              href="/templates"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 13,
                fontWeight: 600,
                color: mkt.onDarkMuted,
                textDecoration: "none",
                marginBottom: 18,
              }}
              data-testid="back-to-templates"
            >
              <ChevronLeft size={14} /> All templates
            </Link>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              {Icon ? (
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: `${mkt.accent}22`,
                    border: `1.5px solid ${mkt.accent}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: mkt.accent,
                    flexShrink: 0,
                  }}
                >
                  <Icon size={24} strokeWidth={2.25} />
                </div>
              ) : null}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: 20,
                  background: `${mkt.accent}1F`,
                  color: mkt.accent,
                  border: `1px solid ${mkt.accent}40`,
                }}
              >
                {activeTemplate.category}
              </span>
            </div>

            <h1
              style={{
                fontSize: "clamp(32px, 4.4vw, 52px)",
                fontWeight: 800,
                color: mkt.onDark,
                margin: "0 0 14px",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              {activeTemplate.name}{" "}
              <span style={{ color: mkt.accent }}>template</span>
            </h1>

            <p
              style={{
                fontSize: 17,
                color: mkt.onDarkMuted,
                lineHeight: 1.6,
                margin: "0 0 22px",
                maxWidth: 720,
              }}
            >
              {activeTemplate.description} Try the live widget below — adjust the
              inputs to see how the price updates in real time. When you’re
              ready, customize it in the wizard.
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link
                href={`/wizard?template=${activeTemplate.id}&accent=${encodeURIComponent(accent)}`}
                data-testid="hero-use-template"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "12px 22px",
                  borderRadius: 10,
                  background: mkt.accent,
                  color: "#FFFFFF",
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: "none",
                  minHeight: 44,
                }}
              >
                Use this template <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>

        {/* Live preview — V7 "Case Studies" bright slate panel. Dark hero
            above, then this #C2D0D6 rounded panel emerging with rounded top
            corners (matches /case-studies "great company"). Text switches to
            dark ink so it reads on the light ground. */}
        <div
          id="live-preview"
          className="tpl-editor-section"
          style={{
            padding: "32px 24px 72px",
            background: CS_LIGHT.bg,
            borderRadius: "32px 32px 0 0",
            marginTop: 12,
          }}
        >
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            {/* Two-pane editor: template rail (colour selector + catalogue) on
                the left, the title + live widget on the right. */}
            <div className="tpl-editor">
              <TemplateRail selectedSlug={selectedSlug} onSelect={handleSelect} accent={accent} combo={selectedCombo} setCombo={setCombo} />
              <div className="tpl-preview">
            {/* Full-width preview — NO card chrome/edges. The widget paints its
                own theme background and fills the preview area edge-to-edge (it
                reads as deployed-on-a-site, not boxed in a card). The grey shows
                only BEHIND the narrowed widget in mobile-preview, like Elfsight.
                maxWidth caps it for readability so it never stretches awkwardly. */}
            <div
              data-testid="template-live-preview"
              data-mode={showPhoneFrame ? "mobile" : "desktop"}
              style={{
                position: "relative",
                width: "100%",
                maxWidth: 980,
                margin: "0 auto",
                display: "flex",
                justifyContent: "center",
                padding: "0 2px",
              }}
            >
              {/* Preview stage — DESKTOP renders the widget inside the browser
                  chrome (traffic-light bar via the scoped CSS below); MOBILE
                  renders it inside a real PhoneMockup (375×812 with a scrollable
                  screen) so a tall calculator scrolls INSIDE the phone instead
                  of stretching down the page. The device toggle anchors to this
                  stage in both modes. */}
              <div
                style={{
                  position: "relative",
                  width: showPhoneFrame ? "fit-content" : 780,
                  maxWidth: "100%",
                  overflow: showPhoneFrame ? "visible" : "hidden",
                  borderRadius: showPhoneFrame ? 0 : 16,
                  transition: "width 520ms cubic-bezier(0.22,1,0.36,1)",
                  ...(showPhoneFrame ? { display: "flex", flexDirection: "column" as const } : null),
                }}
              >
                {/* DESKTOP — toggle sits on the browser chrome bar (top-right). */}
                {!isMobileViewport && !showPhoneFrame && (
                  <button
                    type="button"
                    onClick={() => setPreviewMode((m) => (m === "desktop" ? "mobile" : "desktop"))}
                    data-testid="preview-device-toggle"
                    aria-label="Switch to mobile view"
                    title="Mobile view"
                    className="tpl-device-toggle"
                  >
                    <Smartphone size={16} strokeWidth={2.25} />
                  </button>
                )}
                {/* MOBILE — toggle is a clean pill ABOVE the phone (right-aligned)
                    so it never sits on the bezel/screen seam. */}
                {!isMobileViewport && showPhoneFrame && (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                    <button
                      type="button"
                      onClick={() => setPreviewMode((m) => (m === "desktop" ? "mobile" : "desktop"))}
                      data-testid="preview-device-toggle"
                      aria-label="Switch to desktop view"
                      title="Desktop view"
                      className="tpl-device-toggle-pill"
                    >
                      <Monitor size={14} strokeWidth={2.25} />
                      Desktop view
                    </button>
                  </div>
                )}
                {/* key on the active template → remount + fade/rise on swap.
                    The AI assistant launcher (PreviewChatBubbleSim) is pinned
                    bottom-right, lifted above the widget's CTA so the two don't
                    touch — themed to the live CTA colour. On mobile it pins to
                    the phone bezel (doesn't scroll); on desktop to the column. */}
                {showPhoneFrame ? (
                  <PhoneMockup
                    screenBackground={selectedCombo.bg}
                    floater={<PreviewChatBubbleSim visibility="always" accentColor={selectedCombo.ctaColor} bottom={24} right={16} />}
                  >
                    <div key={activeTemplate.id} className="tpl-swap-in">
                      <PreviewGestureLayer>
                        <QuoteWidget calculator={previewCalculator} isEmbed={false} />
                      </PreviewGestureLayer>
                    </div>
                  </PhoneMockup>
                ) : (
                  <>
                    <div key={activeTemplate.id} className="tpl-swap-in">
                      <PreviewGestureLayer>
                        <QuoteWidget calculator={previewCalculator} isEmbed={false} />
                      </PreviewGestureLayer>
                    </div>
                    <PreviewChatBubbleSim visibility="always" accentColor={selectedCombo.ctaColor} bottom={120} right={18} />
                  </>
                )}
              </div>
            </div>
            <p
              style={{
                fontSize: 12,
                color: CS_LIGHT.inkFaint,
                textAlign: "center",
                margin: "16px 0 0",
                fontFamily: MONO,
              }}
            >
              Sample pricing for preview. Your real numbers are configured in
              the wizard.
            </p>
            {/* Deeper-edit note → wizard (carries the chosen template + colour). */}
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <Link
                href={`/wizard?template=${activeTemplate.id}&accent=${encodeURIComponent(accent)}`}
                data-testid="template-deeper-edit"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: mkt.accent, textDecoration: "none" }}
              >
                Need to edit pricing, formulas &amp; logic? Open the full wizard <ArrowRight size={14} />
              </Link>
            </div>
              </div>{/* /.tpl-preview */}
            </div>{/* /.tpl-editor */}
            <style>{`
              /* Equal-height columns: CSS grid stretches the rail to the
                 preview's height (item 1). */
              .tpl-editor {
                display: grid; grid-template-columns: 320px minmax(0, 1fr);
                gap: 18px; align-items: stretch;
              }
              .tpl-rail { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
              .tpl-rail-block { display: flex; flex-direction: column; gap: 8px; }
              .tpl-rail-head, .tpl-cats-head {
                font-family: ${MONO}; font-size: 10.5px; font-weight: 600;
                letter-spacing: 0.10em; text-transform: uppercase; color: ${CS_LIGHT.inkMuted};
                padding-left: 2px;
              }
              /* Single non-wrapping row: ~8 swatches visible, then horizontal
                 scroll. Each swatch is 32px wide + 8px gap; cap the visible
                 width at 8 swatches (8*32 + 7*8 = 312px) so the 9th onward
                 scrolls into view. Thin unobtrusive scrollbar + touch momentum
                 for mobile. */
              .tpl-color-row {
                display: flex; flex-wrap: nowrap; gap: 8px;
                overflow-x: auto; overflow-y: hidden;
                max-width: 312px;
                /* top/bottom padding so the SELECTED swatch's 4px focus ring
                   isn't clipped by overflow-y:hidden. */
                padding: 5px 0 7px;
                scrollbar-width: thin;
                -webkit-overflow-scrolling: touch;
                /* Drag-to-scroll affordance — grab cursor at rest, grabbing
                   while a pointer drag is panning the row (JS toggles
                   .is-dragging). */
                cursor: grab;
              }
              .tpl-color-row.is-dragging {
                cursor: grabbing; user-select: none; scroll-behavior: auto;
              }
              .tpl-color-row.is-dragging .tpl-swatch { pointer-events: none; }
              .tpl-color-row > .tpl-swatch { flex: 0 0 auto; }
              .tpl-color-row::-webkit-scrollbar { height: 6px; }
              .tpl-color-row::-webkit-scrollbar-thumb {
                background: rgba(15,20,24,0.20); border-radius: 999px;
              }
              .tpl-color-row::-webkit-scrollbar-track { background: transparent; }
              /* CLICKABLE scroll arrows flank the swatch row (flex siblings, so
                 they're vertically centred and never overlap a swatch). Clicking
                 scrolls the row; the row still scrolls by drag/trackpad too. */
              .tpl-color-scroll { display: flex; align-items: center; gap: 2px; max-width: 100%; }
              .tpl-scroll-arrow {
                flex: 0 0 auto; width: 18px; height: 32px;
                display: grid; place-items: center; padding: 0;
                border: none; background: transparent; cursor: pointer;
                font-size: 17px; font-weight: 700; line-height: 1;
                color: rgba(15,20,24,0.5); user-select: none;
              }
              .tpl-scroll-arrow:hover { color: rgba(15,20,24,0.85); }
              /* Desktop preview only — the main "Get a Quote Now" CTA sat a
                 touch too low, leaving an unbalanced gap above it. Trim the
                 pitch block's bottom margin and lift the CTA button a few px
                 so it sits better-balanced under the result. Scoped to the
                 desktop live preview; mobile (≤760px) is left untouched. */
              @media (min-width: 761px) {
                [data-testid="template-live-preview"] [data-testid="advanced-cta-pitch"] {
                  margin-bottom: 8px !important;
                }
                [data-testid="template-live-preview"] [data-testid="advanced-cta"] {
                  margin-top: -6px;
                }
              }
              /* In the website PREVIEW the QuoteQuick brand badge + the
                 "Powered by WeFixTrades" footer are NON-clickable — they only
                 link out on the actually-deployed widget, never in this lite
                 preview. (Scoped to the preview container; deployed widgets are
                 unaffected.) */
              [data-testid="template-live-preview"] [data-qq-brandbar],
              [data-testid="template-live-preview"] [data-qq-brandbar] *,
              [data-testid="template-live-preview"] [data-testid="advanced-powered-by-root"],
              [data-testid="template-live-preview"] [data-testid="advanced-powered-by-root"] * {
                pointer-events: none !important;
                cursor: default !important;
              }
              /* Preview chrome bar — mock browser chrome treatment. Scoped to the
                 preview container ONLY; the deployed/embedded QuoteWidget
                 brandbar is untouched.

                 Design intent: the brand bar + device toggle read as ONE
                 intentional chrome strip — white frosted glass, macOS traffic-
                 light dots on the left via ::before, badge padded after the dots,
                 toggle right-anchored and flush with the bar height. Together they
                 look like a mini browser address bar, not a cheap gray header. */
              [data-testid="template-live-preview"][data-mode="desktop"] [data-qq-brandbar] {
                position: relative !important;
                /* Clean white frosted-glass chrome bar */
                background: rgba(255, 255, 255, 0.82) !important;
                -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
                backdrop-filter: blur(16px) saturate(180%) !important;
                /* Full-width bar spanning preview top — square-topped by default;
                   border-radius clips to the preview container's own border-radius
                   (16px) via overflow:hidden on the parent.  */
                border-radius: 0 !important;
                border: none !important;
                border-bottom: 1px solid rgba(15, 23, 42, 0.10) !important;
                /* No margin inset — the bar spans edge-to-edge at the top of the
                   preview, inside the container's 16px overflow:hidden clip.
                   The container clips the top-left/top-right corners for us. */
                margin: 0 !important;
                /* Fixed height so the toggle can center reliably */
                min-height: 42px !important;
                height: 42px !important;
                /* left padding clears the macOS traffic-light dots (3 dots run
                   ~16→58px in from the bar's left edge); 70px leaves a clean
                   ~12px gap so the QuoteQuick badge no longer kisses the green
                   dot, and the checkmark reads as part of the wordmark. */
                padding: 0 44px 0 70px !important;
                align-items: center !important;
                box-sizing: border-box !important;
              }
              /* macOS traffic-light dots — CSS-only, three circles via box-shadow.
                 Colors at ~35% saturation to stay classy (not toy-bright). */
              [data-testid="template-live-preview"][data-mode="desktop"] [data-qq-brandbar]::before {
                content: "" !important;
                position: absolute !important;
                left: 16px !important;
                top: 50% !important;
                transform: translateY(-50%) !important;
                width: 10px !important;
                height: 10px !important;
                border-radius: 50% !important;
                /* close (red), minimize (amber), maximize (green) — muted tones */
                background: #d4706a !important;
                box-shadow:
                  16px 0 0 #d4b56a,
                  32px 0 0 #6db36d !important;
                flex-shrink: 0 !important;
              }
              .tpl-swatch {
                width: 32px; height: 32px; border-radius: 9px; border: none; cursor: pointer;
                display: grid; place-items: center;
                transition: box-shadow 150ms ease, transform 120ms ease;
              }
              .tpl-swatch:hover { transform: translateY(-1px); }
              /* Dual-colour theme swatch — identical box (size / radius / ring /
                 spacing) to the single-colour .tpl-swatch above; the background
                 gradient supplies the 50/50 split, so the THEME row reads as the
                 same family as the CHOOSE A COLOUR row. */
              .tpl-swatch-split { overflow: hidden; }

              /* 2×2 catalogue grid (item 2). */
              .tpl-rail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; cursor: grab; }
              .tpl-rail-grid:active { cursor: grabbing; }
              .tpl-card {
                display: flex; flex-direction: column; gap: 8px;
                padding: 6px; border: none; border-radius: 14px;
                cursor: pointer; text-align: left;
                transition: box-shadow 160ms ease, background 160ms ease, transform 160ms ease;
              }
              .tpl-card:hover { transform: translateY(-2px); }
              .tpl-card-thumb-wrap { position: relative; width: 100%; }
              /* Real template thumbnail — a scaled live widget HARD-clipped to a
                 fixed frame (item 6). contain:strict + the scale transform keep
                 the widget sticky header / min-height / fixed children from
                 escaping the box. */
              .tpl-thumb {
                position: relative; width: 100%; height: 104px;
                border-radius: 10px; overflow: hidden;
                background: rgba(255,255,255,1);
                box-shadow: inset 0 0 0 1px rgba(15,20,24,0.06);
                contain: strict;
              }
              .tpl-thumb-scale {
                position: absolute; top: 0; left: 0;
                width: calc(100% / 0.30); transform: scale(0.30);
                transform-origin: top left; pointer-events: none;
              }
              .tpl-card-check {
                position: absolute; top: 6px; right: 6px; z-index: 2;
                width: 18px; height: 18px; border-radius: 50%;
                background: ${mkt.accent}; display: grid; place-items: center;
              }
              .tpl-card-name {
                font-family: ${SANS}; font-size: 12px; font-weight: 600; line-height: 1.25;
                color: ${CS_LIGHT.ink}; padding: 0 3px 2px;
                overflow: hidden; text-overflow: ellipsis;
                display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
              }

              /* Pagination (item 2). */
              .tpl-pager { display: flex; align-items: center; justify-content: space-between; padding: 0 2px; }
              .tpl-pager-count { font-family: ${MONO}; font-size: 11px; font-weight: 600; color: ${CS_LIGHT.inkMuted}; }
              .tpl-pager-btns { display: flex; gap: 6px; }
              .tpl-pager-btn {
                width: 28px; height: 28px; border-radius: 8px; cursor: pointer;
                display: grid; place-items: center;
                background: rgba(255,255,255,0.6); border: none;
                box-shadow: inset 0 0 0 1px rgba(15,20,24,0.12);
                color: ${CS_LIGHT.ink};
                transition: background 140ms ease, opacity 140ms ease;
              }
              .tpl-pager-btn:disabled { opacity: 0.35; cursor: default; }

              /* Category block GROWS to absorb the rail's leftover height so the
                 list reaches down toward the CTA instead of leaving dead space
                 below a short fixed-height list. min-height:0 lets the inner
                 scroller actually overflow inside the flex column. */
              .tpl-cats { display: flex; flex-direction: column; gap: 8px; flex: 1 1 auto; min-height: 0; }
              /* Relative shell for the scroll fade + chevron overlays. */
              .tpl-cats-scroll { position: relative; }
              .tpl-cats-list {
                display: flex; flex-direction: column; gap: 6px;
                /* COMPACT, capped, wheel-scrollable container (restored from the
                   pre-#1568 look): only a few rows show; the rest scroll. The
                   176px cap — NOT flex-fill — keeps the list short so it doesn't
                   unfold all ~16 categories down the rail. overscroll-behavior:
                   contain keeps the mouse wheel scrolling THIS list (not the
                   page) once it overflows. cursor: grab signals drag-to-scroll. */
                max-height: 176px;
                overflow-y: auto; scrollbar-width: thin;
                overscroll-behavior: contain;
                -webkit-overflow-scrolling: touch;
                cursor: grab;
                /* A little bottom padding so the fade masks a partial last row
                   rather than slicing one exactly in half. */
                padding-bottom: 4px;
              }
              .tpl-cats-list.is-dragging { cursor: grabbing; }
              .tpl-cats-list.is-dragging .tpl-cat { pointer-events: none; }
              /* Bottom fade — blends the cut-off last row into the rail ground
                 (CS_LIGHT.bg = rgb(194,208,214)) so it reads as "scroll for
                 more", not a hard clip. pointer-events:none keeps clicks live. */
              .tpl-cats-fade {
                position: absolute; left: 0; right: 0; bottom: 0; height: 34px;
                pointer-events: none; border-radius: 0 0 10px 10px;
                background: linear-gradient(
                  180deg,
                  rgba(194,208,214,0) 0%,
                  rgba(194,208,214,0.85) 70%,
                  rgba(194,208,214,1) 100%
                );
              }
              /* Centered down-chevron hint over the fade. */
              .tpl-cats-chevron {
                position: absolute; left: 50%; bottom: 2px; transform: translateX(-50%);
                pointer-events: none; display: flex; align-items: center; justify-content: center;
                color: rgba(15,20,24,0.55);
              }
              .tpl-cat {
                display: flex; align-items: center; justify-content: space-between;
                padding: 9px 12px; border: none; border-radius: 10px; cursor: pointer;
                transition: background 140ms ease, box-shadow 140ms ease;
              }
              .tpl-cat-name { font-family: ${SANS}; font-size: 12.5px; font-weight: 600; color: ${CS_LIGHT.ink}; }
              .tpl-cat-count { font-family: ${MONO}; font-size: 11px; font-weight: 700; color: ${mkt.accent}; }
              .tpl-rail-cta {
                margin-top: auto;
                display: flex; align-items: center; justify-content: center; gap: 8px;
                padding: 14px; border-radius: 12px;
                background: ${mkt.accent}; color: rgba(255,255,255,1);
                font-family: ${MONO}; font-size: 12px; font-weight: 600;
                letter-spacing: 0.06em; text-transform: uppercase; text-decoration: none;
              }

              .tpl-preview { min-width: 0; display: flex; flex-direction: column; }
              /* Device toggle — right-anchored inside the chrome bar row.
                 Ghost style: no heavy border/shadow, just a subtle hover bg so
                 it belongs to the chrome without fighting the traffic-light dots
                 or the badge. Vertically centered in the 42px bar height. */
              .tpl-device-toggle {
                position: absolute;
                /* Center in the 42px bar: (42 - 30) / 2 = 6px from top */
                top: 6px; right: 8px; z-index: 5;
                flex-shrink: 0; width: 30px; height: 30px; border-radius: 7px;
                display: grid; place-items: center; cursor: pointer; border: none;
                background: transparent;
                color: rgba(15, 23, 42, 0.55);
                transition: background 140ms ease, color 140ms ease;
              }
              .tpl-device-toggle:hover {
                background: rgba(15, 23, 42, 0.07);
                color: ${CS_LIGHT.ink};
              }
              /* Mobile/phone-mockup mode — the toggle is a clean pill ABOVE the
                 phone (not on the device), so it never sits on the bezel/screen
                 seam. Subtle light-surface chip with an icon + label. */
              .tpl-device-toggle-pill {
                display: inline-flex; align-items: center; gap: 6px;
                height: 30px; padding: 0 12px;
                border-radius: 999px; border: 1px solid rgba(15, 20, 24, 0.14);
                background: rgba(255, 255, 255, 0.7);
                color: ${CS_LIGHT.inkMuted};
                font-family: ${MONO}; font-size: 11.5px; font-weight: 600;
                letter-spacing: 0.02em; cursor: pointer;
                transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
              }
              .tpl-device-toggle-pill:hover {
                background: rgba(255, 255, 255, 0.95);
                color: ${CS_LIGHT.ink};
                border-color: ${mkt.accent};
              }

              /* Template-swap polish: remount the widget on selection with a
                 soft fade + rise. */
              .tpl-swap-in { animation: tplSwapIn 320ms cubic-bezier(0.22,1,0.36,1) both; }
              @keyframes tplSwapIn {
                from { opacity: 0; transform: translateY(8px); }
                to { opacity: 1; transform: translateY(0); }
              }
              @media (prefers-reduced-motion: reduce) {
                .tpl-swap-in { animation: none; }
              }

              /* Accessibility — visible focus rings on every control. */
              .tpl-card:focus-visible,
              .tpl-swatch:focus-visible,
              .tpl-device-toggle:focus-visible,
              .tpl-pager-btn:focus-visible,
              .tpl-cat:focus-visible {
                outline: none;
                box-shadow: 0 0 0 2px ${CS_LIGHT.bg}, 0 0 0 4px ${mkt.accent};
              }

              @media (max-width: 760px) {
                .tpl-editor-section { padding-left: 4px !important; padding-right: 4px !important; }
                .tpl-editor { grid-template-columns: 1fr; gap: 14px; align-items: start; }
                .tpl-rail { order: 2; }
                .tpl-preview { order: 1; }
                .tpl-rail-cta { margin-top: 0; }
                /* Theme swatch strip spans the FULL rail width on mobile (the
                   312px desktop cap left it hugging the left edge). The scroll
                   wrapper + row both stretch edge-to-edge; the row still scrolls
                   horizontally when the swatches overflow. */
                .tpl-color-scroll { width: 100%; max-width: none; }
                .tpl-color-row { max-width: none; flex: 1 1 auto; min-width: 0; }
              }
            `}</style>
          </div>
        </div>

        {/* Everything-you-need feature grid + benefit ribbon (dark ground).
            Original benefit-led copy for QuoteQuick's real capabilities; lucide
            icons at semantic sizes; brand blue used sparingly. */}
        <section data-testid="template-features" style={{ padding: "76px 28px 8px" }}>
          <div style={{ maxWidth: 1120, margin: "0 auto" }}>
            <h2 style={{ fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 800, color: mkt.onDark, textAlign: "center", margin: "0 0 8px", letterSpacing: "-0.01em" }}>
              Everything you need to quote, built in
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: mkt.onDarkMuted, textAlign: "center", maxWidth: 600, margin: "0 auto 40px" }}>
              Every template ships with the full toolkit — interactive inputs, live math,
              your branding and built-in lead capture. Launch a calculator that prices and
              books work without writing a line of code.
            </p>
            <div className="tpl-feat-grid">
              {[
                {
                  Icon: SlidersHorizontal,
                  title: "Smart input fields",
                  body: "Sliders, dropdowns, number steppers, multi-select and image choices — guide customers to an accurate quote in seconds.",
                },
                {
                  Icon: Calculator,
                  title: "Formula calculations",
                  body: "Spreadsheet-style math runs the moment they choose. Tiers, add-ons and conditional pricing recalculate live, no refresh.",
                },
                {
                  Icon: Palette,
                  title: "Themes & branding",
                  body: "Colours, fonts and your logo applied in a click, so the calculator looks like a native part of your own site.",
                },
                {
                  Icon: UserPlus,
                  title: "Built-in lead capture",
                  body: "Collect name, email and phone with every estimate and turn anonymous visitors into priced, ready-to-call leads.",
                },
                {
                  Icon: Code2,
                  title: "Embed anywhere",
                  body: "Share a hosted link or paste one line of code. It drops into any website builder, CMS or landing page.",
                },
                {
                  Icon: Smartphone,
                  title: "Mobile-ready",
                  body: "Fully responsive and touch-friendly out of the box — fast, tappable and pixel-clean on every screen size.",
                },
              ].map(({ Icon, title, body }) => (
                <div key={title} className="tpl-feat-card">
                  <span className="tpl-feat-ico" aria-hidden="true">
                    <Icon size={24} color={mkt.accent} strokeWidth={2} />
                  </span>
                  <div className="tpl-feat-title">{title}</div>
                  <p className="tpl-feat-body">{body}</p>
                </div>
              ))}
            </div>

            {/* Benefit ribbon — compact value chips, wraps on mobile. */}
            <ul className="tpl-feat-ribbon" data-testid="template-features-ribbon" aria-label="Key benefits">
              {[
                { Icon: Wand2, label: "No-code setup" },
                { Icon: Clock, label: "Live in 60 seconds" },
                { Icon: Smartphone, label: "Mobile-ready" },
                { Icon: Globe, label: "Embed anywhere" },
                { Icon: ShieldCheck, label: "Secure & GDPR-friendly" },
              ].map(({ Icon, label }) => (
                <li key={label} className="tpl-feat-chip">
                  <Icon size={16} color={mkt.accent} strokeWidth={2.25} aria-hidden="true" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>
          <style>{`
            /* Feature grid — 3 cols desktop, 2 tablet, 1 small mobile. */
            .tpl-feat-grid {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 16px;
            }
            .tpl-feat-card {
              background: rgba(255,255,255,0.04);
              border: 1px solid ${mkt.onDarkBorder};
              border-radius: 16px;
              padding: 24px 22px;
              display: flex;
              flex-direction: column;
              gap: 10px;
              transition: border-color 160ms ease, transform 160ms ease;
            }
            .tpl-feat-card:hover {
              border-color: rgba(255,255,255,0.9);
              transform: translateY(-2px);
            }
            .tpl-feat-ico {
              width: 44px; height: 44px; border-radius: 11px;
              display: grid; place-items: center;
              background: rgba(13,60,252,0.14);
            }
            .tpl-feat-title {
              font-size: 16px; font-weight: 700; color: ${mkt.onDark};
              letter-spacing: -0.01em;
            }
            .tpl-feat-body {
              font-size: 13.5px; line-height: 1.6; color: ${mkt.onDarkMuted}; margin: 0;
            }
            /* Benefit ribbon — single wrapping row of value chips. */
            .tpl-feat-ribbon {
              list-style: none; margin: 40px 0 0; padding: 0;
              display: flex; flex-wrap: wrap; justify-content: center; gap: 10px;
            }
            .tpl-feat-chip {
              display: inline-flex; align-items: center; gap: 8px;
              padding: 9px 16px; border-radius: 10px;
              background: rgba(255,255,255,0.04);
              border: 1px solid ${mkt.onDarkBorder};
              font-size: 13.5px; font-weight: 600; color: ${mkt.onDark};
              white-space: nowrap;
            }
            @media (max-width: 900px) {
              .tpl-feat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            }
            @media (max-width: 560px) {
              .tpl-feat-grid { grid-template-columns: 1fr; }
            }
          `}</style>
        </section>

        {/* Why an instant quote tool wins — KPI row (back on the dark ground) */}
        <div style={{ padding: "72px 28px 64px" }}>
          <div style={{ maxWidth: 1120, margin: "0 auto" }}>
            <h2 style={{ fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 800, color: mkt.onDark, textAlign: "center", margin: "0 0 8px", letterSpacing: "-0.01em" }}>
              Why trades win with an instant quote tool
            </h2>
            <p style={{ fontSize: 15, color: mkt.onDarkMuted, textAlign: "center", maxWidth: 560, margin: "0 auto 36px" }}>
              An online calculator turns website visitors into booked jobs — automatically, around the clock.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(228px, 1fr))", gap: 16 }}>
              {[
                { Icon: Zap, stat: "21×", title: "Respond first, win more", sub: "Leads contacted within 5 minutes convert 21× more often than slow follow-ups." },
                { Icon: Clock, stat: "24/7", title: "Never miss a job", sub: "Your calculator captures and prices leads overnight and on weekends, while you sleep." },
                { Icon: TrendingUp, stat: "2×", title: "Quotes beat forms", sub: "An interactive quote tool converts 2× more website visitors than a plain contact form." },
                { Icon: ShieldCheck, stat: "Pre-qualified", title: "Fewer tire-kickers", sub: "Upfront pricing filters out mismatched budgets so you only quote serious buyers." },
              ].map(({ Icon, stat, title, sub }) => (
                <div key={title} style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${mkt.onDarkBorder}`,
                  borderRadius: 16,
                  padding: "24px 20px",
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <span style={{ width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(13,60,252,0.14)" }}>
                    <Icon size={20} color={mkt.accent} />
                  </span>
                  <div style={{ fontSize: 30, fontWeight: 800, color: mkt.onDark, letterSpacing: "-0.02em", lineHeight: 1.05 }}>{stat}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: mkt.onDark }}>{title}</div>
                  <p style={{ fontSize: 13, lineHeight: 1.55, color: mkt.onDarkMuted, margin: 0 }}>{sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Final CTA — V7 gradient closer (slate rounded card on the dark
            ground), matching the Case Studies / product-page rhythm. */}
        <V7FinalCta
          title="Ready to use this template?"
          sub="Drop in your pricing in our setup wizard. Free to start, no credit card required."
          primaryCta={{
            label: "Use this template",
            href: `/wizard?template=${activeTemplate.id}&accent=${encodeURIComponent(accent)}`,
          }}
        />
      </div>
      </V7PageShell>
    </MarketingLayout>
  );
}
