/**
 * /partners — public partner-program landing.
 *
 * Explains BOTH programs (peer REFERRAL — double-sided free month; public
 * AFFILIATE — tiered recurring cash) and hosts the self-serve affiliate signup
 * form (POST /api/partners/signup). On success it shows the marketer their
 * referral link + a deep link to their dashboard. All program NUMBERS come from
 * GET /api/partners/program-terms (server/affiliate/programs.ts), never
 * hardcoded, so the copy can't drift from billing.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, Gift, TrendingUp } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { apiRequest } from "@/lib/queryClient";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { V7Hero, V7Section, V7Container, V7SectionHeading, ctaPrimary } from "@/components/marketing/v7";
import {
  FreeToolFormField,
  FreeToolFormSelect,
  FreeToolFormFieldStyles,
} from "@/components/marketing/FreeToolFormField";
import {
  useProgramTerms,
  formatCents,
  type ProgramTerms,
  type SignupResponse,
} from "./partners.helpers";

const cardStyle = {
  background: mkt.cardBg,
  border: `1px solid ${mkt.cardBorder}`,
  borderRadius: 18,
  padding: "28px 26px",
} as const;

function ProgramCard({
  icon,
  tag,
  title,
  children,
}: {
  icon: React.ReactNode;
  tag: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 38,
            height: 38,
            borderRadius: 10,
            background: "rgba(13,60,252,0.12)",
            color: mkt.accentOnDark,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: mkt.accentOnDark,
            fontWeight: 600,
          }}
        >
          {tag}
        </span>
      </div>
      <h3 style={{ fontSize: 22, fontWeight: 700, color: mkt.onDark, margin: "0 0 12px" }}>{title}</h3>
      <div style={{ fontSize: 15, lineHeight: 1.6, color: mkt.onDarkMuted, display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <Check size={16} color={mkt.accentOnDark} style={{ flexShrink: 0, marginTop: 2 }} />
      <span>{children}</span>
    </div>
  );
}

function TierLadder({ terms }: { terms: ProgramTerms["affiliate"] }) {
  const tiers = [
    { name: "Base", rate: `${terms.baseRatePct}%`, note: "Recurring, from your first referral." },
    { name: "Pro", rate: `${terms.proRatePct}%`, note: `Once you have ${terms.proThreshold}+ active customers — for ${terms.proDurationMonths} months.` },
    { name: "Partner", rate: `${terms.partnerRatePct}%+`, note: "Negotiated lifetime rate for top partners." },
  ];
  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}
      className="max-[720px]:!grid-cols-1"
    >
      {tiers.map((t) => (
        <div key={t.name} style={cardStyle}>
          <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: mkt.onDarkMuted, marginBottom: 8 }}>
            {t.name}
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, color: mkt.onDark, lineHeight: 1, marginBottom: 10 }}>{t.rate}</div>
          <div style={{ fontSize: 14, lineHeight: 1.55, color: mkt.onDarkMuted }}>{t.note}</div>
        </div>
      ))}
    </div>
  );
}

function SignupForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("");
  const [payoutDetails, setPayoutDetails] = useState("");
  const [result, setResult] = useState<SignupResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = { email };
      if (name.trim()) body.name = name.trim();
      if (payoutMethod) body.payoutMethod = payoutMethod;
      if (payoutDetails.trim()) body.payoutDetails = payoutDetails.trim();
      const res = await apiRequest("POST", "/api/partners/signup", body);
      return (await res.json()) as SignupResponse;
    },
    onSuccess: (data) => setResult(data),
  });

  const copyLink = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      // Clipboard blocked (permissions / insecure context) — the link is shown
      // in full below, so the user can still select + copy it manually.
      console.warn("clipboard write failed", err);
    }
  };

  if (result) {
    return (
      <div style={{ ...cardStyle, padding: "32px 30px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: mkt.accentOnDark, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          <Check size={16} /> {result.existing ? "You're already signed up" : "You're in"}
        </div>
        <h3 style={{ fontSize: 22, fontWeight: 700, color: mkt.onDark, margin: "0 0 8px" }}>Your referral link</h3>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: mkt.onDarkMuted, margin: "0 0 18px" }}>
          Share this link. Every customer who signs up through it is credited to you
          {result.status === "pending" ? " once your account is approved." : "."}
        </p>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${mkt.cardBorder}`,
            borderRadius: 12,
            padding: "12px 14px",
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <code style={{ fontSize: 14, color: mkt.onDark, wordBreak: "break-all", flex: 1, minWidth: 0 }}>{result.referralLink}</code>
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
        <Link href={`/partners/dashboard?code=${encodeURIComponent(result.code)}`} style={{ ...ctaPrimary }}>
          View your dashboard <ArrowRight size={16} />
        </Link>
      </div>
    );
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (emailValid) mutation.mutate();
      }}
      style={{ ...cardStyle, padding: "30px 28px", display: "flex", flexDirection: "column", gap: 2 }}
    >
      <FreeToolFormFieldStyles />
      <h3 style={{ fontSize: 22, fontWeight: 700, color: mkt.onDark, margin: "0 0 6px" }}>Become an affiliate</h3>
      <p style={{ fontSize: 14, lineHeight: 1.55, color: mkt.onDarkMuted, margin: "0 0 20px" }}>
        No account needed. Get your link in seconds and start earning recurring commission.
      </p>
      <FreeToolFormField
        id="aff-email"
        label="Email"
        type="email"
        theme="dark"
        value={email}
        onChange={setEmail}
        helpText="Where we send your link, stats, and payouts. We keep it private."
        required
      />
      <FreeToolFormField
        id="aff-name"
        label="Name (optional)"
        theme="dark"
        value={name}
        onChange={setName}
        helpText="Shown on your payout records. Leave blank to use your email."
      />
      <FreeToolFormSelect
        id="aff-payout"
        label="Payout method (optional)"
        theme="dark"
        value={payoutMethod}
        onChange={setPayoutMethod}
        helpText="How you'd like to be paid. You can set this later from your dashboard."
      >
        <option value="">Choose later</option>
        <option value="paypal">PayPal</option>
        <option value="stripe">Stripe</option>
        <option value="bank">Bank transfer</option>
      </FreeToolFormSelect>
      {payoutMethod && (
        <FreeToolFormField
          id="aff-payout-details"
          label="Payout details (optional)"
          theme="dark"
          value={payoutDetails}
          onChange={setPayoutDetails}
          helpText="e.g. your PayPal email. Optional now — add it before your first payout."
        />
      )}
      {mutation.isError && (
        <p style={{ fontSize: 13, color: mkt.onDarkMuted, margin: "6px 0 0" }} role="alert">
          Something went wrong. Please check your email and try again.
        </p>
      )}
      <button
        type="submit"
        disabled={!emailValid || mutation.isPending}
        style={{
          ...ctaPrimary,
          marginTop: 16,
          width: "100%",
          border: "none",
          cursor: emailValid && !mutation.isPending ? "pointer" : "not-allowed",
          opacity: emailValid && !mutation.isPending ? 1 : 0.55,
        }}
      >
        {mutation.isPending ? "Creating your link…" : "Get my referral link"} <ArrowRight size={16} />
      </button>
    </form>
  );
}

export default function PartnersPage() {
  const { data: terms } = useProgramTerms();
  const ref = terms?.referral;
  const aff = terms?.affiliate;

  return (
    <MarketingLayout>
      <PageMeta
        title="Partner with WeFixTrades — refer & earn, or become an affiliate"
        description="Two ways to earn with WeFixTrades: refer a fellow trade business for a free month each, or join our affiliate program for recurring commission on every customer you send."
        canonical="/partners"
        keywords={["wefixtrades affiliate", "trades software referral program", "affiliate commission"]}
      />

      <V7Hero
        productName="Partners"
        headline={<>Earn with WeFixTrades.</>}
        sub="Refer a fellow trade business and you both get a free month — or join our affiliate program and earn recurring cash on every customer you send our way."
        ctas={[
          { label: "Become an affiliate", href: "#affiliate" },
          { label: "Check your stats", href: "/partners/dashboard" },
        ]}
      />

      {/* Two programs, side by side */}
      <V7Section padding="20px 24px 60px">
        <V7Container maxWidth={1040}>
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 20 }}
            className="max-[720px]:!grid-cols-1"
          >
            <ProgramCard icon={<Gift size={20} />} tag="For customers" title="Refer a friend">
              {ref ? (
                <>
                  <Bullet>
                    You get <strong style={{ color: mkt.onDark }}>{ref.referrerFreeMonths} free month</strong> for every trade business you refer that becomes a customer.
                  </Bullet>
                  <Bullet>
                    They get a <strong style={{ color: mkt.onDark }}>{ref.refereeTrialDays}-day trial</strong> plus <strong style={{ color: mkt.onDark }}>{ref.refereeDiscountPct}% off</strong> their first {ref.refereeDiscountMonths} months.
                  </Bullet>
                  <Bullet>Your referral link lives in your portal — share it any time.</Bullet>
                </>
              ) : (
                <Bullet>Double-sided reward — you and the business you refer both win.</Bullet>
              )}
            </ProgramCard>

            <ProgramCard icon={<TrendingUp size={20} />} tag="For marketers" title="Affiliate program">
              {aff ? (
                <>
                  <Bullet>
                    Earn <strong style={{ color: mkt.onDark }}>{aff.baseRatePct}% recurring</strong> commission on every customer you refer.
                  </Bullet>
                  <Bullet>
                    Grow to <strong style={{ color: mkt.onDark }}>{aff.proRatePct}%</strong> at {aff.proThreshold}+ active customers, with negotiated rates for top partners.
                  </Bullet>
                  <Bullet>
                    {aff.cookieDays}-day cookie, {aff.payoutCadence} payouts, {formatCents(aff.minPayoutCents)} minimum.
                  </Bullet>
                </>
              ) : (
                <Bullet>Tiered recurring commission with monthly payouts.</Bullet>
              )}
            </ProgramCard>
          </div>
        </V7Container>
      </V7Section>

      {/* Affiliate tiers + signup */}
      <V7Section id="affiliate" variant="subtle" padding="72px 24px">
        <V7Container maxWidth={1040}>
          <V7SectionHeading
            align="left"
            eyebrow="Affiliate program"
            title="Commission that grows with you"
            sub={
              aff
                ? `Start at ${aff.baseRatePct}%. The more customers you bring, the more you earn — up to a negotiated partner rate.`
                : "Start earning recurring commission from your first referral."
            }
          />
          {aff && <div style={{ marginBottom: 40 }}><TierLadder terms={aff} /></div>}
          <div
            style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: 32, alignItems: "start" }}
            className="max-[720px]:!grid-cols-1"
          >
            <div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: mkt.onDark, margin: "0 0 14px" }}>How it works</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, color: mkt.onDarkMuted, fontSize: 15, lineHeight: 1.6 }}>
                <Bullet>Sign up with your email — you get a unique referral link instantly.</Bullet>
                <Bullet>Share it. We track every click and signup for {aff ? aff.cookieDays : 90} days.</Bullet>
                <Bullet>Earn recurring commission for as long as your referrals stay customers.</Bullet>
                <Bullet>Track clicks, signups, and earnings any time from your dashboard.</Bullet>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: mkt.onDarkMuted, marginTop: 20 }}>
                See the full <Link href="/partners/terms" style={{ color: mkt.accentOnDark }}>program terms</Link>.
              </p>
            </div>
            <SignupForm />
          </div>
        </V7Container>
      </V7Section>
    </MarketingLayout>
  );
}
