import { useState, useEffect, useCallback, useRef } from "react";
import { CalendarDays, Clock, Loader2, ChevronLeft, ChevronRight, Check, X } from "lucide-react";

interface BookNowButtonProps {
  clientId: number;
  label?: string;
  variant?: "primary" | "outline" | "ghost";
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  quoteAmount?: number;
  className?: string;
  onBooked?: (booking: { date: string; time: string }) => void;
  inline?: boolean;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function getNextNDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) { const d = new Date(now); d.setDate(now.getDate() + i); days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`); }
  return days;
}

type FlowStep = "date" | "form" | "confirmed";

function BookingFlow({ clientId, customerName = "", customerEmail = "", customerPhone = "", quoteAmount, onBooked, onClose }: {
  clientId: number; customerName?: string; customerEmail?: string; customerPhone?: string; quoteAmount?: number;
  onBooked?: (booking: { date: string; time: string }) => void; onClose?: () => void;
}) {
  const [step, setStep] = useState<FlowStep>("date");
  const [days] = useState(() => getNextNDays(7));
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [name, setName] = useState(customerName);
  const [email, setEmail] = useState(customerEmail);
  const [phone, setPhone] = useState(customerPhone);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!selectedDate) return;
    setLoadingSlots(true); setSelectedTime(""); setSlots([]);
    fetch(`/api/booking/${clientId}/slots?date=${selectedDate}&days=1`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data.slots)) setSlots(data.slots); else if (data[selectedDate]) setSlots(data[selectedDate]); else setSlots([]); })
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [selectedDate, clientId]);

  const handleSubmit = useCallback(async () => {
    if (submitLockRef.current || submitting) return;
    submitLockRef.current = true; setSubmitting(true); setError(null);
    if (!name.trim()) { setError("Name is required."); submitLockRef.current = false; setSubmitting(false); return; }
    try {
      const res = await fetch(`/api/booking/${clientId}/create`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, time: selectedTime, customer_name: name.trim(), customer_email: email.trim() || undefined, customer_phone: phone.trim() || undefined, notes: notes.trim() || undefined, quote_amount: quoteAmount }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || "Booking failed."); submitLockRef.current = false; setSubmitting(false); return; }
      setStep("confirmed"); onBooked?.({ date: selectedDate, time: selectedTime });
    } catch { setError("Network error."); submitLockRef.current = false; } finally { setSubmitting(false); }
  }, [clientId, selectedDate, selectedTime, name, email, phone, notes, quoteAmount, onBooked, submitting]);

  if (step === "date") return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><CalendarDays className="w-5 h-5 text-gray-500" />Pick a Date & Time</h3>
        {onClose && <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {days.map((d) => { const active = d === selectedDate; const dd = new Date(d + "T00:00:00"); return (
          <button key={d} type="button" onClick={() => setSelectedDate(d)} className={`flex flex-col items-center min-w-[56px] px-3 py-2.5 rounded-xl border text-sm font-medium transition-all shrink-0 ${active ? "border-[#2D6A4F] bg-[#F0F7F4] text-[#2D6A4F] shadow-sm" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"}`}>
            <span className="text-[10px] uppercase tracking-wider opacity-70">{dd.toLocaleDateString("en-US", { weekday: "short" })}</span>
            <span className="text-base font-bold">{dd.getDate()}</span>
          </button>); })}
      </div>
      {selectedDate && (<div>
        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-2"><Clock className="w-4 h-4" />Available times</label>
        {loadingSlots ? <div className="flex items-center gap-2 py-6 justify-center text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />Loading...</div>
        : slots.length === 0 ? <p className="text-sm text-gray-500 py-4 text-center">No slots available. Try another day.</p>
        : <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">{slots.map((s) => { const a = selectedTime === s; return <button key={s} type="button" onClick={() => setSelectedTime(s)} className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${a ? "border-[#2D6A4F] bg-[#F0F7F4] text-[#2D6A4F] shadow-sm" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}>{formatTime(s)}</button>; })}</div>}
      </div>)}
      {selectedTime && <button type="button" onClick={() => setStep("form")} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#2D6A4F] text-white font-semibold text-sm hover:bg-[#1B4332]">Continue<ChevronRight className="w-4 h-4" /></button>}
    </div>
  );

  if (step === "form") return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setStep("date")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><ChevronLeft className="w-4 h-4" />Back</button>
        {onClose && <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>}
      </div>
      <div className="text-center py-1"><p className="text-sm font-medium text-[#2D6A4F]">{formatDate(selectedDate)} at {formatTime(selectedTime)}</p></div>
      <div className="flex flex-col gap-3">
        <div><label className="text-xs font-medium text-gray-600 mb-1 block">Name *</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full h-11 px-3 rounded-lg border border-gray-200 text-sm text-gray-900 outline-none focus:border-[#2D6A4F] focus:ring-2 focus:ring-[#2D6A4F]/10" /></div>
        <div><label className="text-xs font-medium text-gray-600 mb-1 block">Phone *</label><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="w-full h-11 px-3 rounded-lg border border-gray-200 text-sm text-gray-900 outline-none focus:border-[#2D6A4F] focus:ring-2 focus:ring-[#2D6A4F]/10" /></div>
        <div><label className="text-xs font-medium text-gray-600 mb-1 block">Email (optional)</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full h-11 px-3 rounded-lg border border-gray-200 text-sm text-gray-900 outline-none focus:border-[#2D6A4F] focus:ring-2 focus:ring-[#2D6A4F]/10" /></div>
        <div><label className="text-xs font-medium text-gray-600 mb-1 block">Notes (optional)</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should know?" rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 outline-none focus:border-[#2D6A4F] focus:ring-2 focus:ring-[#2D6A4F]/10 resize-none" /></div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="button" onClick={handleSubmit} disabled={!name.trim() || !phone.trim() || submitting} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#2D6A4F] text-white font-semibold text-sm hover:bg-[#1B4332] disabled:opacity-50 disabled:cursor-not-allowed">
        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Booking...</> : <><CalendarDays className="w-4 h-4" />Confirm Booking</>}
      </button>
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center"><Check className="w-6 h-6 text-emerald-600" /></div>
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">Booking Confirmed</h3>
        <p className="text-sm text-gray-500 mt-1">{formatDate(selectedDate)} at {formatTime(selectedTime)}</p>
        <p className="text-sm text-gray-500 mt-2">You will receive a confirmation shortly.</p>
      </div>
      {onClose && <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 underline mt-2">Close</button>}
    </div>
  );
}

export default function BookNowButton({ clientId, label = "Book Now", variant = "primary", customerName, customerEmail, customerPhone, quoteAmount, className = "", onBooked, inline = false }: BookNowButtonProps) {
  const [configChecked, setConfigChecked] = useState(false);
  const [bookingEnabled, setBookingEnabled] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/booking/${clientId}/config`)
      .then((r) => { if (!r.ok) throw new Error("na"); return r.json(); })
      .then((data: { enabled: boolean }) => { setBookingEnabled(data.enabled === true); setConfigChecked(true); })
      .catch(() => { setBookingEnabled(false); setConfigChecked(true); });
  }, [clientId]);

  if (configChecked && !bookingEnabled) return null;
  if (!configChecked) return null;
  if (inline) return <BookingFlow clientId={clientId} customerName={customerName} customerEmail={customerEmail} customerPhone={customerPhone} quoteAmount={quoteAmount} onBooked={onBooked} />;

  const vs: Record<string, string> = { primary: "bg-[#2D6A4F] text-white hover:bg-[#1B4332] border-transparent shadow-sm", outline: "bg-white text-[#2D6A4F] hover:bg-[#F0F7F4] border-[#2D6A4F]", ghost: "bg-transparent text-[#2D6A4F] hover:bg-[#F0F7F4] border-transparent" };

  return (<>
    <button type="button" onClick={() => setModalOpen(true)} className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-semibold transition-all ${vs[variant]} ${className}`}><CalendarDays className="w-4 h-4" />{label}</button>
    {modalOpen && (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
        <div className="relative w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl z-10 p-5 max-h-[85vh] overflow-y-auto">
          <BookingFlow clientId={clientId} customerName={customerName} customerEmail={customerEmail} customerPhone={customerPhone} quoteAmount={quoteAmount} onBooked={onBooked} onClose={() => setModalOpen(false)} />
        </div>
      </div>
    )}
  </>);
}
