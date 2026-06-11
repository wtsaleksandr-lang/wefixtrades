import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Copy,
  Check,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  AlertCircle,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { cn } from "@/lib/utils";
import {
  FieldGroupHeader,
  FieldHelpCue,
  TitleInField,
  TitleInFieldSelect,
} from "./_shared";

/**
 * Appointment / Callback Booking — free-tools self-contained widget.
 *
 * Turns "I'll call later" into a booked *request*. Same scaffold as
 * SchemaGenerator / BeforeAfterSlider: purely client-side. The owner's
 * config (title, service types, available days, time windows, contact
 * fields, submission target) is baked straight into a SELF-CONTAINED
 * inline HTML/CSS/JS snippet the customer pastes. No backend, no API,
 * no external script.
 *
 * HONEST SCOPE: with no backend there is no live calendar availability.
 * This is a "request a slot" form — the customer picks a preferred day +
 * time-window + service and it's sent to the tradesperson (via a pasted
 * form-action endpoint such as Formspree/Getform, or a prefilled mailto
 * fallback). The UI says so plainly so nobody mistakes it for real-time
 * booking.
 *
 * DS compliance: title-in-field + top-left help cue + 2px input-cluster
 * gaps + single .btn-primary-premium (Copy snippet) + theme tokens only
 * (no bare #fff/#000/white/black literals — the embedded CSS uses neutral
 * rgba tokens that read on any host background).
 */

/* ─── Weekday model ─── */
const DAYS = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
  { key: "sat", label: "Saturday", short: "Sat" },
  { key: "sun", label: "Sunday", short: "Sun" },
] as const;

type DayKey = (typeof DAYS)[number]["key"];

/* ─── Time windows the owner can offer ─── */
interface Window {
  key: string;
  label: string;
}
const DEFAULT_WINDOWS: Window[] = [
  { key: "morning", label: "Morning (8am – 12pm)" },
  { key: "afternoon", label: "Afternoon (12pm – 5pm)" },
  { key: "evening", label: "Evening (5pm – 8pm)" },
];

/* ─── Trade service-type presets (labels only — owner edits freely) ─── */
interface TradePreset {
  key: string;
  label: string;
  services: string[];
}
const TRADE_PRESETS: TradePreset[] = [
  {
    key: "roofer",
    label: "Roofer",
    services: ["Free estimate", "Emergency call-out", "Roof repair", "Annual inspection"],
  },
  {
    key: "plumber",
    label: "Plumber",
    services: ["Free estimate", "Emergency call-out", "Leak / repair", "Maintenance visit"],
  },
  {
    key: "electrician",
    label: "Electrician",
    services: ["Free estimate", "Emergency call-out", "Fault-finding", "Safety inspection"],
  },
  {
    key: "hvac",
    label: "HVAC",
    services: ["Free estimate", "Emergency call-out", "Install quote", "Annual service"],
  },
  {
    key: "general",
    label: "General",
    services: ["Free estimate", "Emergency call-out", "Maintenance visit", "Site survey"],
  },
];

/* ─── Required contact fields the form asks for ─── */
interface ContactFields {
  name: boolean;
  phone: boolean;
  email: boolean;
}

type Target = "form" | "mailto";

/* ─── HTML escaping for safe interpolation into the embed snippet. ───
   Escapes the characters that could break out of an HTML attribute or
   text node, plus backtick — defends against snippet breakage and
   injection when the owner pastes arbitrary labels / URLs / emails. */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

/* ─── JS string literal escaping (for values baked into the inline
   <script>, e.g. the mailto subject/body builder). ─── */
function escapeJs(s: string): string {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")
    .replace(/<\/(script)/gi, "<\\/$1");
}

interface SnippetOpts {
  title: string;
  services: string[];
  days: { key: DayKey; label: string }[];
  windows: Window[];
  fields: ContactFields;
  target: Target;
  formAction: string;
  email: string;
}

