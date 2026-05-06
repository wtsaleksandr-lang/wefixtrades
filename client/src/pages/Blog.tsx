import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import {
  ArrowRight, ArrowLeft, Search,
  TrendingDown, Gauge, Star, Zap, MapPin, Calendar,
} from "lucide-react";
import { V7PageShell } from "@/components/marketing/v7";
import { MONO, SANS } from "@/components/effortel-blocks";

/* ════════════════════════════════════════════════════════════════
   Effortel-style blog page:
     - Top tab strip (Blog / Events / Case studies / News)
     - H1 + Featured swiper (snap-scroll, prev/next arrows)
     - "Stay Ahead..." section with filter pills + archive grid
   ════════════════════════════════════════════════════════════════ */

interface Post {
  title: string;
  category: string;
  date: string;
  readMin: number;
  summary: string;
  body: string;
  icon: typeof Star;
  vivid: { bg: string; ink: string };
}

const VIVID = {
  green:  { bg: "#4ADE80", ink: "#0A2818" },
  cyan:   { bg: "#22D3EE", ink: "#0C2832" },
  pink:   { bg: "#F472B6", ink: "#3A0E23" },
  purple: { bg: "#A78BFA", ink: "#1E1233" },
  orange: { bg: "#FB923C", ink: "#3A1A05" },
  yellow: { bg: "#FACC15", ink: "#3A2A05" },
};

