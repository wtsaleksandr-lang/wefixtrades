import { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarDays, Clock, Loader2, ChevronRight, Check, ChevronLeft } from 'lucide-react';
import { eff, primaryButtonStyle, inputStyle, labelStyle } from '../designTokens';

interface BookNowInlineWidgetProps {
  calculatorId: number;
  quoteAmount?: number;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function getNextNDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return days;
}

type FlowStep = 'idle' | 'date' | 'form' | 'confirmed';

export default function BookNowInlineWidget({ calculatorId, quoteAmount }: BookNowInlineWidgetProps) {
  const [configChecked, setConfigChecked] = useState(false);
  const [bookingEnabled, setBookingEnabled] = useState(false);
  const [step, setStep] = useState<FlowStep>('idle');
  const [days] = useState(() => getNextNDays(7));
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!calculatorId || calculatorId <= 0) { setConfigChecked(true); return; }
    fetch(`/api/booking/${calculatorId}/config`)
      .then((r) => { if (!r.ok) throw new Error('na'); return r.json(); })
      .then((data: { enabled: boolean }) => { setBookingEnabled(data.enabled === true); setConfigChecked(true); })
      .catch(() => { setBookingEnabled(false); setConfigChecked(true); });
  }, [calculatorId]);

  useEffect(() => {
    if (!selectedDate || !calculatorId) return;
    setLoadingSlots(true); setSelectedTime(''); setSlots([]);
    fetch(`/api/booking/${calculatorId}/slots?date=${selectedDate}&days=1`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.slots)) setSlots(data.slots);
        else if (data[selectedDate] && Array.isArray(data[selectedDate])) setSlots(data[selectedDate]);
        else setSlots([]);
      })
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [selectedDate, calculatorId]);

  const handleSubmit = useCallback(async () => {
    if (submitLockRef.current || submitting) return;
    submitLockRef.current = true; setSubmitting(true); setError(null);
    if (!name.trim()) { setError('Name is required.'); submitLockRef.current = false; setSubmitting(false); return; }
    if (!phone.trim()) { setError('Phone is required.'); submitLockRef.current = false; setSubmitting(false); return; }
    try {
      const res = await fetch(`/api/booking/${calculatorId}/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, time: selectedTime, customer_name: name.trim(), customer_email: email.trim() || undefined, customer_phone: phone.trim(), notes: notes.trim() || undefined, quote_amount: quoteAmount }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Booking failed.'); submitLockRef.current = false; setSubmitting(false); return; }
      setStep('confirmed');
    } catch { setError('Network error.'); submitLockRef.current = false; } finally { setSubmitting(false); }
  }, [calculatorId, selectedDate, selectedTime, name, email, phone, notes, quoteAmount, submitting]);

  if (!configChecked || !bookingEnabled) return null;

  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.currentTarget.style.borderColor = eff.buttonBg; e.currentTarget.style.boxShadow = `0 0 0 3px ${eff.buttonBorder}`; };
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { e.currentTarget.style.borderColor = eff.buttonBorder; e.currentTarget.style.boxShadow = 'none'; };

  if (step === 'idle') return (
    <button type="button" data-theme="light" onClick={() => setStep('date')} style={{ ...primaryButtonStyle, background: 'transparent', color: eff.buttonBg, border: `2px solid ${eff.buttonBg}`, gap: '10px' }} onMouseEnter={(e) => { e.currentTarget.style.background = eff.bgSecondary; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
      <CalendarDays style={{ width: 16, height: 16 }} />Book an Appointment
    </button>
  );

  if (step === 'confirmed') return (
    <div style={{ borderRadius: eff.radiusXl, border: `1px solid ${eff.buttonBorder}`, background: eff.successBg, padding: '24px 20px', textAlign: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}><Check style={{ width: 20, height: 20, color: eff.success }} /></div>
      <p style={{ fontSize: '16px', fontWeight: 700, color: eff.text, margin: '0 0 4px', fontFamily: eff.font }}>Booking Confirmed</p>
      <p style={{ fontSize: '14px', color: eff.textBody, margin: 0, fontFamily: eff.font }}>{formatDate(selectedDate)} at {formatTime(selectedTime)}</p>
      <p style={{ fontSize: '13px', color: eff.textBody, margin: '8px 0 0', fontFamily: eff.font }}>You will receive a confirmation shortly.</p>
    </div>
  );

  if (step === 'date') return (
    <div style={{ borderRadius: eff.radiusXl, border: `1px solid ${eff.buttonBorder}`, background: '#fff', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: '15px', fontWeight: 700, color: eff.text, margin: 0, fontFamily: eff.font, display: 'flex', alignItems: 'center', gap: '8px' }}><CalendarDays style={{ width: 16, height: 16, color: eff.textBody }} />Pick a Date & Time</p>
        <button type="button" onClick={() => setStep('idle')} style={{ fontSize: '13px', color: eff.textBody, background: 'none', border: 'none', cursor: 'pointer', fontFamily: eff.font, padding: '4px 8px' }}>Cancel</button>
      </div>
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        {days.map((d) => { const active = d === selectedDate; const dd = new Date(d + 'T00:00:00'); return (
          <button key={d} type="button" onClick={() => setSelectedDate(d)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '52px', padding: '8px 10px', borderRadius: eff.radiusMd, border: active ? `2px solid ${eff.buttonBg}` : `1px solid ${eff.buttonBorder}`, background: active ? eff.bgSecondary : '#fff', cursor: 'pointer', fontFamily: eff.font, transition: 'all 0.15s', flexShrink: 0 }}>
            <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: active ? eff.text : eff.textBody, opacity: 0.8 }}>{dd.toLocaleDateString('en-US', { weekday: 'short' })}</span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: active ? eff.text : eff.textBody }}>{dd.getDate()}</span>
          </button>
        ); })}
      </div>
      {selectedDate && (<div>
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Clock style={{ width: 14, height: 14 }} />Available times</label>
        {loadingSlots ? <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 0', fontSize: '14px', color: eff.textBody }}><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />Loading...</div>
        : slots.length === 0 ? <p style={{ fontSize: '14px', color: eff.textBody, padding: '8px 0' }}>No slots available. Try another day.</p>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
          {slots.map((s) => { const a = selectedTime === s; return <button key={s} type="button" onClick={() => setSelectedTime(s)} style={{ borderRadius: eff.radiusMd, border: a ? `2px solid ${eff.buttonBg}` : `1px solid ${eff.buttonBorder}`, padding: '10px 8px', fontSize: '14px', fontWeight: a ? 700 : 500, color: a ? eff.text : eff.textBody, background: a ? eff.bgSecondary : '#fff', cursor: 'pointer', fontFamily: eff.font, transition: 'all 0.15s' }}>{formatTime(s)}</button>; })}
        </div>}
      </div>)}
      {selectedTime && <button type="button" onClick={() => setStep('form')} style={primaryButtonStyle} onMouseEnter={(e) => { e.currentTarget.style.background = eff.buttonBgHover; }} onMouseLeave={(e) => { e.currentTarget.style.background = eff.buttonBg; }}>Continue<ChevronRight style={{ width: 16, height: 16 }} /></button>}
    </div>
  );

  return (
    <div style={{ borderRadius: eff.radiusXl, border: `1px solid ${eff.buttonBorder}`, background: '#fff', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button type="button" onClick={() => setStep('date')} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: eff.textBody, background: 'none', border: 'none', cursor: 'pointer', fontFamily: eff.font, padding: '4px 0' }}><ChevronLeft style={{ width: 14, height: 14 }} />Back</button>
        <p style={{ fontSize: '13px', fontWeight: 600, color: eff.text, margin: 0, fontFamily: eff.font }}>{formatDate(selectedDate)} at {formatTime(selectedTime)}</p>
      </div>
      <p style={{ fontSize: '14px', fontWeight: 600, color: eff.text, margin: 0, fontFamily: eff.font }}>Confirm your details</p>
      <input placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
      <input placeholder="Phone *" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
      <input placeholder="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
      <textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, height: 'auto', padding: '12px 16px', resize: 'none' as const }} onFocus={onFocus as any} onBlur={onBlur as any} />
      {error && <p style={{ fontSize: '13px', color: eff.error, margin: 0 }}>{error}</p>}
      <button type="button" onClick={handleSubmit} disabled={!name.trim() || !phone.trim() || submitting} style={{ ...primaryButtonStyle, opacity: (!name.trim() || !phone.trim() || submitting) ? 0.5 : 1 }} onMouseEnter={(e) => { e.currentTarget.style.background = eff.buttonBgHover; }} onMouseLeave={(e) => { e.currentTarget.style.background = eff.buttonBg; }}>
        {submitting ? <><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />Booking...</> : <><CalendarDays style={{ width: 16, height: 16 }} />Confirm Booking</>}
      </button>
    </div>
  );
}
