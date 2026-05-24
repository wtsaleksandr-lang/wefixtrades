/**
 * ServiceStackTimeline — homepage 3rd-type section.
 *
 * Showcases the 4 done-for-you delivery services as a vertical scroll-driven
 * timeline. Each panel scales + brightens as it scrolls into the centre of the
 * viewport; previous panels shrink to a side rail of "completed" steps. Visual
 * metaphor: building a house, with each service as a step you don't have to do.
 *
 * Visually distinct from CapabilitiesShowcase (tabs) and StickyStackCards
 * (sticky overlap) — this is the third pattern, covering the final 4 of the
 * 12-product catalogue.
 */

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform, useInView, useReducedMotion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Globe, ShieldCheck, Megaphone, Calendar, Check } from "lucide-react";
import { Ticker, MONO, SANS, TILE } from "@/components/effortel-blocks";

const BG = "#dfe8e6";
const SURFACE = "#f5fcff";
const INK = "#22282a";
const MUTED = "#5f6f77";
const ACCENT = "#3d5a5e";

interface Service {
  number: string;
  product: string;
  title: string;
  hook: string;
  href: string;
  icon: typeof Globe;
  tile: ReactNode;
  bullets: string[];
}

const SERVICES: Service[] = [
  {
    number: "01",
    product: "SiteLaunch",
    title: "A site that's built to convert. Done in a week.",
    hook: "Pick a template, drop in your services, and we ship a hosted site optimized for Google and trade-buyer behaviour.",
    href: "/products/sitelaunch",
    icon: Globe,
    bullets: ["5–7 days from kickoff to live", "Lighthouse 95+ on mobile", "Hosting + maintenance included"],
    tile: <KpiTile a={{ value: "5–7", label: "Days to live", color: "cyanSoft" }} b={{ value: "98", label: "Lighthouse mobile", color: "mint" }} c={{ value: "$0", label: "Hosting fees", color: "lavender" }} />,
  },
  {
    number: "02",
    product: "WebCare",
    title: "Updates, security, uptime. We watch your site so you don't have to.",
    hook: "Plugin and theme updates auto-tested before they go live. Security & SSL checks. 15-minute uptime checks. Monthly health report.",
    href: "/products/webcare",
    icon: ShieldCheck,
    bullets: ["Uptime tracked 24/7", "Security & SSL checks", "Monthly health report"],
    tile: <KpiTile a={{ value: "24/7", label: "Uptime monitoring", color: "mint" }} b={{ value: "15m", label: "Check interval", color: "cyanSoft" }} c={{ value: "< 30s", label: "Alert latency", color: "lavender" }} />,
  },
  {
    number: "03",
    product: "AdFlow",
    title: "Real ads. A vetted agency tuning bids. Real ROI in your inbox.",
    hook: "Google + Meta campaigns run by a vetted ad-agency partner. Weekly tuning, swap creative, pause losers. Reports you can read — no agency-speak.",
    href: "/products/adflow",
    icon: Megaphone,
    bullets: ["Cost-per-lead drops weekly", "Trade-buyer creative", "Plain-English reports"],
    tile: <KpiTile a={{ value: "$42→$19", label: "CPL, week 1 to 4", color: "pink" }} b={{ value: "3.2×", label: "ROAS", color: "mint" }} c={{ value: "+340%", label: "vs DIY ads", color: "lavender" }} />,
  },
  {
    number: "04",
    product: "BookFlow",
    title: "Customers pick a slot. You show up. They pay on completion.",
    hook: "Self-service booking from your real calendar. Dispatch view for the field. Eight payment methods. Same-day funds.",
    href: "/products/bookflow",
    icon: Calendar,
    bullets: ["Self-booked from any device", "8 payment methods", "Funds available next day"],
    tile: <KpiTile a={{ value: "62%", label: "Self-booked", color: "cyanSoft" }} b={{ value: "8", label: "Payment methods", color: "mint" }} c={{ value: "Same day", label: "Funds available", color: "lavender" }} />,
  },
];