/** Build the self-contained, no-backend embed snippet. */
function buildSnippet(opts: SnippetOpts): string {
  const id = "wft-book";
  const title = escapeHtml(opts.title.trim() || "Request an appointment");
  const services = opts.services.map((s) => s.trim()).filter(Boolean);
  const windows = opts.windows.filter((w) => w.label.trim());
  const days = opts.days;

  const hasForm = opts.target === "form" && opts.formAction.trim();
  const hasMail = opts.target === "mailto" && opts.email.trim();

  // If nothing is wired up, emit a clear, honest hint instead of a broken
  // form that silently drops submissions.
  if (!hasForm && !hasMail) {
    return `<!-- WeFixTrades Appointment Booking —
     NOT READY: connect a form endpoint or email first.
     In the configurator on the left, set "Where requests go" to either a
     form-action URL (Formspree / Getform) or your email address, then copy
     this snippet again. -->`;
  }

  const serviceOpts = services
    .map((s) => `        <option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
    .join("\n");
  const dayOpts = days
    .map((d) => `        <option value="${escapeHtml(d.label)}">${escapeHtml(d.label)}</option>`)
    .join("\n");
  const winOpts = windows
    .map((w) => `        <option value="${escapeHtml(w.label)}">${escapeHtml(w.label)}</option>`)
    .join("\n");

  // Build the contact field rows that are enabled.
  const contactRows: string[] = [];
  if (opts.fields.name) {
    contactRows.push(
      `      <label class="${id}__row"><span class="${id}__lbl">Your name</span><input class="${id}__in" type="text" name="name" required autocomplete="name" /></label>`,
    );
  }
  if (opts.fields.phone) {
    contactRows.push(
      `      <label class="${id}__row"><span class="${id}__lbl">Phone</span><input class="${id}__in" type="tel" name="phone" required autocomplete="tel" /></label>`,
    );
  }
  if (opts.fields.email) {
    contactRows.push(
      `      <label class="${id}__row"><span class="${id}__lbl">Email</span><input class="${id}__in" type="email" name="email" required autocomplete="email" /></label>`,
    );
  }
  const contactHtml = contactRows.join("\n");

  const formAttrs = hasForm
    ? `action="${escapeHtml(opts.formAction.trim())}" method="POST"`
    : `action="#" method="POST" data-mailto="${escapeHtml(opts.email.trim())}"`;

  // The inline script only needs to do work for the mailto path: intercept
  // submit, build a prefilled mailto: from the chosen service/day/window +
  // contact fields, and open the user's mail client. The form-action path
  // is a plain native POST (urlencoded) — no JS required, works everywhere.
  const mailtoScript = hasMail
    ? `<script>
(function(){
  var form=document.currentScript.previousElementSibling;
  while(form&&form.tagName!=="FORM"){form=form.previousElementSibling;}
  if(!form)return;
  var to=form.getAttribute("data-mailto")||"";
  form.addEventListener("submit",function(e){
    e.preventDefault();
    function v(n){var el=form.querySelector('[name="'+n+'"]');return el?el.value:"";}
    var lines=[];
    lines.push('New appointment request');
    lines.push('');
    lines.push('Service: '+v('service'));
    lines.push('Preferred day: '+v('day'));
    lines.push('Time window: '+v('window'));
    if(v('name'))lines.push('Name: '+v('name'));
    if(v('phone'))lines.push('Phone: '+v('phone'));
    if(v('email'))lines.push('Email: '+v('email'));
    if(v('notes'))lines.push('Notes: '+v('notes'));
    var subject='${escapeJs(`Appointment request — ${opts.title.trim() || "new booking"}`)}';
    var body=lines.join('\\n');
    window.location.href='mailto:'+encodeURIComponent(to)
      +'?subject='+encodeURIComponent(subject)
      +'&body='+encodeURIComponent(body);
    var done=form.querySelector('.${id}__done');
    if(done)done.style.display='block';
  });
})();
</script>`
    : "";

  return `<!-- WeFixTrades Appointment Booking (request a slot) -->
<form class="${id}" ${formAttrs}>
  <h3 class="${id}__title">${title}</h3>
  <p class="${id}__note">Pick a preferred day &amp; time — we'll confirm the exact slot with you. This is a request, not a live booking.</p>
  <div class="${id}__fields">
    <label class="${id}__row">
      <span class="${id}__lbl">Service</span>
      <select class="${id}__in" name="service" required>
${serviceOpts || `        <option value="Appointment">Appointment</option>`}
      </select>
    </label>
    <label class="${id}__row">
      <span class="${id}__lbl">Preferred day</span>
      <select class="${id}__in" name="day" required>
${dayOpts || `        <option value="Any day">Any day</option>`}
      </select>
    </label>
    <label class="${id}__row">
      <span class="${id}__lbl">Time window</span>
      <select class="${id}__in" name="window" required>
${winOpts || `        <option value="Any time">Any time</option>`}
      </select>
    </label>
${contactHtml}
    <label class="${id}__row">
      <span class="${id}__lbl">Notes (optional)</span>
      <textarea class="${id}__in" name="notes" rows="2"></textarea>
    </label>
  </div>
  <button class="${id}__btn" type="submit">Request appointment</button>
  <p class="${id}__done" role="status">Thanks — your request is on its way. We'll be in touch to confirm.</p>
</form>
<style>
.${id}{box-sizing:border-box;max-width:420px;margin:0 auto;padding:20px;border:1px solid rgba(17,24,39,0.12);border-radius:14px;background:rgba(255,255,255,0.96);font-family:inherit;color:rgba(17,24,39,0.92)}
.${id} *{box-sizing:border-box}
.${id}__title{margin:0 0 4px;font-size:18px;font-weight:700;line-height:1.3}
.${id}__note{margin:0 0 14px;font-size:12px;line-height:1.45;color:rgba(17,24,39,0.55)}
.${id}__fields{display:flex;flex-direction:column;gap:10px}
.${id}__row{display:flex;flex-direction:column;gap:4px}
.${id}__lbl{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:rgba(17,24,39,0.6)}
.${id}__in{width:100%;padding:9px 11px;font-size:14px;font-family:inherit;color:inherit;border:1px solid rgba(17,24,39,0.16);border-radius:9px;background:rgba(255,255,255,0.9)}
.${id}__in:focus{outline:none;border-color:rgba(37,99,235,0.8);box-shadow:0 0 0 3px rgba(37,99,235,0.18)}
.${id}__btn{width:100%;margin-top:14px;padding:11px 14px;font-size:14px;font-weight:600;font-family:inherit;color:rgba(255,255,255,0.98);background:rgba(37,99,235,1);border:0;border-radius:9px;cursor:pointer}
.${id}__btn:hover{background:rgba(29,78,216,1)}
.${id}__btn:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(37,99,235,0.4)}
.${id}__done{display:none;margin:12px 0 0;font-size:13px;line-height:1.4;color:rgba(22,101,52,1)}
</style>
${mailtoScript}
<!-- /WeFixTrades Appointment Booking -->`;
}

export default function BookingWidget() {
  usePageTitle("Appointment Booking");
  const { toast } = useToast();

  const [title, setTitle] = useState("Request an appointment");
  const [services, setServices] = useState<string[]>([
    "Free estimate",
    "Emergency call-out",
    "Maintenance visit",
  ]);
  const [newService, setNewService] = useState("");
  const [days, setDays] = useState<Record<DayKey, boolean>>({
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: false,
    sun: false,
  });
  const [windows, setWindows] = useState<Window[]>(DEFAULT_WINDOWS);
  const [fields, setFields] = useState<ContactFields>({
    name: true,
    phone: true,
    email: false,
  });
  const [target, setTarget] = useState<Target>("form");
  const [formAction, setFormAction] = useState("");
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  const activeDays = useMemo(
    () =>
      DAYS.filter((d) => days[d.key]).map((d) => ({
        key: d.key,
        label: d.label,
      })),
    [days],
  );

  const enabledWindows = useMemo(
    () => windows.filter((w) => w.label.trim()),
    [windows],
  );

  const connected =
    (target === "form" && formAction.trim().length > 0) ||
    (target === "mailto" && email.trim().length > 0);

  const snippet = useMemo(
    () =>
      buildSnippet({
        title,
        services,
        days: activeDays,
        windows,
        fields,
        target,
        formAction,
        email,
      }),
    [title, services, activeDays, windows, fields, target, formAction, email],
  );

  useCopilotForm({
    formLabel: "Appointment Booking",
    fields: [
      { key: "title", label: "Widget title shown above the form", required: true },
      { key: "formAction", label: "Form-action URL (Formspree / Getform)", required: false },
      { key: "email", label: "Fallback email address for mailto", required: false },
    ],
    values: { title, formAction, email },
    onApply: (fills) => {
      for (const f of fills) {
        const v = String(f.value ?? "");
        if (f.field_key === "title") setTitle(v);
        else if (f.field_key === "formAction") setFormAction(v);
        else if (f.field_key === "email") setEmail(v);
      }
    },
    enabled: true,
  });

  const applyPreset = (p: TradePreset) => setServices([...p.services]);

  const addService = () => {
    const t = newService.trim();
    if (!t) return;
    if (services.includes(t)) {
      setNewService("");
      return;
    }
    setServices([...services, t]);
    setNewService("");
  };

  const removeService = (s: string) =>
    setServices(services.filter((x) => x !== s));

  const updateWindow = (i: number, label: string) =>
    setWindows(windows.map((w, idx) => (idx === i ? { ...w, label } : w)));

  const removeWindow = (i: number) =>
    setWindows(windows.filter((_, idx) => idx !== i));

  const addWindow = () =>
    setWindows([
      ...windows,
      { key: `w${Date.now()}`, label: "" },
    ]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast({ title: "Copied", description: "Embed snippet copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the snippet and copy manually.",
        variant: "destructive",
      });
    }
  };

  return (
    <PortalLayout
      breadcrumb={
        <span className="flex items-center gap-1.5">
          <Link href="/portal/free-tools" className="hover:text-brand-blue">Free Tools</Link>
          <span className="text-gray-400">/</span>
          <span>Appointment Booking</span>
        </span>
      }
    >
      <div data-theme="light" className="qq-paper-surface space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h2 className="text-2xl font-bold text-gray-900">Appointment Booking</h2>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            Turn “I'll call later” into a booked request. Visitors pick a
            preferred day, a time window, and the service they need — and it's
            sent straight to you. The embed is fully self-contained: your
            options and submission target are baked in, so there's no script to
            host and no account to load.
          </p>
        </header>

        {/* HONEST scope banner — no live calendar without a backend. */}
        <div
          className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900"
          data-testid="booking-honest-banner"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium">This is a slot request, not live-availability booking</p>
            <p className="text-xs mt-0.5">
              Without a backend there's no real-time calendar sync — the form
              collects a customer's <em>preferred</em> day and time window and
              sends it to you to confirm. For true two-way calendar booking,
              upgrade to a hosted scheduler.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration column */}
          <div className="lg:col-span-1 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Widget title"
                  help="The bold heading shown above the booking form on your site."
                />
                <div className="space-y-0.5">
                  <TitleInField
                    id="bk-title"
                    label="Title"
                    value={title}
                    onChange={setTitle}
                    placeholder="Request an appointment"
                    maxLength={60}
                    help="Keep it short and action-y — e.g. “Book a free estimate”."
                    testid="bk-title"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Service types"
                  help="The options a customer can pick from. Use a trade preset to fill sensible defaults, then add or remove your own."
                />
                <div className="flex flex-wrap gap-1 mb-1">
                  {TRADE_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="px-2.5 py-1 text-xs font-medium rounded-full border border-gray-200 text-gray-700 hover:border-brand-blue hover:text-brand-blue transition-colors"
                      data-testid={`bk-preset-${p.key}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5 items-start">
                  <div className="flex-1">
                    <TitleInField
                      id="bk-service-new"
                      label="Add a service"
                      value={newService}
                      onChange={setNewService}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addService();
                        }
                      }}
                      placeholder="Boiler service"
                      maxLength={48}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addService}
                    aria-label="Add service"
                    className="mt-1"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {services.length > 0 && (
                  <ul className="space-y-0.5">
                    {services.map((s) => (
                      <li
                        key={s}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-gray-50 text-xs"
                      >
                        <span className="truncate flex-1 text-gray-700">{s}</span>
                        <button
                          type="button"
                          onClick={() => removeService(s)}
                          className="text-gray-400 hover:text-red-600 shrink-0"
                          aria-label={`Remove ${s}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {services.length === 0 && (
                  <p className="text-[11px] text-gray-500">
                    Add at least one service so customers know what they're booking.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Available days"
                  help="Tick the weekdays you take appointments. Only ticked days appear in the customer's day picker."
                />
                <div className="space-y-0.5">
                  {DAYS.map((d) => (
                    <label key={d.key} className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={days[d.key]}
                        onChange={(e) =>
                          setDays({ ...days, [d.key]: e.target.checked })
                        }
                        className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/20"
                        data-testid={`bk-day-${d.key}`}
                      />
                      {d.label}
                    </label>
                  ))}
                  {activeDays.length === 0 && (
                    <p className="text-[11px] text-amber-700">
                      Pick at least one day, or the form will show “Any day”.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Time windows"
                  help="The time bands you offer. Customers pick a window, not an exact time — you confirm the precise slot when you reach out."
                  right={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addWindow}
                      aria-label="Add time window"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  }
                />
                <div className="space-y-0.5">
                  {windows.map((w, i) => (
                    <div key={w.key} className="flex gap-1.5 items-start">
                      <div className="flex-1">
                        <TitleInField
                          id={`bk-window-${w.key}`}
                          label={`Window ${i + 1}`}
                          value={w.label}
                          onChange={(v) => updateWindow(i, v)}
                          placeholder="Morning (8am – 12pm)"
                          maxLength={40}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeWindow(i)}
                        className="mt-3 text-gray-400 hover:text-red-600 shrink-0"
                        aria-label={`Remove window ${i + 1}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {enabledWindows.length === 0 && (
                    <p className="text-[11px] text-amber-700">
                      Add a window, or the form will show “Any time”.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="relative pl-5">
                  <span className="absolute top-1 left-0">
                    <FieldHelpCue
                      label="Contact fields"
                      help="Which contact details the form requires. Name and at least one of phone/email is recommended so you can reach the customer."
                    />
                  </span>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    Contact fields
                  </div>
                  <div className="space-y-0.5">
                    {(["name", "phone", "email"] as Array<keyof ContactFields>).map((key) => (
                      <label key={key} className="flex items-center gap-2 text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={fields[key]}
                          onChange={(e) =>
                            setFields({ ...fields, [key]: e.target.checked })
                          }
                          className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/20"
                          data-testid={`bk-field-${key}`}
                        />
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                      </label>
                    ))}
                    <p className="text-[11px] text-gray-500">
                      Add at least one way to reach the customer.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Where requests go"
                  help="No backend means the form needs somewhere to send each request. Paste a form-action URL from a free service like Formspree or Getform, OR use your email and the form opens a prefilled message."
                />
                <div className="space-y-0.5">
                  <TitleInFieldSelect
                    id="bk-target"
                    label="Submission target"
                    value={target}
                    onChange={(v) => setTarget(v as Target)}
                    help="Form endpoint = silent POST to Formspree/Getform. Email = opens the visitor's mail app with the request prefilled."
                  >
                    <option value="form">Form endpoint (Formspree / Getform)</option>
                    <option value="mailto">Email (mailto fallback)</option>
                  </TitleInFieldSelect>
                  {target === "form" ? (
                    <TitleInField
                      id="bk-form-action"
                      label="Form-action URL"
                      value={formAction}
                      onChange={setFormAction}
                      placeholder="https://formspree.io/f/abcdwxyz"
                      type="url"
                      help="Create a free form at Formspree or Getform and paste its endpoint URL here. Submissions land in your inbox / their dashboard."
                      testid="bk-form-action"
                    />
                  ) : (
                    <TitleInField
                      id="bk-email"
                      label="Your email"
                      value={email}
                      onChange={setEmail}
                      placeholder="you@yourbusiness.com"
                      type="email"
                      help="The form opens the visitor's mail app with a prefilled message to this address. Needs a working mail client on the visitor's device."
                      testid="bk-email"
                    />
                  )}
                </div>
                {!connected && (
                  <div className="flex items-start gap-2 text-[11px] text-amber-700">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Connect a form endpoint or email — until you do, the
                      snippet shows a setup hint instead of a working form.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Preview + snippet */}
          <div className="lg:col-span-2 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Live preview"
                  help="Exactly what visitors see. The day and window options reflect your config above. Sending is disabled here — it's a preview only."
                />
                <BookingPreview
                  title={title}
                  services={services}
                  days={activeDays.map((d) => d.label)}
                  windows={enabledWindows.map((w) => w.label)}
                  fields={fields}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Embed snippet"
                  help="Self-contained HTML — paste it once wherever you want the booking form. No external script, no account; your options and submission target are baked in."
                  right={
                    /* DS rule 4 — single .btn-primary-premium per page. */
                    <Button
                      type="button"
                      onClick={handleCopy}
                      className="btn-primary-premium"
                      disabled={!connected}
                      data-testid="bk-copy-snippet"
                    >
                      {copied ? (
                        <><Check className="w-4 h-4 mr-1.5" />Copied</>
                      ) : (
                        <><Copy className="w-4 h-4 mr-1.5" />Copy snippet</>
                      )}
                    </Button>
                  }
                />
                <pre
                  className="text-xs bg-slate-50 text-gray-800 p-3 rounded-md overflow-x-auto border border-gray-200 max-h-[420px]"
                  data-testid="bk-snippet"
                >
                  <code>{snippet}</code>
                </pre>
                <p className="text-xs text-gray-500">
                  Tip: the form endpoint route posts standard urlencoded fields
                  (service, day, window, name, phone, email, notes). The email
                  route opens a prefilled mailto: with the same details — no
                  server required either way.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <button
                  type="button"
                  onClick={() => setHowOpen((v) => !v)}
                  className="flex items-center justify-between w-full text-left"
                  aria-expanded={howOpen}
                >
                  <h2 className="text-sm font-semibold text-gray-900">How to install</h2>
                  {howOpen ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>
                {howOpen && (
                  <ul className="mt-3 space-y-2 text-xs text-gray-700">
                    <li>
                      <strong>Get an endpoint (recommended):</strong> sign up at{" "}
                      Formspree or Getform (both free tiers), create a form, copy
                      its action URL into “Where requests go”.
                    </li>
                    <li><strong>WordPress:</strong> add a Custom HTML block and paste the snippet.</li>
                    <li><strong>Wix:</strong> Add → Embed Code → paste.</li>
                    <li><strong>Squarespace:</strong> Add Block → Code → paste.</li>
                    <li><strong>Shopify:</strong> place in a section template or <code>theme.liquid</code>.</li>
                    <li><strong>Plain HTML:</strong> paste anywhere in <code>&lt;body&gt;</code>.</li>
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}

/* ─── Live in-portal preview — mirrors the embedded form's structure and
   options. Submission is intentionally disabled (preview only). ─── */
function BookingPreview({
  title,
  services,
  days,
  windows,
  fields,
}: {
  title: string;
  services: string[];
  days: string[];
  windows: string[];
  fields: ContactFields;
}) {
  const serviceOpts = services.length ? services : ["Appointment"];
  const dayOpts = days.length ? days : ["Any day"];
  const winOpts = windows.length ? windows : ["Any time"];

  return (
    <div
      className="mx-auto max-w-md p-5 rounded-2xl border border-gray-200 bg-white"
      data-testid="bk-preview"
    >
      <h3 className="text-lg font-bold text-gray-900 mb-1">
        {title.trim() || "Request an appointment"}
      </h3>
      <p className="text-xs text-gray-500 mb-3.5 leading-relaxed">
        Pick a preferred day &amp; time — we'll confirm the exact slot with
        you. This is a request, not a live booking.
      </p>
      <form
        className="space-y-2.5"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Appointment request preview"
      >
        <PreviewField label="Service">
          <select className={previewInputClass} aria-label="Service">
            {serviceOpts.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </PreviewField>
        <PreviewField label="Preferred day">
          <select className={previewInputClass} aria-label="Preferred day">
            {dayOpts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </PreviewField>
        <PreviewField label="Time window">
          <select className={previewInputClass} aria-label="Time window">
            {winOpts.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </PreviewField>
        {fields.name && (
          <PreviewField label="Your name">
            <input className={previewInputClass} type="text" aria-label="Your name" />
          </PreviewField>
        )}
        {fields.phone && (
          <PreviewField label="Phone">
            <input className={previewInputClass} type="tel" aria-label="Phone" />
          </PreviewField>
        )}
        {fields.email && (
          <PreviewField label="Email">
            <input className={previewInputClass} type="email" aria-label="Email" />
          </PreviewField>
        )}
        <PreviewField label="Notes (optional)">
          <textarea className={cn(previewInputClass, "resize-y")} rows={2} aria-label="Notes" />
        </PreviewField>
        <button
          type="submit"
          disabled
          className="w-full mt-1 px-4 py-2.5 text-sm font-semibold rounded-lg bg-brand-blue text-white opacity-90 cursor-default"
        >
          Request appointment
        </button>
      </form>
    </div>
  );
}

const previewInputClass =
  "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors";

function PreviewField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
