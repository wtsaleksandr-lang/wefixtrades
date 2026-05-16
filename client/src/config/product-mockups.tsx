/**
 * Per-product mockup configs — the inner-tile content for each product's
 * 4 numbered cards. Adding a new product = adding 4 entries here.
 *
 * Each entry: { number, title, description, cta?, mockup: ReactNode }
 *
 * The mockup is composed of primitives from components/effortel-blocks.
 */

import type { ReactNode } from "react";
import { Mic, Phone, MessageSquare, Calendar, Star, Sparkles, Globe, Eye, ImageIcon, Send, ShieldCheck, PenTool, TrendingUp, Zap, Calculator, Clock } from "lucide-react";
import {
  StatTile, MiniChartTile, FlowCard, OrbitingLogos,
  MapTile, RankTile, CalendarTile, GaugeTile, ReviewTile,
  TILE, MONO, SANS,
} from "@/components/effortel-blocks";
import MapMockup from "@/pages/products/mapguard/MapMockup";
import TradeLineChatDemo from "@/components/product-demos/TradeLineChatDemo";
import QuoteQuickDemo from "@/components/product-demos/QuoteQuickDemo";
import MapGuardDemo from "@/components/product-demos/MapGuardDemo";
import ReputationShieldDemo from "@/components/product-demos/ReputationShieldDemo";
import SocialSyncDemo from "@/components/product-demos/SocialSyncDemo";
import RankFlowDemo from "@/components/product-demos/RankFlowDemo";
import ContentFlowDemo from "@/components/product-demos/ContentFlowDemo";
import AdFlowDemo from "@/components/product-demos/AdFlowDemo";
import BookFlowDemo from "@/components/product-demos/BookFlowDemo";
import WebCareDemo from "@/components/product-demos/WebCareDemo";
import WebFixDemo from "@/components/product-demos/WebFixDemo";
import SiteLaunchDemo from "@/components/product-demos/SiteLaunchDemo";

export interface ProductMockupSection {
  number: string;
  title: string;
  description: string;
  cta?: { label: string; href: string };
  mockup: ReactNode;
}

/* ─── Reusable wee mockups ────────────────────────────────────── */

type StatProps = { value: string; label: string; color?: any; icon?: ReactNode };
function StatTrio({ a, b, c }: { a: StatProps; b: StatProps; c: StatProps }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, maxWidth: 720, width: "100%" }}>
      <StatTile size="lg" {...a} />
      <StatTile size="lg" {...b} />
      <StatTile size="lg" {...c} />
    </div>
  );
}

