import { useEffect, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Mail, Clock, LayoutDashboard, Phone } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { mkt, radius } from "@/theme/tokens";
import { V7Hero, V7Section, V7PageShell } from "@/components/marketing/v7";

export default function ContactPage() {
  useEffect(() => { document.title = "Contact — WeFixTrades"; }, []);

  const [form, setForm] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get("name") || "";
    const email = params.get("email") || "";
    const business = params.get("business") || "";
    return {
      name,
      email,
      subject: business ? "Sales" : "General",
      message: business ? `Audit for: ${business}\n\nI'd like help improving my online presence.` : "",
    };
  });
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
    borderRadius: radius.sm,
    border: `1px solid ${mkt.onDarkBorder}`,
    fontSize: 15,
    color: mkt.onDark,
    background: "rgba(255,255,255,0.04)",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "Inter, system-ui, sans-serif",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: mkt.onDarkMuted,
    marginBottom: 6,
  };

  return (
    <MarketingLayout>
      <V7PageShell>
        <V7Hero
          productName="Contact"
          headline={<>Talk to our team.</>}
          sub="Sales, support, partnerships, or a question before you sign up — we read every message and respond within one business day."
        />
        <V7Section padding="40px 24px 80px">
          <div style={{
            maxWidth: 1000,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.6fr)",
            gap: 48,
          }} className="max-[640px]:!grid-cols-1">
            {/* Left: Contact Info */}
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: mkt.onDark, marginBottom: 32, margin: "0 0 32px" }}>
                Contact Information
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "rgba(13,60,252,0.10)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Phone size={20} color={mkt.accent} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: mkt.onDarkMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>AI-answered line — 24/7</div>
                    <a
                      href="tel:+19156153280"
                      data-testid="contact-phone"
                      style={{ fontSize: 15, color: mkt.accent, textDecoration: "none", fontWeight: 500 }}
                    >
                      +1 (915) 615-3280
                    </a>
                    <div style={{ fontSize: 12, color: mkt.onDarkMuted, marginTop: 4, lineHeight: 1.5 }}>
                      Our AI answers any question about pricing, services, or how we'd help your business. Escalates to a human for anything complex.
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "rgba(13,60,252,0.10)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Mail size={20} color={mkt.accent} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: mkt.onDarkMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Email</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <a href="mailto:sales@wefixtrades.com" style={{ fontSize: 15, color: mkt.accent, textDecoration: "none", fontWeight: 500 }}>
                        sales@wefixtrades.com
                      </a>
                      <a href="mailto:support@wefixtrades.com" style={{ fontSize: 15, color: mkt.accent, textDecoration: "none", fontWeight: 500 }}>
                        support@wefixtrades.com
                      </a>
                    </div>
                    <div style={{ fontSize: 12, color: mkt.onDarkMuted, marginTop: 6, lineHeight: 1.5 }}>
                      Sales for new business inquiries. Support for existing customers.
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "rgba(13,60,252,0.10)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Clock size={20} color={mkt.accent} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: mkt.onDarkMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Response Time</div>
                    <div style={{ fontSize: 15, color: mkt.onDarkMuted, fontWeight: 500 }}>Within one business day</div>
                    <div style={{ fontSize: 14, color: mkt.onDarkMuted, marginTop: 2 }}>Most replies land in a few hours</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "rgba(13,60,252,0.10)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <LayoutDashboard size={20} color={mkt.accent} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: mkt.onDarkMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Urgent Support</div>
                    <div style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
                      For urgent support, use the Help button inside your dashboard.
                    </div>
                  </div>
                </div>
              </div>

              <div style={{
                marginTop: 40,
                padding: "20px 24px",
                background: "rgba(13,60,252,0.10)",
                borderRadius: radius.md,
                border: `1px solid ${mkt.accentGlow}`,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: mkt.accent, marginBottom: 6 }}>Already a customer?</div>
                <div style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.7 }}>
                  Open a support ticket from your portal for the fastest route — your message lands directly in your account file.
                </div>
              </div>
            </div>

            {/* Right: Form */}
            <div style={{
              background: mkt.sectionLight,
              borderRadius: 18,
              padding: "36px 32px",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}>
              {submitted ? (
                <div data-testid="contact-success" style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "rgba(13,60,252,0.10)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 20px",
                  }}>
                    <Mail size={24} color={mkt.accent} />
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, color: mkt.onDark, marginBottom: 12, margin: "0 0 12px" }}>Message received</h3>
                  <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.6, margin: 0 }}>
                    Thanks — we've logged your message and a confirmation is on its way to your inbox. We reply within one business day.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: mkt.onDark, margin: "0 0 4px" }}>Send Us a Message</h2>
                  <p style={{ fontSize: 14, color: mkt.onDarkMuted, margin: 0 }}>Fill in the form and we'll be in touch shortly.</p>

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
                      background: mutation.isPending ? mkt.accentHover : mkt.accent,
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: radius.sm,
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
        </V7Section>
      </V7PageShell>
    </MarketingLayout>
  );
}
