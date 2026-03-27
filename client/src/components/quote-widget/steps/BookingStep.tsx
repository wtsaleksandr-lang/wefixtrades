import { useEffect, useState, useCallback } from 'react';
import { CalendarDays, Clock, Loader2, CheckCircle2 } from 'lucide-react';
import { useWidgetState } from '../useWidgetState';
import { eff, stepTitleStyle, stepSubtitleStyle, inputStyle, primaryButtonStyle, labelStyle } from '../designTokens';
import type { StepDefinition } from '@shared/wizardSchema';

interface BookingStepProps {
  step: StepDefinition;
  accentColor?: string;
}

/**
 * Minimal booking step. Lets user pick a date, see available
 * time slots, fill in customer info, and confirm. Uses existing
 * widget state shape (booking.data, booking.availableSlots, etc.)
 * and the existing GET /api/bookings/availability endpoint.
 */
export default function BookingStep({ step, accentColor }: BookingStepProps) {
  const { config, state, dispatch } = useWidgetState();
  const booking = state.booking;
  const { selectedDate, selectedTime, customer } = booking.data;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirmBooking = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calculator_id: config.calculator.id,
          customer_name: customer.name,
          customer_email: customer.email || undefined,
          customer_phone: customer.phone || undefined,
          date: selectedDate,
          time: selectedTime,
          quote_amount: state.estimate?.total ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Booking failed. Please try again.');
        return;
      }
      dispatch({ type: 'CONFIRM_BOOKING' });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [config.calculator.id, customer, selectedDate, selectedTime, state.estimate, dispatch]);

  // Fetch available slots when date changes
  useEffect(() => {
    if (!selectedDate || !config.calculator.id) return;
    dispatch({ type: 'SET_LOADING_SLOTS', value: true });
    dispatch({ type: 'SET_BOOKING_TIME', time: '' });

    fetch(`/api/bookings/availability?calculator_id=${config.calculator.id}&date=${selectedDate}`)
      .then((r) => r.json())
      .then((data) => {
        dispatch({ type: 'SET_AVAILABLE_SLOTS', slots: data.slots || [] });
      })
      .catch(() => {
        dispatch({ type: 'SET_AVAILABLE_SLOTS', slots: [] });
      })
      .finally(() => {
        dispatch({ type: 'SET_LOADING_SLOTS', value: false });
      });
  }, [selectedDate, config.calculator.id, dispatch]);

  if (booking.confirmed) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: eff.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <CheckCircle2 style={{ width: 24, height: 24, color: eff.buttonBg }} />
        </div>
        <h3 style={{ ...stepTitleStyle, textAlign: 'center' }}>Booking Confirmed</h3>
        <p style={{ ...stepSubtitleStyle, textAlign: 'center' }}>
          {selectedDate} at {selectedTime}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {step.title && <h3 style={stepTitleStyle}>{step.title}</h3>}
      {step.subtitle && <p style={stepSubtitleStyle}>{step.subtitle}</p>}

      {/* Date picker */}
      <div>
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <CalendarDays style={{ width: 16, height: 16 }} />
          Select a date
        </label>
        <input
          type="date"
          value={selectedDate}
          min={new Date().toISOString().split('T')[0]}
          onChange={(e) => dispatch({ type: 'SET_BOOKING_DATE', date: e.target.value })}
          style={inputStyle}
          onFocus={(e) => { e.currentTarget.style.borderColor = eff.buttonBg; e.currentTarget.style.boxShadow = `0 0 0 3px ${eff.buttonBorder}`; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = eff.buttonBorder; e.currentTarget.style.boxShadow = 'none'; }}
        />
      </div>

      {/* Time slots */}
      {selectedDate && (
        <div>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock style={{ width: 16, height: 16 }} />
            Available times
          </label>
          {booking.loadingSlots ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 0', fontSize: '14px', color: eff.textBody }}>
              <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
              Loading slots...
            </div>
          ) : booking.availableSlots.length === 0 ? (
            <p style={{ fontSize: '14px', color: eff.textBody, padding: '8px 0' }}>
              No slots available for this date. Try another day.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {booking.availableSlots.map((slot) => {
                const active = selectedTime === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => dispatch({ type: 'SET_BOOKING_TIME', time: slot })}
                    style={{
                      borderRadius: eff.radiusMd,
                      border: active ? `2px solid ${eff.buttonBg}` : `1px solid ${eff.buttonBorder}`,
                      padding: '10px 8px',
                      fontSize: '14px',
                      fontWeight: active ? 700 : 500,
                      color: active ? eff.text : eff.textBody,
                      background: active ? eff.bgSecondary : '#fff',
                      cursor: 'pointer',
                      fontFamily: eff.font,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = eff.textBody; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = eff.buttonBorder; }}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Customer info */}
      {selectedTime && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          borderTop: `1px solid ${eff.buttonBorder}`,
          paddingTop: '24px',
        }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: eff.text, margin: 0 }}>Your details</p>
          <input
            placeholder="Name"
            value={customer.name}
            onChange={(e) => dispatch({ type: 'SET_BOOKING_CUSTOMER', field: 'name', value: e.target.value })}
            style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = eff.buttonBg; e.currentTarget.style.boxShadow = `0 0 0 3px ${eff.buttonBorder}`; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = eff.buttonBorder; e.currentTarget.style.boxShadow = 'none'; }}
          />
          <input
            placeholder="Email"
            type="email"
            value={customer.email}
            onChange={(e) => dispatch({ type: 'SET_BOOKING_CUSTOMER', field: 'email', value: e.target.value })}
            style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = eff.buttonBg; e.currentTarget.style.boxShadow = `0 0 0 3px ${eff.buttonBorder}`; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = eff.buttonBorder; e.currentTarget.style.boxShadow = 'none'; }}
          />
          <input
            placeholder="Phone"
            type="tel"
            value={customer.phone}
            onChange={(e) => dispatch({ type: 'SET_BOOKING_CUSTOMER', field: 'phone', value: e.target.value })}
            style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = eff.buttonBg; e.currentTarget.style.boxShadow = `0 0 0 3px ${eff.buttonBorder}`; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = eff.buttonBorder; e.currentTarget.style.boxShadow = 'none'; }}
          />
          {error && (
            <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>{error}</p>
          )}
          <button
            type="button"
            onClick={handleConfirmBooking}
            disabled={!customer.name.trim() || !customer.email.trim() || submitting}
            style={{
              ...primaryButtonStyle,
              opacity: (!customer.name.trim() || !customer.email.trim() || submitting) ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = eff.buttonBgHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = eff.buttonBg; }}
          >
            {submitting ? 'Booking...' : 'Confirm Booking'}
          </button>
        </div>
      )}
    </div>
  );
}
