/**
 * Wave R-1 — Calendly-style scheduling picker.
 *
 * Fetches a 14-day availability grid from /api/scheduling/availability,
 * lets the customer pick a day → time slot → fill in contact details →
 * POST /api/scheduling/book. On success it auto-advances to the next
 * widget step (Confirmation).
 *
 * Self-contained, no external calendar libraries. The visual idiom
 * matches existing steps (designTokens + simple inline styles).
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { CalendarDays, Clock, ChevronLeft, Loader2, Check } from 'lucide-react';
import HelpTip from '../HelpTip';
import { useWidgetState } from '../useWidgetState';
import {
  eff,
  stepTitleStyle,
  stepSubtitleStyle,
  inputStyle,
  primaryButtonStyle,
  labelStyle,
} from '../designTokens';
import type { StepDefinition } from '@shared/wizardSchema';
import type { Slot } from '@shared/schemas/scheduling';

interface SchedulingStepProps {
  step: StepDefinition;
  accentColor?: string;
}

interface AvailabilityResponse {
  enabled: boolean;
  timezone?: string;
  slot_duration_minutes?: number;
  slots: Slot[];
}

/* ─── Helpers ─── */

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

const WINDOW_DAYS = 14;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(d: Date): { weekday: string; day: string; month: string } {
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    day: String(d.getDate()),
    month: d.toLocaleDateString(undefined, { month: 'short' }),
  };
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/* ─── Component ─── */