const BLOG_POSTS: Post[] = [
  {
    title: "5 Ways Trades Businesses Lose Leads Online",
    category: "Growth",
    date: "May 2026", readMin: 4,
    summary: "Most trades businesses are losing leads every day without realising it. Five common website mistakes — and how to fix each one.",
    icon: TrendingDown, vivid: VIVID.green,
    body: `Every week, potential customers visit your website, look around, and leave without contacting you. For most trades businesses — plumbers, electricians, roofers — this silent loss of leads adds up to thousands in missed revenue each year. The good news: the fixes are straightforward once you know where to look.

The five biggest lead killers are: slow website load times (anything over 3 seconds loses half your visitors), missing or broken contact forms, no mobile optimisation (over 60% of local searches happen on phones), zero social proof on your homepage, and failing to follow up with enquiries within the first hour. Each of these is fixable in a day or less.

Start with the easiest wins first. Test your site speed at PageSpeed Insights, check your contact form actually delivers emails, and make sure your phone number is clickable on mobile. Then add a few Google reviews to your homepage and set up automated text-back for missed calls. These five changes alone can double your conversion rate from existing traffic.`,
  },
  {
    title: "Why Your Website Speed Matters for Local SEO",
    category: "SEO",
    date: "May 2026", readMin: 5,
    summary: "Google uses page speed as a direct ranking factor. If your site loads slowly, you're losing visitors and rankings to faster competitors.",
    icon: Gauge, vivid: VIVID.cyan,
    body: `Google confirmed years ago that page speed is a ranking signal, and with the Core Web Vitals update, it now measures exactly how fast your site loads, how quickly it becomes interactive, and how stable the layout is during loading. For local trades businesses competing in the Map Pack, these fractions of a second matter more than you think.

When a homeowner searches "emergency plumber near me" at 10pm, Google favours sites that load fast on mobile. If your competitor's site loads in 1.5 seconds and yours takes 6, you are at a measurable disadvantage — not just in rankings, but in whether the visitor stays long enough to call. Studies show that 53% of mobile visitors abandon a page that takes longer than 3 seconds to load.

The most impactful speed fixes for trades websites are image compression (swap those 4MB photos for optimised versions), removing unused plugins and scripts, enabling browser caching, and using a content delivery network. A one-time speed optimisation sprint typically improves load time by 40-60%, which directly translates to better rankings and more enquiries from the same amount of traffic.`,
  },
  {
    title: "How to Get More Google Reviews (Without Being Awkward)",
    category: "Marketing",
    date: "Jun 2026", readMin: 4,
    summary: "Google reviews are the single most influential factor in local search trust. A practical system for collecting 5-star reviews after every job.",
    icon: Star, vivid: VIVID.pink,
    body: `For trades businesses, Google reviews are the digital equivalent of word-of-mouth referrals. A business with 50 reviews averaging 4.8 stars will outperform a competitor with 5 reviews averaging 5.0 stars — both in rankings and in customer trust. The challenge is not getting happy customers to leave reviews; it is remembering to ask them consistently.

The most effective review collection system works like this: within 2 hours of completing a job, the customer receives a short, friendly SMS with a direct link to your Google review page. If they do not respond within 48 hours, a gentle follow-up is sent. The message should be personal ("Thanks for choosing us for your boiler repair, Sarah") and make the process effortless — one tap to leave a review, no login required.

The critical detail most businesses miss is handling unhappy customers separately. Instead of sending every customer to Google, use a satisfaction gate: the message first asks "How was your experience?" with a simple rating. Customers who rate highly go straight to Google. Those who rate lower see a private feedback form instead — giving you a chance to resolve the issue before it becomes a public 1-star review. This approach typically doubles review volume while keeping your average rating above 4.7.`,
  },
  {
    title: "Automating Follow-Ups Without Losing the Personal Touch",
    category: "Automation",
    date: "Jun 2026", readMin: 5,
    summary: "Speed wins leads, authenticity keeps customers. Automate follow-up sequences while still sounding human.",
    icon: Zap, vivid: VIVID.purple,
    body: `The data is clear: trades businesses that respond to enquiries within 5 minutes are 21 times more likely to convert that lead than those who respond within 30 minutes. But when you are on a job site with your hands full, responding in 5 minutes is impossible — unless you automate the initial response.

The trick is not replacing the personal touch; it is buying yourself time. An automated text-back that says "Hi [name], thanks for reaching out about [service]. I'm currently on a job but I'll call you back within the hour — or you can book a time that works for you here: [link]" accomplishes three things: it confirms you received their message, sets an expectation, and gives them an immediate action they can take. This is not impersonal — it is professional.

Build your automation in layers. Layer one: instant acknowledgement (text-back within 60 seconds). Layer two: if no booking or response within 4 hours, send a follow-up with a quote estimate or availability. Layer three: if still no response after 48 hours, a final "just checking in" message. After that, stop. Three touchpoints is the sweet spot — enough to show you care, not so many that you become annoying.`,
  },
  {
    title: "Google Maps Ranking: The Trades Business Playbook",
    category: "SEO",
    date: "Jul 2026", readMin: 6,
    summary: "Ranking in the Map Pack is the single highest-ROI marketing activity for local trades. The exact playbook for improving your position.",
    icon: MapPin, vivid: VIVID.orange,
    body: `When someone searches "electrician near me" or "emergency roofer [city]," Google shows a map with three businesses. Being in that top three — the Map Pack — is worth more than any other marketing channel for trades businesses. These results get 42% of all clicks, and the searcher's intent is almost always to hire someone right now.

The three pillars of Map Pack ranking are: Google Business Profile completeness, review quantity and quality, and local relevance signals. Start with your GBP — fill in every single field. Business description, service areas, categories (pick the most specific primary category), business hours, photos of your work, and posts. Google rewards profiles that are 100% complete and regularly updated. Add at least 3-5 photos per month of recent jobs.

For local relevance, your website needs location-specific content. Create individual pages for each service you offer in each area you serve — "Emergency Plumbing in [City]" performs far better than a generic "Our Services" page. Build local citations by listing your business on directories like Yelp, Angi, HomeAdvisor, and your local chamber of commerce. Combined with a steady flow of genuine reviews, this playbook reliably moves businesses into the Map Pack within 60-90 days.`,
  },
  {
    title: "The Real Cost of Not Having Online Booking",
    category: "Strategy",
    date: "Jul 2026", readMin: 4,
    summary: "Every hour you make a customer wait to book is an hour they call your competitors. What no-booking-system businesses actually lose.",
    icon: Calendar, vivid: VIVID.yellow,
    body: `A homeowner discovers a leaking pipe at 9pm on a Tuesday. They search for a local plumber, find your website, and see a contact form. They fill it out and wait. By the next morning when you check your inbox, they have already called two other plumbers — one of whom had online booking and confirmed an appointment at 8am. You lost the job before you even saw the lead.

This scenario plays out hundreds of times a year for the average trades business without online booking. Research shows that 67% of consumers prefer self-service scheduling over calling, and 40% of bookings happen outside business hours. When you force every customer through a phone call or contact form, you are filtering out the majority who want to book on their own terms.

The maths is simple. If you receive 20 website enquiries per month and an online booking system converts even 30% of those into confirmed appointments (compared to the typical 15% from contact forms), that is 3 extra booked jobs per month. At an average job value of $350 for a typical trade, that is over $12,000 per year in revenue from a system that costs a fraction of that.`,
  },
];

