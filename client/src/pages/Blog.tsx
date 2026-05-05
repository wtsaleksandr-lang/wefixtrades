import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import {
  ArrowRight, ArrowLeft, ArrowUpRight,
  TrendingDown, Gauge, Star, Zap, MapPin, Calendar,
} from "lucide-react";
import { V7PageShell } from "@/components/marketing/v7";
import { MONO, SANS } from "@/components/effortel-blocks";

/* ════════════════════════════════════════════════════════════════
   Effortel-style blog: drag carousel + bright-tile grid + tab strip
   ════════════════════════════════════════════════════════════════ */

interface Post {
  title: string;
  category: string;
  date: string;
  readMin: number;
  summary: string;
  body: string;
  icon: typeof Star;
  /** Vivid background + dark ink for that category. */
  vivid: { bg: string; ink: string; soft: string };
}

const VIVID = {
  green:  { bg: "#4ADE80", ink: "#0A2818", soft: "#86EFAC" },
  cyan:   { bg: "#22D3EE", ink: "#0C2832", soft: "#67E8F9" },
  pink:   { bg: "#F472B6", ink: "#3A0E23", soft: "#F9A8D4" },
  purple: { bg: "#A78BFA", ink: "#1E1233", soft: "#C4B5FD" },
  orange: { bg: "#FB923C", ink: "#3A1A05", soft: "#FDBA74" },
  yellow: { bg: "#FACC15", ink: "#3A2A05", soft: "#FDE68A" },
};

