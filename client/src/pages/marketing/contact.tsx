import { useEffect, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Mail, Clock, LayoutDashboard } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { mkt, colors, shadows, radius } from "@/theme/tokens";

const p = {
  colors: {
    accent: mkt.accent,
    accentDark: mkt.accentHover,
    navy: mkt.dark,
    pageBg: mkt.surface,
    surface: mkt.bg,
    heading: mkt.text,
    body: mkt.textMuted,
    muted: mkt.textMuted,
    border: mkt.border,
    borderLight: mkt.borderLight,
  },
  shadows: {
    card: shadows.card,
  },
  radius: {
    sm: radius.sm,
    md: radius.md,
  },
};

export default function ContactPage() {
  useEffect(() => {
    document.title = "Contact — QuickQuotePro";
  }, []);

  const [form, setForm] = useState({ name: "", email: "", subject: "General", message: "" });
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/contact", data),
    onSuccess: () => setSubmitted(true),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: p.radius.sm,
    border: `1px solid ${p.colors.border}`,
    fontSize: 15,
    color: p.colors.heading,
    background: p.colors.surface,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "Inter, system-ui, sans-serif",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: p.colors.body,
    marginBottom: 6,
  };

  return (
    <MarketingLayout>
      <div data-testid="contact-page" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {/* Page Header */}
        <section style={{ background: p.colors.navy, padding: "72px 24px 64px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
            <h1 style={{ fontSize: 40, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.2, marginBottom: 16, margin: "0 0 16px" }}>
              Get in Touch
            </h1>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, margin: 0 }}>
              We'd love to hear from you. Drop us a message and we'll get back to you quickly.
            </p>
          </div>
        </section>

        {/* Two-column layout */}
        <section style={{ background: p.colors.pageBg, padding: "64px 24px 80px" }}>
          <div style={{
            maxWidth: 1000,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr 1.6fr",
            gap: 48,
          }}>
            {/* Left: Contact Info */}
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: p.colors.heading, marginBottom: 32, margin: "0 0 32px" }}>
                Contact Information
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "#F0F7F4",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Mail size={18} color={p.colors.accent} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: p.colors.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Email</div>
                    <a href="mailto:contact@wefxtrades.com" style={{ fontSize: 15, color: p.colors.accent, textDecoration: "none", fontWeight: 500 }}>
                      contact@wefxtrades.com
                    </a>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "#F0F7F4",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Clock size={18} color={p.colors.accent} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: p.colors.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Response Time</div>
                    <div style={{ fontSize: 15, color: p.colors.body, fontWeight: 500 }}>Usually within 2 hours</div>
                    <div style={{ fontSize: 14, color: p.colors.muted, marginTop: 2 }}>During business hours (Mon–Fri)</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "#F0F7F4",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <LayoutDashboard size={18} color={p.colors.accent} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: p.colors.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Urgent Support</div>
                    <div style={{ fontSize: 14, color: p.colors.body, lineHeight: 1.6 }}>
                      For urgent support, use the Help button inside your dashboard.
                    </div>
                  </div>
                </div>
              </div>

              <div style={{
                marginTop: 40,
                padding: "20px 24px",
                background: "#F0F7F4",
                borderRadius: p.radius.md,
                border: `1px solid rgba(45,106,79,0.15)`,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: p.colors.accent, marginBottom: 6 }}>Working Hours</div>
                <div style={{ fontSize: 14, color: p.colors.body, lineHeight: 1.7 }}>
                  Monday – Friday: 9am – 6pm AEST<br />
                  Saturday: 10am – 2pm AEST<br />
                  Sunday: Closed
                </div>
              </div>
            </div>

            {/* Right: Form */}
            <div style={{
              background: p.colors.surface,
              borderRadius: p.radius.md,
              padding: "36px 32px",
              boxShadow: p.shadows.card,
              border: `1px solid ${p.colors.borderLight}`,
            }}>
              {submitted ? (
                <div data-testid="contact-success" style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "#F0F7F4",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 20px",
                  }}>
                    <Mail size={24} color={p.colors.accent} />
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, color: p.colors.heading, marginBottom: 12, margin: "0 0 12px" }}>Message Sent!</h3>
                  <p style={{ fontSize: 15, color: p.colors.muted, lineHeight: 1.6, margin: 0 }}>
                    Thanks for reaching out. We'll get back to you within 2 hours.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: p.colors.heading, margin: "0 0 4px" }}>Send Us a Message</h2>
                  <p style={{ fontSize: 14, color: p.colors.muted, margin: 0 }}>Fill in the form and we'll be in touch shortly.</p>

                  <div>
                    <label style={labelStyle} htmlFor="contact-name">Full Name *</label>
                    <input
                      id="contact-name"
                      type="text"
                      required
                      placeholder="John Smith"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      style={inputStyle}
                      data-testid="input-contact-name"
                    />
                  </div>

                  <div>
                    <label style={labelStyle} htmlFor="contact-email">Email Address *</label>
                    <input
                      id="contact-email"
                      type="email"
                      required
                      placeholder="john@example.com"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      style={inputStyle}
                      data-testid="input-contact-email"
                    />
                  </div>

                  <div>
                    <label style={labelStyle} htmlFor="contact-subject">Subject</label>
                    <select
                      id="contact-subject"
                      value={form.subject}
                      onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                      style={inputStyle}
                      data-testid="select-contact-subject"
                    >
                      <option value="General">General</option>
                      <option value="Sales">Sales</option>
                      <option value="Support">Support</option>
                      <option value="Partnership">Partnership</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle} htmlFor="contact-message">Message *</label>
                    <textarea
                      id="contact-message"
                      required
                      rows={5}
                      placeholder="Tell us how we can help..."
                      value={form.message}
                      onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                      style={{ ...inputStyle, resize: "vertical" }}
                      data-testid="input-contact-message"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={mutation.isPending}
                    style={{
                      padding: "12px 24px",
                      background: mutation.isPending ? "#93C5A1" : p.colors.accent,
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: p.radius.sm,
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: mutation.isPending ? "not-allowed" : "pointer",
                      transition: "background 0.15s ease",
                      width: "100%",
                      fontFamily: "Inter, system-ui, sans-serif",
                    }}
                    data-testid="button-contact-submit"
                  >
                    {mutation.isPending ? "Sending..." : "Send Message"}
                  </button>

                  {mutation.isError && (
                    <p style={{ fontSize: 14, color: "#DC2626", margin: 0, textAlign: "center" }}>
                      Something went wrong. Please try again.
                    </p>
                  )}
                </form>
              )}
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
