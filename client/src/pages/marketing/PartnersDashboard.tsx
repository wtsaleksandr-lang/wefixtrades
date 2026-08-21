/**
 * /partners/dashboard — an affiliate's self-serve stats view.
 *
 * Reads GET /api/partners/dashboard?code=… (code from the URL query or the
 * lookup form). Shows clicks / signups / tier + progress / commission +
 * payout stats. Public read by design (a marketer checks their own stats by
 * code); the endpoint returns only aggregate stats + the affiliate's own
 * name/email/tier/link.
 */
import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Copy } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { apiRequest } from "@/lib/queryClient";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { V7Hero, V7Section, V7Container, ctaPrimary } from "@/components/marketing/v7";
import {
  FreeToolFormField,
  FreeToolFormFieldStyles,
} from "@/components/marketing/FreeToolFormField";
import {
  formatCents,
  formatRate,
  type AffiliateDashboardSummary,
} from "./partners.helpers";

const cardStyle = {
  background: mkt.cardBg,
  border: `1px solid ${mkt.cardBorder}`,
  borderRadius: 16,
  padding: "22px 22px",
} as const;

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: mkt.onDarkMuted, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: mkt.onDark, lineHeight: 1 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: mkt.onDarkMuted, marginTop: 8, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: mkt.accentOnDark,
        border: `1px solid ${mkt.cardBorder}`,
        borderRadius: 999,
        padding: "5px 12px",
      }}
    >
      {tier} tier
    </span>
  );
}