const BLOG_POSTS: Post[] = [
  {
    title: "5 Ways Trades Businesses Lose Leads Online",
    category: "Growth",
    date: "May 2026",
    readMin: 4,
    summary: "Most trades businesses are losing leads every day without realising it. Five common website mistakes — and how to fix each one.",
    icon: TrendingDown,
    vivid: VIVID.green,
    body: `Every week, potential customers visit your website, look around, and leave without contacting you. For most trades businesses — plumbers, electricians, roofers — this silent loss of leads adds up to thousands in missed revenue each year. The good news: the fixes are straightforward once you know where to look.

The five biggest lead killers are: slow website load times (anything over 3 seconds loses half your visitors), missing or broken contact forms, no mobile optimisation (over 60% of local searches happen on phones), zero social proof on your homepage, and failing to follow up with enquiries within the first hour. Each of these is fixable in a day or less.

Start with the easiest wins first. Test your site speed at PageSpeed Insights, check your contact form actually delivers emails, and make sure your phone number is clickable on mobile. Then add a few Google reviews to your homepage and set up automated text-back for missed calls. These five changes alone can double your conversion rate from existing traffic.`,
  },
  {
    title: "Why Your Website Speed Matters for Local SEO",
    category: "SEO",
    date: "May 2026",
    readMin: 5,
    summary: "Google uses page speed as a direct ranking factor. If your site loads slowly, you're losing visitors and rankings to faster competitors.",
    icon: Gauge,
    vivid: VIVID.cyan,
    body: `Google confirmed years ago that page speed is a ranking signal, and with the Core Web Vitals update, it now measures exactly how fast your site loads, how quickly it becomes interactive, and how stable the layout is during loading. For local trades businesses competing in the Map Pack, these fractions of a second matter more than you think.

When a homeowner searches "emergency plumber near me" at 10pm, Google favours sites that load fast on mobile. If your competitor's site loads in 1.5 seconds and yours takes 6, you are at a measurable disadvantage — not just in rankings, but in whether the visitor stays long enough to call. Studies show that 53% of mobile visitors abandon a page that takes longer than 3 seconds to load.

The most impactful speed fixes for trades websites are image compression (swap those 4MB photos for optimised versions), removing unused plugins and scripts, enabling browser caching, and using a content delivery network. A one-time speed optimisation sprint typically improves load time by 40-60%, which directly translates to better rankings and more enquiries from the same amount of traffic.`,
  },
  {
    title: "How to Get More Google Reviews (Without Being Awkward)",
    category: "Marketing",
    date: "Jun 2026",
    readMin: 4,
    summary: "Google reviews are the single most influential factor in local search trust. A practical system for collecting 5-star reviews after every job.",
    icon: Star,
    vivid: VIVID.pink,
    body: `For trades businesses, Google reviews are the digital equivalent of word-of-mouth referrals. A business with 50 reviews averaging 4.8 stars will outperform a competitor with 5 reviews averaging 5.0 stars — both in rankings and in customer trust. The challenge is not getting happy customers to leave reviews; it is remembering to ask them consistently.

The most effective review collection system works like this: within 2 hours of completing a job, the customer receives a short, friendly SMS with a direct link to your Google review page. If they do not respond within 48 hours, a gentle follow-up is sent. The message should be personal ("Thanks for choosing us for your boiler repair, Sarah") and make the process effortless — one tap to leave a review, no login required.

The critical detail most businesses miss is handling unhappy customers separately. Instead of sending every customer to Google, use a satisfaction gate: the message first asks "How was your experience?" with a simple rating. Customers who rate highly go straight to Google. Those who rate lower see a private feedback form instead — giving you a chance to resolve the issue before it becomes a public 1-star review. This approach typically doubles review volume while keeping your average rating above 4.7.`,
  },
  {
    title: "Automating Follow-Ups Without Losing the Personal Touch",
    category: "Automation",
    date: "Jun 2026",
    readMin: 5,
    summary: "Speed wins leads, authenticity keeps customers. Automate follow-up sequences while still sounding human.",
    icon: Zap,
    vivid: VIVID.purple,
    body: `The data is clear: trades businesses that respond to enquiries within 5 minutes are 21 times more likely to convert that lead than those who respond within 30 minutes. But when you are on a job site with your hands full, responding in 5 minutes is impossible — unless you automate the initial response.

The trick is not replacing the personal touch; it is buying yourself time. An automated text-back that says "Hi [name], thanks for reaching out about [service]. I'm currently on a job but I'll call you back within the hour — or you can book a time that works for you here: [link]" accomplishes three things: it confirms you received their message, sets an expectation, and gives them an immediate action they can take. This is not impersonal — it is professional.

Build your automation in layers. Layer one: instant acknowledgement (text-back within 60 seconds). Layer two: if no booking or response within 4 hours, send a follow-up with a quote estimate or availability. Layer three: if still no response after 48 hours, a final "just checking in" message. After that, stop. Three touchpoints is the sweet spot — enough to show you care, not so many that you become annoying.`,
  },
  {
    title: "Google Maps Ranking: The Trades Business Playbook",
    category: "SEO",
    date: "Jul 2026",
    readMin: 6,
    summary: "Ranking in the Map Pack is the single highest-ROI marketing activity for local trades. The exact playbook for improving your position.",
    icon: MapPin,
    vivid: VIVID.orange,
    body: `When someone searches "electrician near me" or "emergency roofer [city]," Google shows a map with three businesses. Being in that top three — the Map Pack — is worth more than any other marketing channel for trades businesses. These results get 42% of all clicks, and the searcher's intent is almost always to hire someone right now.

The three pillars of Map Pack ranking are: Google Business Profile completeness, review quantity and quality, and local relevance signals. Start with your GBP — fill in every single field. Business description, service areas, categories (pick the most specific primary category), business hours, photos of your work, and posts. Google rewards profiles that are 100% complete and regularly updated. Add at least 3-5 photos per month of recent jobs.

For local relevance, your website needs location-specific content. Create individual pages for each service you offer in each area you serve — "Emergency Plumbing in [City]" performs far better than a generic "Our Services" page. Build local citations by listing your business on directories like Yelp, Angi, HomeAdvisor, and your local chamber of commerce. Combined with a steady flow of genuine reviews, this playbook reliably moves businesses into the Map Pack within 60-90 days.`,
  },
  {
    title: "The Real Cost of Not Having Online Booking",
    category: "Strategy",
    date: "Jul 2026",
    readMin: 4,
    summary: "Every hour you make a customer wait to book is an hour they call your competitors. What no-booking-system businesses actually lose.",
    icon: Calendar,
    vivid: VIVID.yellow,
    body: `A homeowner discovers a leaking pipe at 9pm on a Tuesday. They search for a local plumber, find your website, and see a contact form. They fill it out and wait. By the next morning when you check your inbox, they have already called two other plumbers — one of whom had online booking and confirmed an appointment at 8am. You lost the job before you even saw the lead.

This scenario plays out hundreds of times a year for the average trades business without online booking. Research shows that 67% of consumers prefer self-service scheduling over calling, and 40% of bookings happen outside business hours. When you force every customer through a phone call or contact form, you are filtering out the majority who want to book on their own terms.

The maths is simple. If you receive 20 website enquiries per month and an online booking system converts even 30% of those into confirmed appointments (compared to the typical 15% from contact forms), that is 3 extra booked jobs per month. At an average job value of $350 for a typical trade, that is over $12,000 per year in revenue from a system that costs a fraction of that.`,
  },
];

