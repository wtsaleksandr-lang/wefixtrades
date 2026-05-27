/**
 * useWidgetFonts — runtime loader for the QuoteWidget / calculator
 * curated font set.
 *
 * Wave 45 — moved out of index.html so the marketing homepage no longer
 * render-blocks on ~9 Google webfont requests for fonts it never uses.
 * The customer-facing widget pages (/wizard, /calculator, /q/:slug,
 * /edit-calculator, hosted-page embeds) call this hook so customers who
 * picked Manrope, Plus Jakarta, IBM Plex, Outfit, or Sora for their
 * widget still get them when the widget mounts.
 *
 * The injected `<link>` is keyed by a dataset attribute so navigating
 * between calculator-family routes doesn't double-load.
 */
import { useEffect } from "react";

const QUOTEQUICK_WIDGET_FONTS =
  "https://fonts.googleapis.com/css2?" +
  "family=Inter:wght@400;500;600;700;800&" +
  "family=Manrope:wght@400;500;600;700;800&" +
  "family=Plus+Jakarta+Sans:wght@400;500;600;700;800&" +
  "family=IBM+Plex+Sans:wght@400;500;600;700&" +
  "family=Outfit:wght@300;400;500;600;700&" +
  "family=Sora:wght@400;500;600;700;800&" +
  "display=swap";

export function useWidgetFonts(): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.querySelector('link[data-quotequick-fonts]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.dataset.quotequickFonts = "1";
    link.href = QUOTEQUICK_WIDGET_FONTS;
    document.head.appendChild(link);
  }, []);
}