export default function SchedulingStep({ step }: SchedulingStepProps) {
  const { config, state, dispatch, nextStep } = useWidgetState();
  const slug = config.calculator.slug;

  // Days window — today + 13 days
  const days = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < WINDOW_DAYS; i++) {
      const d = new Date(TODAY);
      d.setDate(d.getDate() + i);
      out.push(d);
    }
    return out;
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotsByDay, setSlotsByDay] = useState<Record<string, Slot[]>>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState<{ scheduledFor: string } | null>(null);

  // Hydrate customer fields from existing lead state if present (lead_capture
  // may have already collected them). Otherwise blank.
  const initialLead = state.lead?.data ?? { name: '', email: '', phone: '' };
  const [customer, setCustomer] = useState({
    name: initialLead.name || '',
    email: initialLead.email || '',
    phone: initialLead.phone || '',
  });

  /* ─── Fetch availability on mount ─── */
  useEffect(() => {
    if (!slug) return;
    // Preview mode: synthesize mock slots so the wizard preview is usable.
    if (config.calculator.id < 0) {
      const mock: Record<string, Slot[]> = {};
      for (const d of days) {
        if (d.getDay() === 0 || d.getDay() === 6) continue;
        const key = ymd(d);
        mock[key] = [9, 10, 11, 13, 14, 15, 16].map((h) => {
          const start = new Date(d);
          start.setHours(h, 0, 0, 0);
          const end = new Date(start.getTime() + 30 * 60 * 1000);
          return { start: start.toISOString(), end: end.toISOString(), available: true };
        });
      }
      setSlotsByDay(mock);
      return;
    }

    setLoading(true);
    setError(null);
    const from = ymd(days[0]);
    const to = ymd(days[days.length - 1]);
    fetch(`/api/scheduling/availability?slug=${encodeURIComponent(slug)}&from=${from}&to=${to}`)
      .then(async (r) => {
        const data = (await r.json()) as AvailabilityResponse | { error: string };
        if (!r.ok || !('slots' in data)) {
          throw new Error(('error' in data && data.error) || 'Could not fetch availability');
        }
        const grouped: Record<string, Slot[]> = {};
        for (const s of data.slots) {
          const key = ymd(new Date(s.start));
          (grouped[key] ||= []).push(s);
        }
        setSlotsByDay(grouped);
      })
      .catch((e) => setError(e?.message || 'Could not load times'))
      .finally(() => setLoading(false));
  }, [slug, config.calculator.id, days]);

  /* ─── Booking ─── */
  const handleBook = useCallback(async () => {
    if (!selectedSlot || submitting) return;
    const trimmedName = customer.name.trim();
    const trimmedEmail = customer.email.trim();
    if (!trimmedName || !trimmedEmail) {
      setError('Name and email are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Preview mode: skip API
      if (config.calculator.id < 0) {
        setBooked({ scheduledFor: selectedSlot.start });
        setTimeout(() => nextStep(), 1200);
        return;
      }
      const res = await fetch('/api/scheduling/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          start_iso: selectedSlot.start,
          customer_name: trimmedName,
          customer_email: trimmedEmail,
          customer_phone: customer.phone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Could not book this time. Please try another.');
      }
      setBooked({ scheduledFor: data.scheduled_for });
      // Auto-advance after a brief confirmation flash.
      setTimeout(() => {
        try { dispatch({ type: 'CONFIRM_BOOKING' }); } catch { /* ignore */ }
        nextStep();
      }, 1400);
    } catch (e: any) {
      setError(e?.message || 'Booking failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [selectedSlot, submitting, customer, slug, config.calculator.id, nextStep, dispatch]);

  /* ─── Render ─── */

  if (booked) {
    return (
      <div
        data-testid="scheduling-step-booked"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          padding: '32px 8px',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: eff.successBg,
            color: eff.success,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Check style={{ width: 28, height: 28 }} />
        </div>
        <h3 style={{ ...stepTitleStyle, textAlign: 'center' }}>
          Booked! See you {new Date(booked.scheduledFor).toLocaleString(undefined, {
            weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          })}
        </h3>
        <p style={{ ...stepSubtitleStyle, textAlign: 'center' }}>
          A confirmation will land in your inbox shortly.
        </p>
      </div>
    );
  }

  // Confirmation panel (slot chosen, collecting contact)
  if (confirming && selectedSlot) {
    const slotDate = new Date(selectedSlot.start);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} data-testid="scheduling-step-confirm">
        <button
          type="button"
          onClick={() => { setConfirming(false); setSelectedSlot(null); setError(null); }}
          style={{
            alignSelf: 'flex-start',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: eff.textBody, fontSize: 13, padding: 0,
          }}
          data-testid="scheduling-back-to-slots"
        >
          <ChevronLeft style={{ width: 16, height: 16 }} /> Back to times
        </button>
        <div>
          <h3 style={stepTitleStyle}>Confirm your details</h3>
          <p style={{ ...stepSubtitleStyle, margin: '4px 0 0' }}>
            {slotDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            {' · '}
            {timeLabel(selectedSlot.start)}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            placeholder="Full name"
            value={customer.name}
            onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
            style={inputStyle}
            data-testid="scheduling-input-name"
          />
          <input
            placeholder="Email"
            type="email"
            value={customer.email}
            onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
            style={inputStyle}
            data-testid="scheduling-input-email"
          />
          <input
            placeholder="Phone (optional)"
            type="tel"
            value={customer.phone}
            onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
            style={inputStyle}
            data-testid="scheduling-input-phone"
          />
          {error && (
            <p style={{ fontSize: 13, color: eff.error, margin: 0 }} role="alert">{error}</p>
          )}
          <button
            type="button"
            onClick={handleBook}
            disabled={submitting || !customer.name.trim() || !customer.email.trim()}
            style={{
              ...primaryButtonStyle,
              opacity: submitting || !customer.name.trim() || !customer.email.trim() ? 0.5 : 1,
            }}
            data-testid="scheduling-book-submit"
          >
            {submitting ? 'Booking…' : 'Confirm booking'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} data-testid="scheduling-step-root">
      <div>
        <h3 style={stepTitleStyle}>
          {step.title || 'Pick a time'}
          <HelpTip text="Pick any open slot — we'll lock it in instantly." />
        </h3>
        {step.subtitle && (
          <p style={{ ...stepSubtitleStyle, margin: '4px 0 0' }}>{step.subtitle}</p>
        )}
      </div>

      {loading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, color: eff.textBody, fontSize: 14,
        }}>
          <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
          Loading available times…
        </div>
      )}

      {!loading && (
        <>
          {/* Day strip */}
          <div>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CalendarDays style={{ width: 16, height: 16 }} />
              Choose a day
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))',
                gap: 8,
              }}
              data-testid="scheduling-day-grid"
            >
              {days.map((d) => {
                const key = ymd(d);
                const count = slotsByDay[key]?.filter((s) => s.available).length || 0;
                const active = selectedDay === key;
                const disabled = count === 0;
                const lbl = dayLabel(d);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    onClick={() => { setSelectedDay(key); setSelectedSlot(null); }}
                    data-testid={`scheduling-day-${key}`}
                    aria-pressed={active}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                      padding: '10px 6px',
                      borderRadius: eff.radiusMd,
                      border: active ? `2px solid ${eff.buttonBg}` : `1px solid ${eff.buttonBorder}`,
                      background: active ? eff.accentTint : '#fff',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.45 : 1,
                      fontFamily: eff.font,
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 600, color: eff.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      {lbl.weekday}
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: active ? eff.accent : eff.text }}>
                      {lbl.day}
                    </span>
                    <span style={{ fontSize: 11, color: eff.textBody }}>
                      {disabled ? '—' : `${count} open`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Slot list for selected day */}
          {selectedDay && (
            <div data-testid="scheduling-slot-list">
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock style={{ width: 16, height: 16 }} />
                Available times
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                  gap: 8,
                }}
              >
                {(slotsByDay[selectedDay] || []).map((s) => {
                  if (!s.available) return null;
                  return (
                    <button
                      key={s.start}
                      type="button"
                      onClick={() => { setSelectedSlot(s); setConfirming(true); }}
                      data-testid={`scheduling-slot-${s.start}`}
                      style={{
                        padding: '10px 8px',
                        borderRadius: eff.radiusMd,
                        border: `1px solid ${eff.buttonBorder}`,
                        background: '#fff',
                        cursor: 'pointer',
                        fontFamily: eff.font,
                        fontSize: 14, fontWeight: 600, color: eff.text,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = eff.buttonBg;
                        e.currentTarget.style.color = eff.accent;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = eff.buttonBorder;
                        e.currentTarget.style.color = eff.text;
                      }}
                    >
                      {timeLabel(s.start)}
                    </button>
                  );
                })}
                {(slotsByDay[selectedDay] || []).filter((s) => s.available).length === 0 && (
                  <p style={{ ...stepSubtitleStyle, gridColumn: '1 / -1' }}>
                    No times left on this day — try another.
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <p style={{ fontSize: 13, color: eff.error, margin: 0 }} role="alert" data-testid="scheduling-error">
              {error}
            </p>
          )}
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
