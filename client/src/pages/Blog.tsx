import { useEffect, useState } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, shadows } from "@/theme/tokens";
import { ArrowRight, ArrowLeft } from "lucide-react";

const BLOG_POSTS = [
  {
    title: "5 Ways Trades Businesses Lose Leads Online",
    category: "Growth",
    date: "May 2026",
    summary: "Most trades businesses are losing leads every day without realising it. Here are the five most common website and marketing mistakes — and how to fix each one.",
    body: `Every week, potential customers visit your website, look around, and leave without contacting you. For most trades businesses — plumbers, electricians, roofers — this silent loss of leads adds up to thousands in missed revenue each year. The good news: the fixes are straightforward once you know where to look.

The five biggest lead killers are: slow website load times (anything over 3 seconds loses half your visitors), missing or broken contact forms, no mobile optimisation (over 60% of local searches happen on phones), zero social proof on your homepage, and failing to follow up with enquiries within the first hour. Each of these is fixable in a day or less.

Start with the easiest wins first. Test your site speed at PageSpeed Insights, check your contact form actually delivers emails, and make sure your phone number is clickable on mobile. Then add a few Google reviews to your homepage and set up automated text-back for missed calls. These five changes alone can double your conversion rate from existing traffic.`,
  },
  {
    title: "Why Your Website Speed Matters for Local SEO",
    category: "SEO",
    date: "May 2026",
    summary: "Google uses page speed as a direct ranking factor. If your trades website loads slowly, you are losing both visitors and search rankings to faster competitors.",
    body: `Google confirmed years ago that page speed is a ranking signal, and with the Core Web Vitals update, it now measures exactly how fast your site loads, how quickly it becomes interactive, and how stable the layout is during loading. For local trades businesses competing in the Map Pack, these fractions of a second matter more than you think.

When a homeowner searches "emergency plumber near me" at 10pm, Google favours sites that load fast on mobile. If your competitor's site loads in 1.5 seconds and yours takes 6, you are at a measurable disadvantage — not just in rankings, but in whether the visitor stays long enough to call. Studies show that 53% of mobile visitors abandon a page that takes longer than 3 seconds to load.

The most impactful speed fixes for trades websites are image compression (swap those 4MB photos for optimised versions), removing unused plugins and scripts, enabling browser caching, and using a content delivery network. A one-time speed optimisation sprint typically improves load time by 40-60%, which directly translates to better rankings and more enquiries from the same amount of traffic.`,
  },
  {
    title: "How to Get More Google Reviews (Without Being Awkward)",
    category: "Marketing",
    date: "Jun 2026",
    summary: "Google reviews are the single most influential factor in local search trust. Here is a practical system for collecting 5-star reviews consistently after every job.",
    body: `For trades businesses, Google reviews are the digital equivalent of word-of-mouth referrals. A business with 50 reviews averaging 4.8 stars will outperform a competitor with 5 reviews averaging 5.0 stars — both in rankings and in customer trust. The challenge is not getting happy customers to leave reviews; it is remembering to ask them consistently.

The most effective review collection system works like this: within 2 hours of completing a job, the customer receives a short, friendly SMS with a direct link to your Google review page. If they do not respond within 48 hours, a gentle follow-up is sent. The message should be personal ("Thanks for choosing us for your boiler repair, Sarah") and make the process effortless — one tap to leave a review, no login required.

The critical detail most businesses miss is handling unhappy customers separately. Instead of sending every customer to Google, use a satisfaction gate: the message first asks "How was your experience?" with a simple rating. Customers who rate highly go straight to Google. Those who rate lower see a private feedback form instead — giving you a chance to resolve the issue before it becomes a public 1-star review. This approach typically doubles review volume while keeping your average rating above 4.7.`,
  },
  {
    title: "Automating Follow-Ups Without Losing the Personal Touch",
    category: "Automation",
    date: "Jun 2026",
    summary: "Speed wins leads, but authenticity keeps customers. Here is how to automate your follow-up sequences while still sounding human and genuine.",
    body: `The data is clear: trades businesses that respond to enquiries within 5 minutes are 21 times more likely to convert that lead than those who respond within 30 minutes. But when you are on a job site with your hands full, responding in 5 minutes is impossible — unless you automate the initial response.

The trick is not replacing the personal touch; it is buying yourself time. An automated text-back that says "Hi [name], thanks for reaching out about [service]. I'm currently on a job but I'll call you back within the hour — or you can book a time that works for you here: [link]" accomplishes three things: it confirms you received their message, sets an expectation, and gives them an immediate action they can take. This is not impersonal — it is professional.

Build your automation in layers. Layer one: instant acknowledgement (text-back within 60 seconds). Layer two: if no booking or response within 4 hours, send a follow-up with a quote estimate or availability. Layer three: if still no response after 48 hours, a final "just checking in" message. After that, stop. Three touchpoints is the sweet spot — enough to show you care, not so many that you become annoying. Personalise the templates with the customer's name and the service they asked about, and you will convert more leads than any manual follow-up process ever could.`,
  },
  {
    title: "Google Maps Ranking: The Trades Business Playbook",
    category: "SEO",
    date: "Jul 2026",
    summary: "Ranking in the Google Map Pack is the single highest-ROI marketing activity for local trades. Here is the exact playbook for improving your position.",
    body: `When someone searches "electrician near me" or "emergency roofer [city]," Google shows a map with three businesses. Being in that top three — the Map Pack — is worth more than any other marketing channel for trades businesses. These results get 42% of all clicks, and the searcher's intent is almost always to hire someone right now.

The three pillars of Map Pack ranking are: Google Business Profile completeness, review quantity and quality, and local relevance signals. Start with your GBP — fill in every single field. Business description, service areas, categories (pick the most specific primary category), business hours, photos of your work, and posts. Google rewards profiles that are 100% complete and regularly updated. Add at least 3-5 photos per month of recent jobs.

For local relevance, your website needs location-specific content. Create individual pages for each service you offer in each area you serve — "Emergency Plumbing in [City]" performs far better than a generic "Our Services" page. Build local citations by listing your business on directories like Yelp, Angi, HomeAdvisor, and your local chamber of commerce. Ensure your name, address, and phone number are identical everywhere. Inconsistencies confuse Google and hurt your ranking. Combined with a steady flow of genuine reviews, this playbook reliably moves businesses into the Map Pack within 60-90 days.`,
  },
  {
    title: "The Real Cost of Not Having Online Booking",
    category: "Strategy",
    date: "Jul 2026",
    summary: "Every hour you make a potential customer wait to book is an hour they spend calling your competitors. Here is what no-booking-system businesses actually lose.",
    body: `A homeowner discovers a leaking pipe at 9pm on a Tuesday. They search for a local plumber, find your website, and see a contact form. They fill it out and wait. By the next morning when you check your inbox, they have already called two other plumbers — one of whom had online booking and confirmed an appointment at 8am. You lost the job before you even saw the lead.

This scenario plays out hundreds of times a year for the average trades business without online booking. Research shows that 67% of consumers prefer self-service scheduling over calling, and 40% of bookings happen outside business hours. When you force every customer through a phone call or contact form, you are filtering out the majority who want to book on their own terms — especially younger homeowners who are becoming your primary customer base.

The maths is simple. If you receive 20 website enquiries per month and an online booking system converts even 30% of those into confirmed appointments (compared to the typical 15% from contact forms), that is 3 extra booked jobs per month. At an average job value of $350 for a typical trade, that is over $12,000 per year in revenue from a system that costs a fraction of that. Add in the time you save not playing phone tag, and online booking is one of the highest-ROI tools a trades business can adopt.`,
  },
];

