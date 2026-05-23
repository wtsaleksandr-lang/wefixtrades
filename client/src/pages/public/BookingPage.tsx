import { useState, useEffect, useMemo, useCallback } from "react";
import { useRoute } from "wouter";

/* ─── Types ─── */

interface BookflowConfig {
  businessName: string;
  slug: string;
  timezone: string;
  slotDurationMinutes: number;
  services: ServiceDef[] | null;
  workingHours: Record<string, { enabled: boolean; start: string; end: string }> | null;
  confirmationMessage: string | null;
  autoConfirm: boolean;
  accentColor: string;
}

interface ServiceDef {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  description?: string;
}

interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

interface BookingResult {
  success: boolean;
  appointment: {
    id: number;
    status: string;
    startTime: string;
    endTime: string;
    serviceName: string | null;
  };
  confirmationMessage: string | null;
}

type Step = "service" | "date" | "time" | "details" | "success";

/* ─── Helpers ─── */

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

function formatSlotTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

/* ─── Main Component ─── */

export default function BookingPage() {
  const [, params] = useRoute("/book/:slug");
  const slug = params?.slug || "";

  const [config, setConfig] = useState<BookflowConfig | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [step, setStep] = useState<Step>("service");
  const [selectedService, setSelectedService] = useState<ServiceDef | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const accent = config?.accentColor || "#3B82F6";
  const accentRgb = useMemo(() => hexToRgb(accent), [accent]);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/bookflow/${slug}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Booking page not found");
        return res.json();
      })
      .then((data: BookflowConfig) => {
        setConfig(data);
        if (!data.services || data.services.length === 0) {
          setStep("date");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [slug]);

  const loadSlots = useCallback((startDate: Date) => {
    if (!slug) return;
    setSlotsLoading(true);
    const dateStr = dateKey(startDate);
    fetch(`/api/bookflow/${slug}/slots?date=${dateStr}&days=14`)
      .then((res) => res.json())
      .then((data) => {
        setSlots(data.slots || []);
        setSlotsLoading(false);
      })
      .catch(() => setSlotsLoading(false));
  }, [slug]);

  useEffect(() => {
    if (config) loadSlots(new Date());
  }, [config, loadSlots]);

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, []);

  const slotsByDate = useMemo(() => {
    const map: Record<string, TimeSlot[]> = {};
    for (const slot of slots) {
      const d = new Date(slot.start);
      const key = dateKey(d);
      if (!map[key]) map[key] = [];
      map[key].push(slot);
    }
    return map;
  }, [slots]);

  const datesWithSlots = useMemo(() => new Set(Object.keys(slotsByDate)), [slotsByDate]);

  const currentDateSlots = useMemo(() => {
    if (!selectedDate) return [];
    return slotsByDate[dateKey(selectedDate)] || [];
  }, [selectedDate, slotsByDate]);

  const handleSubmit = async () => {
    if (!selectedSlot || !name.trim() || !phone.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bookflow/${slug}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name.trim(),
          customerPhone: phone.trim(),
          customerEmail: email.trim() || undefined,
          customerAddress: address.trim() || undefined,
          serviceId: selectedService?.id,
          startTime: selectedSlot.start,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Booking failed" }));
        throw new Error(errData.error || "Booking failed");
      }
      const result = await res.json();
      setBookingResult(result);
      setStep("success");
    } catch (err: any) {
      alert(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageShell accent={accent} accentRgb={accentRgb}>
        <div data-theme="dark" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 }}>
          <Spinner accent={accent} />
          <p style={{ color: "#94A3B8", fontSize: 14, fontFamily: "'DM Sans', system-ui, sans-serif" }}>Loading booking page...</p>
        </div>
      </PageShell>
    );
  }

  if (error || !config) {
    return (
      <PageShell accent={accent} accentRgb={accentRgb}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16, padding: "0 24px" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <p style={{ color: "#1E293B", fontSize: 17, fontWeight: 600, fontFamily: "'DM Sans', system-ui, sans-serif", textAlign: "center" }}>
            {error || "This booking page could not be found."}
          </p>
        </div>
      </PageShell>
    );
  }

  const hasServices = config.services && config.services.length > 0;

  return (
    <PageShell accent={accent} accentRgb={accentRgb}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      <header style={{ textAlign: "center", padding: "32px 24px 24px" }}>
        <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 28, fontWeight: 400, color: "#0F172A", margin: 0, lineHeight: 1.2, letterSpacing: "-0.01em" }}>
          {config.businessName}
        </h1>
        <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14, color: "#94A3B8", margin: "8px 0 0", letterSpacing: "0.02em" }}>
          Book an appointment online
        </p>
      </header>

      {step !== "success" && (
        <ProgressDots
          steps={hasServices ? ["service", "date", "time", "details"] : ["date", "time", "details"]}
          current={step}
          accent={accent}
        />
      )}

      <main style={{ padding: "0 20px 100px", maxWidth: 480, margin: "0 auto" }}>

        {step === "service" && hasServices && (
          <StepContainer title="What do you need?">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {config.services!.map((svc) => (
                <button
                  key={svc.id}
                  onClick={() => { setSelectedService(svc); setStep("date"); }}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "#FFFFFF", border: "1.5px solid #E2E8F0", borderRadius: 14,
                    padding: "16px 18px", cursor: "pointer", textAlign: "left",
                    transition: "all 0.15s ease", width: "100%",
                  }}
                >
                  <div>
                    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 600, fontSize: 15, color: "#1E293B" }}>{svc.name}</div>
                    {svc.description && <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 13, color: "#94A3B8", marginTop: 4 }}>{svc.description}</div>}
                    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 12, color: "#64748B", marginTop: 6 }}>{svc.duration_minutes} min</div>
                  </div>
                  <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 700, fontSize: 15, color: accent, whiteSpace: "nowrap", marginLeft: 16 }}>
                    {formatPrice(svc.price_cents)}
                  </div>
                </button>
              ))}
            </div>
          </StepContainer>
        )}

        {step === "date" && (
          <StepContainer title="Pick a date" onBack={hasServices ? () => { setStep("service"); setSelectedDate(null); } : undefined}>
            {slotsLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}><Spinner accent={accent} /></div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 8 }}>
                {calendarDays.map((day) => {
                  const key = dateKey(day);
                  const hasAvailability = datesWithSlots.has(key);
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const isToday = isSameDay(day, new Date());
                  return (
                    <button key={key} disabled={!hasAvailability}
                      onClick={() => { setSelectedDate(day); setSelectedSlot(null); setStep("time"); }}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 4px",
                        borderRadius: 12, border: isSelected ? `2px solid ${accent}` : "1.5px solid #E2E8F0",
                        background: isSelected ? `rgba(${accentRgb}, 0.06)` : hasAvailability ? "#FFFFFF" : "#F8FAFC",
                        cursor: hasAvailability ? "pointer" : "default", opacity: hasAvailability ? 1 : 0.4,
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 11, fontWeight: 600, color: isSelected ? accent : "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {day.toLocaleDateString("en-US", { weekday: "short" })}
                      </span>
                      <span style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 20, fontWeight: 700, color: isSelected ? accent : hasAvailability ? "#1E293B" : "#CBD5E1", marginTop: 2 }}>
                        {day.getDate()}
                      </span>
                      <span style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 10, color: isSelected ? accent : "#94A3B8" }}>
                        {day.toLocaleDateString("en-US", { month: "short" })}
                      </span>
                      {isToday && <span style={{ display: "inline-block", width: 4, height: 4, borderRadius: "50%", background: accent, marginTop: 4 }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </StepContainer>
        )}

        {step === "time" && selectedDate && (
          <StepContainer title={formatShortDate(selectedDate)} subtitle="Choose a time" onBack={() => { setStep("date"); setSelectedSlot(null); }}>
            {currentDateSlots.length === 0 ? (
              <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", color: "#94A3B8", textAlign: "center", padding: "32px 0" }}>No available times for this date.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {currentDateSlots.map((slot) => {
                  const isSelected = selectedSlot?.start === slot.start;
                  return (
                    <button key={slot.start} onClick={() => { setSelectedSlot(slot); setStep("details"); }}
                      style={{
                        padding: "14px 8px", borderRadius: 12,
                        border: isSelected ? `2px solid ${accent}` : "1.5px solid #E2E8F0",
                        background: isSelected ? accent : "#FFFFFF",
                        color: isSelected ? "#FFFFFF" : "#1E293B",
                        fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14, fontWeight: 600,
                        cursor: "pointer", transition: "all 0.15s ease",
                      }}
                    >
                      {formatSlotTime(slot.start)}
                    </button>
                  );
                })}
              </div>
            )}
          </StepContainer>
        )}

        {step === "details" && selectedSlot && (
          <StepContainer title="Your details" onBack={() => setStep("time")}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
              background: `rgba(${accentRgb}, 0.05)`, borderRadius: 10, marginBottom: 20,
              border: `1px solid rgba(${accentRgb}, 0.12)`,
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 13, fontWeight: 600, color: "#1E293B" }}>
                  {formatSlotTime(selectedSlot.start)} - {formatSlotTime(selectedSlot.end)}
                </div>
                <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 12, color: "#64748B" }}>
                  {formatFullDate(selectedSlot.start)}{selectedService ? ` · ${selectedService.name}` : ""}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <FormField label="Name" required>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" style={inputStyle} autoComplete="name" />
              </FormField>
              <FormField label="Phone" required>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} autoComplete="tel" />
              </FormField>
              <FormField label="Email">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} autoComplete="email" />
              </FormField>
              <FormField label="Address">
                <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Where should we come?" style={inputStyle} autoComplete="street-address" />
              </FormField>
              <FormField label="Notes">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should know?" rows={3} style={{ ...inputStyle, resize: "vertical", minHeight: 72 }} />
              </FormField>
            </div>

            <button onClick={handleSubmit} disabled={!name.trim() || !phone.trim() || submitting}
              style={{
                width: "100%", padding: "16px 24px", marginTop: 22, borderRadius: 14, border: "none",
                background: (!name.trim() || !phone.trim()) ? "#CBD5E1" : accent, color: "#FFFFFF",
                fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 15, fontWeight: 700,
                cursor: (!name.trim() || !phone.trim() || submitting) ? "default" : "pointer",
                transition: "all 0.2s ease", opacity: submitting ? 0.7 : 1, letterSpacing: "0.01em",
              }}
            >
              {submitting ? "Booking..." : "Confirm Booking"}
            </button>
          </StepContainer>
        )}

        {step === "success" && bookingResult && (
          <div style={{ textAlign: "center", padding: "40px 0 20px" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: `rgba(${accentRgb}, 0.1)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 24, fontWeight: 400, color: "#0F172A", margin: "0 0 8px" }}>
              {bookingResult.appointment.status === "confirmed" ? "You're booked!" : "Booking requested"}
            </h2>
            <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14, color: "#64748B", margin: "0 0 24px", lineHeight: 1.5 }}>
              {bookingResult.appointment.status === "confirmed"
                ? "Your appointment has been confirmed."
                : "Your booking request has been submitted and is pending confirmation."}
            </p>
            <div style={{ background: "#FFFFFF", border: "1.5px solid #E2E8F0", borderRadius: 16, padding: 20, textAlign: "left" }}>
              <DetailRow label="Date" value={formatFullDate(bookingResult.appointment.startTime)} />
              <DetailRow label="Time" value={`${formatSlotTime(bookingResult.appointment.startTime)} - ${formatSlotTime(bookingResult.appointment.endTime)}`} />
              {bookingResult.appointment.serviceName && <DetailRow label="Service" value={bookingResult.appointment.serviceName} />}
              <DetailRow label="Status" value={bookingResult.appointment.status === "confirmed" ? "Confirmed" : "Pending"} accent={accent} />
            </div>
            {bookingResult.confirmationMessage && (
              <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 13, color: "#64748B", margin: "20px 0 0", lineHeight: 1.6 }}>{bookingResult.confirmationMessage}</p>
            )}
            {email && (
              <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 12, color: "#94A3B8", margin: "16px 0 0" }}>A confirmation has been sent to {email}</p>
            )}
          </div>
        )}
      </main>

      <footer style={{ textAlign: "center", padding: "20px 24px 32px", borderTop: "1px solid #F1F5F9" }}>
        <a href="https://wefixtrades.com" target="_blank" rel="noopener noreferrer"
          style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 11, color: "#CBD5E1", textDecoration: "none", letterSpacing: "0.03em" }}>
          Powered by <span style={{ fontWeight: 700, color: "#94A3B8" }}>WeFixTrades</span>
        </a>
      </footer>
    </PageShell>
  );
}

/* ─── Sub-components ─── */

function PageShell({ children, accent, accentRgb }: { children: React.ReactNode; accent: string; accentRgb: string }) {
  return (
    <div style={{ minHeight: "100vh", background: "#FAFBFC", position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${accent}, rgba(${accentRgb}, 0.3))` }} />
      {children}
    </div>
  );
}

