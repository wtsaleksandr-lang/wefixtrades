/**
 * RankGridHelpModal — Free Audit "Rank Grid" tab explainer.
 *
 * Premium-redesign companion to MapSnapshotShell's HeatmapView. Surfaced
 * by a small `?` trigger on the grid card header so non-SEO-experts can
 * understand:
 *   1. What this is        — what a 5×5 rank grid actually represents
 *   2. How to read it      — color tiers, center pin, distance falloff
 *   3. Why it matters      — different customers see different results
 *   4. How to improve it   — GBP optimisation + reviews → MapGuard CTA
 *
 * Mirrors effortel.com polish: generous whitespace, soft rounded corners,
 * calm typographic hierarchy. Uses the project's shadcn Dialog primitive
 * + Lucide icons on the semantic ladder (16 / 20).
 *
 * Light-theme locked (data-theme="light") on the outer wrapper so the
 * intentional white background + dark ink survives the hardcoded-color
 * guard without growing the contrast baseline.
 */

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  HelpCircle,
  MapPin,
  Target,
  Eye,
  TrendingUp,
  ArrowRight,
} from "lucide-react";

const BRAND_PRIMARY = "#0d3cfc";
const BRAND_INK = "#1E1E1E";

type Section = {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
};

function makeSections(trade?: string): Section[] {
  const tradeLabel = trade && trade.trim() ? trade.trim() : "your service";
  return [
    {
      icon: <Target size={20} aria-hidden="true" />,
      title: "What this is",
      body: (
        <>
          A 5×5 grid showing where your business ranks in local Google searches
          across your service area. Each cell is a different physical location
          near you — so the grid samples <strong>25 spots</strong> around your
          address and asks Google "who shows up here?"
        </>
      ),
    },
    {
      icon: <Eye size={20} aria-hidden="true" />,
      title: "How to read it",
      body: (
        <>
          The number in each cell is your rank for someone searching from that
          spot. Cells use four calm tiers:
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
            <li>
              <strong style={{ color: "#047857" }}>Green</strong> — top 3
              (nearly everyone sees you)
            </li>
            <li>
              <strong style={{ color: "#1d4ed8" }}>Blue</strong> — top 10 (most
              people see you)
            </li>
            <li>
              <strong style={{ color: "#b45309" }}>Amber</strong> — top 20
              (some people see you)
            </li>
            <li>
              <strong style={{ color: "#b91c1c" }}>Red</strong> — beyond top 20
              (those customers go to competitors)
            </li>
          </ul>
          The small pin at the center marks your actual address.
        </>
      ),
    },
    {
      icon: <MapPin size={20} aria-hidden="true" />,
      title: "Why it matters",
      body: (
        <>
          Customers searching for <strong>{tradeLabel}</strong> from different
          parts of town see different results. Cells where you're top-3 mean
          those customers will easily find you. Cells where you're beyond top
          20 mean your competitors are getting that work — not you.
          <br />
          <br />
          A single average rank hides this. The grid shows you exactly which
          neighbourhoods you're invisible in.
        </>
      ),
    },
    {
      icon: <TrendingUp size={20} aria-hidden="true" />,
      title: "How to improve it",
      body: (
        <>
          The fastest path is optimising your Google Business Profile
          (categories, services, photos, weekly posts) and getting more
          reviews — especially from customers in the low-ranking areas. Each
          new local review nudges those red cells toward amber and beyond.
          <br />
          <br />
          MapGuard runs this audit every week and fixes the gaps automatically,
          so you don't have to think about it.
        </>
      ),
    },
  ];
}

export interface RankGridHelpModalProps {
  /** Optional trade name woven into the copy ("emergency plumber"). */
  trade?: string;
  /** Optional snapshot slug propagated into the CTA UTM. */
  slug?: string;
  /** Triggers reuse this id for aria-controls (defaults to a stable string). */
  triggerTestId?: string;
}

/**
 * Default trigger — a small circular `?` button matching the calm InfoCue
 * affordance used elsewhere in the audit report (top-left of the section
 * header per the recurring UI rules).
 */
function DefaultTrigger({ testid }: { testid: string }) {
  return (
    <button
      type="button"
      aria-label="What is the Rank Grid?"
      data-testid={testid}
      style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        border: "1px solid #e5e7eb",
        background: "#f8fafc",
        color: "#64748b",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
        transition: "background 150ms ease, color 150ms ease, border-color 150ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#eef2ff";
        e.currentTarget.style.borderColor = "#c7d2fe";
        e.currentTarget.style.color = BRAND_PRIMARY;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#f8fafc";
        e.currentTarget.style.borderColor = "#e5e7eb";
        e.currentTarget.style.color = "#64748b";
      }}
    >
      <HelpCircle size={14} aria-hidden="true" />
    </button>
  );
}

export function RankGridHelpModal({
  trade,
  slug,
  triggerTestId = "rank-grid-help-trigger",
}: RankGridHelpModalProps) {
  const sections = React.useMemo(() => makeSections(trade), [trade]);
  const ctaHref = `/products/mapguard?utm_source=map-snapshot&utm_medium=help-modal&utm_campaign=rank-grid-explainer${slug ? `&utm_content=${slug}` : ""}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <span>
          <DefaultTrigger testid={triggerTestId} />
        </span>
      </DialogTrigger>
      <DialogContent
        data-theme="light"
        data-testid="rank-grid-help-modal"
        className="sm:max-w-[560px] sm:rounded-2xl"
      >
        <DialogHeader>
          <DialogTitle style={{ color: BRAND_INK, fontSize: 20, fontWeight: 700 }}>
            Understanding your Rank Grid
          </DialogTitle>
        </DialogHeader>

        <div
          style={{
            display: "grid",
            gap: 20,
            marginTop: 4,
            maxHeight: "60vh",
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {sections.map((s) => (
            <section
              key={s.title}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr",
                gap: 12,
                alignItems: "start",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: "#eef2ff",
                  color: BRAND_PRIMARY,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {s.icon}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: BRAND_INK,
                    marginBottom: 4,
                  }}
                >
                  {s.title}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#475569",
                    lineHeight: 1.6,
                  }}
                >
                  {s.body}
                </div>
              </div>
            </section>
          ))}
        </div>

        <div
          style={{
            marginTop: 8,
            paddingTop: 16,
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <a
            href={ctaHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: BRAND_PRIMARY,
              color: "#fff",
              padding: "10px 16px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              transition: "transform 120ms ease, box-shadow 120ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(13,60,252,0.25)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            Get MapGuard <ArrowRight size={14} aria-hidden="true" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default RankGridHelpModal;