function DashboardView({ dash }: { dash: AffiliateDashboardSummary }) {
  const [copied, setCopied] = useState(false);
  const { affiliate, stats, tier, earnings } = dash;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(affiliate.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.warn("clipboard write failed", err);
    }
  };

  const progressPct =
    tier.nextTier && tier.toNextTier > 0
      ? Math.min(100, Math.round((stats.activeReferredCustomers / (stats.activeReferredCustomers + tier.toNextTier)) * 100))
      : 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Identity + link */}
      <div style={{ ...cardStyle, padding: "26px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: mkt.onDark }}>{affiliate.name || affiliate.email}</div>
            <div style={{ fontSize: 13, color: mkt.onDarkMuted, marginTop: 4 }}>
              Code <strong style={{ color: mkt.onDark }}>{affiliate.code}</strong>
              {affiliate.status === "pending" && " · pending approval"}
            </div>
          </div>
          <TierBadge tier={affiliate.tier} />
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${mkt.cardBorder}`,
            borderRadius: 12,
            padding: "12px 14px",
            marginTop: 18,
            flexWrap: "wrap",
          }}
        >
          <code style={{ fontSize: 14, color: mkt.onDark, wordBreak: "break-all", flex: 1, minWidth: 0 }}>{affiliate.link}</code>
          <button
            type="button"
            onClick={copyLink}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              border: `1px solid ${mkt.cardBorder}`,
              borderRadius: 8,
              color: mkt.onDark,
              fontSize: 13,
              padding: "8px 12px",
              cursor: "pointer",
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Traffic + conversion stats */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}
        className="max-[720px]:!grid-cols-2"
      >
        <StatTile label="Clicks" value={stats.clicks.toLocaleString()} />
        <StatTile label="Signups" value={stats.signups.toLocaleString()} />
        <StatTile label="Paying" value={stats.convertedCustomers.toLocaleString()} />
        <StatTile label="Active" value={stats.activeReferredCustomers.toLocaleString()} />
      </div>

      {/* Tier progress */}
      <div style={{ ...cardStyle, padding: "24px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: mkt.onDark }}>
            Commission rate: {formatRate(affiliate.commissionRate)}
          </div>
          {tier.nextTier && tier.toNextTier > 0 ? (
            <div style={{ fontSize: 13, color: mkt.onDarkMuted }}>
              {tier.toNextTier} more active {tier.toNextTier === 1 ? "customer" : "customers"} to reach {tier.nextTier} tier
            </div>
          ) : (
            <div style={{ fontSize: 13, color: mkt.onDarkMuted }}>Top of the self-serve ladder</div>
          )}
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <div style={{ width: `${progressPct}%`, height: "100%", background: mkt.accent, borderRadius: 999 }} />
        </div>
      </div>

      {/* Earnings + payout */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}
        className="max-[720px]:!grid-cols-2"
      >
        <StatTile label="Est. / month" value={formatCents(earnings.estimatedMonthlyCents)} hint="Estimate at your current rate" />
        <StatTile label="Pending" value={formatCents(earnings.pendingCents)} />
        <StatTile label="Approved" value={formatCents(earnings.approvedCents)} />
        <StatTile label="Paid" value={formatCents(earnings.paidCents)} hint={`${formatCents(earnings.minPayoutCents)} payout minimum`} />
      </div>

      <p style={{ fontSize: 13, color: mkt.onDarkMuted }}>
        Numbers are phase-1 estimates until the first billing cycle. See the{" "}
        <Link href="/partners/terms" style={{ color: mkt.accentOnDark }}>program terms</Link>.
      </p>
    </div>
  );
}

function LookupForm({ initial, onLookup }: { initial: string; onLookup: (code: string) => void }) {
  const [code, setCode] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) onLookup(code.trim().toUpperCase());
      }}
      style={{ ...cardStyle, padding: "30px 28px", maxWidth: 460 }}
    >
      <FreeToolFormFieldStyles />
      <h3 style={{ fontSize: 20, fontWeight: 700, color: mkt.onDark, margin: "0 0 6px" }}>Check your stats</h3>
      <p style={{ fontSize: 14, lineHeight: 1.55, color: mkt.onDarkMuted, margin: "0 0 18px" }}>
        Enter your affiliate code to see clicks, signups, and earnings.
      </p>
      <FreeToolFormField
        id="dash-code"
        label="Affiliate code"
        theme="dark"
        value={code}
        onChange={setCode}
        helpText="The code from your referral link, e.g. the part after /ref/."
        required
      />
      <button
        type="submit"
        disabled={!code.trim()}
        style={{ ...ctaPrimary, marginTop: 16, width: "100%", border: "none", cursor: code.trim() ? "pointer" : "not-allowed", opacity: code.trim() ? 1 : 0.55 }}
      >
        View dashboard <ArrowRight size={16} />
      </button>
      <p style={{ fontSize: 13, color: mkt.onDarkMuted, marginTop: 16 }}>
        Not an affiliate yet? <Link href="/partners" style={{ color: mkt.accentOnDark }}>Get your link →</Link>
      </p>
    </form>
  );
}

export default function PartnersDashboardPage() {
  const search = useSearch();
  const initialCode = (new URLSearchParams(search).get("code") || "").toUpperCase();
  const [code, setCode] = useState(initialCode);

  // Keep the field in sync if the URL query changes (e.g. arriving from signup).
  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);

  const query = useQuery<AffiliateDashboardSummary>({
    queryKey: ["/api/partners/dashboard", code],
    enabled: !!code,
    retry: false,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/partners/dashboard?code=${encodeURIComponent(code)}`);
      return (await res.json()) as AffiliateDashboardSummary;
    },
  });

  return (
    <MarketingLayout>
      <PageMeta
        title="Affiliate dashboard — WeFixTrades Partners"
        description="Track your WeFixTrades affiliate performance: clicks, signups, commission tier, and earnings."
        canonical="/partners/dashboard"
      />

      <V7Hero
        productName="Partners"
        headline={<>Your dashboard.</>}
        sub="Clicks, signups, your commission tier, and earnings — updated as your referrals come in."
      />

      <V7Section padding="20px 24px 100px">
        <V7Container maxWidth={840}>
          {!code || query.isError ? (
            <>
              {query.isError && (
                <p style={{ fontSize: 14, color: mkt.onDarkMuted, marginBottom: 20 }} role="alert">
                  We couldn't find an affiliate with that code. Check it and try again.
                </p>
              )}
              <LookupForm initial={code} onLookup={setCode} />
            </>
          ) : query.isLoading ? (
            <p style={{ fontSize: 15, color: mkt.onDarkMuted }}>Loading your stats…</p>
          ) : query.data ? (
            <DashboardView dash={query.data} />
          ) : null}
        </V7Container>
      </V7Section>
    </MarketingLayout>
  );
}
