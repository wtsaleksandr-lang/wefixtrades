/**
 * AuditTabHelpModal — shared explainer modal for the 5 new Free-Audit
 * tab tools. One factory, one consistent surface — each tool passes its
 * own title + sections instead of cloning the RankGridHelpModal pattern
 * five times. Keeps the help-modal voice + layout uniform across tabs.
 *
 * Light-theme locked (data-theme="light") so the white background +
 * brand-blue accents survive the hardcoded-color guard.
 */

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HelpCircle, ArrowRight } from "lucide-react";

const BRAND_PRIMARY = "#0d3cfc";
const BRAND_INK = "#1E1E1E";

export interface HelpSection {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}

export interface AuditTabHelpModalProps {
  /** Modal title (e.g. "Understanding your SEO Checklist") */
  title: string;
  /** Sections shown in the modal body (icon + title + body). */
  sections: HelpSection[];
  /** Optional CTA at the bottom (label + href). Omit to skip. */
  cta?: { label: string; href: string };
  /** Aria-label for the trigger button. */
  triggerLabel: string;
  /** data-testid for the trigger + modal (pair them by suffix). */
  testid: string;
}

function HelpTrigger({ testid, label }: { testid: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
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
        flexShrink: 0,
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

export default function AuditTabHelpModal({
  title,
  sections,
  cta,
  triggerLabel,
  testid,
}: AuditTabHelpModalProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <span>
          <HelpTrigger testid={`${testid}-trigger`} label={triggerLabel} />
        </span>
      </DialogTrigger>
      <DialogContent
        data-theme="light"
        data-testid={`${testid}-modal`}
        className="sm:max-w-[560px] sm:rounded-2xl"
      >
        <DialogHeader>
          <DialogTitle style={{ color: BRAND_INK, fontSize: 20, fontWeight: 700 }}>
            {title}
          </DialogTitle>
        </DialogHeader>

        <div
          style={{
            display: "grid",
            gap: 18,
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

        {cta && (
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
              href={cta.href}
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
              {cta.label} <ArrowRight size={14} aria-hidden="true" />
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