function ProgressDots({ steps, current, accent }: { steps: string[]; current: string; accent: string }) {
  const idx = steps.indexOf(current);
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 6, padding: "0 24px 24px" }}>
      {steps.map((s, i) => (
        <div key={s} style={{ width: i <= idx ? 24 : 8, height: 8, borderRadius: 4, background: i <= idx ? accent : "#E2E8F0", transition: "all 0.3s ease" }} />
      ))}
    </div>
  );
}

function StepContainer({ title, subtitle, children, onBack }: { title: string; subtitle?: string; children: React.ReactNode; onBack?: () => void }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        {onBack && (
          <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        )}
        <div>
          <h2 style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 18, fontWeight: 700, color: "#0F172A", margin: 0, letterSpacing: "-0.01em" }}>{title}</h2>
          {subtitle && <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 13, color: "#94A3B8", margin: "2px 0 0" }}>{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 6, letterSpacing: "0.02em" }}>
        {label}{required && <span style={{ color: "#EF4444", marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function DetailRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F1F5F9" }}>
      <span style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 13, color: "#94A3B8" }}>{label}</span>
      <span style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14, fontWeight: 600, color: accent || "#1E293B" }}>{value}</span>
    </div>
  );
}

function Spinner({ accent }: { accent: string }) {
  return (
    <div style={{ width: 32, height: 32, border: "3px solid #E2E8F0", borderTopColor: accent, borderRadius: "50%", animation: "bf-spin 0.7s linear infinite" }}>
      <style>{`@keyframes bf-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "13px 14px", borderRadius: 12, border: "1.5px solid #E2E8F0",
  background: "#FFFFFF", fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14,
  color: "#1E293B", outline: "none", transition: "border-color 0.15s ease", boxSizing: "border-box",
};