/* ─── Tab strip — Blog / Docs / Case studies / Resources ─── */

const RESOURCE_TABS = [
  { label: "Blog",         href: "/blog" },
  { label: "Docs",         href: "/docs" },
  { label: "Case studies", href: "/case-studies" },
  { label: "Resources",    href: "/resources" },
];

function ResourceTabStrip({ active }: { active: string }) {
  return (
    <div style={{
      display: "inline-flex", gap: 4, padding: 4,
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${mkt.onDarkBorder}`,
      borderRadius: 999,
    }}>
      {RESOURCE_TABS.map((t) => {
        const isActive = t.href === active;
        return (
          <Link key={t.href} href={t.href} style={{
            display: "inline-flex", alignItems: "center",
            padding: "8px 18px", borderRadius: 999,
            fontSize: 13, fontWeight: 600,
            fontFamily: SANS, lineHeight: 1,
            whiteSpace: "nowrap", textDecoration: "none",
            background: isActive ? mkt.onDark : "transparent",
            color: isActive ? mkt.dark : mkt.onDarkMuted,
            transition: "background 200ms ease, color 200ms ease",
          }}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

/* ─── BlogCard — full-bleed thumbnail on top, content below ─── */

function ConcentricRings({ ink }: { ink: string }) {
  return (
    <svg
      width="100%" height="100%" viewBox="0 0 600 380"
      style={{ position: "absolute", inset: 0, opacity: 0.35, pointerEvents: "none" }}
    >
      {[60, 110, 160, 210, 260, 310].map((r) => (
        <ellipse key={r} cx="300" cy="190" rx={r * 1.2} ry={r * 0.78}
          fill="none" stroke={ink} strokeWidth="1.2" />
      ))}
    </svg>
  );
}

function BlogCard({ post, onOpen, size = "grid" }: {
  post: Post;
  onOpen: () => void;
  size?: "featured" | "grid";
}) {
  const [hover, setHover] = useState(false);
  const Icon = post.icon;
  const isFeatured = size === "featured";
  const thumbHeight = isFeatured ? 280 : 190;
  const iconSize = isFeatured ? 96 : 70;

  return (
    <article
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: mkt.sectionLight,
        border: `1px solid ${hover ? "rgba(102,232,250,0.45)" : mkt.onDarkBorder}`,
        borderRadius: 18, overflow: "hidden",
        cursor: "pointer", position: "relative",
        display: "flex", flexDirection: "column",
        height: "100%",
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hover ? "0 18px 40px rgba(0,0,0,0.35)" : "0 0 0 rgba(0,0,0,0)",
        transition: "transform 320ms cubic-bezier(0.22,1,0.36,1), box-shadow 320ms cubic-bezier(0.22,1,0.36,1), border-color 320ms ease",
      }}
    >
      {/* Thumbnail — full width, illustration centered */}
      <div style={{
        background: post.vivid.bg, height: thumbHeight,
        position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", flexShrink: 0,
      }}>
        <ConcentricRings ink={post.vivid.ink} />
        <div style={{
          position: "relative",
          color: post.vivid.ink,
          opacity: 0.85,
          transform: hover ? "scale(1.06)" : "scale(1)",
          transition: "transform 360ms cubic-bezier(0.22,1,0.36,1)",
        }}>
          <Icon size={iconSize} strokeWidth={1.6} />
        </div>
        {/* subtle dark overlay on hover */}
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.18)",
          opacity: hover ? 1 : 0,
          transition: "opacity 280ms ease",
        }} />
      </div>

      {/* Content */}
      <div style={{
        padding: isFeatured ? "22px 26px 26px" : "18px 20px 22px",
        display: "flex", flexDirection: "column",
        gap: 14, flex: 1,
      }}>
        {/* Tag row: primary tag + counter chip */}
        <div style={{ display: "inline-flex", gap: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 700,
            padding: "5px 10px", borderRadius: 999,
            background: "rgba(255,255,255,0.06)", color: mkt.onDark,
            fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase",
            border: `1px solid ${mkt.onDarkBorder}`,
          }}>{post.category}</span>
          <span style={{
            fontSize: 10, fontWeight: 700,
            padding: "5px 8px", borderRadius: 999,
            background: "rgba(255,255,255,0.04)", color: mkt.onDarkMuted,
            fontFamily: MONO,
            border: `1px solid ${mkt.onDarkBorder}`,
          }}>+2</span>
        </div>

        {/* Heading — clamped 4 lines */}
        <h3 style={{
          fontSize: isFeatured ? "clamp(20px, 2.2vw, 26px)" : 16,
          fontWeight: 700, color: mkt.onDark, margin: 0,
          lineHeight: 1.25, letterSpacing: "-0.01em",
          fontFamily: SANS,
          display: "-webkit-box",
          WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>{post.title}</h3>

        {/* Meta — read time (small, muted) + date */}
        <div style={{
          marginTop: "auto", paddingTop: 10,
          fontFamily: MONO, fontSize: 11, color: mkt.onDarkMuted,
          letterSpacing: "0.04em",
          display: "flex", flexDirection: "column", gap: 2,
        }}>
          <span style={{ opacity: 0.6 }}>{post.readMin} min</span>
          <span>{post.date}</span>
        </div>
      </div>
    </article>
  );
}

/* ─── FeaturedSwiper — horizontal scroll-snap with prev/next arrows ─── */

function FeaturedSwiper({ posts, onOpen }: {
  posts: Post[];
  onOpen: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const updateButtons = () => {
    const el = ref.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  };

  useEffect(() => {
    updateButtons();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", updateButtons, { passive: true });
    window.addEventListener("resize", updateButtons);
    return () => {
      el.removeEventListener("scroll", updateButtons);
      window.removeEventListener("resize", updateButtons);
    };
  }, []);

  const scrollByCard = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const step = (card?.offsetWidth ?? 720) + 16;
    el.scrollBy({ left: step * dir, behavior: "smooth" });
  };

  return (
    <section style={{ background: mkt.bg, padding: "8px 0 32px" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div
          ref={ref}
          style={{
            display: "flex", gap: 16,
            overflowX: "auto", overflowY: "hidden",
            scrollSnapType: "x mandatory",
            scrollPadding: "0 24px",
            padding: "8px 24px 8px",
            scrollbarWidth: "none",
            WebkitOverflowScrolling: "touch",
          }}
          className="hide-scrollbar"
        >
          {posts.map((post, i) => (
            <div
              key={i}
              data-card
              style={{
                flex: "0 0 auto",
                width: "min(840px, 88vw)",
                scrollSnapAlign: "start",
              }}
            >
              <BlogCard post={post} onOpen={() => onOpen(i)} size="featured" />
            </div>
          ))}
        </div>

        {/* Arrow nav */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 12,
          marginTop: 18,
        }}>
          <button
            onClick={() => scrollByCard(-1)}
            disabled={!canPrev}
            aria-label="Previous post"
            style={{
              width: 48, height: 48, borderRadius: "50%",
              border: `1px solid ${mkt.onDarkBorder}`,
              background: "rgba(255,255,255,0.04)",
              color: canPrev ? mkt.onDark : mkt.onDarkMuted,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: canPrev ? "pointer" : "default",
              opacity: canPrev ? 1 : 0.4,
              transition: "background 200ms ease, opacity 200ms ease",
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            onClick={() => scrollByCard(1)}
            disabled={!canNext}
            aria-label="Next post"
            style={{
              width: 48, height: 48, borderRadius: "50%",
              border: `1px solid ${mkt.onDarkBorder}`,
              background: "rgba(255,255,255,0.04)",
              color: canNext ? mkt.onDark : mkt.onDarkMuted,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: canNext ? "pointer" : "default",
              opacity: canNext ? 1 : 0.4,
              transition: "background 200ms ease, opacity 200ms ease",
            }}
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
      <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
    </section>
  );
}

/* ─── FilterBar — clickable category pills + (clear) ─── */

function FilterBar({ categories, active, onToggle, onClear }: {
  categories: string[];
  active: Set<string>;
  onToggle: (cat: string) => void;
  onClear: () => void;
}) {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap",
      alignItems: "center", gap: 10,
      marginBottom: 24,
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700, fontFamily: MONO,
        color: mkt.onDarkMuted, textTransform: "uppercase",
        letterSpacing: "0.08em", marginRight: 4,
      }}>Filter</span>
      <button
        onClick={onClear}
        disabled={active.size === 0}
        style={{
          fontSize: 11, fontFamily: MONO,
          color: active.size === 0 ? "rgba(255,255,255,0.25)" : mkt.accent,
          background: "transparent", border: "none",
          cursor: active.size === 0 ? "default" : "pointer",
          padding: 0, marginRight: 8,
          textTransform: "lowercase",
        }}
      >(clear)</button>

      {categories.map((cat) => {
        const isActive = active.has(cat);
        return (
          <button
            key={cat}
            onClick={() => onToggle(cat)}
            style={{
              fontSize: 12, fontWeight: 600,
              fontFamily: SANS, lineHeight: 1,
              padding: "8px 14px", borderRadius: 999,
              border: `1px solid ${isActive ? mkt.onDark : mkt.onDarkBorder}`,
              background: isActive ? mkt.onDark : "transparent",
              color: isActive ? mkt.dark : mkt.onDarkMuted,
              cursor: "pointer",
              transition: "background 180ms ease, color 180ms ease, border-color 180ms ease",
            }}
          >
            {cat}
          </button>
        );
      })}

      <button
        aria-label="Search"
        style={{
          marginLeft: "auto",
          width: 36, height: 36, borderRadius: 999,
          border: `1px solid ${mkt.onDarkBorder}`,
          background: "rgba(255,255,255,0.04)",
          color: mkt.onDarkMuted,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <Search size={15} />
      </button>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────── */

export default function BlogPage() {
  const [openArticle, setOpenArticle] = useState<number | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  useEffect(() => { document.title = "Blog — WeFixTrades"; }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "auto" }); }, [openArticle]);

  const categories = useMemo(() => {
    return Array.from(new Set(BLOG_POSTS.map((p) => p.category))).sort();
  }, []);

  const filtered = useMemo(() => {
    if (activeFilters.size === 0) return BLOG_POSTS;
    return BLOG_POSTS.filter((p) => activeFilters.has(p.category));
  }, [activeFilters]);

  const toggleFilter = (cat: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const activePost = openArticle !== null ? BLOG_POSTS[openArticle] : null;

  return (
    <MarketingLayout>
      <V7PageShell>
        {activePost ? (
          /* ─ Article detail ─ */
          <section style={{ background: mkt.bg, padding: "44px 16px 60px" }}>
            <div style={{ maxWidth: 760, margin: "0 auto" }}>
              <button
                onClick={() => setOpenArticle(null)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 13, fontWeight: 600, color: mkt.accent,
                  background: "none", border: "none", cursor: "pointer",
                  padding: 0, marginBottom: 24,
                }}
              >
                <ArrowLeft size={14} /> Back to all articles
              </button>
              <span style={{
                display: "inline-block",
                fontSize: 11, fontWeight: 700,
                color: activePost.vivid.ink,
                textTransform: "uppercase", letterSpacing: "0.08em",
                background: activePost.vivid.bg,
                padding: "5px 14px", borderRadius: 999,
                marginBottom: 16, fontFamily: MONO,
              }}>{activePost.category}</span>
              <h2 style={{
                fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700,
                color: mkt.onDark, margin: "0 0 8px",
                lineHeight: 1.2, letterSpacing: "-0.02em",
              }}>{activePost.title}</h2>
              <p style={{ fontSize: 14, color: mkt.onDarkMuted, margin: "0 0 32px" }}>
                {activePost.date} · {activePost.readMin} min read
              </p>
              <div style={{ fontSize: 16, color: mkt.onDark, lineHeight: 1.75 }}>
                {activePost.body.split("\n\n").map((para, i) => (
                  <p key={i} style={{ margin: "0 0 20px" }}>{para}</p>
                ))}
              </div>
              <div style={{ borderTop: `1px solid ${mkt.onDarkBorder}`, paddingTop: 32, marginTop: 40, textAlign: "center" }}>
                <p style={{ fontSize: 15, color: mkt.onDarkMuted, marginBottom: 16 }}>
                  Want help implementing these strategies for your business?
                </p>
                <Link href="/Wizard" style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "12px 28px", borderRadius: 14,
                  background: mkt.accent, color: mkt.dark,
                  fontSize: 15, fontWeight: 700, textDecoration: "none",
                }}>
                  Get Started Free <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </section>
        ) : (
          <>
            {/* ─ Hero: tabs + headline ─ */}
            <section style={{
              background: mkt.bg,
              padding: "56px 24px 16px",
              textAlign: "center",
            }}>
              <div style={{ marginBottom: 28 }}>
                <ResourceTabStrip active="/blog" />
              </div>
              <h1 style={{
                fontSize: "clamp(34px, 5.4vw, 64px)", fontWeight: 700,
                color: mkt.onDark, margin: "0 auto", maxWidth: 900,
                lineHeight: 1.05, letterSpacing: "-0.025em",
                fontFamily: SANS,
              }}>
                Insights &amp; Trends — The Future of Trades
              </h1>
            </section>

            {/* ─ Featured swiper ─ */}
            <FeaturedSwiper posts={BLOG_POSTS} onOpen={setOpenArticle} />

            {/* ─ Stay-Ahead section: filter bar + archive grid ─ */}
            <section style={{ background: mkt.bg, padding: "56px 24px 80px" }}>
              <div style={{ maxWidth: 1400, margin: "0 auto" }}>
                <h2 style={{
                  fontSize: "clamp(28px, 4.2vw, 48px)", fontWeight: 700,
                  color: mkt.onDark, margin: "0 0 32px",
                  lineHeight: 1.1, letterSpacing: "-0.02em",
                  fontFamily: SANS,
                }}>
                  Stay Ahead of the Competition with WeFixTrades
                </h2>

                <FilterBar
                  categories={categories}
                  active={activeFilters}
                  onToggle={toggleFilter}
                  onClear={() => setActiveFilters(new Set())}
                />

                {filtered.length === 0 ? (
                  <p style={{ color: mkt.onDarkMuted, fontSize: 14, padding: "40px 0" }}>
                    No posts match the selected filters.
                  </p>
                ) : (
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: 14,
                  }}>
                    {filtered.map((post) => {
                      const idx = BLOG_POSTS.indexOf(post);
                      return (
                        <BlogCard
                          key={idx}
                          post={post}
                          onOpen={() => setOpenArticle(idx)}
                          size="grid"
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </V7PageShell>
    </MarketingLayout>
  );
}
