import DocsLayout, { Step, Accordion, InfoBox, DocH2, DocH3, Checklist } from "@/components/marketing/DocsLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { mkt } from "@/theme/tokens";

export default function DocsReputationShield() {
  // Title + meta tags handled by <PageMeta> below.

  return (
    <>
    <PageMeta
      title="ReputationShield — WeFixTrades docs"
      description="Set up ReputationShield to capture 5-star reviews automatically, route low-rating feedback privately, and respond to reviews with AI-drafted replies."
      canonical="/docs/reputationshield"
    />
    <DocsLayout
      activeSlug="reputationshield"
      title="ReputationShield Guide"
      description="How ReputationShield wins you more 5-star reviews, shields you from public 1-stars, and drafts a reply to every review."
    >
      <DocH2>What ReputationShield does</DocH2>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 16 }}>
        ReputationShield turns your completed jobs into 5-star reviews — automatically. After
        every job it asks the customer for a review, routes unhappy customers to a private
        feedback form (not your Google page), drafts professional AI replies to the reviews you
        get, and shows your best reviews on your own website.
      </p>

      <Checklist items={[
        "Automatic SMS / email review requests after every completed job",
        "Private feedback shield — unhappy customers tell you, not the internet",
        "AI-drafted owner replies, posted to Google with one click (or auto-posted)",
        "QR codes so techs can collect reviews in person, on-site",
        "An embeddable review widget for your website",
        "Monitoring across Google and Facebook reviews",
        "Instant low-rating alerts + a monthly reputation report",
      ]} />

      <DocH2>Your first week</DocH2>
      <Step n={1} title="Sign up and pay">
        After checkout you'll get a ReputationShield welcome email and your portal at
        <code>/portal/reviews</code>. Your account is active immediately.
      </Step>
      <Step n={2} title="Connect Google Business Profile">
        From your portal, click <strong>Connect Google</strong>. Sign in with the Google account
        that owns your Business Profile and approve access — about 30 seconds. This is what lets
        us read your reviews and post replies.
      </Step>
      <Step n={3} title="Set how review requests go out">
        Choose SMS or email (SMS is the default — it gets 3–5× more responses), and how long
        after a job to wait before asking. Reasonable defaults are already set.
      </Step>
      <Step n={4} title="Reviews start flowing">
        As jobs complete, customers get a friendly request. New reviews appear in your portal;
        AI drafts replies for you to approve.
      </Step>

      <InfoBox type="info">
        <strong>Why connect Google?</strong> Without it we can't read your reviews or post
        replies. The connect button uses Google's official OAuth — you can revoke access any
        time from your Google account.
      </InfoBox>

      <DocH2>How review collection works</DocH2>

      <Accordion title="Automatic requests after every job" icon="📲">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          When a job is marked complete, ReputationShield sends the customer a short, friendly
          message asking about their experience. If they don't respond, a smart reminder follows
          up. No awkward asking — it just happens.
        </p>
      </Accordion>

      <Accordion title="The private feedback shield" icon="🛡">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          The request first asks how the job went. <strong>Happy customers</strong> are sent
          straight to Google (or Facebook) to leave a public review. <strong>Unhappy
          customers</strong> see a private feedback form instead — the complaint comes to you,
          not the internet. You get a chance to make it right before it becomes a public
          1-star.
        </p>
      </Accordion>

      <Accordion title="QR codes for in-person collection" icon="📱">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          Generate a QR code from your portal and print it on invoices, vehicle decals, or a
          card you hand the customer. They scan it on the spot and go straight into the same
          review flow — sentiment gate included.
        </p>
      </Accordion>

      <DocH2>How review responses work</DocH2>

      <Accordion title="AI-drafted replies" icon="✍️">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          Every review — Google or Facebook — gets an AI-drafted reply in your business's voice:
          gracious for positive reviews, calm and empathetic for critical ones, never defensive.
          Lower-rated replies wait for your one-click approval so you stay in control of
          sensitive responses.
        </p>
      </Accordion>

      <Accordion title="Posting your reply" icon="↩️">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          <strong>Google:</strong> approved replies post straight to Google through the official
          API — no copy-paste. <strong>Facebook:</strong> we draft the reply and surface it in
          your portal ready to go; you paste it onto the review yourself (Facebook's API doesn't
          permit posting owner replies for you). Either way, fast public responses show future
          customers you're attentive.
        </p>
      </Accordion>

      <Accordion title="Low-rating alerts" icon="🔔">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          The moment a new 1–2★ review appears, you get an email alert with the review and a
          drafted response — so you can respond the same day.
        </p>
      </Accordion>

      <DocH2>The review widget</DocH2>
      <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6, marginBottom: 12 }}>
        Show your best reviews on your own website. From <code>/portal/reviews/widget</code>,
        copy the embed code and paste it where you want reviews to appear. Two styles:
      </p>
      <Checklist items={[
        "Badge — a compact rating summary for headers, sidebars, footers (all plans)",
        "Carousel — rotating review cards with text, great for landing pages (Pro plan)",
      ]} />
      <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6, marginTop: 12 }}>
        The widget updates itself — new reviews appear automatically, and you control the
        minimum star rating and how many show.
      </p>

      <DocH2>Platforms we monitor</DocH2>
      <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6, marginBottom: 12 }}>
        We focus where your customers actually leave reviews: <strong>Google</strong> —
        connected via OAuth, the platform that drives the bulk of trades-business reviews —
        and <strong>Facebook</strong>, picked up automatically from your page URL.
      </p>

      <DocH2>The monthly report</DocH2>
      <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6, marginBottom: 12 }}>
        Once a month (weekly/biweekly on higher tiers) you get a reputation report: total
        reviews, average rating, new reviews this period, requests sent, private feedback
        captured, and how you're trending. It's your proof the system is working.
      </p>

      <DocH2>Common questions</DocH2>

      <Accordion title="Do I have to do anything day to day?" icon="❓">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          Almost nothing. Requests go out automatically. AI drafts every reply. The only routine
          action is a one-click approval on lower-rated review replies — and even that is
          optional on the higher tiers for positive reviews.
        </p>
      </Accordion>

      <Accordion title="What if I get a bad review anyway?" icon="❓">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          You'll get an instant alert with an AI-drafted, professional response. Post it quickly
          — a calm, fast reply does more for future customers than the 1-star does against you.
          And the private feedback shield means most unhappy customers never reach your public
          page in the first place.
        </p>
      </Accordion>

      <Accordion title="Can I change or cancel my plan?" icon="❓">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          Yes — manage your plan from the portal billing area. Plan changes take effect at the
          next billing cycle. No contracts; cancel any time.
        </p>
      </Accordion>

      <InfoBox type="tip">
        <strong>Still have questions?</strong> Email <code>support@wefixtrades.com</code> and
        we'll get back to you within one business day.
      </InfoBox>
    </DocsLayout>
    </>
  );
}
