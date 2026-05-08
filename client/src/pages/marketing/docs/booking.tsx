import { useEffect } from "react";
import DocsLayout, { Step, InfoBox, DocH2, DocH3, Checklist, Accordion } from "@/components/marketing/DocsLayout";
import { mkt } from "@/theme/tokens";

export default function DocsBooking() {
  useEffect(() => { document.title = "Booking + Deposits — QuoteQuick Pro Docs"; }, []);

  return (
    <DocsLayout
      activeSlug="booking"
      title="Booking + Deposits"
      description="Let customers book a time and pay a deposit right after they see their estimate — without a phone call."
    >

      <DocH2>What Booking Does</DocH2>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 16 }}>
        After a customer sees their estimate, they can:
      </p>
      <Checklist items={[
        "Choose an available time slot from your calendar",
        "Pay a deposit to confirm the booking (via Stripe)",
        "Receive an instant confirmation email (and SMS on Pro)",
        "Reschedule or cancel within limits you set",
      ]} />
      <InfoBox type="tip">
        Booking is available on <strong>Pro and Elite plans</strong>. It works with the estimate flow — customers can't book without seeing a quote first (unless you set your calculator to Booking Only mode).
      </InfoBox>

      <DocH2>Enabling Booking</DocH2>
      <Step n={1} title="Open your calculator in the wizard">
        Go to Dashboard → your calculator → Edit. In Step 1 (Basic Setup), set the <strong>Calculator Type</strong> to <em>Estimate + Booking</em> or <em>Booking Only</em>.
      </Step>
      <Step n={2} title="Configure your availability">
        Go to the <strong>Booking Settings</strong> tab. Set:
        <Checklist items={[
          "Your working days (e.g. Mon–Fri)",
          "Available hours (e.g. 8am–5pm)",
          "Slot duration (e.g. 1 hour, 2 hours, half day)",
          "Buffer time between jobs (e.g. 30 min travel buffer)",
          "Max bookings per day",
        ]} />
      </Step>
      <Step n={3} title="Connect Stripe for deposits">
        Go to Dashboard → Settings → Payments → Connect Stripe. Follow the Stripe Express onboarding. Once connected, you can set a deposit amount or percentage per calculator.
      </Step>
      <Step n={4} title="Publish your calculator">
        Click Publish. Customers now see a calendar after their estimate and can book + pay in one flow.
      </Step>

      <DocH2>Deposit Settings</DocH2>
      <DocH3>Deposit amount options</DocH3>
      <Checklist items={[
        "Fixed amount — e.g. $200 deposit regardless of estimate size",
        "Percentage — e.g. 20% of the estimate total",
        "No deposit — collect booking only, no payment required",
      ]} />
      <InfoBox type="info">
        Deposits go directly to your Stripe account via Stripe Connect Express. QuoteQuick Pro never holds your money — funds settle in your Stripe account within 2 business days.
      </InfoBox>

      <DocH2>Confirmations</DocH2>
      <DocH3>What happens automatically:</DocH3>
      <Checklist items={[
        "Customer receives booking confirmation email (with date, time, deposit receipt)",
        "You receive a notification email instantly",
        "SMS confirmation to the customer (Pro plan — requires Twilio setup)",
        "SMS notification to you (Pro plan)",
        "Booking appears in Dashboard → Bookings tab",
      ]} />

      <DocH2>Cancellation + Reschedule Rules</DocH2>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 12 }}>
        Configure these in Dashboard → your calculator → Booking Settings → Cancellation Policy:
      </p>
      <Checklist items={[
        "Allow customer to cancel: toggle on/off",
        "Cancellation window: e.g. only allow cancellation 24h+ before the appointment",
        "Allow reschedule: toggle on/off",
        "Refund deposit on cancellation: toggle on/off (processed via Stripe)",
      ]} />
      <InfoBox type="warn">
        Deposit refunds are processed through Stripe. You can also manually refund from your Stripe dashboard at any time, regardless of the cancellation policy setting.
      </InfoBox>

      <DocH2>Common Questions</DocH2>

      <Accordion title="Can I prevent double-booking?" icon="🚫">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.7, margin: 0 }}>
          Yes. Once a slot is booked, it's automatically removed from the available times. If two customers are on the booking page simultaneously, only the first to confirm gets the slot — the second sees an "unavailable" message and is shown the next available slot.
        </p>
      </Accordion>

      <Accordion title="Can I manually block time off?" icon="📅">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.7, margin: 0 }}>
          Yes. In Dashboard → Bookings, use the <strong>Block Time</strong> button to mark any date or time range as unavailable (e.g. holidays, other jobs not in the system).
        </p>
      </Accordion>

      <Accordion title="Does it connect to Google Calendar or Outlook?" icon="📆">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.7, margin: 0 }}>
          Google Calendar and Outlook sync are on our roadmap. Currently, bookings appear in your QuoteQuick Pro Dashboard only. You can export bookings as CSV from the Bookings tab.
        </p>
      </Accordion>

      <Accordion title="What if Stripe isn't set up — can I still use booking?" icon="💳">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.7, margin: 0 }}>
          Yes. Set the deposit amount to $0 or "No deposit required". Customers can still book a time without paying — you just won't collect a deposit upfront.
        </p>
      </Accordion>

    </DocsLayout>
  );
}
