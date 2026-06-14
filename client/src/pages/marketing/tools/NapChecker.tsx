/**
 * /tools/nap-checker — free NAP (Name / Address / Phone) consistency checker.
 *
 * Checks whether the user's business is listed consistently across the major
 * citation directories. Inputs: canonical business name, address, phone, +
 * optional city. For each directory we find the listing (reusing the #1812
 * citation backend) and compare its Name + Phone against the canonical NAP,
 * flagging genuine mismatches.
 *
 * HONESTY: a host-only / unverified hit (couldn't confirm it's this business)
 * is shown as "couldn't verify", NEVER a false mismatch — mirrors the
 * classifyCitationHit discipline in freeToolsRoutes.ts.
 *
 * Backend: POST /api/tools/nap-checker (server/routes/freeToolsRoutes.ts).
 * Conversion layer: shared ToolLeadCapture + result-aware ToolUpsellCTA
 * (mapguard-setup when mismatches found, full audit when clean).
 */
import { useMemo, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import FreeToolLayout from "@/components/marketing/FreeToolLayout";
import ToolFaq from "@/components/marketing/ToolFaq";
import {
  FreeToolFormField,
  FreeToolFormFieldStyles,
} from "@/components/marketing/FreeToolFormField";
import { PageMeta } from "@/components/seo/PageMeta";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { AlertCircle, CheckCircle2, AlertTriangle, HelpCircle, MinusCircle } from "lucide-react";
import { ToolLeadCapture, ToolUpsellCTA } from "@/components/marketing/ToolLeadCapture";

const TOOL_PATH = "/tools/nap-checker";

type FieldStatus = "match" | "mismatch" | "unknown";
interface NapRow {
  source: string;
  label: string;
  listing: "listed" | "unverified" | "missing" | "unable-to-check";
  url?: string;
  name: FieldStatus;
  phone: FieldStatus;
  note?: string;
}
interface NapResult {
  results: NapRow[];
  summary: {
    checked: number;
    listed: number;
    unverified: number;
    missing: number;
    mismatches: number;
    score: number | null;
  };
  topFixes: string[];
}

const FAQ_ITEMS = [
  {
    question: "What is NAP consistency?",
    answer:
      "NAP stands for Name, Address, and Phone number. NAP consistency means those three details are identical everywhere your business is listed online. Google uses matching NAP across directories as a trust signal — inconsistent listings can hold back your local ranking and confuse customers.",
  },
  {
    question: "Why does a different phone number hurt me?",
    answer:
      "When directories show different phone numbers or name variations for the same business, Google can struggle to confirm they're all the same business — diluting the authority each listing passes to your Google Business Profile. It also means customers might call an old number.",
  },
  {
    question: "Why do some listings say 'couldn't verify'?",
    answer:
      "We only flag a real mismatch when we can confirm the listing is yours AND a field provably differs. If we find a page on a directory but can't confirm it's your specific business (a category page, a different city, or a name we couldn't match), we say 'couldn't verify' rather than guess — we'd rather be honest than alarm you with a false mismatch.",
  },
  {
    question: "How do I fix NAP inconsistencies?",
    answer:
      "Claim each listing and update the Name, Address, and Phone to match your canonical details exactly — including formatting like 'Street' vs 'St'. It's tedious across dozens of directories, which is why MapGuard does it for you.",
  },
];

function StatusPill({ status }: { status: NapRow["listing"] }) {
  const map = {
    listed: { bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.35)", color: "rgb(22,101,52)", label: "Listed", icon: <CheckCircle2 size={12} /> },
    unverified: { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.35)", color: "rgb(146,64,14)", label: "Couldn't verify", icon: <HelpCircle size={12} /> },
    missing: { bg: "rgba(0,0,0,0.04)", border: "rgba(0,0,0,0.12)", color: "rgba(0,0,0,0.55)", label: "Not found", icon: <MinusCircle size={12} /> },
    "unable-to-check": { bg: "rgba(0,0,0,0.04)", border: "rgba(0,0,0,0.12)", color: "rgba(0,0,0,0.45)", label: "Couldn't check", icon: <MinusCircle size={12} /> },
  } as const;
  const s = map[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
        borderRadius: 999,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {s.icon}
      {s.label}
    </span>
  );
}

function FieldCell({ status }: { status: FieldStatus }) {
  if (status === "match") return <CheckCircle2 size={16} color="rgb(34,197,94)" aria-label="Match" />;
  if (status === "mismatch") return <AlertTriangle size={16} color="rgb(245,158,11)" aria-label="Mismatch" />;
  return <span style={{ color: "rgba(0,0,0,0.3)", fontSize: 13 }} aria-label="Not determined">—</span>;
}

export default function NapChecker() {
  const [businessName, setBusinessName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NapResult | null>(null);

  const faqSchemaItems = useMemo(
    () => FAQ_ITEMS.map((f) => ({ question: f.question, answer: f.answer })),
    [],
  );
  useFaqSchema(faqSchemaItems);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!businessName.trim() || !phone.trim()) {
      setError("Please enter your business name and phone number.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/tools/nap-checker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          address: address.trim(),
          phone: phone.trim(),
          city: city.trim(),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || "NAP check failed.");
      setResult({ results: data.results || [], summary: data.summary, topFixes: data.topFixes || [] });
    } catch (err: any) {
      setError(err?.message || "NAP check failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <form onSubmit={submit}>
      <FreeToolFormFieldStyles />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <FreeToolFormField
          id="nap-business"
          label="Business name"
          value={businessName}
          onChange={setBusinessName}
          required
          autoComplete="organization"
          placeholder="e.g. Smith Plumbing"
          testId="input-nap-business"
          helpText="Your canonical business name — exactly how it should appear everywhere."
        />
        <FreeToolFormField
          id="nap-phone"
          label="Phone number"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={setPhone}
          required
          autoComplete="tel"
          placeholder="e.g. (512) 555-0190"
          testId="input-nap-phone"
          helpText="Your canonical phone number. We flag a listing that shows a different number."
        />
        <FreeToolFormField
          id="nap-address"
          label="Street address (optional)"
          value={address}
          onChange={setAddress}
          autoComplete="street-address"
          placeholder="e.g. 123 Main St"
          testId="input-nap-address"
          helpText="Your canonical street address — included on your emailed report for reference."
        />
        <FreeToolFormField
          id="nap-city"
          label="City (optional)"
          value={city}
          onChange={setCity}
          autoComplete="address-level2"
          placeholder="e.g. Austin TX"
          testId="input-nap-city"
          helpText="Helps us confirm a listing is yours and not a different-city business with a similar name."
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        data-testid="button-nap-submit"
        style={{
          marginTop: 2,
          width: "100%",
          padding: "14px 16px",
          borderRadius: 12,
          background: loading ? "rgba(13,60,252,0.6)" : "rgb(13,60,252)",
          color: "rgb(255,255,255)",
          fontSize: 15,
          fontWeight: 700,
          border: "none",
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Checking your listings…" : "Check NAP consistency"}
      </button>
      {error && (
        <div style={{ marginTop: 8, color: "rgb(185,28,28)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </form>
  );

  const score = result?.summary.score ?? null;
  const hasMismatches = (result?.summary.mismatches ?? 0) > 0;
  const scoreColor = score == null
    ? "rgba(0,0,0,0.45)"
    : score >= 90
      ? "rgb(34,197,94)"
      : score >= 60
        ? "rgb(245,158,11)"
        : "rgb(220,38,38)";

  const resultPanel = result ? (
    <div
      style={{
        background: "rgb(255,255,255)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
      }}
    >
      {/* Score + summary */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <div
          data-testid="nap-score"
          style={{
            minWidth: 84,
            textAlign: "center",
            padding: "10px 14px",
            borderRadius: 14,
            border: `1.5px solid ${scoreColor}`,
            background: "rgba(13,60,252,0.02)",
          }}
        >
          <div style={{ fontSize: 26, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>
            {score == null ? "—" : `${score}%`}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(0,0,0,0.45)", marginTop: 4 }}>
            Consistent
          </div>
        </div>
        <div style={{ fontSize: 13, color: "rgba(0,0,0,0.62)", lineHeight: 1.55, flex: "1 1 200px", minWidth: 0 }}>
          Confirmed on <strong>{result.summary.listed}</strong> of {result.summary.checked} directories.
          {result.summary.mismatches > 0 ? (
            <> <strong style={{ color: "rgb(146,64,14)" }}>{result.summary.mismatches}</strong> inconsistency{result.summary.mismatches === 1 ? "" : "ies"} found.</>
          ) : score != null ? (
            <> No inconsistencies found on confirmed listings.</>
          ) : (
            <> We couldn't confirm any listings to compare — try adding your city.</>
          )}
          {result.summary.unverified > 0 && (
            <> {result.summary.unverified} listing{result.summary.unverified === 1 ? "" : "s"} couldn't be verified (not counted against your score).</>
          )}
        </div>
      </div>

      {/* Per-listing table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 360 }} data-testid="nap-table">
          <thead>
            <tr style={{ textAlign: "left", color: "rgba(0,0,0,0.45)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <th style={{ padding: "6px 8px", fontWeight: 700 }}>Directory</th>
              <th style={{ padding: "6px 8px", fontWeight: 700 }}>Listing</th>
              <th style={{ padding: "6px 8px", fontWeight: 700, textAlign: "center" }}>Name</th>
              <th style={{ padding: "6px 8px", fontWeight: 700, textAlign: "center" }}>Phone</th>
            </tr>
          </thead>
          <tbody>
            {result.results.map((row) => (
              <tr key={row.source} data-testid={`nap-row-${row.source}`} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                <td style={{ padding: "8px", color: "rgb(17,24,39)", fontWeight: 600 }}>
                  {row.url ? (
                    <a href={row.url} target="_blank" rel="noreferrer noopener" style={{ color: "rgb(13,60,252)", textDecoration: "none" }}>
                      {row.label}
                    </a>
                  ) : (
                    row.label
                  )}
                  {row.note && (
                    <div style={{ fontSize: 11, color: "rgb(146,64,14)", fontWeight: 500, marginTop: 2 }}>{row.note}</div>
                  )}
                </td>
                <td style={{ padding: "8px" }}><StatusPill status={row.listing} /></td>
                <td style={{ padding: "8px", textAlign: "center" }}><FieldCell status={row.name} /></td>
                <td style={{ padding: "8px", textAlign: "center" }}><FieldCell status={row.phone} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top fixes */}
      {result.topFixes.length > 0 && (
        <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 12, background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.3)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgb(146,64,14)", marginBottom: 6 }}>
            Top inconsistencies to fix
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "rgb(17,24,39)", lineHeight: 1.6 }}>
            {result.topFixes.map((f, i) => (
              <li key={i} data-testid={`nap-fix-${i}`}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {hasMismatches ? (
        <ToolUpsellCTA
          sourceTool="nap-checker"
          tone="fix"
          eyebrow="Next step"
          headline="We'll fix your citations + NAP for you"
          body="MapGuard claims and corrects your listings across the major directories so your Name, Address, and Phone match everywhere — the consistency Google rewards, without the tedious manual work."
          serviceId="mapguard-setup"
          ctaLabel="Fix my NAP consistency"
        />
      ) : (
        <ToolUpsellCTA
          sourceTool="nap-checker"
          tone="audit"
          eyebrow="You're in good shape"
          headline="Your NAP looks consistent — now go deeper"
          body="Consistent NAP is one piece of the local-ranking picture. The Full Audit also checks your citations coverage, keyword rankings, Google Business Profile, and competitors."
          href="/tools/free-audit"
          ctaLabel="Run the Full Audit"
        />
      )}

      <ToolLeadCapture
        sourceTool="nap-checker"
        sourcePage={TOOL_PATH}
        businessName={businessName.trim() || undefined}
        title="Email me this NAP report"
        subtitle="Get the full consistency table and fix list in your inbox so you can work through it. No spam."
      />
    </div>
  ) : null;

  return (
    <MarketingLayout>
      <PageMeta
        title="Free NAP Consistency Checker — check your Name, Address & Phone across directories"
        description="Check whether your business Name, Address, and Phone are consistent across the major citation directories. Get a per-listing consistency table, an overall score, and the top inconsistencies to fix."
        canonical={TOOL_PATH}
        keywords={["nap consistency checker", "nap checker", "citation consistency", "business listing consistency", "local seo nap"]}
      />
      <FreeToolLayout
        eyebrow="Free Tool"
        title="NAP Consistency Checker"
        subtitle="Check your Name, Address & Phone for consistency across the major directories — see exactly which listings don't match."
        path={TOOL_PATH}
        breadcrumbLabel="NAP Consistency Checker"
        form={form}
        result={resultPanel}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)", marginTop: 0 }}>What is NAP consistency?</h2>
        <p>
          NAP stands for Name, Address, and Phone number — the three core
          details that identify your business across the web. When those details
          match everywhere you're listed, Google can confidently connect every
          citation to your Google Business Profile, and that authority helps you
          rank. When they don't match — an old phone number on one directory, an
          abbreviated street on another — the signal gets muddy and your local
          ranking can suffer.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>How this tool works</h2>
        <p>
          Enter your canonical business name and phone (and optionally your
          address and city). We search the major citation directories for your
          listing, and for each one we could confirm is yours, we compare the
          listed Name and Phone against what you entered. You get a per-listing
          table, an overall consistency score, and the specific inconsistencies
          worth fixing first. When we find a directory page but can't confirm
          it's your business, we say so honestly — never a false alarm.
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "rgb(30,30,30)" }}>Frequently asked questions</h2>
        <ToolFaq items={FAQ_ITEMS} />
      </FreeToolLayout>
    </MarketingLayout>
  );
}
