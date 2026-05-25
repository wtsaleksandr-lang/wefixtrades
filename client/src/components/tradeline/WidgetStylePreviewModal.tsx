/**
 * WidgetStylePreviewModal — live preview of a TradeLine chat-widget style.
 *
 * Renders the existing `TradeLineHeroPhone` component (the canonical
 * TradeLine chat surface) scaled to fit a dialog, wrapped in a div whose
 * inline-style applies the preset's `--tlhp-*` CSS-variable overrides.
 * Sample data (`Apex Plumbing` + a representative service line + price band)
 * is shown above the phone so trades can see the style with a familiar
 * business context — the phone itself cycles its own built-in plumbing /
 * HVAC / roofing / electrical scenarios.
 *
 * The "Use this style" action calls back with the picked style; the parent
 * is responsible for persisting `accent_color` (the one piece of style that
 * the existing widget schema stores today).
 */

import { useMemo } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import TradeLineHeroPhone from "@/components/marketing/TradeLineHeroPhone";
import type { TradelineWidgetStyle } from "./widgetStyles";

interface Props {
  style: TradelineWidgetStyle;
  open: boolean;
  onClose: () => void;
  onApply: (style: TradelineWidgetStyle) => void;
}

/* Sample business shown above the phone so the preview reads as "this is
 * how it'd look for a plumber called Apex Plumbing" rather than a generic
 * demo. The widget itself runs its own realistic scenario loop. */
const SAMPLE_BUSINESS = {
  name: "Apex Plumbing",
  tagline: "24/7 emergency dispatch · licensed + insured",
  services: [
    { label: "Burst pipe repair", price: "$185–$240 + parts" },
    { label: "Water-heater swap", price: "$1,200–$2,400" },
    { label: "Drain unclog", price: "$120–$320" },
  ],
} as const;

export default function WidgetStylePreviewModal({ style, open, onClose, onApply }: Props) {
  // Style overrides applied via inline CSS custom properties so the existing
  // `TradeLineHeroPhone` (which already reads these vars) re-themes itself
  // without any prop plumbing or component rewrite.
  const wrapStyle = useMemo<React.CSSProperties>(() => {
    return { ...(style.cssVars as React.CSSProperties) };
  }, [style.cssVars]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-3xl w-[calc(100vw-2rem)] sm:w-auto max-h-[92vh] overflow-y-auto p-0 gap-0"
        // data-theme="light" — the preview body intentionally uses a dark
        // gallery backdrop (bg-gray-900) with white-on-dark text + a white
        // footer to simulate the trade's installed widget on their own
        // site. Marking the scope so the hardcoded-color guard treats the
        // white text/footer as intentional preview chrome, not a
        // theme-naive surface.
        data-theme="light"
      >
        {/* DialogContent renders its own close X in the top-right corner.
            Header just carries the style name + description. */}
        <DialogHeader className="space-y-0 px-5 py-3 pr-12 border-b border-gray-200">
          <DialogTitle className="text-base font-semibold text-gray-900">
            Preview · {style.name}
          </DialogTitle>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{style.description}</p>
        </DialogHeader>

        <div className="px-5 py-5 bg-gray-900">
          {/* Sample business context strip */}
          <div className="mb-4 rounded-lg bg-white/5 border border-white/10 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-white/55 font-semibold">
              Sample business
            </p>
            <p className="text-sm font-semibold text-white mt-0.5">{SAMPLE_BUSINESS.name}</p>
            <p className="text-xs text-white/70">{SAMPLE_BUSINESS.tagline}</p>
            <ul className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SAMPLE_BUSINESS.services.map((svc) => (
                <li
                  key={svc.label}
                  className="rounded-md bg-white/5 border border-white/10 px-2 py-1.5"
                >
                  <p className="text-[11px] font-medium text-white">{svc.label}</p>
                  <p className="text-[10px] text-white/60 font-mono">{svc.price}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Scaled phone preview. The TradeLineHeroPhone is ~340×650 — we
              scale it down so the whole device fits comfortably inside the
              dialog without horizontal scroll. Transform-origin top centers
              the scale so the trust strip stays visible below. The style
              preset's CSS-var overrides are passed directly into the phone
              (the component applies them inline so they win over the
              stylesheet defaults in `.tlhp-wrap`). */}
          <div className="flex justify-center overflow-hidden">
            <div
              style={{
                transform: "scale(0.78)",
                transformOrigin: "top center",
                marginBottom: -140,
              }}
            >
              <TradeLineHeroPhone styleOverrides={wrapStyle} />
            </div>
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-gray-200 bg-white">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onApply(style)}>
            <Check className="w-3.5 h-3.5 mr-1.5" />
            Use this style
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
