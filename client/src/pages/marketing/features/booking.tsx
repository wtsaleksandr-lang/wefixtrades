import { Calendar, DollarSign, Bell, Ban, ArrowRight } from "lucide-react";
import FeaturePage, { type FeaturePageConfig } from "@/components/marketing/FeaturePage";
import { mkt, colors, shadows } from "@/theme/tokens";

/* ── Mockup ──────────────────────────────────── */
function BookingMockup() {
  const days = [14, 15, 16, 17, 18, 19, 20];
  const unavail = new Set([15, 18]);
  const selected = 17;

  return (
    <div
      style={{
        background: mkt.bg,
        border: `1px solid ${mkt.onDarkBorder}`,
        borderRadius: 20,
        padding: 28,
        width: "100%",
        maxWidth: 400,
        boxShadow: shadows.xl,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: mkt.onDarkMuted, marginBottom: 2 }}>Available slots</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: mkt.text }}>March 2026</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, background: "rgba(102,232,250,0.10)", color: mkt.accent, padding: "4px 12px", borderRadius: 20 }}>
          Deposits via Stripe ✓
        </div>
      </div>

      {/* Day labels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: mkt.onDarkMuted, padding: "4px 0" }}>{d}</div>
        ))}
      </div>

      {/* Calendar days */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 18 }}>
        {days.map((d) => {
          const isSel = d === selected;
          const isNA = unavail.has(d);
          return (
            <div key={d} style={{
              textAlign: "center", padding: "9px 0", borderRadius: 9,
              fontSize: 13, fontWeight: isSel ? 700 : 500,
              background: isSel ? mkt.accent : isNA ? "transparent" : mkt.surface,
              color: isSel ? "#FFFFFF" : isNA ? mkt.border : mkt.text,
              border: isSel ? "none" : isNA ? "none" : `1px solid ${mkt.onDarkBorder}`,
            }}>
              {isNA ? <span style={{ textDecoration: "line-through" }}>{d}</span> : d}
            </div>
          );
        })}
      </div>

      {/* Time slots */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        {[
          { time: "9:00 AM", sel: true, spots: null },
          { time: "11:30 AM", sel: false, spots: "2 left" },
          { time: "2:00 PM", sel: false, spots: null },
        ].map(({ time, sel, spots }) => (
          <div key={time} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "11px 14px", borderRadius: 10,
            background: sel ? mkt.accent : mkt.surface,
            border: sel ? "none" : `1px solid ${mkt.onDarkBorder}`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: sel ? "#FFFFFF" : mkt.text }}>{time}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {spots && <span style={{ fontSize: 11, color: mkt.orange }}>{spots}</span>}
              {sel && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>Selected ✓</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Deposit */}
      <div style={{ background: "#D1FAE5", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#065F46" }}>Deposit Required</div>
            <div style={{ fontSize: 11, color: "#047857", marginTop: 2 }}>Processed instantly via Stripe</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#065F46" }}>$200</div>
        </div>
        <div style={{ marginTop: 12, background: "#065F46", borderRadius: 9, padding: "10px", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>
          Confirm &amp; Pay Deposit →
        </div>
      </div>
    </div>
  );
}

const config: FeaturePageConfig = {
  meta: { title: "Booking + Deposits — QuoteQuick Pro | No-Show Prevention Built In" },
  hero: {
    badge: "Booking Engine",
    badgeColor: colors.accent.blue,
    headline: "Convert Estimates Into Paid Appointments — Automatically",
    highlightedWords: ["Paid Appointments", "Automatically"],
    sub: "Customers pick a time, pay a deposit, and you get an instant notification — no phone calls, no chasing, no no-shows.",
    accentColor: colors.accent.blue,
  },
  demo: {
    label: "How Booking Works",
    title: "From estimate to confirmed deposit in under 2 minutes",
    description: "Once a customer sees their estimate, they can immediately book a time slot and pay a deposit via Stripe — all within your calculator widget. You see the booking in your dashboard the moment it happens.",
    bullets: [
      "Real-time slot availability managed from your dashboard",
      "Stripe Connect deposit collection — no setup fees, no monthly costs",
      "Automated confirmation emails to customer and business",
      "Double-booking prevention built in",
    ],
    bulletColor: colors.accent.blue,
    mockup: BookingMockup,
  },
  benefits: [
    {
      icon: DollarSign,
      title: "Deposits Prevent No-Shows",
      body: "Customers who've paid a deposit cancel 80% less often than those who book for free. Protect your time and revenue.",
      color: mkt.accent, bg: mkt.accentTint,
    },
    {
      icon: Calendar,
      title: "Zero Phone Tag",
      body: "No more 'What time works for you?' back-and-forth. Customers self-serve on your live availability.",
      color: colors.accent.blue, bg: colors.accent.blueTint,
    },
    {
      icon: Bell,
      title: "Instant Notifications",
      body: "Get a push, email, or SMS the moment a booking is confirmed — so you can prepare for the job immediately.",
      color: "#7C3AED", bg: "#F5F3FF",
    },
    {
      icon: Ban,
      title: "No Double Bookings",
      body: "Slots are locked the moment a booking is confirmed. Your availability stays accurate across all open calculators.",
      color: mkt.orange, bg: mkt.orangeTint,
    },
  ],
  steps: [
    { num: "01", title: "Set Your Availability", body: "Configure your working hours, slot duration, buffer times, and any blackout dates in your dashboard — takes under 5 minutes." },
    { num: "02", title: "Customer Picks a Slot", body: "After seeing their estimate, customers see your live availability and pick a time that works. No logins, no friction." },
    { num: "03", title: "Deposit Collected", body: "Stripe processes the deposit immediately. Funds go directly to your connected bank account, minus Stripe's standard fee." },
  ],
  faqs: [
    { q: "How does Stripe Connect work?", a: "You connect your Stripe account (free) to QuoteQuick Pro. Deposits are charged directly by your business — we never hold your funds. Stripe's standard processing fee (1.7–2.9% + 30¢) applies." },
    { q: "Can customers cancel their booking?", a: "Cancellation is handled by you. You can configure a cancellation policy in your dashboard — full refund, partial refund, or no-refund windows — and it's shown to customers before they pay." },
    { q: "What if a slot gets double-booked?", a: "It can't. The moment a booking is confirmed, that slot is locked system-wide. A customer trying to book the same slot will see it as unavailable." },
    { q: "Do I need Stripe already?", a: "No. If you don't have a Stripe account, we'll walk you through creating one during setup. It takes around 5 minutes and requires standard business verification." },
    { q: "Can I use booking without deposits?", a: "Yes. Deposits are optional. You can configure booking-only (no deposit), deposit-required, or deposit-optional modes per calculator." },
  ],
  cta: {
    headline: "Stop Losing Jobs to No-Shows",
    sub: "Add booking and deposit collection to your calculator today — free to set up, no credit card required.",
  },
};

export default function BookingPage() {
  return <FeaturePage config={config} />;
}
