import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import CalculatorTemplateCard from "@/components/marketing/CalculatorTemplateCard";
import { TEMPLATE_PRESETS } from "@shared/templatePresets";

/**
 * Portal "Calculator Templates" — customers browse the quote-calculator
 * templates with the same compact card as the public /templates gallery.
 * "Try" opens the public landing page; "Use" jumps into the wizard with the
 * template preselected. Read-only browser (search filter only).
 */

export default function PortalCalculatorTemplates() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TEMPLATE_PRESETS;
    return TEMPLATE_PRESETS.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <PortalLayout>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
        <div className="mb-1 text-2xl font-semibold text-foreground">Calculator Templates</div>
        <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
          Pick a ready-made quote calculator for your trade, drop in your pricing, and go
          live in minutes. Preview any template, then customise it in the builder.
        </p>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="font-mono text-xs text-muted-foreground">
            {filtered.length} template{filtered.length === 1 ? "" : "s"}
          </div>
          <div className="inline-flex min-w-[240px] items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <Search size={16} strokeWidth={2} className="text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates…"
              aria-label="Search calculator templates"
              className="w-full bg-transparent text-sm text-foreground outline-none"
            />
          </div>
        </div>

        {/* Light panel so the (light) calculator card renders correctly in any theme. */}
        <div className="rounded-2xl p-4 sm:p-6" style={{ background: "#E7ECEF" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))", gap: 12 }}>
            {filtered.map((t) => (
              <CalculatorTemplateCard key={t.id} template={t} />
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm" style={{ color: "#3F4549" }}>
              No templates match “{query}”.
            </p>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}