/* ──────────────────────────────────────────────────────────────────
   Tab strip — Resources shortcut tabs (Effortel pill style)
   ────────────────────────────────────────────────────────────────── */

interface TabItem { label: string; href: string; }
const RESOURCE_TABS: TabItem[] = [
  { label: "BLOG",         href: "/blog" },
  { label: "DOCS",         href: "/docs" },
  { label: "CASE STUDIES", href: "/case-studies" },
  { label: "RESOURCES",    href: "/resources" },
];

function ResourceTabStrip({ active }: { active: string }) {
  return (
    <div style={{
      display: "inline-flex",
      gap: 4,
      padding: 4,
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${mkt.onDarkBorder}`,
      borderRadius: 12,
    }}>
      {RESOURCE_TABS.map((t) => {
        const isActive = t.href === active;
        return (
          <Link key={t.href} href={t.href} style={{
            display: "inline-flex", alignItems: "center",
            padding: "7px 12px",
            borderRadius: 9,
            fontSize: 10.5, fontWeight: 700,
            fontFamily: MONO, letterSpacing: "0.06em",
            whiteSpace: "nowrap",
            lineHeight: 1,
            textDecoration: "none",
            background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
            color: isActive ? mkt.onDark : mkt.onDarkMuted,
            transition: "background 200ms ease, color 200ms ease",
          }}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   FeaturedCard — the big card body (split: vivid art + dark info)
   ────────────────────────────────────────────────────────────────── */

function ConcentricRings({ ink }: { ink: string }) {
  return (
    <svg
      width="100%" height="100%"
      viewBox="0 0 600 380"
      style={{ position: "absolute", inset: 0, opacity: 0.35, pointerEvents: "none" }}
    >
      {[60, 110, 160, 210, 260, 310].map((r) => (
        <ellipse
          key={r} cx="300" cy="190" rx={r * 1.2} ry={r * 0.78}
          fill="none" stroke={ink} strokeWidth="1.2"
        />
      ))}
    </svg>
  );
}

function FeaturedCard({ post, big }: { post: Post; big: boolean }) {
  const Icon = post.icon;
  const tileSize = big ? 200 : 160;
  return (
    <div style={{
      display: "flex",
      borderRadius: 22,
      overflow: "hidden",
      border: `1px solid ${mkt.onDarkBorder}`,
      background: mkt.sectionLight,
      width: "100%",
      height: "100%",
    }}>
      {/* Vivid art half */}
      <div style={{
        flex: "1 1 60%",
        background: post.vivid.bg,
        position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        <ConcentricRings ink={post.vivid.ink} />
        <div style={{
          position: "relative",
          width: tileSize, height: tileSize, borderRadius: 28,
          background: post.vivid.ink,
          color: post.vivid.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          transform: "rotate(-7deg)",
          boxShadow: `0 24px 60px ${post.vivid.ink}55`,
        }}>
          <Icon size={tileSize * 0.4} strokeWidth={2} />
        </div>
      </div>

      {/* Dark info half */}
      <div style={{
        flex: "1 1 40%",
        padding: big ? "28px 32px" : "20px 24px",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        gap: 12,
      }}>
        <div>
          <div style={{ display: "inline-flex", gap: 6, marginBottom: 18 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "5px 10px", borderRadius: 6,
              background: "rgba(255,255,255,0.06)", color: mkt.onDark,
              fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}>{post.category}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "5px 8px", borderRadius: 6,
              background: "rgba(255,255,255,0.04)", color: mkt.onDarkMuted,
              fontFamily: MONO,
              border: `1px solid ${mkt.onDarkBorder}`,
            }}>+2</span>
          </div>
          <h3 style={{
            fontSize: big ? "clamp(20px, 2.2vw, 26px)" : 16,
            fontWeight: 700,
            color: mkt.onDark,
            lineHeight: 1.2, letterSpacing: "-0.01em",
            margin: 0,
            fontFamily: SANS,
          }}>
            {post.title}
          </h3>
        </div>
        <div style={{ fontFamily: MONO }}>
          <p style={{ fontSize: 11, color: mkt.onDarkMuted, margin: "0 0 4px", letterSpacing: "0.04em" }}>
            {post.readMin} min
          </p>
          <p style={{ fontSize: 13, color: mkt.onDarkMuted, margin: 0, letterSpacing: "0.04em" }}>
            {post.date}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   FeaturedCarousel — drag-to-scroll, tilted side cards, custom cursor
   ────────────────────────────────────────────────────────────────── */

function FeaturedCarousel({ posts, onOpen }: {
  posts: Post[];
  onOpen: (i: number) => void;
}) {
  const [active, setActive] = useState(0);
  const [drag, setDrag] = useState<{ start: number; delta: number } | null>(null);
  const [hover, setHover] = useState(false);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const cardW = isMobile ? 320 : 720;
  const cardH = isMobile ? 360 : 420;
  const gap = isMobile ? 24 : 56;

  const goPrev = () => setActive((i) => Math.max(0, i - 1));
  const goNext = () => setActive((i) => Math.min(posts.length - 1, i + 1));

  const onMove = (e: React.PointerEvent) => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
    }
    if (drag !== null) setDrag({ ...drag, delta: e.clientX - drag.start });
  };
  const onDown = (e: React.PointerEvent) => {
    setDrag({ start: e.clientX, delta: 0 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onUp = () => {
    if (drag !== null) {
      const threshold = cardW * 0.18;
      if (drag.delta > threshold) goPrev();
      else if (drag.delta < -threshold) goNext();
    }
    setDrag(null);
  };

  return (
    <section style={{ background: mkt.bg, padding: isMobile ? "32px 8px 24px" : "48px 12px 24px" }}>
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => { setHover(false); onUp(); }}
        style={{
          position: "relative",
          height: cardH + 60,
          maxWidth: 1400,
          margin: "0 auto",
          cursor: isMobile ? "grab" : "none",
          touchAction: "pan-y",
          userSelect: "none",
          overflow: "hidden",
        }}
      >
        {posts.map((post, i) => {
          const offset = i - active;
          const x = offset * (cardW + gap) + (drag?.delta ?? 0);
          const dist = Math.abs(offset);
          const rot = offset === 0 ? 0 : (offset > 0 ? -4 : 4);
          const scale = offset === 0 ? 1 : 0.86;
          const opacity = dist > 1.5 ? 0 : offset === 0 ? 1 : 0.45;
          return (
            <div
              key={i}
              onClick={() => offset === 0 && drag === null && onOpen(i)}
              style={{
                position: "absolute",
                top: 24, left: "50%",
                width: cardW, height: cardH,
                transform: `translate(calc(-50% + ${x}px), 0) rotate(${rot}deg) scale(${scale})`,
                transformOrigin: "center center",
                opacity,
                pointerEvents: dist > 1.5 ? "none" : "auto",
                cursor: offset === 0 ? "pointer" : "default",
                transition: drag === null
                  ? "transform 600ms cubic-bezier(0.22,1,0.36,1), opacity 400ms ease"
                  : "none",
                zIndex: offset === 0 ? 3 : 1,
                filter: offset === 0 ? "none" : "saturate(0.7) brightness(0.85)",
              }}
            >
              <FeaturedCard post={post} big={offset === 0} />
            </div>
          );
        })}

        {/* Custom circular cursor — desktop only, absolute to carousel */}
        {!isMobile && hover && (
          <div style={{
            position: "absolute",
            left: cursor.x, top: cursor.y,
            width: drag !== null ? 76 : 64,
            height: drag !== null ? 76 : 64,
            borderRadius: "50%",
            background: drag !== null ? "rgba(102,232,250,0.20)" : "rgba(255,255,255,0.10)",
            border: `1.5px solid ${drag !== null ? mkt.accent : "rgba(255,255,255,0.55)"}`,
            backdropFilter: "blur(6px)",
            color: mkt.onDark,
            fontSize: 9, fontWeight: 700,
            fontFamily: MONO, letterSpacing: "0.12em",
            display: "flex", alignItems: "center", justifyContent: "center",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 10,
            transition: "width 180ms ease, height 180ms ease, background 180ms ease, border-color 180ms ease",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          }}>
            {drag !== null ? "DRAGGING" : "DRAG"}
          </div>
        )}
      </div>

      {/* Arrow nav under carousel */}
      <div style={{
        display: "flex", justifyContent: "center", gap: 12,
        marginTop: 20,
      }}>
        <button
          onClick={goPrev}
          disabled={active === 0}
          aria-label="Previous post"
          style={{
            width: 48, height: 48, borderRadius: "50%",
            border: `1px solid ${mkt.onDarkBorder}`,
            background: "rgba(255,255,255,0.04)",
            color: active === 0 ? mkt.onDarkMuted : mkt.onDark,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: active === 0 ? "default" : "pointer",
            opacity: active === 0 ? 0.4 : 1,
            transition: "background 200ms ease, opacity 200ms ease",
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <button
          onClick={goNext}
          disabled={active === posts.length - 1}
          aria-label="Next post"
          style={{
            width: 48, height: 48, borderRadius: "50%",
            border: `1px solid ${mkt.onDarkBorder}`,
            background: "rgba(255,255,255,0.04)",
            color: active === posts.length - 1 ? mkt.onDarkMuted : mkt.onDark,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: active === posts.length - 1 ? "default" : "pointer",
            opacity: active === posts.length - 1 ? 0.4 : 1,
            transition: "background 200ms ease, opacity 200ms ease",
          }}
        >
          <ArrowRight size={18} />
        </button>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────
   GridCard — bright tiles for the lower archive grid
   ────────────────────────────────────────────────────────────────── */

function GridCard({ post, i, onOpen }: { post: Post; i: number; onOpen: (i: number) => void }) {
  const [hover, setHover] = useState(false);
  const Icon = post.icon;
  return (
    <article
      onClick={() => onOpen(i)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: mkt.sectionLight,
        border: `1px solid ${hover ? "rgba(102,232,250,0.45)" : mkt.onDarkBorder}`,
        borderRadius: 18,
        overflow: "hidden",
        cursor: "pointer",
        position: "relative",
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hover ? "0 18px 40px rgba(0,0,0,0.35)" : "0 0 0 rgba(0,0,0,0)",
        transition: "transform 320ms cubic-bezier(0.22,1,0.36,1), box-shadow 320ms cubic-bezier(0.22,1,0.36,1), border-color 320ms ease",
      }}
    >
      {/* Top — vivid art block */}
      <div style={{
        background: post.vivid.bg,
        height: 200,
        position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        <ConcentricRings ink={post.vivid.ink} />
        <div style={{
          position: "relative",
          width: 96, height: 96, borderRadius: 18,
          background: post.vivid.ink,
          color: post.vivid.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          transform: hover ? "rotate(-7deg) scale(1.05)" : "rotate(-7deg)",
          transition: "transform 320ms cubic-bezier(0.22,1,0.36,1)",
          boxShadow: `0 12px 30px ${post.vivid.ink}55`,
        }}>
          <Icon size={42} strokeWidth={2} />
        </div>
        {/* Top-right hover arrow */}
        <div style={{
          position: "absolute", top: 12, right: 12,
          width: 30, height: 30, borderRadius: 9,
          background: "rgba(0,0,0,0.25)",
          color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: hover ? 1 : 0,
          transform: hover ? "translate(0,0)" : "translate(6px,-6px)",
          transition: "opacity 280ms ease, transform 280ms cubic-bezier(0.22,1,0.36,1)",
          backdropFilter: "blur(6px)",
        }}>
          <ArrowUpRight size={16} strokeWidth={2.2} />
        </div>
      </div>

      {/* Bottom — dark info */}
      <div style={{ padding: "20px 22px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "inline-flex", gap: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "5px 10px", borderRadius: 6,
            background: "rgba(255,255,255,0.06)", color: mkt.onDark,
            fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase",
            border: `1px solid ${mkt.onDarkBorder}`,
          }}>{post.category}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "5px 8px", borderRadius: 6,
            background: "rgba(255,255,255,0.04)", color: mkt.onDarkMuted,
            fontFamily: MONO,
            border: `1px solid ${mkt.onDarkBorder}`,
          }}>+1</span>
        </div>
        <h3 style={{
          fontSize: 17, fontWeight: 700, color: mkt.onDark, margin: 0,
          lineHeight: 1.25, letterSpacing: "-0.01em",
        }}>{post.title}</h3>
        <div style={{
          fontFamily: MONO, fontSize: 11, color: mkt.onDarkMuted,
          letterSpacing: "0.04em",
          display: "flex", justifyContent: "space-between", marginTop: 4,
          paddingTop: 12, borderTop: `1px solid ${mkt.onDarkBorder}`,
        }}>
          <span>{post.readMin} min</span>
          <span>{post.date}</span>
        </div>
      </div>
    </article>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────────────────────── */

export default function BlogPage() {
  const [openArticle, setOpenArticle] = useState<number | null>(null);

  useEffect(() => {
    document.title = "Blog — WeFixTrades";
  }, []);

  // Jump to the top of the page whenever the user opens a post or returns to the index
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [openArticle]);

  const activePost = openArticle !== null ? BLOG_POSTS[openArticle] : null;

  return (
    <MarketingLayout>
      <V7PageShell>
        {activePost ? (
          /* Article detail view */
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
              }}>
                {activePost.category}
              </span>
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
                <Link
                  href="/Wizard"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "12px 28px", borderRadius: 14,
                    background: mkt.accent, color: mkt.dark,
                    fontSize: 15, fontWeight: 700, textDecoration: "none",
                  }}
                >
                  Get Started Free <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </section>
        ) : (
          <>
            {/* Hero — tabs first, then headline (Effortel order) */}
            <section style={{
              background: mkt.bg,
              padding: "48px 12px 12px",
              textAlign: "center",
            }}>
              <div style={{ marginBottom: 22 }}>
                <ResourceTabStrip active="/blog" />
              </div>
              <h1 style={{
                fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 700,
                color: mkt.onDark, margin: "0 auto", maxWidth: 880,
                lineHeight: 1.05, letterSpacing: "-0.025em",
                fontFamily: SANS,
              }}>
                Insights &amp; Trends — The<br />
                <span style={{ color: mkt.onDarkMuted }}>Future of Trades.</span>
              </h1>
            </section>

            {/* Featured carousel */}
            <FeaturedCarousel posts={BLOG_POSTS} onOpen={setOpenArticle} />

            {/* Archive grid */}
            <section style={{ background: mkt.bg, padding: "28px 12px 64px" }}>
              <div style={{
                maxWidth: 1400, margin: "0 auto",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 14,
              }}>
                {BLOG_POSTS.map((post, i) => (
                  <GridCard key={i} post={post} i={i} onOpen={setOpenArticle} />
                ))}
              </div>
            </section>

            {/* Closing CTA */}
            <section style={{ padding: "32px 16px 80px", textAlign: "center", background: mkt.bg }}>
              <h2 style={{
                fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700,
                color: mkt.onDark, margin: "0 0 12px", letterSpacing: "-0.02em",
              }}>
                Stay in the loop
              </h2>
              <p style={{
                fontSize: 16, color: mkt.onDarkMuted,
                margin: "0 auto 28px", maxWidth: 480,
              }}>
                New articles and product updates published regularly.
              </p>
              <Link href="/" style={{
                display: "inline-block", padding: "12px 28px", borderRadius: 14,
                background: mkt.dark, color: mkt.onDark,
                fontSize: 15, fontWeight: 600, textDecoration: "none",
              }}>
                Back to Home
              </Link>
            </section>
          </>
        )}
      </V7PageShell>
    </MarketingLayout>
  );
}
