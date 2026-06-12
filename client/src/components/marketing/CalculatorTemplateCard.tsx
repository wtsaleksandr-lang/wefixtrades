import type { CSSProperties } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { ensureReadableText } from "@/lib/contrastGuard";
import { getCategoryStyle } from "@/lib/categoryStyles";
import TemplateThumbnail from "@/components/shared/TemplateThumbnail";
import type { TemplateConfig } from "@shared/templatePresets";

/**
 * Compact calculator template card (.calx-* mirrors the AI-receptionist
 * .airx-* design language in index.css). The thumb now shows a REAL preview
 * of the calculator via the shared `<TemplateThumbnail>` (PNG-first →
 * `<TemplateMockup>` data-driven mini render → category icon tile) instead
 * of the old lone trade icon / 4-template screenshot hack — every card gets
 * an actual title/fields/CTA preview in the template's own palette. The 4:5
 * portrait preview is top-cropped into the wide 116px thumb as a "peek"
 * (header + step dots + field rows emerge from the category-coloured panel
 * and run off the bottom edge), which is the deliberate crop treatment.
 *
 * CTA pattern (templates-page audit, batch PR-3): the WHOLE card is
 * clickable → /templates/{id} (low-commitment preview/landing page) via a
 * stretched link on the heading, with ONE primary button — "Use template →"
 * (→ /wizard?template={id}) — layered above the stretched link. Replaces the
 * old near-synonymous Try/Use chip pair.
 *
 * Reused on the public /templates gallery, the portal, and the admin
 * preview. `tryHref` keeps its name for caller compatibility: it is the
 * whole-card (preview) destination.
 */

export interface CalculatorTemplateCardProps {
  template: TemplateConfig;
  /** Whole-card (preview) target. Defaults to the public landing /templates/{id}. */
  tryHref?: string;
  /** Primary "Use template" target. Defaults to /wizard?template={id}. */
  useHref?: string;
  /** New tab for both links (used inside the portal). */
  newTab?: boolean;
}

export default function CalculatorTemplateCard({ template, tryHref, useHref, newTab }: CalculatorTemplateCardProps) {
  const cat = getCategoryStyle(template.category);

  const tabProps = newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};

  return (
    <div
      className="calx-card"
      data-testid={`template-card-${template.id}`}
      style={{
        ["--calx-accent" as string]: cat.heroAccent,
        /* --calx-ink paints the "Use template" label on a --calx-cta fill.
         * ctaText is tuned for the mockup's bright gradient CTA — on dark
         * ctaOnWhite tiles (construction: slate #1e293b on amber-800
         * #92400e) it read 2.06:1. Derive the ink from the actual tile
         * colour so it always clears WCAG (night-audit P-A). */
        ["--calx-ink" as string]: ensureReadableText(cat.ctaText, cat.ctaOnWhite),
        ["--calx-cta" as string]: cat.ctaOnWhite,
      } as CSSProperties}
    >
      <div className="calx-thumb">
        <div className="calx-bg" />
        {/* Real calculator preview — 4:5 portrait, top-anchored and cropped
         * by the 116px thumb so the form portion (title, steps, fields)
         * reads as a card peeking out of the category panel. The shared
         * component guarantees a non-empty render (PNG → mockup → icon). */}
        <div className="calx-mini" aria-hidden="true">
          <TemplateThumbnail template={template} />
        </div>
      </div>

      <div className="calx-content">
        <div className="calx-tags"><span className="calx-tag">{template.category}</span></div>
        <h3 className="calx-heading">
          {/* Stretched link — its ::after covers the card, making the whole
           * card click → the template preview page. Real <a>: tabbable,
           * Enter-activates, focus ring drawn by .calx-card-link::after. */}
          <Link
            className="calx-card-link"
            href={tryHref ?? `/templates/${template.id}`}
            {...tabProps}
            aria-label={`Preview ${template.name} template`}
            data-testid={`preview-cta-${template.id}`}
          >
            {template.name}
          </Link>
        </h3>
        <p className="calx-desc">{template.description}</p>
        <div className="calx-cta">
          <Link
            className="calx-btn calx-use"
            href={useHref ?? `/wizard?template=${template.id}`}
            {...tabProps}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Use ${template.name} template`}
            data-testid={`use-cta-${template.id}`}
          >
            Use template <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
