import { useEffect, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { MapPin, TrendingUp, Globe, Star, Share2 } from "lucide-react";

export default function ServicesPage() {
  useEffect(() => {
    document.title = "Growth Services — WeFixTrades";
  }, []);

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
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const s = {
    pageHeader: {
      background: "linear-gradient(135deg, #0B1F3A, #1A3A5C)",
      padding: "80px 24px 60px",
      textAlign: "center" as const,
    },
    pageHeaderH1: {
      fontSize: "clamp(32px, 5vw, 48px)",
      fontWeight: 800,
      color: "#FFFFFF",
      margin: "0 0 16px",
      letterSpacing: "-0.02em",
    },
    pageHeaderSub: {
      fontSize: 18,
      color: "rgba(255,255,255,0.7)",
      margin: 0,
    },
    servicesSection: {
      background: "#F7F8FA",
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
      background: "#FFFFFF",
      borderRadius: 12,
      padding: "32px 28px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 1px 8px rgba(0,0,0,0.04)",
      border: "1px solid #E5E7EB",
      display: "flex",
      flexDirection: "column" as const,
      gap: 16,
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 12,
      background: "#F0F7F4",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    serviceTitle: {
      fontSize: 18,
      fontWeight: 700,
      color: "#111827",
      margin: 0,
    },
    serviceDesc: {
      fontSize: 14,
      color: "#6B7280",
      lineHeight: 1.6,
      margin: 0,
    },
    serviceFrom: {
      fontSize: 14,
      fontWeight: 700,
      color: "#2D6A4F",
    },
    requestBtn: {
      padding: "10px 20px",
      borderRadius: 8,
      background: "#2D6A4F",
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: 600,
      border: "none",
      cursor: "pointer",
      alignSelf: "flex-start" as const,
      transition: "background 0.15s ease",
    },
    formSection: {
      background: "#FFFFFF",
      padding: "60px 24px",
    },
    formWrap: {
      maxWidth: 600,
      margin: "0 auto",
    },
    formTitle: {
      fontSize: 28,
      fontWeight: 700,
      color: "#111827",
      margin: "0 0 8px",
      textAlign: "center" as const,
    },
    formSub: {
      fontSize: 15,
      color: "#6B7280",
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
      color: "#374151",
      marginBottom: 6,
    },
    input: {
      width: "100%",
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid #E5E7EB",
      fontSize: 14,
      color: "#111827",
      outline: "none",
      boxSizing: "border-box" as const,
      fontFamily: "Inter, system-ui, sans-serif",
    },
    select: {
      width: "100%",
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid #E5E7EB",
      fontSize: 14,
      color: "#111827",
      outline: "none",
      boxSizing: "border-box" as const,
      fontFamily: "Inter, system-ui, sans-serif",
      background: "#FFFFFF",
      cursor: "pointer",
    },
    textarea: {
      width: "100%",
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid #E5E7EB",
      fontSize: 14,
      color: "#111827",
      outline: "none",
      boxSizing: "border-box" as const,
      fontFamily: "Inter, system-ui, sans-serif",
      resize: "vertical" as const,
      minHeight: 120,
    },
    submitBtn: {
      width: "100%",
      padding: "12px",
      borderRadius: 8,
      background: "#2D6A4F",
      color: "#FFFFFF",
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
      color: "#111827",
      margin: "0 0 8px",
    },
    successSub: {
      fontSize: 15,
      color: "#6B7280",
    },
  };

  const services = [
    {
      id: "gmb",
      icon: <MapPin size={24} color="#4A7C6F" strokeWidth={1.5} />,
      title: "Google Maps Optimization",
      desc: "Get found by local customers searching for your trade. GMB optimisation, citations, review strategy.",
      from: "From $299/mo",
      testid: "service-gmb",
      btnTestid: "button-request-info-gmb",
    },
    {
      id: "seo",
      icon: <TrendingUp size={24} color="#4A7C6F" strokeWidth={1.5} />,
      title: "Website SEO + Speed",
      desc: "Rank higher on Google. Fast-loading, optimised pages that convert visitors.",
      from: "From $199/mo",
      testid: "service-seo",
      btnTestid: "button-request-info-seo",
    },
    {
      id: "website",
      icon: <Globe size={24} color="#4A7C6F" strokeWidth={1.5} />,
      title: "Website Build",
      desc: "Professional trade website with your QuickQuote calculator built in. Done in 5 days.",
      from: "From $1,499 one-time",
      testid: "service-website",
      btnTestid: "button-request-info-website",
    },
    {
      id: "reputation",
      icon: <Star size={24} color="#4A7C6F" strokeWidth={1.5} />,
      title: "Reputation Management",
      desc: "Automated review requests, response templates, reputation monitoring.",
      from: "From $149/mo",
      testid: "service-reputation",
      btnTestid: "button-request-info-reputation",
    },
    {
      id: "social",
      icon: <Share2 size={24} color="#4A7C6F" strokeWidth={1.5} />,
      title: "Social Media Automation",
      desc: "Consistent posting, branded content, lead-gen campaigns on Facebook/Instagram.",
      from: "From $249/mo",
      testid: "service-social",
      btnTestid: "button-request-info-social",
    },
  ];

  return (
    <MarketingLayout>
      <div data-testid="services-page">
        <div style={s.pageHeader}>
          <h1 style={s.pageHeaderH1}>Done-For-You Growth Services</h1>
          <p style={s.pageHeaderSub}>We handle the marketing. You handle the jobs.</p>
        </div>

        <div style={s.servicesSection}>
          <div style={s.servicesGrid}>
            {services.map(svc => (
              <div key={svc.id} style={s.serviceCard} data-testid={svc.testid}>
                <div style={s.iconWrap}>{svc.icon}</div>
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
                    <option value="gmb">Google Maps Optimization</option>
                    <option value="seo">Website SEO + Speed</option>
                    <option value="website">Website Build</option>
                    <option value="reputation">Reputation Management</option>
                    <option value="social">Social Media Automation</option>
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
    </MarketingLayout>
  );
}