function KpiTile({ a, b, c }: { a: { value: string; label: string; color: keyof typeof TILE }; b: { value: string; label: string; color: keyof typeof TILE }; c: { value: string; label: string; color: keyof typeof TILE } }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
      {[a, b, c].map((s) => {
        const t = TILE[s.color];
        return (
          <div key={s.label} style={{ background: t.bg, borderRadius: 14, padding: "14px 12px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: t.ink, letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 6, fontFamily: SANS }}>
              <Ticker value={s.value} duration={1.4} />
            </div>
            <div style={{ fontSize: 9.5, fontFamily: MONO, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: t.muted }}>
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ServiceStackTimeline() {
  const sectionRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={sectionRef}
      style={{
        background: BG,
        /* compression: trimmed padding (was 80-120) and heading margin
         * (was 80). Panels gap halved (was 40). */
        padding: "clamp(48px, 6vw, 72px) clamp(20px, 5vw, 40px)",
        fontFamily: SANS,
        position: "relative",
        zIndex: 8,
        borderRadius: "28px 28px 0 0",
        marginTop: -28,
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {/* Heading */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 11, fontFamily: MONO, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: ACCENT, marginBottom: 12 }}>
            [ DONE FOR YOU ]
          </div>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 46px)", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.025em", color: INK, marginBottom: 12, maxWidth: 780, margin: "0 auto 12px" }}>
            You don't need a team. You have one.
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.5, color: MUTED, maxWidth: 600, margin: "0 auto" }}>
            Four services you'd usually hire four agencies for. Delivered by us — for what one of those agencies would charge.
          </p>
        </div>

        {/* Vertical stack */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {SERVICES.map((s, i) => (
            <ServicePanel key={s.number} service={s} index={i} total={SERVICES.length} />
          ))}
        </div>

        {/* Footer summary */}
        <div style={{ marginTop: 36, textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "10px 20px", borderRadius: 999, background: SURFACE, border: `1px solid rgba(34,40,42,0.08)`, fontSize: 13, fontWeight: 500, color: INK }}>
            <Check size={14} color="#10B981" strokeWidth={3} />
            Bundled together: about <strong>1/3</strong> of what 4 agencies would charge.
          </div>
        </div>
      </div>
    </section>
  );
}

function ServicePanel({ service, index }: { service: Service; index: number; total: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15%" });
  const reduced = useReducedMotion();

  // Subtle scroll-driven scale: panel grows slightly as it enters the centre.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const scale = useTransform(scrollYProgress, [0, 0.4, 0.6, 1], [0.96, 1, 1, 0.97]);

  const Icon = service.icon;

  return (
    <motion.div
      ref={ref}
      style={{
        background: SURFACE,
        borderRadius: 24,
        border: `1px solid rgba(34,40,42,0.08)`,
        padding: 0,
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(34,40,42,0.06)",
        scale: reduced ? 1 : scale,
      }}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: 0.05 * index, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="sst-panel-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 1fr",
          gap: 0,
        }}
      >
        {/* LEFT — text */}
        <div style={{ padding: "28px 32px 24px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: ACCENT, color: SURFACE,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon size={20} strokeWidth={1.6} />
              </div>
              <div style={{ fontSize: 11, fontFamily: MONO, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED }}>
                {service.number} · {service.product}
              </div>
            </div>
            <h3 style={{ fontSize: "clamp(20px, 2.2vw, 26px)", fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.02em", color: INK, marginBottom: 10 }}>
              {service.title}
            </h3>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: MUTED, marginBottom: 14 }}>
              {service.hook}
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "flex", flexDirection: "column", gap: 6 }}>
              {service.bullets.map((b) => (
                <li key={b} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: INK }}>
                  <Check size={14} color="#10B981" strokeWidth={3} />
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <Link href={service.href} style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
            color: INK, textDecoration: "none",
            padding: "10px 0",
            borderBottom: `1px solid ${ACCENT}`,
            alignSelf: "flex-start",
          }}>
            See {service.product} <ArrowRight size={14} />
          </Link>
        </div>

        {/* RIGHT — KPI tile */}
        <div style={{
          padding: "28px 32px 24px",
          background: BG,
          display: "flex", alignItems: "center",
        }}>
          <div style={{ width: "100%" }}>
            {service.tile}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .sst-panel-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </motion.div>
  );
}