function ChatPreviewCenter() {
  return (
    <div style={{
      background: TILE.white.bg, color: TILE.white.ink,
      borderRadius: 14, padding: "16px 18px",
      minWidth: 220, fontFamily: SANS,
      boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
    }}>
      <div style={{ fontSize: 11, fontFamily: MONO, color: TILE.white.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
        Inbox
      </div>
      <RowMini icon={<Phone size={11} />} label="Sarah K." sub="Burst pipe — booked" />
      <RowMini icon={<MessageSquare size={11} />} label="Mike R." sub="AC quote sent" />
      <RowMini icon={<Calendar size={11} />} label="Diana L." sub="Follow-up done" />
    </div>
  );
}

function RowMini({ icon, label, sub }: { icon: ReactNode; label: string; sub: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid rgba(0,0,0,0.06)` }}>
      <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", color: TILE.white.ink }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: TILE.white.ink }}>{label}</div>
        <div style={{ fontSize: 10, color: TILE.white.muted, fontFamily: MONO }}>{sub}</div>
      </div>
    </div>
  );
}

const Wide = ({ children }: { children: ReactNode }) => (
  <div style={{ width: "100%", maxWidth: 720 }}>{children}</div>
);

/* ════════════════════════════════════════════════════════════════
   12 PRODUCT CONFIGS
   ════════════════════════════════════════════════════════════════ */

export const PRODUCT_MOCKUPS: Record<string, ProductMockupSection[]> = {

  /* ─── 1. TradeLine ─── */
  tradeline: [
    {
      number: "01",
      title: "Always-On Lead Handling",
      description: "Picks up at 2 AM the same way it picks up at 2 PM. Real-time AI handles inbound calls and chats around the clock — no voicemail, no missed revenue.",
      cta: { label: "See It Live", href: "/demo" },
      mockup: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 32, maxWidth: 880, width: "100%", alignItems: "center" }} className="effortel-grid-2">
          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr 1fr", gap: 12 }}>
            <StatTile value="100%" label="Calls answered" color="cyanSoft" size="sm" />
            <StatTile value="< 30s" label="Avg pick-up" color="lavender" size="sm" />
            <StatTile value="240+" label="Trades businesses" color="mint" size="sm" />
          </div>
          <TradeLineChatDemo />
        </div>
      ),
    },
    {
      number: "02",
      title: "Instant Estimates",
      description: "Configure your pricing once — flat, hourly, tiered, per-unit. TradeLine quotes every caller using your real numbers. No callbacks, no lost leads.",
      cta: { label: "See Pricing", href: "/pricing" },
      mockup: <Wide>
        <StatTrio
          a={{ value: "$185", label: "Drain unblock", color: "cyanSoft", icon: <Mic size={16} /> }}
          b={{ value: "$420", label: "HVAC tune-up", color: "lavender", icon: <Mic size={16} /> }}
          c={{ value: "$95", label: "Service call", color: "mint", icon: <Mic size={16} /> }}
        />
      </Wide>,
    },
    {
      number: "03",
      title: "Automated Follow-ups",
      description: "Confirmations, reminders, nurture sequences, review requests. Every lead gets the right message at the right time — without you remembering to send it.",
      cta: { label: "Learn More", href: "/products/tradeline" },
      mockup: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "auto auto", gap: 16, maxWidth: 720, width: "100%" }}>
          <StatTile value="5467894" label="Lead captured" color="cyanSoft" badge={<span style={{ fontSize: 10, fontFamily: MONO, padding: "3px 8px", borderRadius: 999, background: TILE.pink.bg, color: TILE.pink.ink, letterSpacing: "0.08em" }}>NEW</span>} />
          <StatTile value="$185.00" label="Estimated value" color="pink" />
          <FlowCard
            title="Follow-up plan"
            currentStep={{ label: "Sent", date: "2:47 AM", type: "check" }}
            nextStep="Reminder…"
            color="cyan"
            style={{ gridColumn: "span 2" }}
          />
        </div>
      ),
    },
    {
      number: "04",
      title: "One Inbox. All Channels.",
      description: "Phone, SMS, web chat — every conversation transcribed, tagged, and ready for follow-up. Plug into the tools you already use.",
      cta: { label: "See Integrations", href: "/products/tradeline" },
      mockup: (
        <OrbitingLogos
          center={<ChatPreviewCenter />}
          logos={[
            { label: "P", color: "#1E3A8A", angle: 200, ring: 2 },
            { label: "S", color: "#7C3AED", angle: 250, ring: 2 },
            { label: "W", color: "#059669", angle: 320, ring: 2 },
            { label: "G", color: "#DC2626", angle: 30,  ring: 2 },
            { label: "C", color: "#2563EB", angle: 100, ring: 1, size: 40 },
            { label: "Z", color: "#EA580C", angle: 160, ring: 1, size: 40 },
          ]}
        />
      ),
    },
  ],

  /* ─── 2. QuoteQuick Pro ─── */
  quickquotepro: [
    {
      number: "01",
      title: "Instant On-Site Quotes",
      description: "Customers get accurate prices on your website 24/7 — even when you're on a job site. Every quote becomes a captured lead.",
      cta: { label: "Try Demo", href: "/tools/quote-demo" },
      mockup: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 32, maxWidth: 880, width: "100%", alignItems: "center" }} className="effortel-grid-2">
          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr 1fr", gap: 12 }}>
            <StatTile value="$2 480" label="Bathroom remodel" color="cyanSoft" size="sm" icon={<Calculator size={14} />} />
            <StatTile value="$640" label="Drain unblock" color="lavender" size="sm" icon={<Calculator size={14} />} />
            <StatTile value="$1 250" label="Boiler install" color="mint" size="sm" icon={<Calculator size={14} />} />
          </div>
          <QuoteQuickDemo />
        </div>
      ),
    },
    {
      number: "02",
      title: "Every Quote Captures a Lead",
      description: "Name, email, phone — captured automatically with each estimate. Live in your dashboard before they leave the site.",
      cta: { label: "See Wizard", href: "/wizard" },
      mockup: (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, maxWidth: 720, width: "100%" }}>
          <MiniChartTile value="3×" label="More leads" trend="+212%" color="cyanSoft" />
          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 16 }}>
            <StatTile value="$420" label="Avg job value" color="pink" size="sm" />
            <StatTile value="5 min" label="Setup time" color="mint" size="sm" />
          </div>
        </div>
      ),
    },
    {
      number: "03",
      title: "Automated Follow-up & Booking",
      description: "Customers can book a slot and pay a deposit right after their quote. Email + SMS reminders run automatically.",
      cta: { label: "Learn More", href: "/products/quickquotepro" },
      mockup: <Wide><StatTrio
        a={{ value: "62%", label: "Quote-to-book", color: "lavender", icon: <TrendingUp size={16} /> }}
        b={{ value: "—", label: "Manual touches", color: "mint", icon: <Sparkles size={16} /> }}
        c={{ value: "0", label: "Add-on fees", color: "cyanSoft", icon: <ShieldCheck size={16} /> }}
      /></Wide>,
    },
    {
      number: "04",
      title: "Works With Everything You Use",
      description: "WordPress, Wix, Squarespace, Webflow, Shopify, plain HTML. Works alongside Jobber, Housecall Pro — no platform switch.",
      cta: { label: "See Integrations", href: "/products/quickquotepro" },
      mockup: <OrbitingLogos
        center={<div style={{ background: TILE.white.bg, color: TILE.white.ink, borderRadius: 14, padding: 18, minWidth: 200, fontFamily: SANS, boxShadow: "0 16px 40px rgba(0,0,0,0.4)" }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: TILE.white.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Embed</div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: TILE.white.ink, padding: 8, borderRadius: 6, background: "rgba(0,0,0,0.05)" }}>{'<script src="quotequick.js"/>'}</div>
        </div>}
        logos={[
          { label: "WP", color: "#1E40AF", angle: 200, ring: 2, size: 44 },
          { label: "W", color: "#0EA5E9", angle: 270, ring: 2 },
          { label: "Sq", color: "#000", angle: 340, ring: 2, size: 44 },
          { label: "S", color: "#16A34A", angle: 60, ring: 2 },
          { label: "J", color: "#0EA5E9", angle: 130, ring: 1, size: 40 },
        ]}
      />,
    },
  ],

  /* ─── 3. MapGuard ─── */
  mapguard: [
    {
      number: "01",
      title: "Your Profile, Always Optimized",
      description: "We monitor your Google Business Profile every week and fix issues before customers see them — wrong hours, broken images, missing categories.",
      cta: { label: "See Sample Report", href: "/tools/free-audit" },
      // Uses the new animated MapGuardDemo (live-fixing pins + score ticker)
      // alongside V7 stat tiles for context.
      mockup: <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 32, maxWidth: 880, width: "100%", alignItems: "center" }} className="effortel-grid-2">
        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr 1fr", gap: 12 }}>
          <StatTile value="89" label="Profile score" color="mint" size="sm" icon={<Eye size={14} />} />
          <StatTile value="12" label="Issues fixed" color="lavender" size="sm" icon={<ShieldCheck size={14} />} />
          <StatTile value="#3" label="Map pack rank" color="cyanSoft" size="sm" icon={<TrendingUp size={14} />} />
        </div>
        <MapGuardDemo />
      </div>,
    },
    {
      number: "02",
      title: "Issue Detection, Auto-Fixed",
      description: "We catch profile suspensions, hour mismatches, missing photos, and category drift. Most issues are auto-fixed by us — no work for you.",
      cta: { label: "Learn More", href: "/products/mapguard" },
      mockup: <Wide><StatTrio
        a={{ value: "47", label: "Issues found YTD", color: "cyanSoft", icon: <Eye size={16} /> }}
        b={{ value: "44", label: "Auto-fixed", color: "mint", icon: <ShieldCheck size={16} /> }}
        c={{ value: "3", label: "Escalated to you", color: "pink", icon: <Send size={16} /> }}
      /></Wide>,
    },
    {
      number: "03",
      title: "Visibility Score, Tracked",
      description: "Monthly reports show how often you appear in Maps searches and where you rank vs nearby competitors.",
      cta: { label: "Learn More", href: "/products/mapguard" },
      mockup: <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, maxWidth: 720, width: "100%" }}>
        <GaugeTile value={89} label="Visibility score" color="cyanSoft" />
        <MiniChartTile value="+87%" label="Map impressions" trend="30 days" color="mint" />
        <StatTile value="#3" label="Local pack rank" color="lavender" size="lg" />
      </div>,
    },
    {
      number: "04",
      title: "Connected To Everything",
      description: "Pulls Google Business Profile, Search Console, and Maps data. Pushes alerts to your inbox + dashboard.",
      cta: { label: "See How It Works", href: "/products/mapguard" },
      mockup: <OrbitingLogos
        center={<div style={{ background: TILE.white.bg, color: TILE.white.ink, borderRadius: 14, padding: 18, minWidth: 200, fontFamily: SANS, boxShadow: "0 16px 40px rgba(0,0,0,0.4)" }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: TILE.white.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Health</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#10B981", letterSpacing: "-0.02em" }}>89/100</div>
          <div style={{ fontSize: 11, color: TILE.white.muted, marginTop: 4 }}>Last scan: 2h ago</div>
        </div>}
        logos={[
          { label: "G", color: "#DC2626", angle: 200, ring: 2 },
          { label: "M", color: "#2563EB", angle: 270, ring: 2 },
          { label: "SC", color: "#16A34A", angle: 340, ring: 2, size: 44 },
        ]}
      />,
    },
  ],

  /* ─── 4. ReputationShield ─── */
  reputationshield: [
    {
      number: "01",
      title: "Every Review Gets a Reply",
      description: "AI drafts a personalized reply to every review within minutes. You approve or it auto-sends after your set timeout.",
      cta: { label: "See Sample", href: "/demos/reputationshield" },
      mockup: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 32, maxWidth: 880, width: "100%", alignItems: "center" }} className="effortel-grid-2">
          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr 1fr", gap: 12 }}>
            <StatTile value="247" label="Reviews this year" color="cyanSoft" size="sm" icon={<Star size={14} />} />
            <StatTile value="< 30m" label="Avg reply time" color="lavender" size="sm" icon={<MessageSquare size={14} />} />
            <StatTile value="+1.2★" label="30-day lift" color="mint" size="sm" icon={<TrendingUp size={14} />} />
          </div>
          <ReputationShieldDemo />
        </div>
      ),
    },
    {
      number: "02",
      title: "Bad Reviews, Caught Fast",
      description: "1- and 2-star reviews are escalated to you immediately with a suggested response. Address concerns before they spread.",
      cta: { label: "Learn More", href: "/products/reputationshield" },
      mockup: <Wide><StatTrio
        a={{ value: "< 30 min", label: "Reply time avg", color: "cyanSoft", icon: <MessageSquare size={16} /> }}
        b={{ value: "4.9★", label: "Current avg", color: "mint", icon: <Star size={16} /> }}
        c={{ value: "+1.2★", label: "30-day lift", color: "lavender", icon: <TrendingUp size={16} /> }}
      /></Wide>,
    },
    {
      number: "03",
      title: "Review Requests, Automated",
      description: "Sends a Google review link the day after each completed job. The leads who liked the work tell the world about it.",
      cta: { label: "Learn More", href: "/products/reputationshield" },
      mockup: <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 720, width: "100%" }}>
        <MiniChartTile value="247" label="Reviews this year" trend="+183%" color="cyanSoft" />
        <GaugeTile value={94} label="Reply rate" color="mint" />
      </div>,
    },
    {
      number: "04",
      title: "Every Review, One Inbox",
      description: "Monitors your Google and Facebook reviews. Every reply drafted for you, ready to post in one place.",
      cta: { label: "Learn More", href: "/products/reputationshield" },
      mockup: <OrbitingLogos
        center={<div style={{ background: TILE.white.bg, color: TILE.white.ink, borderRadius: 14, padding: 18, minWidth: 220, fontFamily: SANS, boxShadow: "0 16px 40px rgba(0,0,0,0.4)" }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: TILE.white.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Reputation</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: TILE.white.ink, letterSpacing: "-0.02em" }}>4.9</span>
            <span style={{ fontSize: 14, color: "#F59E0B" }}>★★★★★</span>
          </div>
          <div style={{ fontSize: 11, color: TILE.white.muted, marginTop: 4 }}>247 reviews</div>
        </div>}
        logos={[
          { label: "G", color: "#DC2626", angle: 220, ring: 2 },
          { label: "F", color: "#1877F2", angle: 320, ring: 2 },
        ]}
      />,
    },
  ],

  /* ─── 5. SocialSync ─── */
  socialsync: [
    {
      number: "01",
      title: "AI-Drafted Posts, Your Voice",
      description: "Branded social posts written for your audience. Approved by you, scheduled by us. Never run out of content.",
      cta: { label: "Try Demo", href: "/demos/socialsync" },
      mockup: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 32, maxWidth: 880, width: "100%", alignItems: "center" }} className="effortel-grid-2">
          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr 1fr", gap: 12 }}>
            <StatTile value="12/wk" label="Posts auto-drafted" color="cyanSoft" size="sm" icon={<PenTool size={14} />} />
            <StatTile value="4" label="Channels per click" color="lavender" size="sm" icon={<Send size={14} />} />
            <StatTile value="+340%" label="Engagement lift" color="mint" size="sm" icon={<TrendingUp size={14} />} />
          </div>
          <SocialSyncDemo />
        </div>
      ),
    },
    {
      number: "02",
      title: "Multi-Channel Publishing",
      description: "One post → published to Facebook, Instagram, Google Business, and LinkedIn. Tracked, optimized, and analyzed in one place.",
      cta: { label: "Learn More", href: "/products/socialsync" },
      mockup: <Wide><StatTrio
        a={{ value: "4 channels", label: "From 1 click", color: "cyanSoft", icon: <Send size={16} /> }}
        b={{ value: "1 hr/wk", label: "Time spent", color: "lavender", icon: <Clock size={16} /> }}
        c={{ value: "240+", label: "Auto-posted/mo", color: "mint", icon: <Calendar size={16} /> }}
      /></Wide>,
    },
    {
      number: "03",
      title: "Performance, Tracked",
      description: "See which posts drive engagement, calls, and reviews. AI learns your audience and adjusts the next round.",
      cta: { label: "Learn More", href: "/products/socialsync" },
      mockup: <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, maxWidth: 720, width: "100%" }}>
        <MiniChartTile value="14.2k" label="Reach 30d" trend="+87%" color="cyanSoft" />
        <StatTile value="247" label="Engagements" color="lavender" size="lg" />
        <StatTile value="18" label="Calls from social" color="mint" size="lg" />
      </div>,
    },
    {
      number: "04",
      title: "Connected To Every Platform",
      description: "Facebook, Instagram, LinkedIn, Pinterest, Google Business. Add one, get them all.",
      cta: { label: "See Integrations", href: "/products/socialsync" },
      mockup: <OrbitingLogos
        center={<div style={{ background: TILE.white.bg, color: TILE.white.ink, borderRadius: 14, padding: 18, minWidth: 200, fontFamily: SANS, boxShadow: "0 16px 40px rgba(0,0,0,0.4)" }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: TILE.white.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>This week</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: TILE.white.ink }}>12 posts</div>
          <div style={{ fontSize: 11, color: TILE.white.muted, marginTop: 4 }}>Across 4 channels</div>
        </div>}
        logos={[
          { label: "F", color: "#1877F2", angle: 200, ring: 2 },
          { label: "Ig", color: "#E4405F", angle: 260, ring: 2, size: 44 },
          { label: "L", color: "#0A66C2", angle: 320, ring: 2 },
          { label: "P", color: "#BD081C", angle: 30, ring: 2 },
          { label: "G", color: "#EA4335", angle: 90, ring: 1, size: 40 },
        ]}
      />,
    },
  ],

  /* ─── 6. RankFlow ─── */
  rankflow: [
    {
      number: "01",
      title: "Track Every Keyword That Matters",
      description: "Monitor your rank for the searches that drive trades work in your area. Daily checks, weekly reports, monthly trend lines.",
      cta: { label: "Try Free SEO Check", href: "/demos/rankflow" },
      mockup: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 32, maxWidth: 880, width: "100%", alignItems: "center" }} className="effortel-grid-2">
          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr 1fr", gap: 12 }}>
            <StatTile value="47" label="Keywords tracked" color="mint" size="sm" icon={<Eye size={14} />} />
            <StatTile value="+18" label="Page-1 wins, 90d" color="lavender" size="sm" icon={<TrendingUp size={14} />} />
            <StatTile value="+38%" label="Organic clicks" color="cyanSoft" size="sm" icon={<TrendingUp size={14} />} />
          </div>
          <RankFlowDemo />
        </div>
      ),
    },
    {
      number: "02",
      title: "Search Console, Demystified",
      description: "All the data Google gives you, in plain English. Where you ranked, who clicked, what they searched.",
      cta: { label: "Learn More", href: "/products/rankflow" },
      mockup: <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, maxWidth: 720, width: "100%" }}>
        <MiniChartTile value="14 240" label="Impressions" trend="+62%" color="cyanSoft" />
        <MiniChartTile value="847" label="Clicks" trend="+38%" color="lavender" />
        <StatTile value="6.0%" label="Click-through rate" color="mint" size="lg" />
      </div>,
    },
    {
      number: "03",
      title: "Action Items, Not Charts",
      description: "Each report includes exactly which pages to update, which keywords to target, and which competitors to watch.",
      cta: { label: "See Sample Report", href: "/products/rankflow" },
      mockup: <Wide><StatTrio
        a={{ value: "5", label: "Pages to update", color: "pink", icon: <PenTool size={16} /> }}
        b={{ value: "12", label: "New keyword wins", color: "mint", icon: <TrendingUp size={16} /> }}
        c={{ value: "3", label: "Competitor moves", color: "lavender", icon: <Eye size={16} /> }}
      /></Wide>,
    },
    {
      number: "04",
      title: "Built On Real Google Data",
      description: "Search Console + GA4 + Maps. Real ranking data, not third-party scraping.",
      cta: { label: "See Integrations", href: "/products/rankflow" },
      mockup: <OrbitingLogos
        center={<div style={{ background: TILE.white.bg, color: TILE.white.ink, borderRadius: 14, padding: 18, minWidth: 200, fontFamily: SANS, boxShadow: "0 16px 40px rgba(0,0,0,0.4)" }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: TILE.white.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>This month</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: TILE.white.ink, letterSpacing: "-0.02em" }}>+38%</div>
          <div style={{ fontSize: 11, color: TILE.white.muted, marginTop: 4 }}>Organic clicks</div>
        </div>}
        logos={[
          { label: "GA", color: "#F9AB00", angle: 200, ring: 2, size: 44 },
          { label: "SC", color: "#4285F4", angle: 280, ring: 2, size: 44 },
          { label: "M", color: "#EA4335", angle: 0, ring: 2 },
        ]}
      />,
    },
  ],

  /* ─── 7. SiteLaunch ─── */
  sitelaunch: [
    {
      number: "01",
      title: "A Trade-Ready Site, Done For You",
      description: "Pick a template, drop in your services, and we ship a hosted site that's optimized for Google and converts trade visitors.",
      cta: { label: "See What's Included", href: "/products/sitelaunch" },
      mockup: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 32, maxWidth: 880, width: "100%", alignItems: "center" }} className="effortel-grid-2">
          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr 1fr", gap: 12 }}>
            <StatTile value="5–7 days" label="Kickoff to live" color="cyanSoft" size="sm" icon={<Clock size={14} />} />
            <StatTile value="98" label="Lighthouse mobile" color="mint" size="sm" icon={<Zap size={14} />} />
            <StatTile value="$0" label="Hosting fees" color="lavender" size="sm" icon={<ShieldCheck size={14} />} />
          </div>
          <SiteLaunchDemo />
        </div>
      ),
    },
    {
      number: "02",
      title: "Built For Conversion",
      description: "Every section is designed to turn visitors into leads. Quote widgets, click-to-call, instant chat — wired in from day one.",
      cta: { label: "Learn More", href: "/products/sitelaunch" },
      mockup: <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, maxWidth: 720, width: "100%" }}>
        <GaugeTile value={98} label="Performance" color="cyanSoft" />
        <GaugeTile value={100} label="SEO" color="mint" />
        <GaugeTile value={94} label="Accessibility" color="lavender" />
      </div>,
    },
    {
      number: "03",
      title: "AI-Optimized After Delivery",
      description: "Once launched, AI tunes copy, image alt text, and meta tags every month based on what's actually working in search.",
      cta: { label: "See Process", href: "/products/sitelaunch" },
      mockup: <Wide><StatTrio
        a={{ value: "Monthly", label: "AI tune-ups", color: "lavender", icon: <Sparkles size={16} /> }}
        b={{ value: "Free", label: "Updates included", color: "mint", icon: <ShieldCheck size={16} /> }}
        c={{ value: "→ pages", label: "Across the site", color: "cyanSoft", icon: <Globe size={16} /> }}
      /></Wide>,
    },
    {
      number: "04",
      title: "Plays Well With Everything",
      description: "Stripe, Calendly, Google Business, our quote widgets — wired in. Your existing tools come along.",
      cta: { label: "See Integrations", href: "/products/sitelaunch" },
      mockup: <OrbitingLogos
        center={<div style={{ background: TILE.white.bg, color: TILE.white.ink, borderRadius: 14, padding: 18, minWidth: 200, fontFamily: SANS, boxShadow: "0 16px 40px rgba(0,0,0,0.4)" }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: TILE.white.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Live</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: TILE.white.ink }}>your-trade.com</div>
          <div style={{ fontSize: 11, color: "#10B981", marginTop: 4 }}>● 99.99% uptime</div>
        </div>}
        logos={[
          { label: "S", color: "#635BFF", angle: 200, ring: 2 },
          { label: "C", color: "#0EA5E9", angle: 270, ring: 2 },
          { label: "G", color: "#DC2626", angle: 340, ring: 2 },
          { label: "QQ", color: "#0d3cfc", angle: 60, ring: 2, size: 44 },
        ]}
      />,
    },
  ],

  /* ─── 8. WebCare ─── */
  webcare: [
    {
      number: "01",
      title: "Your Site, Watched 24/7",
      description: "Uptime checks every 15 minutes. The moment your site goes down, we know — and so does our on-call team.",
      cta: { label: "Learn More", href: "/products/webcare" },
      mockup: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 32, maxWidth: 880, width: "100%", alignItems: "center" }} className="effortel-grid-2">
          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr 1fr", gap: 12 }}>
            <StatTile value="99.99%" label="30-day uptime" color="mint" size="sm" icon={<ShieldCheck size={14} />} />
            <StatTile value="2,880" label="Checks / month" color="cyanSoft" size="sm" icon={<Clock size={14} />} />
            <StatTile value="< 30s" label="Alert latency" color="lavender" size="sm" icon={<Zap size={14} />} />
          </div>
          <WebCareDemo />
        </div>
      ),
    },
    {
      number: "02",
      title: "Updates Without Drama",
      description: "WordPress, plugins, and themes auto-updated and tested. We catch breaks before your customers do.",
      cta: { label: "Learn More", href: "/products/webcare" },
      mockup: <Wide><StatTrio
        a={{ value: "47", label: "Updates this month", color: "cyanSoft", icon: <Zap size={16} /> }}
        b={{ value: "0", label: "Breaks reaching prod", color: "mint", icon: <ShieldCheck size={16} /> }}
        c={{ value: "Daily", label: "Backup snapshots", color: "lavender", icon: <Clock size={16} /> }}
      /></Wide>,
    },
    {
      number: "03",
      title: "Performance, Maintained",
      description: "Lighthouse scores monitored monthly. We fix regressions, compress new images, and keep page speed where it should be.",
      cta: { label: "Learn More", href: "/products/webcare" },
      mockup: <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, maxWidth: 720, width: "100%" }}>
        <GaugeTile value={94} label="Performance" color="cyanSoft" />
        <GaugeTile value={100} label="Best practices" color="mint" />
        <GaugeTile value={96} label="SEO" color="lavender" />
      </div>,
    },
    {
      number: "04",
      title: "One Dashboard For Everything",
      description: "Site health, traffic, security, backups — one place. Plus monthly health reports delivered to your inbox.",
      cta: { label: "See Dashboard", href: "/portal" },
      mockup: <OrbitingLogos
        center={<div style={{ background: TILE.white.bg, color: TILE.white.ink, borderRadius: 14, padding: 18, minWidth: 200, fontFamily: SANS, boxShadow: "0 16px 40px rgba(0,0,0,0.4)" }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: TILE.white.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Status</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10B981" }} />
            <span style={{ fontSize: 18, fontWeight: 700, color: TILE.white.ink }}>All systems normal</span>
          </div>
        </div>}
        logos={[
          { label: "WP", color: "#21759B", angle: 200, ring: 2, size: 44 },
          { label: "C", color: "#F38020", angle: 280, ring: 2 },
          { label: "U", color: "#10B981", angle: 0, ring: 2 },
        ]}
      />,
    },
  ],

  /* ─── 9. WebFix ─── */
  webfix: [
    {
      number: "01",
      title: "Audit, In Minutes",
      description: "Drop your URL — we score performance, SEO, accessibility, and best practices with explained issues you can act on.",
      cta: { label: "Try Free Audit", href: "/tools/free-audit" },
      mockup: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 32, maxWidth: 880, width: "100%", alignItems: "center" }} className="effortel-grid-2">
          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr 1fr", gap: 12 }}>
            <StatTile value="42 → 98" label="Lighthouse climb" color="mint" size="sm" icon={<Zap size={14} />} />
            <StatTile value="23 → 1" label="Issues fixed" color="cyanSoft" size="sm" icon={<ShieldCheck size={14} />} />
            <StatTile value="+184%" label="Organic traffic" color="lavender" size="sm" icon={<TrendingUp size={14} />} />
          </div>
          <WebFixDemo />
        </div>
      ),
    },
    {
      number: "02",
      title: "Fixes, Done For You",
      description: "We turn audit findings into actual code changes. Image compression, lazy loading, broken links, SEO meta — all sorted.",
      cta: { label: "Learn More", href: "/products/webfix" },
      mockup: <Wide><StatTrio
        a={{ value: "23 → 4", label: "Issues, before & after", color: "cyanSoft", icon: <Eye size={16} /> }}
        b={{ value: "+56pts", label: "Performance lift", color: "mint", icon: <Zap size={16} /> }}
        c={{ value: "5–7 days", label: "Turnaround", color: "lavender", icon: <Clock size={16} /> }}
      /></Wide>,
    },
    {
      number: "03",
      title: "Monthly Health Reports",
      description: "Track whether the fixes stuck. Performance scores, traffic, conversions — all charted month over month.",
      cta: { label: "See Sample", href: "/products/webfix" },
      mockup: <Wide><div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        <MiniChartTile value="+184%" label="Organic traffic" trend="90 days" color="cyanSoft" />
        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 16 }}>
          <StatTile value="2.1s" label="LCP avg" color="mint" size="sm" />
          <StatTile value="12" label="New page-1 keywords" color="lavender" size="sm" />
        </div>
      </div></Wide>,
    },
    {
      number: "04",
      title: "Works With Any Site",
      description: "WordPress, Webflow, Shopify, Wix, custom builds. We adapt to your stack — you don't migrate.",
      cta: { label: "See Stack", href: "/products/webfix" },
      mockup: <OrbitingLogos
        center={<div style={{ background: TILE.white.bg, color: TILE.white.ink, borderRadius: 14, padding: 18, minWidth: 200, fontFamily: SANS, boxShadow: "0 16px 40px rgba(0,0,0,0.4)" }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: TILE.white.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Lighthouse</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#10B981", letterSpacing: "-0.02em" }}>98</div>
          <div style={{ fontSize: 11, color: TILE.white.muted, marginTop: 4 }}>Mobile</div>
        </div>}
        logos={[
          { label: "WP", color: "#21759B", angle: 200, ring: 2, size: 44 },
          { label: "Wf", color: "#4353FF", angle: 280, ring: 2, size: 44 },
          { label: "S", color: "#16A34A", angle: 0, ring: 2 },
          { label: "Wx", color: "#000", angle: 90, ring: 2, size: 44 },
        ]}
      />,
    },
  ],

  /* ─── 10. ContentFlow ─── */
  contentflow: [
    {
      number: "01",
      title: "AI-Drafted Articles, Trade-Specific",
      description: "Content tuned to your trade, your service area, and your voice. Drafted weekly, approved by you, published automatically.",
      cta: { label: "See Sample", href: "/products/contentflow" },
      mockup: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 32, maxWidth: 880, width: "100%", alignItems: "center" }} className="effortel-grid-2">
          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr 1fr", gap: 12 }}>
            <StatTile value="4–8/mo" label="Articles drafted" color="cyanSoft" size="sm" icon={<PenTool size={14} />} />
            <StatTile value="~1 hr" label="Your time / month" color="lavender" size="sm" icon={<Clock size={14} />} />
            <StatTile value="+184%" label="Organic traffic" color="mint" size="sm" icon={<TrendingUp size={14} />} />
          </div>
          <ContentFlowDemo />
        </div>
      ),
    },
    {
      number: "02",
      title: "Long-Form + Social, In Sync",
      description: "Each blog post becomes a Facebook post, an Instagram caption, a LinkedIn share, and a Google Business update.",
      cta: { label: "Learn More", href: "/products/contentflow" },
      mockup: <Wide><div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        <CalendarTile cells={["booked", "free", "booked", "today", "free", "booked", "free", "booked", "free", "booked", "free", "booked", "free", "booked"]} label="Distribution calendar" color="cyanSoft" />
        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 16 }}>
          <StatTile value="4 channels" label="Per article" color="mint" size="sm" />
          <StatTile value="100%" label="Auto-distributed" color="lavender" size="sm" />
        </div>
      </div></Wide>,
    },
    {
      number: "03",
      title: "Performance Feeds The Loop",
      description: "We see which pieces drive calls and clicks — then adjust the next batch to do more of what's working.",
      cta: { label: "Learn More", href: "/products/contentflow" },
      mockup: <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, maxWidth: 720, width: "100%" }}>
        <MiniChartTile value="+184%" label="Organic traffic" trend="90 days" color="cyanSoft" />
        <StatTile value="247" label="Engagements/post" color="lavender" size="lg" />
        <StatTile value="18" label="Calls from posts" color="mint" size="lg" />
      </div>,
    },
    {
      number: "04",
      title: "Distributed Everywhere",
      description: "WordPress, Facebook, Instagram, LinkedIn, Google Business, YouTube. One workflow, every channel.",
      cta: { label: "See Channels", href: "/products/contentflow" },
      mockup: <OrbitingLogos
        center={<div style={{ background: TILE.white.bg, color: TILE.white.ink, borderRadius: 14, padding: 18, minWidth: 200, fontFamily: SANS, boxShadow: "0 16px 40px rgba(0,0,0,0.4)" }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: TILE.white.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>This week</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: TILE.white.ink }}>1 article</div>
          <div style={{ fontSize: 11, color: TILE.white.muted, marginTop: 4 }}>+ 6 social posts</div>
        </div>}
        logos={[
          { label: "WP", color: "#21759B", angle: 200, ring: 2, size: 44 },
          { label: "F", color: "#1877F2", angle: 260, ring: 2 },
          { label: "Ig", color: "#E4405F", angle: 320, ring: 2, size: 44 },
          { label: "L", color: "#0A66C2", angle: 30, ring: 2 },
          { label: "Y", color: "#FF0000", angle: 90, ring: 2 },
        ]}
      />,
    },
  ],

  /* ─── 11. AdFlow ─── */
  adflow: [
    {
      number: "01",
      title: "Google Ads, Run For You",
      description: "Real campaigns, managed by humans + AI. We tune bids, swap creative, and pause losers — every week.",
      cta: { label: "Learn More", href: "/products/adflow" },
      mockup: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 32, maxWidth: 880, width: "100%", alignItems: "center" }} className="effortel-grid-2">
          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr 1fr", gap: 12 }}>
            <StatTile value="$42→$19" label="Cost per lead, 4 wks" color="cyanSoft" size="sm" icon={<TrendingUp size={14} />} />
            <StatTile value="3.2×" label="ROAS" color="mint" size="sm" icon={<Zap size={14} />} />
            <StatTile value="+340%" label="vs DIY ads" color="lavender" size="sm" icon={<Sparkles size={14} />} />
          </div>
          <AdFlowDemo />
        </div>
      ),
    },
    {
      number: "02",
      title: "Creative That Speaks Trades",
      description: "Headlines, images, and copy written for trade buyers — emergency calls, quote requests, service calls.",
      cta: { label: "See Examples", href: "/products/adflow" },
      mockup: <Wide><StatTrio
        a={{ value: "12", label: "Active ads", color: "cyanSoft", icon: <Sparkles size={16} /> }}
        b={{ value: "8.4%", label: "CTR", color: "mint", icon: <TrendingUp size={16} /> }}
        c={{ value: "+340%", label: "Vs DIY ads", color: "lavender", icon: <Zap size={16} /> }}
      /></Wide>,
    },
    {
      number: "03",
      title: "Reports You Can Read",
      description: "What you spent, what came back, and what we changed last week. No agency-speak.",
      cta: { label: "See Sample Report", href: "/products/adflow" },
      mockup: <Wide><div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <MiniChartTile value="$8 240" label="Revenue from ads" trend="+212%" color="cyanSoft" />
        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 16 }}>
          <StatTile value="3.2×" label="ROAS" color="mint" size="sm" />
          <StatTile value="47" label="Leads delivered" color="lavender" size="sm" />
        </div>
      </div></Wide>,
    },
    {
      number: "04",
      title: "Connected To Your Funnel",
      description: "Google Ads, Meta Ads, your CRM, your dashboards. One signal flowing end-to-end.",
      cta: { label: "See Integrations", href: "/products/adflow" },
      mockup: <OrbitingLogos
        center={<div style={{ background: TILE.white.bg, color: TILE.white.ink, borderRadius: 14, padding: 18, minWidth: 200, fontFamily: SANS, boxShadow: "0 16px 40px rgba(0,0,0,0.4)" }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: TILE.white.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Last 7 days</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: TILE.white.ink, letterSpacing: "-0.02em" }}>$1 247</div>
          <div style={{ fontSize: 11, color: "#10B981", marginTop: 4 }}>↑ 18% vs prev week</div>
        </div>}
        logos={[
          { label: "G", color: "#4285F4", angle: 200, ring: 2 },
          { label: "M", color: "#1877F2", angle: 280, ring: 2 },
          { label: "GA", color: "#F9AB00", angle: 0, ring: 2, size: 44 },
        ]}
      />,
    },
  ],

  /* ─── 12. BookFlow ─── */
  bookflow: [
    {
      number: "01",
      title: "Customer-Side Booking",
      description: "Customers pick a time slot from your real availability — no email back-and-forth, no missed appointments.",
      cta: { label: "Try Demo", href: "/demo" },
      mockup: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 32, maxWidth: 880, width: "100%", alignItems: "center" }} className="effortel-grid-2">
          <div style={{ display: "grid", gridTemplateRows: "1fr 1fr 1fr", gap: 12 }}>
            <StatTile value="62%" label="Self-booked" color="cyanSoft" size="sm" icon={<Calendar size={14} />} />
            <StatTile value="0" label="Phone-tag rounds" color="mint" size="sm" icon={<ShieldCheck size={14} />} />
            <StatTile value="Same day" label="Funds available" color="lavender" size="sm" icon={<Clock size={14} />} />
          </div>
          <BookFlowDemo />
        </div>
      ),
    },
    {
      number: "02",
      title: "Dispatch View, Made Simple",
      description: "A daily list optimized for the field. Driving directions, customer notes, and pay-on-completion built in.",
      cta: { label: "See Mobile View", href: "/portal/dispatch" },
      mockup: <Wide><StatTrio
        a={{ value: "8", label: "Jobs today", color: "cyanSoft", icon: <Calendar size={16} /> }}
        b={{ value: "$2 480", label: "Day's revenue", color: "mint", icon: <TrendingUp size={16} /> }}
        c={{ value: "Auto-routed", label: "By proximity", color: "lavender", icon: <Globe size={16} /> }}
      /></Wide>,
    },
    {
      number: "03",
      title: "Pay On Completion",
      description: "Card, Apple Pay, bank, e-transfer. Customer pays the moment the job is done — funds in your account next day.",
      cta: { label: "Learn More", href: "/products/bookflow" },
      mockup: <Wide><StatTrio
        a={{ value: "8 methods", label: "Payment options", color: "cyanSoft", icon: <Send size={16} /> }}
        b={{ value: "Same day", label: "Funds available", color: "mint", icon: <Clock size={16} /> }}
        c={{ value: "0%", label: "Setup fees", color: "lavender", icon: <ShieldCheck size={16} /> }}
      /></Wide>,
    },
    {
      number: "04",
      title: "Connects To Your Calendar",
      description: "Google Calendar, Cal.com, Calendly. Your real availability, no double-bookings.",
      cta: { label: "See Calendars", href: "/products/bookflow" },
      mockup: <OrbitingLogos
        center={<div style={{ background: TILE.white.bg, color: TILE.white.ink, borderRadius: 14, padding: 18, minWidth: 200, fontFamily: SANS, boxShadow: "0 16px 40px rgba(0,0,0,0.4)" }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: TILE.white.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Today</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: TILE.white.ink, letterSpacing: "-0.02em" }}>8 jobs</div>
          <div style={{ fontSize: 11, color: TILE.white.muted, marginTop: 4 }}>$2 480 booked</div>
        </div>}
        logos={[
          { label: "G", color: "#4285F4", angle: 200, ring: 2 },
          { label: "C", color: "#0EA5E9", angle: 280, ring: 2 },
          { label: "Cy", color: "#000", angle: 0, ring: 2, size: 44 },
          { label: "S", color: "#635BFF", angle: 90, ring: 2 },
        ]}
      />,
    },
  ],

  /* ─── Fallback for any unknown slug ─── */
  __default: [
    {
      number: "01",
      title: "Built For Trades",
      description: "Every WeFixTrades product is built specifically for trades businesses — not retrofitted from a generic SaaS.",
      mockup: <Wide><StatTrio
        a={{ value: "240+", label: "Trades businesses", color: "cyanSoft" }}
        b={{ value: "5 min", label: "Setup time", color: "lavender" }}
        c={{ value: "Cancel anytime", label: "No contracts", color: "mint" }}
      /></Wide>,
    },
  ],
};
