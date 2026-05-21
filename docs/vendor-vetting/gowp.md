# GoWP — Partner Verification (W-AN-4)

**Purpose.** Verify GoWP (https://gowp.com/) meets the pay-per-customer-only
constraint before we commit to them as the white-label fulfillment partner for
WebCare ($79 Basic / $129 Pro retail).

**Public pricing seen (2026-05):** Maintenance from $39/mo per site; +$60/mo
adds content edits ($99/mo total). Public site does not disclose platform
fees, minimums, or contract terms — those are the unknowns this doc resolves.

**Hard constraint (Alex):** zero monthly platform fee, zero minimum spend,
month-to-month. We pay only when we have a paying customer.

---

## A. Verification questions for GoWP

1. Confirm $39/site is the wholesale rate available at the **first site**, with
   no volume tier required to start?
2. Is there **any** monthly platform / subscription / agency fee on top of the
   per-site rate?
3. Is there a **minimum site count** to enroll as a partner (now or after a
   ramp period)?
4. Are sites billed **only while active**? If we cancel a customer mid-month,
   do we continue to pay for that site for the remainder of the billing cycle,
   or does billing stop on cancellation?
5. Is there a **setup / onboarding fee** per site, per partner, or one-time?
6. **Annual contract** required, or strict month-to-month with no termination
   penalty?
7. **Cancellation policy** if a customer churns — pro-rated refund, end-of-cycle
   stop, or forfeit?
8. **White-label terms** — confirm all client-facing reports, portals, and
   email comms carry **WeFixTrades** branding only (no GoWP mentions to the
   end customer)?
9. **SLA on emergency / security tickets** — 24/7 is advertised; what is the
   contractual first-response time and resolution target?
10. Is there an **API or webhook** for programmatic site addition / removal,
    or is onboarding email / ticket / portal-form based?
11. Is there a **pause / freeze** option if a customer site is temporarily
    inactive (e.g., seasonal trade), and at what (if any) cost?
12. Is there a **reseller agreement template** we can review before signing?
    Are there exclusivity, non-solicit, or non-compete clauses?

---

## B. Outreach email draft

**To:** hello@gowp.com (fallback: contact form at https://gowp.com/contact/)
**From:** Alex (WeFixTrades)
**Subject:** Partner enquiry — WeFixTrades (white-label trades SaaS, launching WebCare)

```
Hi GoWP team,

I'm Alex, founder of WeFixTrades — a SaaS platform for trades businesses
(plumbers, electricians, HVAC, builders). We're launching a WordPress care
product called WebCare, retailing at $79/mo (Basic) and $129/mo (Pro), and
we're evaluating white-label maintenance partners. GoWP is at the top of
our list based on your feature set, pricing, and 24/7 support posture.

Before we move forward, twelve quick questions:

1.  Is $39/site the wholesale rate from the first site, with no volume tier
    required to start?
2.  Is there any monthly platform / subscription / agency fee on top of the
    per-site rate?
3.  Is there a minimum site count to enroll as a partner?
4.  Are sites billed only while active? If we cancel a customer mid-month,
    does billing for that site stop, or do we pay through the cycle?
5.  Is there any setup / onboarding fee?
6.  Annual contract required, or month-to-month?
7.  What's the cancellation policy if a customer churns?
8.  White-label terms — can you confirm all reports, portals, and emails to
    end customers carry WeFixTrades branding only?
9.  SLA on emergency / security tickets — what's the contractual first-
    response and resolution target?
10. Do you offer an API or webhook for programmatic site provisioning, or
    is onboarding email / ticket / portal-form based?
11. Is there a pause / freeze option for temporarily inactive customer sites?
12. Could you share your reseller agreement template for review?

Volume expectations: launching with <10 sites in month one, ramping toward
50–100 within six months on the strength of our existing trades-business
customer base.

Happy to jump on a 15-min call once we have answers in writing.

Best,
Alex
WeFixTrades
```

---

## C. Acceptance criteria

### PROCEED if **all** of the following are true:

- $39/site wholesale confirmed from the **first site** with no volume tier
  required.
- **No** monthly platform / subscription / agency fee.
- **No** minimum site count.
- **Month-to-month**; no annual contract requirement.
- Sites **billed only while active**; cancellation stops billing within the
  cycle (or at most, pro-rates to end-of-cycle with no penalty).
- White-label confirmed: WeFixTrades branding only on all customer-facing
  surfaces.
- Setup / onboarding fee is **$0** (or one-time and trivial, < $50/site).

### WALK AWAY if **any** of the following are true:

- **Any** recurring monthly platform / agency / subscription fee on top of
  per-site pricing.
- **Any** minimum site count requirement (now or after a grace period).
- **Annual contract** required, or month-to-month carries a termination
  penalty.
- White-label is partial (e.g., GoWP branding appears in customer emails or
  reports).
- Per-site billing continues after customer cancellation through the rest of
  the cycle **with no offsetting credit** on the next site.

### NEGOTIATE if borderline:

- Setup fee exists but is one-time and absorbable into our first-month
  WebCare margin ($79 retail − $39 wholesale = $40 cushion).
- SLA on emergency tickets is > 4hr first-response — push for 2hr or a
  written commitment.
- API / webhook not available — acceptable short-term if onboarding via
  email / ticket is < 1 business day; revisit at 50+ sites.

---

## D. Backup vendors (if GoWP fails acceptance)

- **WP Buffs** (https://wpbuffs.com/) — 24/7 white-label WP support, partner
  program with tiered per-site pricing (~$67–$200/site retail; partner rates
  not public). Strong on dev work, weaker on bulk maintenance pricing. Next
  to contact if GoWP walks.
- **Maintainn** (https://maintainn.com/) — established WP maintenance, plans
  from ~$59/site retail. No public partner program; would need to ask. Less
  modern dashboard than GoWP, but solid uptime record.
- **Seahawk** (https://seahawkmedia.com/) — agency-focused white-label,
  per-site pricing similar to GoWP, includes content edits at lower tiers.
  Strong partner program. Best backup if both GoWP and WP Buffs fail.

---

## E. Recommended next steps for Alex

- [ ] Send the email in section B to hello@gowp.com (or the contact form).
- [ ] Wait 24–48 hours for response.
- [ ] If GoWP responds and meets acceptance criteria → schedule a 15-min
      call to confirm verbally and request the reseller agreement.
- [ ] If GoWP fails any walk-away criterion → send the same questionnaire
      to WP Buffs (https://wpbuffs.com/contact/) within 24h.
- [ ] If WP Buffs also fails → Maintainn, then Seahawk.
- [ ] Once a partner passes acceptance: kick off W-AN-5 (reseller agreement
      review + WebCare provisioning wiring).
