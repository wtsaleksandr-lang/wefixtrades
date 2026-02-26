import { useEffect } from "react";
import DocsLayout, { InfoBox, DocH2, DocH3, Checklist, Accordion } from "@/components/marketing/DocsLayout";

export default function DocsTroubleshooting() {
  useEffect(() => { document.title = "Troubleshooting — QuickQuotePro Docs"; }, []);

  return (
    <DocsLayout
      activeSlug="troubleshooting"
      title="Troubleshooting"
      description="Common issues and how to fix them in under 2 minutes."
    >

      <InfoBox type="info">
        Can't find a fix here? <a href="/contact" style={{ color: "#4A7C6F", fontWeight: 600 }}>Contact support</a> — we typically respond within 2 hours.
      </InfoBox>

      <DocH2>Calculator & Widget</DocH2>

      <Accordion title="My calculator isn't showing on my website" icon="❓">
        <DocH3>Check these first:</DocH3>
        <Checklist items={[
          "Is the Calculator ID in the embed code correct? Copy it fresh from Dashboard → Deploy",
          "Is the script tag placed inside the <body> (not <head>)?",
          "Is the <div id=\"qqp-widget\"></div> present on the same page as the script?",
          "Is your calculator published? (Status must show Published, not Draft)",
          "Try opening your page in an Incognito window to rule out browser cache",
        ]} />
      </Accordion>

      <Accordion title="The widget loads but shows no content / blank white area" icon="⬜">
        <Checklist items={[
          "Check the browser console (F12 → Console tab) for JavaScript errors",
          "The widget div needs a minimum height — add style=\"min-height: 500px\" to the div",
          "Make sure no other script on your page conflicts (check for Content Security Policy headers)",
          "Try the iframe embed option instead of the script embed",
        ]} />
      </Accordion>

      <Accordion title="Estimate result is not what I expected" icon="🔢">
        <Checklist items={[
          "Go to Dashboard → Edit Calculator → Pricing tab and review your formula",
          "Check if the minimum and maximum rates are set correctly",
          "If using multipliers, verify each multiplier value is intentional",
          "Try the Preview button in the Dashboard to test inputs vs outputs",
          "If you recently changed the formula, republish the calculator",
        ]} />
      </Accordion>

      <Accordion title="Custom domain shows a security warning" icon="🔒">
        <Checklist items={[
          "DNS may not have fully propagated yet — wait up to 30 minutes and refresh",
          "Check that the CNAME record is correctly pointing to cname.quickquotepro.com",
          "If using Cloudflare, make sure the record is set to DNS Only (grey cloud), not Proxied",
          "Still broken after 1 hour? Contact support with your domain name",
        ]} />
      </Accordion>

      <DocH2>Leads & Notifications</DocH2>

      <Accordion title="I'm not receiving lead notification emails" icon="📧">
        <Checklist items={[
          "Check your spam folder — some email providers flag automated notifications",
          "Go to Dashboard → Settings → Notifications and verify your email address",
          "Check the email address is spelled correctly",
          "Add noreply@quickquotepro.com to your email contacts/whitelist",
          "If you recently changed email, click the verification link we sent",
        ]} />
      </Accordion>

      <Accordion title="Leads are not appearing in my Dashboard" icon="📋">
        <Checklist items={[
          "Refresh the Leads tab — it may need a manual refresh after a new submission",
          "Check the date filter isn't excluding recent leads (default shows last 30 days)",
          "Make sure the lead capture form on your calculator has required fields set",
          "Submit a test lead yourself to confirm the flow is working end-to-end",
        ]} />
      </Accordion>

      <DocH2>Booking & Payments</DocH2>

      <Accordion title="Booking calendar is not showing after the estimate" icon="📅">
        <Checklist items={[
          "Calculator type must be set to Estimate + Booking or Booking Only",
          "Check that you have at least one available time slot configured",
          "Verify Booking Settings are saved and the calculator is republished",
          "Make sure today's date isn't blocked or in the past",
        ]} />
      </Accordion>

      <Accordion title="Stripe deposit not being charged" icon="💳">
        <Checklist items={[
          "Go to Dashboard → Settings → Payments — verify Stripe is connected (green status)",
          "Check the deposit amount is set to more than $0",
          "Your Stripe account must be fully verified for charges to go through",
          "Check Stripe's own dashboard for any failed payment logs",
        ]} />
      </Accordion>

      <Accordion title="Customer received a booking confirmation but I didn't get a notification" icon="🔔">
        <Checklist items={[
          "Check Dashboard → Bookings — the booking will appear there regardless",
          "Verify your notification email in Dashboard → Settings → Notifications",
          "Check spam for email from noreply@quickquotepro.com",
          "If SMS notifications are set up, check Twilio delivery logs",
        ]} />
      </Accordion>

      <DocH2>AI Employee</DocH2>

      <Accordion title="AI Employee is giving wrong answers" icon="🤖">
        <Checklist items={[
          "Update your training profile — more detail = better answers",
          "Add the incorrect topic as a FAQ with the correct answer",
          "Set escalation rules for topics where accuracy is critical",
          "Use Preview mode to test and iterate before going live",
          "Remember: the AI only quotes for services with a configured calculator",
        ]} />
      </Accordion>

      <Accordion title="SMS / WhatsApp messages are not sending" icon="📱">
        <Checklist items={[
          "Go to Dashboard → Settings → SMS and confirm Twilio is connected",
          "Check your Twilio account balance (Twilio charges per message)",
          "Verify your Twilio phone number is active and SMS-enabled",
          "For WhatsApp: confirm your Meta Business account is approved",
          "Check Twilio's error logs in your Twilio Console for delivery failures",
        ]} />
      </Accordion>

      <DocH2>Account & Billing</DocH2>

      <Accordion title="I can't access the Dashboard" icon="🔐">
        <Checklist items={[
          "Make sure you're using the email address you signed up with",
          "Try clearing your browser cache and cookies",
          "Use an Incognito window to rule out extension conflicts",
          "Contact support if you've lost access to your email",
        ]} />
      </Accordion>

      <Accordion title="I want to cancel or change my plan" icon="💼">
        <p style={{ fontSize: 14, color: "#334155", lineHeight: 1.7, margin: 0 }}>
          Go to Dashboard → Settings → Plan → Manage Subscription. You can downgrade, upgrade, or cancel at any time. Cancellations take effect at the end of the current billing period. Your data is retained for 90 days after cancellation in case you return.
        </p>
      </Accordion>

      <InfoBox type="tip">
        <strong>Still stuck?</strong> Include the following when contacting support: your account email, the calculator name, and a screenshot of any error message. This helps us resolve issues faster.
      </InfoBox>

    </DocsLayout>
  );
}
