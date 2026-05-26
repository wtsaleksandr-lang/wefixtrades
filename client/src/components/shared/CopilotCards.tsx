import type { CopilotCard } from "@shared/copilotProtocol";

/**
 * CopilotCards — renders 1-3 recommendation tiles emitted by the AI inside
 * a <<<COPILOT_CARDS>>> block. Shared by portal, admin, and the marketing
 * widget so the visual standard stays identical across surfaces.
 *
 * Clicking a card calls onSelect — the host widget decides what to do
 * (navigate via wouter, window.location for cross-surface, or send the
 * title back as a user message). hrefs are already sanitized server-side
 * by sanitizeCopilotCards (relative or https only, no "..").
 *
 * Visual: 2px gaps, semantic tokens, brand-blue accent, hover = subtle
 * border tint (no shift). Dark + light mode safe via tokens.
 */
export default function CopilotCards({
  cards,
  onSelect,
  variant = "portal",
}: {
  cards: CopilotCard[];
  onSelect: (card: CopilotCard) => void;
  /** Light vs widget-on-marketing-page — only affects text contrast on the lead-in. */
  variant?: "portal" | "admin" | "widget";
}) {
  if (cards.length === 0) return null;
  return (
    <div
      className="flex flex-col gap-2"
      data-testid="copilot-cards"
      data-theme="light"
      role="list"
    >
      {cards.map((c, i) => {
        const interactive = !!c.href || !!onSelect;
        const Tag: "button" | "div" = interactive ? "button" : "div";
        return (
          <Tag
            key={i}
            type={interactive ? "button" : undefined}
            onClick={() => onSelect(c)}
            role="listitem"
            className={[
              "group text-left rounded-lg border border-border bg-card overflow-hidden",
              "transition-colors hover:border-brand-blue/60 focus:outline-none focus:ring-2 focus:ring-brand-blue/30",
              interactive ? "cursor-pointer" : "",
            ].join(" ")}
            data-testid={`copilot-card-${i}`}
            data-variant={variant}
          >
            <div className="flex gap-3 p-3">
              {c.image && (
                <img
                  src={c.image}
                  alt=""
                  loading="lazy"
                  width={48}
                  height={48}
                  className="rounded object-cover shrink-0 border border-border"
                  style={{ width: 48, height: 48 }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground leading-snug truncate">
                  {c.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground leading-snug line-clamp-2">
                  {c.description}
                </p>
                {(c.cta || c.href) && (
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-brand-blue group-hover:underline">
                    {c.cta ?? "Learn more"}
                    <span aria-hidden="true">→</span>
                  </span>
                )}
              </div>
            </div>
          </Tag>
        );
      })}
    </div>
  );
}
