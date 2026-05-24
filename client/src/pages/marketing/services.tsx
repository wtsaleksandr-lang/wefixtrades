import { useEffect, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { V7Hero, V7PageShell } from "@/components/marketing/v7";
import { mkt, colors, shadows } from "@/theme/tokens";
import voiceAssistantIcon from "@assets/voice-assistant-icon_1772080241394.webp";
import chatAssistantIcon from "@assets/chat-assistant-icon_1772080241379.webp";
// WebBoost removed — using placeholder for legacy icon reference
const webboostIcon = "";
import webcareIcon from "@assets/webcare-icon_1772080241410.webp";
import mapguardIcon from "@assets/mapguard-icon_1772080241423.webp";
import calendarIcon from "@assets/calendar-icon_1772080241291.webp";
import sitelaunchIcon from "@assets/sitelaunch-icon_1772080241325.webp";
import quickquoteIcon from "@assets/quickquote-icon_1772080241349.webp";
import socialsyncIcon from "@assets/socialsync-icon_1772080241338.webp";
import reputationshieldIcon from "@assets/reputationshield-icon_1772080241309.webp";
import {
  TRADELINE, QUOTEQUICK, RANKFLOW, MAPGUARD, SITELAUNCH,
  WEBFIX, SOCIALSYNC, REPUTATIONSHIELD,
  lowestMonthly, formatPrice,
} from "@/config/pricing";

export default function ServicesPage() {
  // Title + meta tags handled by <PageMeta> below.

  const [formData, setFormData] = useState({ name: "", email: "", service: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, subject: formData.service }),
      });
      setSubmitted(true);
    } catch {
    } finally {
      setSubmitting(false);
    }
  };

  const s = {
    pageHeader: {
      background: `linear-gradient(135deg, ${mkt.dark}, ${mkt.darkHover})`,
      padding: "80px 24px 60px",
      textAlign: "center" as const,
    },
    pageHeaderH1: {
      fontSize: "clamp(32px, 5vw, 48px)",
      fontWeight: 700,
      color: mkt.onDark,
      margin: "0 0 16px",
      letterSpacing: "-0.025em",
    },
    pageHeaderSub: {
      fontSize: 18,
      color: mkt.onDarkMuted,
      margin: 0,
    },
    servicesSection: {
      background: mkt.surface,
      padding: "60px 24px",
    },
    servicesGrid: {
      maxWidth: 1120,
      margin: "0 auto",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
      gap: 24,
    },
    serviceCard: {
      background: mkt.bg,
      borderRadius: 16,
      padding: "32px 28px",
      boxShadow: shadows.card,
      border: `1px solid ${mkt.border}`,
      display: "flex",
      flexDirection: "column" as const,
      gap: 16,
    },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: 14,
      background: mkt.accentTint,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden" as const,
    },
    serviceIcon: {
      width: 48,
      height: 48,
      objectFit: "contain" as const,
    },
    serviceTitle: {
      fontSize: 18,
      fontWeight: 700,
      color: mkt.text,
      margin: 0,
    },
    serviceDesc: {
      fontSize: 14,
      color: mkt.textMuted,
      lineHeight: 1.6,
      margin: 0,
    },
    serviceFrom: {
      fontSize: 14,
      fontWeight: 700,
      color: mkt.accent,
    },
    requestBtn: {
      padding: "10px 20px",
      borderRadius: 10,
      background: mkt.ctaBg,
      color: mkt.ctaText,
      fontSize: 14,
      fontWeight: 500,
      border: "none",
      cursor: "pointer",
      alignSelf: "flex-start" as const,
      transition: "background 0.15s ease",
    },
    formSection: {
      background: mkt.bg,
      padding: "60px 24px",
    },
    formWrap: {
      maxWidth: 600,
      margin: "0 auto",
    },
    formTitle: {
      fontSize: 28,
      fontWeight: 700,
      color: mkt.text,
      margin: "0 0 8px",
      textAlign: "center" as const,
    },
    formSub: {
      fontSize: 15,
      color: mkt.textMuted,
      textAlign: "center" as const,
      margin: "0 0 32px",
    },
    field: {
      marginBottom: 20,
    },
    label: {
      display: "block",
      fontSize: 13,
      fontWeight: 600,
      color: mkt.textMuted,
      marginBottom: 6,
    },
    input: {
      width: "100%",
      padding: "10px 14px",
      borderRadius: 8,
      border: `1px solid ${mkt.border}`,
      fontSize: 14,
      color: mkt.text,
      outline: "none",
      boxSizing: "border-box" as const,
      fontFamily: "inherit",
    },
    select: {
      width: "100%",
      padding: "10px 14px",
      borderRadius: 8,
      border: `1px solid ${mkt.border}`,
      fontSize: 14,
      color: mkt.text,
      outline: "none",
      boxSizing: "border-box" as const,
      fontFamily: "inherit",
      background: mkt.bg,
      cursor: "pointer",
    },
    textarea: {
      width: "100%",
      padding: "10px 14px",
      borderRadius: 8,
      border: `1px solid ${mkt.border}`,
      fontSize: 14,
      color: mkt.text,
      outline: "none",
      boxSizing: "border-box" as const,
      fontFamily: "inherit",
      resize: "vertical" as const,
      minHeight: 120,
    },
    submitBtn: {
      width: "100%",
      padding: "12px",
      borderRadius: 14,
      background: mkt.accent,
      color: mkt.onDark,
      fontSize: 15,
      fontWeight: 600,
      border: "none",
      cursor: "pointer",
      transition: "background 0.15s ease",
    },
    successBox: {
      textAlign: "center" as const,
      padding: "40px 0",
    },
    successTitle: {
      fontSize: 22,
      fontWeight: 700,
      color: mkt.text,
      margin: "0 0 8px",
    },
    successSub: {
      fontSize: 15,
      color: mkt.textMuted,
    },
  };

  const services = [
    {
      id: "voice-assistant",
      img: voiceAssistantIcon,
      title: "TradeLine\u2122",
      desc: "AI call answering, SMS replies, missed call auto-response, and follow-ups. 200–1500 mins included.",
      from: `From $${TRADELINE.tiers[0].price}/mo`,
      testid: "service-voice-assistant",
      btnTestid: "button-request-info-voice-assistant",
    },
    {
      id: "chat-assistant",
      img: chatAssistantIcon,
      title: "QuoteQuick™",
      desc: "Instant quote calculator for your website. Give visitors real-time estimates and capture more leads.",
      from: `From ${formatPrice(lowestMonthly(QUOTEQUICK)!)}/mo`,
      testid: "service-chat-assistant",
      btnTestid: "button-request-info-chat-assistant",
    },
    {
      id: "seo",
      img: "",
      title: "RankFlow",
      desc: "Done-for-you local SEO. We handle keyword targeting, page optimization, local listings, and monthly progress tracking.",
      from: `From ${formatPrice(lowestMonthly(RANKFLOW)!)}/mo`,
      testid: "service-seo",
      btnTestid: "button-request-info-seo",
    },
    {
      id: "webcare",
      img: webcareIcon,
      title: "WebCare",
      desc: "Ongoing website maintenance. Updates, security checks, and monitoring so your site stays working.",
      from: `From $79/mo`,
      testid: "service-webcare",
      btnTestid: "button-request-info-webcare",
    },
    {
      id: "gmb",
      img: mapguardIcon,
      title: "MapGuard",
      desc: "Fully managed Google Maps visibility. We monitor, optimize, and fix your profile every month so you show up when customers search.",
      from: `From ${formatPrice(lowestMonthly(MAPGUARD)!)}/mo + ${formatPrice(MAPGUARD.setup!)} setup`,
      testid: "service-gmb",
      btnTestid: "button-request-info-gmb",
    },
    {
      id: "booking",
      img: calendarIcon,
      title: "Booking & Calendar Integration",
      desc: "Seamless booking and calendar add-on. Let customers schedule jobs directly from your website or calculator.",
      from: "Add-on",
      testid: "service-booking",
      btnTestid: "button-request-info-booking",
    },
    {
      id: "website",
      img: sitelaunchIcon,
      title: "SiteLaunch",
      desc: "Professional trade website built from scratch with QuoteQuick embed, mobile & speed optimization. Includes 14-day free trial.",
      from: `${formatPrice(SITELAUNCH.tiers[0].price)} one-time`,
      testid: "service-website",
      btnTestid: "button-request-info-website",
    },
    {
      id: "quickquote",
      img: quickquoteIcon,
      title: "WebFix\u2122",
      desc: "One-off website fixes, tweaks, and optimization. Broken pages, slow loading, SEO issues, design tweaks.",
      from: `${formatPrice(WEBFIX.tiers[0].price)} one-time`,
      testid: "service-quickquote",
      btnTestid: "button-request-info-quickquote",
    },
    {
      id: "social",
      img: socialsyncIcon,
      title: "SocialSync",
      desc: "Social media management and automation. Consistent posting, branded content, lead-gen campaigns on Facebook/Instagram.",
      from: `From ${formatPrice(lowestMonthly(SOCIALSYNC)!)}/mo`,
      testid: "service-social",
      btnTestid: "button-request-info-social",
    },
    {
      id: "reputation",
      img: reputationshieldIcon,
      title: "ReputationShield",
      desc: "Review and reputation management. Automated review requests, response templates, and reputation monitoring.",
      from: `From ${formatPrice(lowestMonthly(REPUTATIONSHIELD)!)}/mo`,
      testid: "service-reputation",
      btnTestid: "button-request-info-reputation",
    },
  ];

  return (
    <MarketingLayout>
      <PageMeta
        title="Growth services for trade businesses"
        description="QuoteQuick calculators, 24/7 TradeLine AI, MapGuard local SEO, RankFlow, ReputationShield — pick the services that move the needle for your trade business."
        canonical="/services"
        keywords={["trades growth services", "local seo for trades", "ai for trades"]}
      />
      <V7PageShell>
      <div data-testid="services-page">
        <V7Hero
          productName="Done-For-You Services"
          eyebrow="You handle the trade. We handle the rest."
          headline={<>Growth services<br/><span style={{ color: mkt.accent }}>delivered, not DIY.</span></>}
          sub="We install, configure, and operate every tool for you. Real humans you can reach, fixed monthly fees."
        />

        <div style={s.servicesSection}>
          <div style={s.servicesGrid}>
            {services.map(svc => (
              <div key={svc.id} style={s.serviceCard} data-testid={svc.testid}>
                <div style={s.iconWrap}>
                  <img src={svc.img} alt={svc.title} style={s.serviceIcon} loading="lazy" />
                </div>
                <h3 style={s.serviceTitle}>{svc.title}</h3>
                <p style={s.serviceDesc}>{svc.desc}</p>
                <span style={s.serviceFrom}>{svc.from}</span>
                <button style={s.requestBtn} data-testid={svc.btnTestid}>
                  Request Info
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={s.formSection}>
          <div style={s.formWrap}>
            <h2 style={s.formTitle}>Get in Touch</h2>
            <p style={s.formSub}>Tell us about your business and we'll recommend the right service package.</p>

            {submitted ? (
              <div style={s.successBox} data-testid="services-contact-success">
                <h3 style={s.successTitle}>Message sent!</h3>
                <p style={s.successSub}>We'll get back to you within 2 hours.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} data-testid="contact-form-services">
                <div style={s.field}>
                  <label style={s.label} htmlFor="svc-name">Name</label>
                  <input
                    id="svc-name"
                    style={s.input}
                    type="text"
                    required
                    placeholder="Your name"
                    value={formData.name}
                    onChange={e => setFormData(d => ({ ...d, name: e.target.value }))}
                    data-testid="input-services-name"
                  />
                </div>
                <div style={s.field}>
                  <label style={s.label} htmlFor="svc-email">Email</label>
                  <input
                    id="svc-email"
                    style={s.input}
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={e => setFormData(d => ({ ...d, email: e.target.value }))}
                    data-testid="input-services-email"
                  />
                </div>
                <div style={s.field}>
                  <label style={s.label} htmlFor="svc-service">Service Interest</label>
                  <select
                    id="svc-service"
                    style={s.select}
                    value={formData.service}
                    onChange={e => setFormData(d => ({ ...d, service: e.target.value }))}
                    data-testid="select-services-interest"
                  >
                    <option value="">Select a service...</option>
                    <option value="voice-assistant">24/7 Lead Assistant Voice</option>
                    <option value="chat-assistant">24/7 Lead Assistant Chat</option>
                    <option value="seo">RankFlow (Local SEO)</option>
                    <option value="webcare">WebCare (Maintenance)</option>
                    <option value="gmb">MapGuard (Google Maps)</option>
                    <option value="booking">Booking & Calendar Integration</option>
                    <option value="website">SiteLaunch (Website Build)</option>
                    <option value="quickquote">QuoteQuick (Calculator)</option>
                    <option value="social">SocialSync (Social Media)</option>
                    <option value="reputation">ReputationShield (Reviews)</option>
                    <option value="bundle">Growth Bundle / Autopilot</option>
                  </select>
                </div>
                <div style={s.field}>
                  <label style={s.label} htmlFor="svc-message">Message</label>
                  <textarea
                    id="svc-message"
                    style={s.textarea}
                    required
                    placeholder="Tell us about your business..."
                    value={formData.message}
                    onChange={e => setFormData(d => ({ ...d, message: e.target.value }))}
                    data-testid="input-services-message"
                  />
                </div>
                <button type="submit" style={s.submitBtn} disabled={submitting} data-testid="button-services-submit">
                  {submitting ? "Sending..." : "Send Message"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
      </V7PageShell>
    </MarketingLayout>
  );
}
