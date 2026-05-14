import { useEffect } from "react";
import DocsLayout, { Step, Accordion, InfoBox, DocH2, DocH3, Checklist } from "@/components/marketing/DocsLayout";
import { mkt } from "@/theme/tokens";

export default function DocsMapguard() {
  useEffect(() => { document.title = "MapGuard — WeFixTrades Docs"; }, []);

  return (
    <DocsLayout
      activeSlug="mapguard"
      title="MapGuard Guide"
      description="What MapGuard does for your Google Business Profile, what to expect each week, and how to read your monthly report."
    >
      <DocH2>What MapGuard does</DocH2>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 16 }}>
        MapGuard watches your Google Business Profile every week, fixes what we can fix
        automatically, and posts on your behalf — so your map ranking and review reputation
        keep growing while you focus on the work.
      </p>

      <Checklist items={[
        "Weekly visibility scan — score, rating, review count, keyword rankings",
        "Automatic Google Business posts (2/month on Basic, 4/month on Pro)",
        "AI-drafted owner replies to new customer reviews — auto-published",
        "Alerts when ranking, rating, or score drops — we act on them, then tell you",
        "Monthly performance report emailed on the 2nd of each month",
        "Profile protection — we flag missing photos, descriptions, hours, and unwanted edits",
      ]} />

      <DocH2>Your first week</DocH2>
      <Step n={1} title="Sign up and pay">
        After checkout, you'll receive a welcome email and your portal account at <code>/portal/mapguard</code>.
        Your account is active immediately. If you bought <strong>MapSetup</strong>, your one-time
        profile rebuild kicks off the same day.
      </Step>
      <Step n={2} title="Connect Google Business Profile">
        On your portal, click <strong>Connect Google Business</strong>. You'll be sent to a
        Google consent screen — sign in with the Google account that owns your Business
        Profile and approve access. Takes about 30 seconds.
      </Step>
      <Step n={3} title="First scan runs (within 24 hours)">
        We pull your baseline data — score, rating, reviews, keyword rankings — and store the
        starting point. You'll see your dashboard populate the next time you visit.
      </Step>
      <Step n={4} title="Posts and replies start firing">
        Your first Google Business post goes live mid-month. Reviews left by customers get an
        AI-drafted reply within 24 hours of appearing.
      </Step>

      <InfoBox type="info">
        <strong>Why do you need Google access?</strong> Without it we can <em>see</em> your
        profile but we can't post, reply, or fix anything. The connect button gives us
        manager-level access through Google's official OAuth — you can revoke it any time
        from your Google account settings.
      </InfoBox>

      <DocH2>What we actually do each week</DocH2>

      <Accordion title="Visibility scan (every Tuesday)" icon="🛰">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          We pull live data from Google — your business listing's score, rating, total reviews,
          photo count, and where you rank for the keywords your customers actually search for.
          Changes are stored, and significant drops trigger an internal alert that our team
          responds to.
        </p>
      </Accordion>

      <Accordion title="Google Business posts (monthly fan-out)" icon="📝">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          On the 1st of each month, we schedule your tier's quota of posts. Each post is
          drafted by AI tailored to your trade and service area, then auto-published throughout
          the month. Topics rotate: promotions, tips, service highlights, seasonal updates.
        </p>
        <Checklist items={[
          "Basic plan: 2 posts/month",
          "Pro plan: 4 posts/month",
        ]} />
      </Accordion>

      <Accordion title="Review responses (daily check)" icon="💬">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          Every day we check Google for new reviews. Reviews that need a response get an
          AI-drafted reply in your voice — gracious for positive reviews, empathetic for
          critical ones, never defensive. The reply is posted via Google's official API and
          appears as your owner reply on your profile.
        </p>
        <InfoBox type="info">
          <strong>Reviews that need careful handling</strong> (legal threats, defamation,
          extreme complaints) skip auto-reply and route to our human team instead. We'll
          contact you before posting anything sensitive.
        </InfoBox>
      </Accordion>

      <Accordion title="Profile health monitoring" icon="🛡">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          We continuously check your profile for issues that hurt visibility — outdated hours,
          missing website link, no business description, low photo count, unwanted profile
          edits. Anything that's a quick fix gets handled within your monthly task quota
          (Basic: 2, Pro: 4 improvements/month). Anything bigger we email you about first.
        </p>
      </Accordion>

      <DocH2>The emails you'll get</DocH2>

      <DocH3>Welcome email — day 0</DocH3>
      <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6, marginBottom: 12 }}>
        Confirms your subscription is active and points you to your portal. You don't need to
        do anything except click Connect Google Business when you have a minute.
      </p>

      <DocH3>Weekly recap — every Friday at 9am UTC</DocH3>
      <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6, marginBottom: 12 }}>
        Short check-in: what we did this week, any improvements we shipped, new reviews you've
        earned. If we didn't have specific activity, we still send a brief reassurance so you
        know we're watching. Disable any time from your portal settings.
      </p>

      <DocH3>Heads-up email — only when something actually drops</DocH3>
      <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6, marginBottom: 12 }}>
        If your visibility score or Google rating dips meaningfully, we'll email you the same
        day. The framing is calm: <em>we noticed, we're already on it, no action needed from
        you</em>. Short-term dips happen — what matters is we caught it and started fixing.
      </p>

      <DocH3>Monthly performance report — 2nd of each month</DocH3>
      <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6, marginBottom: 12 }}>
        Full HTML report showing the month's score chart, completed improvements, growth
        metrics, and what's queued for next month. This is your record of what your MapGuard
        plan delivered.
      </p>

      <DocH2>Reading your monthly report</DocH2>

      <Accordion title="Visibility Score" icon="📊">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          A 0–100 composite that combines your profile completeness, review reputation, photo
          count, keyword rankings, and Google-rated authority signals. <strong>Grade A is 85+,
          B is 70–84, C is 55–69, D is below 55.</strong> A 5-point change month-over-month is
          meaningful. Below 70 means the profile has clear gaps worth fixing.
        </p>
      </Accordion>

      <Accordion title="Map Pack keywords" icon="📍">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          The "Map Pack" is the box of 3 local businesses that shows above the regular Google
          results. Being in the Map Pack drives the bulk of clicks for trades searches. We
          track how many of your target keywords you rank in the Map Pack for, and any keywords
          where you rank in the top 10 generally.
        </p>
      </Accordion>

      <Accordion title="Completed Actions" icon="✓">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          The list of fixes our team actually shipped this month — citation cleanup, content
          updates, photo uploads, review responses. Your plan's monthly quota caps this list.
          If you see <em>"X improvements waiting"</em> on the dashboard, that's the backlog
          we'll get to next month, or sooner on a higher tier.
        </p>
      </Accordion>

      <DocH2>Common questions</DocH2>

      <Accordion title="What if I don't connect Google Business?" icon="❓">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          We can still scan, track rankings, and run the visibility report — but we can't post,
          reply to reviews, or fix profile gaps. Posts you don't connect for show up as
          <em> "skipped — no connection"</em> on your portal calendar. Connect any time and
          they'll resume.
        </p>
      </Accordion>

      <Accordion title="What does the AI sound like in my replies and posts?" icon="❓">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          Plain, conversational, like a small-business owner posting themselves. Never robotic,
          never salesy, never with emojis or hashtags. If anything ever sounds off,
          email <code>support@wefixtrades.com</code> with the post URL and we'll retune.
        </p>
      </Accordion>

      <Accordion title="Can I change my plan?" icon="❓">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          Yes — click <strong>Upgrade Plan</strong> on your portal. That opens the secure
          Stripe billing portal where you can switch between Basic and Pro, update payment
          method, or cancel. Plan changes take effect at the next billing cycle.
        </p>
      </Accordion>

      <Accordion title="Can I cancel any time?" icon="❓">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          Yes. Cancel through the billing portal — your service continues until the end of the
          paid period, then ends cleanly with no further charges. Past months are not refunded.
          If MapGuard isn't working for you in the first 30 days, email us and we'll refund the
          first charge in full.
        </p>
      </Accordion>

      <Accordion title="What's MapSetup? Do I need it?" icon="❓">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
          MapSetup is the one-time $397 profile rebuild — fresh photos, optimized
          description, citation cleanup, category corrections, baseline keyword research. It's
          optional. Most customers buy it once to fix a neglected profile, then run on a
          monthly plan after that. If your profile is already in decent shape, skip MapSetup
          and start with Basic or Pro.
        </p>
      </Accordion>

      <InfoBox type="tip">
        <strong>Still have questions?</strong> Email <code>support@wefixtrades.com</code> and
        we'll get back to you within one business day.
      </InfoBox>
    </DocsLayout>
  );
}
