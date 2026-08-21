/**
 * /partners/terms — full program terms for the referral + affiliate programs.
 * Every NUMBER is read from GET /api/partners/program-terms
 * (server/affiliate/programs.ts) so the legal copy never drifts from billing.
 */
import { Link } from "wouter";
import { mkt } from "@/theme/tokens";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { V7Hero, V7Section, V7Container } from "@/components/marketing/v7";
import { useProgramTerms, formatCents } from "./partners.helpers";

function Clause({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: mkt.onDark, margin: "0 0 8px" }}>
        {n}. {title}
      </h2>
      <div style={{ fontSize: 15, lineHeight: 1.65, color: mkt.onDarkMuted }}>{children}</div>
    </div>
  );
}

export default function PartnersTermsPage() {
  const { data: terms } = useProgramTerms();
  const ref = terms?.referral;
  const aff = terms?.affiliate;

  return (
    <MarketingLayout>
      <PageMeta
        title="Partner program terms — WeFixTrades referral & affiliate"
        description="The full terms of the WeFixTrades referral and affiliate programs: rewards, commission tiers, the attribution cookie, payout cadence, and eligibility."
        canonical="/partners/terms"
      />

      <V7Hero
        productName="Partners"
        headline={<>Program terms.</>}
        sub="The rules for both partner programs — the referral reward and the affiliate commission ladder — in plain language."
      />

      <V7Section padding="20px 24px 100px">
        <V7Container maxWidth={780}>
          <p style={{ fontSize: 14, color: mkt.onDarkMuted, marginBottom: 36 }}>
            These terms govern the WeFixTrades referral and affiliate programs. By taking part you agree to them.
            We may update them; material changes are posted here. Questions? <Link href="/contact" style={{ color: mkt.accentOnDark }}>Contact us</Link>.
          </p>

          <Clause n="1" title="Referral program (for customers)">
            {ref ? (
              <>
                Refer another trade business and, once they become a paying customer, you earn{" "}
                <strong style={{ color: mkt.onDark }}>{ref.referrerFreeMonths} free month</strong> of your plan as account credit.
                The business you refer receives a <strong style={{ color: mkt.onDark }}>{ref.refereeTrialDays}-day trial</strong> and{" "}
                <strong style={{ color: mkt.onDark }}>{ref.refereeDiscountPct}% off</strong> their first {ref.refereeDiscountMonths} months.
                Self-referrals (signing up with your own code) are not eligible.
              </>
            ) : (
              "A double-sided referral reward for existing customers who refer another trade business."
            )}
          </Clause>

          <Clause n="2" title="Affiliate program (for marketers)">
            {aff ? (
              <>
                Affiliates earn recurring commission on the subscription revenue of customers they refer, at a rate set by tier:
                <ul style={{ margin: "10px 0 0", paddingLeft: 20 }}>
                  <li><strong style={{ color: mkt.onDark }}>Base — {aff.baseRatePct}%</strong> recurring, from your first referral.</li>
                  <li><strong style={{ color: mkt.onDark }}>Pro — {aff.proRatePct}%</strong> once you have {aff.proThreshold}+ active referred customers, for {aff.proDurationMonths} months.</li>
                  <li><strong style={{ color: mkt.onDark }}>Partner — {aff.partnerRatePct}%+</strong> a negotiated lifetime rate for top partners.</li>
                </ul>
              </>
            ) : (
              "Tiered recurring commission for affiliates who refer paying customers."
            )}
          </Clause>

          <Clause n="3" title="Attribution">
            {aff ? (
              <>
                When someone clicks your link we set a cookie that lasts <strong style={{ color: mkt.onDark }}>{aff.cookieDays} days</strong>.
                If they sign up within that window, the referral is credited to you. Attribution is last-touch —
                the most recent partner link wins. We do not credit self-referrals or fraudulent signups.
              </>
            ) : (
              "Referrals are tracked with a cookie set when someone clicks your link."
            )}
          </Clause>

          <Clause n="4" title="Payouts">
            {aff ? (
              <>
                Affiliate commissions are paid <strong style={{ color: mkt.onDark }}>{aff.payoutCadence}</strong> once your balance reaches the{" "}
                <strong style={{ color: mkt.onDark }}>{formatCents(aff.minPayoutCents)}</strong> minimum. Balances below the minimum roll over.
                Commission accrues while a referred customer keeps a paying subscription and stops if they cancel or refund.
                Referral free-month credits are applied to your own subscription automatically.
              </>
            ) : (
              "Commissions are paid on a monthly cadence once a minimum balance is reached."
            )}
          </Clause>

          <Clause n="5" title="Eligibility & conduct">
            Anyone can join the affiliate program. You may not bid on WeFixTrades trademarks in paid search, use spam,
            misrepresent the product, or self-refer. We may withhold commission for, or remove from the program, any
            partner who breaches these terms or engages in fraud. Commission on refunded or charged-back revenue is reversed.
          </Clause>

          <Clause n="6" title="Changes & termination">
            We may change rates, tiers, or terms, or end either program, at any time. Changes are not retroactive to
            commission already accrued. Either party may leave the program at any time.
          </Clause>

          <p style={{ fontSize: 13, color: mkt.onDarkMuted, marginTop: 40 }}>
            Ready to start? <Link href="/partners" style={{ color: mkt.accentOnDark }}>Get your referral link →</Link>
          </p>
        </V7Container>
      </V7Section>
    </MarketingLayout>
  );
}
