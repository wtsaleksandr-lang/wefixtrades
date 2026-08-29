/**
 * SiteLaunch — stylesheet generation.
 *
 * Emits ONE self-contained stylesheet per site from the resolved theme. It is
 * inlined into every rendered page rather than served as a separate asset,
 * because the "you own it, you take it with you" promise
 * (client/src/config/products.ts:304) requires each exported HTML file to
 * stand alone with no external requests.
 *
 * Mobile-first. Two breakpoints only — 768px (tablet/desktop layout) and
 * 1100px (wide type scale). Everything below 768px is single-column by
 * default, so a new section cannot accidentally ship a desktop-only layout.
 */

import type { ResolvedTheme } from "./themes";

/** Escape a value being interpolated into a CSS declaration. Customer data
 *  (brand hex, font key) is already validated upstream, but CSS injection via
 *  a stored value would be a stored-XSS vector, so nothing untrusted reaches
 *  the stylesheet unescaped. */
function cssSafe(value: string): string {
  return String(value).replace(/[<>{}\\;"']/g, "");
}

export function buildStylesheet(rt: ResolvedTheme): string {
  const { theme, accent } = rt;
  const p = theme.palette;
  const l = theme.layout;
  const t = theme.type;
  const s = theme.structure;

  const upper = t.headingCase === "upper" ? "uppercase" : "none";
  const eyebrowCase = t.eyebrowCase === "upper" ? "uppercase" : "none";
  const btnRadius =
    s.buttonShape === "pill" ? "999px" : s.buttonShape === "square" ? "0px" : `${l.radiusSmall + 2}px`;

  return `
:root{
  --sl-surface:${cssSafe(p.surface)};
  --sl-surface-alt:${cssSafe(p.surfaceAlt)};
  --sl-surface-raised:${cssSafe(p.surfaceRaised)};
  --sl-surface-dark:${cssSafe(p.surfaceDark)};
  --sl-ink:${cssSafe(p.ink)};
  --sl-ink-muted:${cssSafe(p.inkMuted)};
  --sl-ink-subtle:${cssSafe(p.inkSubtle)};
  --sl-ink-on-dark:${cssSafe(p.inkOnDark)};
  --sl-ink-on-dark-muted:${cssSafe(p.inkOnDarkMuted)};
  --sl-line:${cssSafe(p.line)};
  --sl-line-strong:${cssSafe(p.lineStrong)};
  --sl-accent:${cssSafe(accent.base)};
  --sl-accent-hover:${cssSafe(accent.hover)};
  --sl-accent-active:${cssSafe(accent.active)};
  --sl-accent-tint:${cssSafe(accent.tint)};
  --sl-accent-tint-strong:${cssSafe(accent.tintStrong)};
  --sl-on-accent:${cssSafe(accent.onBase)};
  --sl-ring:${cssSafe(accent.ring)};
  --sl-container:${l.container}px;
  --sl-radius:${l.radius}px;
  --sl-radius-sm:${l.radiusSmall}px;
  --sl-border:${l.borderWidth}px;
  --sl-shadow:${cssSafe(l.shadow)};
  --sl-gap:${l.gridGap}px;
  --sl-pad-y:${l.sectionPadMobile}px;
  --sl-font-heading:${cssSafe(rt.headingStack)};
  --sl-font-body:${cssSafe(rt.bodyStack)};
  --sl-btn-radius:${btnRadius};
}

*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;
  background:var(--sl-surface);
  color:var(--sl-ink);
  font-family:var(--sl-font-body);
  font-size:${t.bodySize}px;
  line-height:${t.lineHeight};
  -webkit-font-smoothing:antialiased;
}
img{max-width:100%;height:auto;display:block}
a{color:var(--sl-accent);text-decoration:none}
a:hover{text-decoration:underline}
:focus-visible{outline:3px solid var(--sl-ring);outline-offset:2px}

.sl-skip{position:absolute;left:-9999px;top:0;padding:10px 16px;background:var(--sl-accent);color:var(--sl-on-accent);z-index:100}
.sl-skip:focus{left:8px;top:8px}

.sl-wrap{width:100%;max-width:var(--sl-container);margin:0 auto;padding-left:20px;padding-right:20px}

/* ── Header / nav ─────────────────────────────────────────────────────── */
.sl-utility{background:var(--sl-surface-dark);color:var(--sl-ink-on-dark);font-size:13px}
.sl-utility .sl-wrap{display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;padding-top:8px;padding-bottom:8px}
.sl-utility a{color:var(--sl-ink-on-dark)}

.sl-header{
  position:sticky;top:0;z-index:40;
  background:var(--sl-surface);
  border-bottom:1px solid var(--sl-line);
}
.sl-header-inner{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;padding-top:12px;padding-bottom:0}
.sl-brand{display:flex;flex:1 1 auto;min-width:0;align-items:center;gap:10px;font-family:var(--sl-font-heading);font-weight:${t.headingWeight};font-size:19px;color:var(--sl-ink);text-decoration:none;text-transform:${s.nav === "bar-uppercase" ? "uppercase" : "none"};letter-spacing:${s.nav === "bar-uppercase" ? "0.04em" : "0"}}
.sl-brand:hover{text-decoration:none}
.sl-brand img{height:34px;width:auto}
/* The nav is ALWAYS in the DOM and always visible — no disclosure widget.
 * A closed <details> hides its non-summary children through the UA slot, so
 * no amount of CSS on the child can reveal it; that made the desktop nav
 * invisible. A 5-page trades site navigates fine as a wrapping row. */
.sl-nav{
  display:flex;flex-wrap:wrap;align-items:center;gap:4px 18px;
  flex-basis:100%;order:3;padding:4px 0 10px;margin-top:2px;
  border-top:1px solid var(--sl-line);
}
.sl-nav a{
  display:inline-block;padding:8px 0;color:var(--sl-ink);font-size:15px;
  text-transform:${s.nav === "bar-uppercase" ? "uppercase" : "none"};
  letter-spacing:${s.nav === "bar-uppercase" ? "0.06em" : "0"};
}
.sl-nav a:hover{color:var(--sl-accent);text-decoration:none}
.sl-nav a[aria-current="page"]{color:var(--sl-accent);font-weight:600}
/* Tap-to-call is the highest-value action on a trades site — it stays
 * visible at 375px, just tighter. */
.sl-header-cta{flex:0 0 auto;order:2;white-space:nowrap;font-size:14px;padding:10px 14px;min-height:40px}

/* ── Buttons ──────────────────────────────────────────────────────────── */
.sl-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  min-height:46px;padding:12px 22px;border-radius:var(--sl-btn-radius);
  font-family:var(--sl-font-body);font-size:16px;font-weight:600;line-height:1.2;
  border:2px solid transparent;cursor:pointer;text-align:center;
}
.sl-btn:hover{text-decoration:none}
.sl-btn-primary{background:var(--sl-accent);color:var(--sl-on-accent);border-color:var(--sl-accent)}
.sl-btn-primary:hover{background:var(--sl-accent-hover);border-color:var(--sl-accent-hover)}
.sl-btn-secondary{background:transparent;color:var(--sl-ink);border-color:var(--sl-line-strong)}
.sl-btn-secondary:hover{border-color:var(--sl-accent);color:var(--sl-accent)}
.sl-on-dark .sl-btn-secondary{color:var(--sl-ink-on-dark);border-color:var(--sl-ink-on-dark-muted)}
.sl-on-dark .sl-btn-secondary:hover{color:var(--sl-ink-on-dark);border-color:var(--sl-ink-on-dark)}
.sl-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}

/* ── Sections ─────────────────────────────────────────────────────────── */
.sl-section{padding-top:var(--sl-pad-y);padding-bottom:var(--sl-pad-y)}
.sl-section--alt{background:var(--sl-surface-alt)}
.sl-section--dark{background:var(--sl-surface-dark);color:var(--sl-ink-on-dark)}
.sl-section--dark .sl-eyebrow{color:var(--sl-ink-on-dark-muted)}
.sl-section--dark .sl-lede,.sl-section--dark .sl-body{color:var(--sl-ink-on-dark-muted)}
.sl-section--dark h2,.sl-section--dark h3{color:var(--sl-ink-on-dark)}
${s.divider === "rule" ? ".sl-section + .sl-section{border-top:1px solid var(--sl-line)}" : ""}
${s.divider === "thick-rule" ? ".sl-section + .sl-section{border-top:3px solid var(--sl-line-strong)}" : ""}

.sl-head{max-width:720px;text-align:${s.headingAlign}}
${s.headingAlign === "center" ? ".sl-head{margin-left:auto;margin-right:auto}" : ""}
.sl-eyebrow{
  display:block;margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.10em;
  text-transform:${eyebrowCase};color:var(--sl-accent);
}
h1,h2,h3,h4{font-family:var(--sl-font-heading);font-weight:${t.headingWeight};letter-spacing:${t.headingTracking};text-transform:${upper};margin:0}
h2,.sl-h1-as-h2{font-size:${t.headingMobile}px;line-height:1.18}
h3{font-size:20px;line-height:1.3;text-transform:none}
.sl-lede{margin:14px 0 0;font-size:${t.bodySize + 1}px;color:var(--sl-ink-muted)}
.sl-body{margin:0 0 14px;color:var(--sl-ink-muted)}
.sl-body:last-child{margin-bottom:0}
.sl-grid{display:grid;grid-template-columns:1fr;gap:var(--sl-gap);margin-top:32px}
${l.gridGap <= 4 ? ".sl-grid--cards{background:var(--sl-line);border:var(--sl-border) solid var(--sl-line-strong)}" : ""}

/* ── Hero ─────────────────────────────────────────────────────────────── */
.sl-hero{padding-top:44px;padding-bottom:44px}
.sl-hero h1{font-size:${t.displayMobile}px;line-height:1.08}
.sl-hero .sl-lede{font-size:${t.bodySize + 2}px;max-width:600px}
.sl-hero-media{margin-top:30px}
.sl-hero-media img{width:100%;border-radius:var(--sl-radius);border:var(--sl-border) solid var(--sl-line);object-fit:cover;aspect-ratio:4/3}
.sl-hero--dark{background:var(--sl-surface-dark);color:var(--sl-ink-on-dark);position:relative;overflow:hidden}
.sl-hero--dark h1{color:var(--sl-ink-on-dark)}
.sl-hero--dark .sl-lede{color:var(--sl-ink-on-dark-muted)}
.sl-hero--dark .sl-eyebrow{color:var(--sl-on-accent);background:var(--sl-accent);display:inline-block;padding:5px 10px}
.sl-hero-bg{position:absolute;inset:0;z-index:0;opacity:0.28}
.sl-hero-bg img{width:100%;height:100%;object-fit:cover}
.sl-hero--dark .sl-wrap{position:relative;z-index:1}
.sl-hero--center .sl-head{text-align:center;margin-left:auto;margin-right:auto}
.sl-hero--center .sl-lede{margin-left:auto;margin-right:auto}
.sl-hero--center .sl-actions{justify-content:center}
.sl-creds{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px;padding-top:20px;border-top:1px solid var(--sl-line)}
.sl-hero--dark .sl-creds{border-top-color:var(--sl-ink-on-dark-muted)}
.sl-cred{font-size:13px;font-weight:600;color:var(--sl-ink-muted);display:inline-flex;align-items:center;gap:6px}
.sl-hero--dark .sl-cred{color:var(--sl-ink-on-dark-muted)}

/* ── Cards ────────────────────────────────────────────────────────────── */
.sl-card{
  background:var(--sl-surface-raised);
  border:var(--sl-border) solid var(--sl-line);
  border-radius:var(--sl-radius);
  box-shadow:var(--sl-shadow);
  padding:24px;
}
${s.card === "hairline" ? ".sl-card{border-color:var(--sl-line);box-shadow:none}" : ""}
${s.card === "flat-square" ? ".sl-card{border:0;border-radius:0;box-shadow:none;padding:28px}" : ""}
${s.card === "accent-rail" ? ".sl-card{border-left:4px solid var(--sl-accent);padding-left:22px}" : ""}
.sl-card h3{margin-bottom:8px}
.sl-card p{margin:0;color:var(--sl-ink-muted);font-size:15px}
.sl-card-icon{
  width:40px;height:40px;display:flex;align-items:center;justify-content:center;
  border-radius:var(--sl-radius-sm);background:var(--sl-accent-tint);color:var(--sl-accent);margin-bottom:14px;
}
.sl-card-icon svg{width:20px;height:20px}
.sl-price{display:block;margin-top:12px;font-weight:700;color:var(--sl-accent);font-size:15px}

/* ── Steps ────────────────────────────────────────────────────────────── */
.sl-step{position:relative;padding-top:8px}
.sl-step-num{
  font-family:var(--sl-font-heading);font-size:40px;line-height:1;font-weight:${t.headingWeight};
  color:var(--sl-accent-tint-strong);display:block;margin-bottom:10px;
}
.sl-step h3{margin-bottom:8px}
.sl-step p{margin:0;color:var(--sl-ink-muted);font-size:15px}

/* ── Stats ────────────────────────────────────────────────────────────── */
.sl-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sl-gap);margin-top:28px}
.sl-stat{padding:20px;text-align:${s.stat === "table" ? "left" : "center"};border-radius:var(--sl-radius)}
${s.stat === "tiles" ? ".sl-stat{background:var(--sl-surface-raised);border:var(--sl-border) solid var(--sl-line)}" : ""}
${s.stat === "edge-strip" ? ".sl-stats{gap:0;border:3px solid var(--sl-ink-on-dark-muted)}.sl-stat{border-radius:0;border-right:3px solid var(--sl-ink-on-dark-muted);border-bottom:3px solid var(--sl-ink-on-dark-muted)}.sl-stat:nth-child(2n){border-right:0}" : ""}
${s.stat === "inline-row" ? ".sl-stat{padding:16px 8px}" : ""}
${s.stat === "table" ? ".sl-stats{gap:0}.sl-stat{border-bottom:1px solid var(--sl-line);border-radius:0;display:flex;align-items:baseline;gap:12px}" : ""}
.sl-stat-value{display:block;font-family:var(--sl-font-heading);font-size:34px;line-height:1;font-weight:${t.headingWeight};color:var(--sl-accent)}
.sl-section--dark .sl-stat-value{color:var(--sl-ink-on-dark)}
.sl-stat-label{display:block;margin-top:8px;font-size:14px;color:var(--sl-ink-muted)}
.sl-section--dark .sl-stat-label{color:var(--sl-ink-on-dark-muted)}
${s.stat === "table" ? ".sl-stat-label{margin-top:0}" : ""}

/* ── Trust strip ──────────────────────────────────────────────────────── */
ul.sl-trust{
  display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;
  margin:24px 0 0;padding:0;list-style:none;
}
.sl-trust li{
  list-style:none;display:flex;align-items:center;justify-content:center;
  text-align:center;padding:10px 12px;border-radius:var(--sl-btn-radius);
  background:var(--sl-accent-tint);color:var(--sl-ink);
  font-size:13px;font-weight:600;line-height:1.3;
}
.sl-section--dark .sl-trust li{background:var(--sl-accent);color:var(--sl-on-accent)}
/* A trust strip is a strip, not a full section — half the rhythm, or it
 * leaves a ~200px hole between two adjacent bands. */
.sl-section--strip{padding-top:calc(var(--sl-pad-y) / 2);padding-bottom:calc(var(--sl-pad-y) / 2)}

/* ── About / split ────────────────────────────────────────────────────── */
.sl-split{display:grid;grid-template-columns:1fr;gap:32px;align-items:center}
.sl-split img{width:100%;border-radius:var(--sl-radius);border:var(--sl-border) solid var(--sl-line);object-fit:cover;aspect-ratio:4/3}
.sl-bullets{margin:20px 0 0;padding:0;list-style:none}
.sl-bullets li{position:relative;padding-left:26px;margin-bottom:10px;color:var(--sl-ink-muted);font-size:15px}
.sl-bullets li::before{content:"";position:absolute;left:0;top:8px;width:12px;height:12px;border-radius:3px;background:var(--sl-accent)}

/* ── Gallery ──────────────────────────────────────────────────────────── */
.sl-gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:28px}
.sl-gallery figure{margin:0}
.sl-gallery img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:var(--sl-radius-sm)}
.sl-gallery figcaption{margin-top:6px;font-size:13px;color:var(--sl-ink-subtle)}

/* ── Testimonials ─────────────────────────────────────────────────────── */
.sl-quote{
  background:var(--sl-surface-raised);border:var(--sl-border) solid var(--sl-line);
  border-radius:var(--sl-radius);padding:24px;
}
${s.card === "flat-square" ? ".sl-quote{border:0;border-radius:0}" : ""}
${s.card === "accent-rail" ? ".sl-quote{border-left:4px solid var(--sl-accent)}" : ""}
.sl-quote blockquote{margin:0 0 14px;font-size:16px;line-height:1.6;color:var(--sl-ink)}
.sl-quote cite{font-style:normal;font-size:14px;font-weight:600;color:var(--sl-ink-muted)}
.sl-rating{color:var(--sl-accent);font-size:14px;letter-spacing:2px;margin-bottom:10px}

/* ── FAQ ──────────────────────────────────────────────────────────────── */
.sl-faq{margin-top:28px;border-top:1px solid var(--sl-line)}
.sl-faq details{border-bottom:1px solid var(--sl-line)}
.sl-faq summary{
  cursor:pointer;list-style:none;padding:18px 34px 18px 0;position:relative;
  font-weight:600;font-size:16px;color:var(--sl-ink);
}
.sl-faq summary::-webkit-details-marker{display:none}
.sl-faq summary::after{content:"+";position:absolute;right:6px;top:16px;font-size:22px;color:var(--sl-accent);line-height:1}
.sl-faq details[open] summary::after{content:"\\2212"}
.sl-faq p{margin:0 0 18px;color:var(--sl-ink-muted);font-size:15px;max-width:70ch}

/* ── Hours / areas / contact ──────────────────────────────────────────── */
.sl-hours{margin:24px 0 0;padding:0;list-style:none;max-width:460px}
.sl-hours li{display:flex;justify-content:space-between;gap:16px;padding:11px 0;border-bottom:1px solid var(--sl-line);font-size:15px}
.sl-areas{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0 0;padding:0;list-style:none}
.sl-areas li{padding:7px 12px;border:1px solid var(--sl-line-strong);border-radius:var(--sl-btn-radius);font-size:14px;color:var(--sl-ink-muted)}
.sl-contact{display:grid;grid-template-columns:1fr;gap:28px;margin-top:28px}
.sl-field{display:block;margin-bottom:14px}
.sl-field span{display:block;font-size:13px;font-weight:600;color:var(--sl-ink-muted);margin-bottom:6px}
.sl-field input,.sl-field textarea{
  width:100%;padding:12px 14px;font:inherit;font-size:16px;color:var(--sl-ink);
  background:var(--sl-surface-raised);border:1px solid var(--sl-line-strong);
  border-radius:var(--sl-radius-sm);
}
.sl-field textarea{min-height:120px;resize:vertical}
.sl-field input:focus,.sl-field textarea:focus{border-color:var(--sl-accent);outline:3px solid var(--sl-ring);outline-offset:1px}
.sl-contact-facts{margin:0;padding:0;list-style:none}
.sl-contact-facts li{padding:12px 0;border-bottom:1px solid var(--sl-line);font-size:15px}
.sl-contact-facts strong{display:block;font-size:13px;color:var(--sl-ink-subtle);font-weight:600;margin-bottom:3px}

/* ── Embed slot ───────────────────────────────────────────────────────── */
.sl-embed{margin-top:28px;min-height:320px;border:var(--sl-border) solid var(--sl-line);border-radius:var(--sl-radius);background:var(--sl-surface-raised);padding:8px}

/* ── CTA band ─────────────────────────────────────────────────────────── */
.sl-cta{background:var(--sl-accent);color:var(--sl-on-accent)}
.sl-cta h2,.sl-cta .sl-lede{color:var(--sl-on-accent)}
.sl-cta .sl-lede{opacity:0.88}
.sl-cta .sl-btn-primary{background:var(--sl-surface);color:var(--sl-ink);border-color:var(--sl-surface)}
.sl-cta .sl-btn-secondary{color:var(--sl-on-accent);border-color:var(--sl-on-accent)}

/* ── Footer ───────────────────────────────────────────────────────────── */
.sl-footer{background:var(--sl-surface-dark);color:var(--sl-ink-on-dark-muted);padding:44px 0 30px;font-size:14px}
.sl-footer a{color:var(--sl-ink-on-dark)}
.sl-footer h4{color:var(--sl-ink-on-dark);font-size:15px;margin-bottom:12px;text-transform:none}
.sl-footer-grid{display:grid;grid-template-columns:1fr;gap:28px}
.sl-footer ul{margin:0;padding:0;list-style:none}
.sl-footer li{margin-bottom:8px}
.sl-footer-legal{margin-top:32px;padding-top:20px;border-top:1px solid var(--sl-ink-on-dark-muted);display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;font-size:13px}

/* ── Breakpoints ──────────────────────────────────────────────────────── */
@media (min-width:768px){
  :root{--sl-pad-y:${l.sectionPadDesktop}px}
  .sl-wrap{padding-left:32px;padding-right:32px}
  .sl-header-inner{flex-wrap:nowrap;padding-bottom:12px}
  .sl-brand{flex:0 0 auto}
  .sl-nav{flex:1 1 auto;flex-basis:auto;order:1;border-top:0;margin-top:0;padding:0;gap:26px;justify-content:flex-end;margin-right:24px}
  .sl-nav a{padding:6px 0}
  .sl-header-cta{order:2;font-size:15px;padding:12px 20px;min-height:44px}
  ul.sl-trust{display:flex;flex-wrap:wrap;gap:10px}
  .sl-trust li{font-size:14px;padding:9px 14px}
  .sl-hero{padding-top:72px;padding-bottom:72px}
  .sl-hero h1{font-size:${Math.round((t.displayMobile + t.displayDesktop) / 2)}px}
  h2,.sl-h1-as-h2{font-size:${Math.round((t.headingMobile + t.headingDesktop) / 2)}px}
  .sl-grid{grid-template-columns:repeat(3,minmax(0,1fr));margin-top:44px}
  .sl-grid--2{grid-template-columns:repeat(2,minmax(0,1fr))}
  .sl-grid--4{grid-template-columns:repeat(4,minmax(0,1fr))}
  .sl-split{grid-template-columns:1fr 1fr;gap:56px}
  .sl-split--media-first .sl-split-media{order:-1}
  .sl-stats{grid-template-columns:repeat(4,minmax(0,1fr))}
  ${s.stat === "edge-strip" ? ".sl-stat:nth-child(2n){border-right:3px solid var(--sl-ink-on-dark-muted)}.sl-stat:last-child{border-right:0}" : ""}
  .sl-gallery{grid-template-columns:repeat(4,minmax(0,1fr))}
  .sl-contact{grid-template-columns:1.2fr 0.8fr;gap:56px}
  .sl-footer-grid{grid-template-columns:2fr 1fr 1fr}
  .sl-hero-media{margin-top:0}
}
@media (min-width:1100px){
  .sl-hero h1{font-size:${t.displayDesktop}px}
  h2,.sl-h1-as-h2{font-size:${t.headingDesktop}px}
  .sl-hero{padding-top:96px;padding-bottom:96px}
}
@media (prefers-reduced-motion:reduce){
  *{animation:none !important;transition:none !important;scroll-behavior:auto !important}
}
@media print{
  .sl-header,.sl-utility,.sl-nav-toggle{position:static}
  .sl-section{page-break-inside:avoid}
}
`.trim();
}
