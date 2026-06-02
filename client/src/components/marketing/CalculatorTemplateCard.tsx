import { useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { getCategoryStyle } from "@/lib/categoryStyles";
import { getQuoteQuickIcon } from "@/data/quoteQuickIcons";
import type { TemplateConfig } from "@shared/templatePresets";

/**
 * Compact (~30% smaller) calculator template card — same design language as
 * the AI-receptionist card (.calx-* mirrors .airx-* in index.css): the
 * category-coloured thumbnail recedes + dims on hover while the trade
 * calculator icon (the "character") zooms forward, the badge merges to just
 * its icon, and the Try/Use CTAs cross-swap colours. Per-category colour is
 * passed via the --calx-accent / --calx-ink CSS variables.
 *
 * Reused on the public /templates gallery, the portal, and the admin preview.
 */

// The four templates that have real captured calculator screenshots.
const SHOT_IDS = new Set(["car_towing", "driveway_paving", "property_cleaning", "energy_upgrade"]);

export interface CalculatorTemplateCardProps {
  template: TemplateConfig;
  /** Primary "Try" target. Defaults to the public landing /templates/{id}. */
  tryHref?: string;
  /** Secondary "Use" target. Defaults to /wizard?template={id}. */
  useHref?: string;
  /** New tab for both links (used inside the portal). */
  newTab?: boolean;
}

export default function CalculatorTemplateCard({ template, tryHref, useHref, newTab }: CalculatorTemplateCardProps) {
  const cat = getCategoryStyle(template.category);
  const Icon = getQuoteQuickIcon(template.defaultIcon);
  const [shotFailed, setShotFailed] = useState(false);
  const hasShot = SHOT_IDS.has(template.id) && !shotFailed;

  const tabProps = newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};

  return (
    <div
      className="calx-card"
      data-testid={`template-card-${template.id}`}
      style={{ ["--calx-accent" as string]: cat.heroAccent, ["--calx-ink" as string]: cat.ctaText } as CSSProperties}
    >
      <div className="calx-thumb">
        <div className="calx-bg" />
        {Icon ? <div className="calx-badge"><Icon size={14} strokeWidth={2.2} /></div> : null}
        {hasShot ? (
          <img
            className="calx-shot"
            src={`/ai-thumbnails/templates/${encodeURIComponent(template.id)}.png`}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setShotFailed(true)}
          />
        ) : Icon ? (
          <Icon className="calx-ico" size={32} strokeWidth={1.8} />
        ) : null}
      </div>

      <div className="calx-content">
        <div className="calx-tags"><span className="calx-tag">{template.category}</span></div>
        <h3 className="calx-heading">{template.name}</h3>
        <p className="calx-desc">{template.description}</p>
        <div className="calx-cta">
          <Link className="calx-btn calx-try" href={tryHref ?? `/templates/${template.id}`} {...tabProps} data-testid={`preview-cta-${template.id}`}>
            Try
          </Link>
          <Link className="calx-btn calx-use" href={useHref ?? `/wizard?template=${template.id}`} {...tabProps} aria-label={`Use ${template.name} template`} data-testid={`use-cta-${template.id}`}>
            Use <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}
