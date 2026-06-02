import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Search } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import AiReceptionistCard from "@/components/marketing/AiReceptionistCard";
import AiReceptionistPreviewModal from "@/components/marketing/AiReceptionistPreviewModal";
import { AI_RECEPTIONISTS, type AiReceptionist } from "@/data/aiReceptionists";

/**
 * Portal "AI Receptionists" — customers browse the 40 trade templates, preview
 * them, and pick one for their own TradeLine. Reuses the exact marketing card
 * (so the look matches the public gallery), but the primary CTA is "Use this"
 * which routes into the TradeLine setup with the trade preselected. "Read more"
 * opens the shared public /ai-receptionists/{trade} page in a new tab (one page,
 * both surfaces). One-click apply + assistant reprovision is a future step.
 */

export default function PortalAiReceptionists() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<{ mode: "voice" | "chat"; data: AiReceptionist } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return AI_RECEPTIONISTS;
    return AI_RECEPTIONISTS.filter(
      (r) => r.label.toLowerCase().includes(q) || r.cardBenefits.some((b) => b.toLowerCase().includes(q)),
    );
  }, [query]);

  return (
    <PortalLayout>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
        <div className="mb-1 text-2xl font-semibold text-foreground">AI Receptionists</div>
        <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
          Pick a ready-made AI receptionist for your trade. Each one is pre-trained on the
          industry, answers calls and messages 24/7, gives estimates, books jobs, and follows
          up — with a male or female voice. Preview any of them, then set yours up.
        </p>

        {/* Search */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="font-mono text-xs text-muted-foreground">
            {filtered.length} trade{filtered.length === 1 ? "" : "s"}
          </div>
          <div className="inline-flex min-w-[240px] items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <Search size={16} strokeWidth={2} className="text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search trades…"
              aria-label="Search trades"
              className="w-full bg-transparent text-sm text-foreground outline-none"
            />
          </div>
        </div>

        {/* Gallery — light panel so the (light) marketing card renders correctly
            regardless of the portal light/dark theme. */}
        <div
          className="rounded-2xl p-4 sm:p-6"
          style={{ background: "#E7ECEF" }}
        >
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}
          >
            {filtered.map((r) => (
              <AiReceptionistCard
                key={r.id}
                data={r}
                readMoreHref={`/ai-receptionists/${r.slug}`}
                readMoreNewTab
                onPreview={(mode, data) => setPreview({ mode, data })}
                onUse={(data) => navigate(`/portal/tradeline/setup?template=${data.slug}`)}
                useLabel="Use this"
              />
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm" style={{ color: "#3F4549" }}>
              No trades match “{query}”.
            </p>
          )}
        </div>
      </div>

      {preview && (
        <AiReceptionistPreviewModal
          data={preview.data}
          initialMode={preview.mode}
          onClose={() => setPreview(null)}
        />
      )}
    </PortalLayout>
  );
}