export default function BlogPage() {
  const [openArticle, setOpenArticle] = useState<number | null>(null);

  useEffect(() => {
    document.title = "Blog — WeFixTrades";
  }, []);

  const activePost = openArticle !== null ? BLOG_POSTS[openArticle] : null;

  return (
    <MarketingLayout>
      <div
        data-testid="section-blog-hero"
        style={{
          background: `linear-gradient(135deg, ${mkt.dark}, ${mkt.darkHover})`,
          padding: "100px 24px 60px",
          textAlign: "center",
        }}
      >
        <h1
          data-testid="text-blog-title"
          style={{
            fontSize: "clamp(32px, 5vw, 48px)",
            fontWeight: 700,
            color: mkt.onDark,
            margin: "0 0 16px",
            letterSpacing: "-0.025em",
          }}
        >
          Blog
        </h1>
        <p
          data-testid="text-blog-subtitle"
          style={{ fontSize: 18, color: mkt.onDarkMuted, margin: 0, maxWidth: 560, marginInline: "auto" }}
        >
          Tips, strategies, and product updates to help your trades business grow.
        </p>
      </div>

      {/* Article detail view */}
      {activePost && (
        <section style={{ background: mkt.bg, padding: "60px 24px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <button
              onClick={() => setOpenArticle(null)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 600,
                color: mkt.accent,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                marginBottom: 24,
              }}
            >
              <ArrowLeft size={14} /> Back to all articles
            </button>
            <span
              style={{
                display: "inline-block",
                fontSize: 11,
                fontWeight: 700,
                color: mkt.accent,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                background: mkt.accentTint,
                padding: "4px 12px",
                borderRadius: 20,
                marginBottom: 16,
              }}
            >
              {activePost.category}
            </span>
            <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: mkt.text, margin: "0 0 8px", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
              {activePost.title}
            </h2>
            <p style={{ fontSize: 14, color: mkt.textMuted, margin: "0 0 32px" }}>{activePost.date}</p>
            <div style={{ fontSize: 16, color: mkt.text, lineHeight: 1.75 }}>
              {activePost.body.split("\n\n").map((para, i) => (
                <p key={i} style={{ margin: "0 0 20px" }}>{para}</p>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${mkt.border}`, paddingTop: 32, marginTop: 40, textAlign: "center" }}>
              <p style={{ fontSize: 15, color: mkt.textMuted, marginBottom: 16 }}>
                Want help implementing these strategies for your business?
              </p>
              <Link
                href="/Wizard"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px 28px",
                  borderRadius: 14,
                  background: mkt.accent,
                  color: mkt.dark,
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Get Started Free <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Article grid */}
      {!activePost && (
        <section
          data-testid="section-blog-posts"
          style={{ background: mkt.surface, padding: "60px 24px" }}
        >
          <div
            style={{
              maxWidth: 1120,
              margin: "0 auto",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 24,
            }}
          >
            {BLOG_POSTS.map((post, i) => (
              <div
                key={i}
                data-testid={`card-blog-post-${i}`}
                onClick={() => setOpenArticle(i)}
                style={{
                  background: mkt.bg,
                  borderRadius: 16,
                  boxShadow: shadows.card,
                  border: `1px solid ${mkt.border}`,
                  display: "flex",
                  flexDirection: "column",
                  cursor: "pointer",
                  transition: "box-shadow 0.2s ease, transform 0.2s ease",
                }}
              >
                <div
                  style={{
                    height: 160,
                    borderRadius: "16px 16px 0 0",
                    background: `linear-gradient(135deg, ${mkt.accentTint}, ${mkt.surface})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: mkt.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {post.category}
                  </span>
                </div>
                <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                  <span style={{ fontSize: 12, color: mkt.textMuted, fontWeight: 500 }}>{post.date}</span>
                  <h3 style={{ fontSize: 17, fontWeight: 650, color: mkt.text, margin: 0, lineHeight: 1.3 }}>{post.title}</h3>
                  <p style={{ fontSize: 13, color: mkt.textMuted, lineHeight: 1.5, margin: 0 }}>{post.summary}</p>
                  <div style={{ flex: 1 }} />
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 13,
                      fontWeight: 600,
                      color: mkt.accent,
                    }}
                  >
                    Read More <ArrowRight size={13} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!activePost && (
        <section
          data-testid="section-blog-cta"
          style={{ padding: "60px 24px", textAlign: "center" }}
        >
          <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: mkt.text, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
            Stay in the loop
          </h2>
          <p style={{ fontSize: 16, color: mkt.textMuted, margin: "0 0 28px", maxWidth: 480, marginInline: "auto" }}>
            New articles and product updates published regularly. Bookmark this page or follow us on social media.
          </p>
          <Link
            href="/"
            data-testid="link-blog-home"
            style={{
              display: "inline-block",
              padding: "12px 28px",
              borderRadius: 14,
              background: mkt.dark,
              color: mkt.onDark,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Back to Home
          </Link>
        </section>
      )}
    </MarketingLayout>
  );
}
