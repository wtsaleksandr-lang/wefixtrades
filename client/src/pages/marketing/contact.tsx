import { useEffect, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { Mail, Clock, LayoutDashboard, Phone } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { mkt, radius } from "@/theme/tokens";
import { V7Hero, V7Section, V7PageShell } from "@/components/marketing/v7";
import {
  FreeToolFormField,
  FreeToolFormSelect,
  FreeToolFormTextarea,
  FreeToolFormFieldStyles,
} from "@/components/marketing/FreeToolFormField";

export default function ContactPage() {
  // Title + meta tags handled by <PageMeta> below.

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

  // Note (2026-05-25): inputStyle / labelStyle removed. The form now uses
  // FreeToolFormField + Select + Textarea (DESIGN-SYSTEM compliant: floating
  // label, top-left help cue, 52px height, 2px gaps). The dark theme variant
  // of those primitives matches the V7Section dark surface.

  return (
    <MarketingLayout>
      <PageMeta
        title="Contact WeFixTrades — talk to a human about your trade business"
        description="Reach the WeFixTrades team. We answer pricing, onboarding, integration, and partnership questions for plumbers, electricians, HVAC, roofers, and more — usually within one business day."
        canonical="/contact"
        keywords={["contact wefixtrades", "trades software support"]}
      />
      <V7PageShell data-theme="light">
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
                <form
                  onSubmit={handleSubmit}
                  // DESIGN-SYSTEM compliance (2026-05-25 audit): replaced raw
                  // <label> + <input> pairs with FreeToolFormField primitives.
                  // Gap drops from 20 → 2 for the input cluster. The label
                  // background needs to match the form panel so the floated
                  // label reads crisply against the input border — exposed
                  // via the --ftool-label-bg custom property below.
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    ["--ftool-label-bg" as any]: mkt.sectionLight,
                  }}
                >
                  <FreeToolFormFieldStyles />
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: mkt.onDark, margin: "0 0 4px" }}>Send Us a Message</h2>
                  <p style={{ fontSize: 14, color: mkt.onDarkMuted, margin: "0 0 6px" }}>Fill in the form and we'll be in touch shortly.</p>

                  <FreeToolFormField
                    id="contact-name"
                    label="Full Name"
                    value={form.name}
                    onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                    required
                    autoComplete="name"
                    testId="input-contact-name"
                    theme="dark"
                    helpText="Your name or your company contact name."
                  />

                  <FreeToolFormField
                    id="contact-email"
                    label="Email Address"
                    type="email"
                    inputMode="email"
                    value={form.email}
                    onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                    required
                    autoComplete="email"
                    testId="input-contact-email"
                    theme="dark"
                    helpText="We'll reply within one business day. Used only for this conversation."
                  />

                  <FreeToolFormSelect
                    id="contact-subject"
                    label="Subject"
                    value={form.subject}
                    onChange={(v) => setForm((f) => ({ ...f, subject: v }))}
                    testId="select-contact-subject"
                    theme="dark"
                    helpText="Pick the topic closest to your reason for getting in touch."
                  >
                    <option value="General">General</option>
                    <option value="Sales">Sales</option>
                    <option value="Support">Support</option>
                    <option value="Partnership">Partnership</option>
                  </FreeToolFormSelect>

                  <FreeToolFormTextarea
                    id="contact-message"
                    label="Message"
                    value={form.message}
                    onChange={(v) => setForm((f) => ({ ...f, message: v }))}
                    required
                    rows={5}
                    testId="input-contact-message"
                    theme="dark"
                    helpText="Tell us what you need — we read every message and reply within one business day."
                  />

                  <button
                    type="submit"
                    disabled={mutation.isPending}
                    style={{
                      padding: "12px 24px",
                      background: mutation.isPending ? mkt.accentHover : mkt.accent,
                      color: "rgb(255,255,255)",
                      border: "none",
                      borderRadius: radius.sm,
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: mutation.isPending ? "not-allowed" : "pointer",
                      transition: "background 0.15s ease",
                      width: "100%",
                      marginTop: 2,
                      fontFamily: "Inter, system-ui, sans-serif",
                    }}
                    data-testid="button-contact-submit"
                  >
                    {mutation.isPending ? "Sending..." : "Send Message"}
                  </button>

                  {mutation.isError && (
                    <p style={{ fontSize: 14, color: "rgb(220,38,38)", margin: 0, textAlign: "center" }}>
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
