import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Copy,
  Check,
  Camera,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Upload,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  FieldGroupHeader,
  TitleInField,
  TitleInFieldTextarea,
  TitleInFieldSelect,
} from "./_shared";

/**
 * Photo-quote Intake — free-tools self-contained widget.
 *
 * A lead-capture form built for trades who quote off visuals: the homeowner
 * describes the job AND attaches photos, so the tradesperson can price it
 * without a site visit. The single most trades-specific, high-converting
 * form on the platform.
 *
 * Same client-side scaffold as SchemaGenerator / BeforeAfterSlider — a
 * config column + a live preview + a copy-paste embed snippet. No backend,
 * no hosted script, no account: everything the owner configures is baked
 * straight into a SELF-CONTAINED inline HTML/CSS snippet they paste.
 *
 * ── The no-backend photo problem (read this) ──────────────────────────────
 * Photos cannot be emailed without a server. `mailto:` cannot attach files,
 * and a static HTML page has no place to store an upload. The HONEST,
 * pragmatic v1 answer is a configurable FORM-ACTION URL: the owner pastes a
 * free form endpoint (Formspree / Getform / Basin — all accept multipart
 * file uploads on their free tiers and forward submissions to the owner's
 * inbox). The embed is then a real `<form method="post" enctype=
 * "multipart/form-data">` that posts the text fields AND the chosen photos
 * to that endpoint. The provider stores the images and emails the lead.
 *
 * If the owner sets a notification email but NO form-action URL, the embed
 * degrades to a `mailto:` link that sends the TEXT fields only, and the UI
 * states plainly that photos cannot ride along on a mailto — so we never
 * claim photos are delivered when they aren't.
 *
 * DS compliance: title-in-field + top-left help cue + 2px input-cluster
 * gaps + single .btn-primary-premium (Copy snippet) + theme tokens only
 * (no bare #fff/#000 literals; the embedded CSS uses neutral rgba tokens
 * that read on any host background, and the whole page sits in a
 * data-theme="light" scope).
 */

interface TradePreset {
  key: string;
  label: string;
  intro: string;
  jobLabel: string;
  jobTypes: string[];
  descHelp: string;
}

// Trade presets pre-fill sensible job-type options + helper copy. They never
// touch contact fields (those stay user-controlled).
const PRESETS: TradePreset[] = [
  {
    key: "roofer",
    label: "Roofer",
    intro: "Send a few photos of your roof and I'll get you a quote — no visit needed.",
    jobLabel: "Roof job",
    jobTypes: ["Leak / repair", "Full re-roof", "Flat roof", "Gutters / fascia", "Chimney / flashing", "Inspection"],
    descHelp: "Tell me the rough age of the roof, what's gone wrong, and which photos show it best.",
  },
  {
    key: "plumber",
    label: "Plumber",
    intro: "Snap the problem and a quick description and I'll quote the fix.",
    jobLabel: "Plumbing job",
    jobTypes: ["Leak / burst", "Blocked drain", "Boiler / heating", "Bathroom install", "Tap / toilet", "Other"],
    descHelp: "Where is it, how long has it been happening, and is the water currently off?",
  },
  {
    key: "electrician",
    label: "Electrician",
    intro: "Photos of the board / fitting plus a short note and I'll price it up.",
    jobLabel: "Electrical job",
    jobTypes: ["Fault / not working", "New socket / light", "Fuse board / consumer unit", "EV charger", "Rewire", "Inspection / EICR"],
    descHelp: "Describe the symptoms and add a clear photo of the consumer unit or fitting.",
  },
  {
    key: "cleaner",
    label: "Cleaner",
    intro: "Show me the space and I'll send a tailored cleaning quote.",
    jobLabel: "Cleaning job",
    jobTypes: ["One-off deep clean", "End of tenancy", "Regular / weekly", "After-builders", "Carpet / upholstery", "Windows"],
    descHelp: "Rough size (rooms / sq ft), how many bathrooms, and any problem areas to photograph.",
  },
  {
    key: "landscaper",
    label: "Landscaper",
    intro: "Photos of the garden and a quick brief — I'll quote without coming round first.",
    jobLabel: "Garden job",
    jobTypes: ["Lawn / turfing", "Patio / paving", "Fencing", "Decking", "Planting / borders", "Clearance / tidy-up"],
    descHelp: "Approximate area, current state, and what you'd like it to look like.",
  },
  {
    key: "hvac",
    label: "HVAC",
    intro: "Send photos of the unit and I'll quote the work.",
    jobLabel: "HVAC job",
    jobTypes: ["Not heating / cooling", "New install", "Service / maintenance", "Heat pump", "Ductwork", "Thermostat / controls"],
    descHelp: "Make / model if you can see it, the fault, and a photo of the unit and its location.",
  },
];

/* ─── HTML escaping for safe interpolation into the embed snippet. ───
   Escapes the characters that could break out of an HTML attribute or text
   node, plus backtick — defends against snippet breakage and injection when
   the owner pastes arbitrary titles / emails / endpoints. */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

interface BuildOpts {
  title: string;
  intro: string;
  email: string;
  actionUrl: string;
  jobLabel: string;
  jobTypes: string[];
  requireName: boolean;
  requirePhone: boolean;
  requireEmail: boolean;
}

/** Build the self-contained, no-backend embed snippet. */
function buildSnippet(opts: BuildOpts): string {
  const id = "wft-pq";
  const title = escapeHtml(opts.title.trim() || "Get a photo quote");
  const intro = escapeHtml(opts.intro.trim());
  const jobLabel = escapeHtml(opts.jobLabel.trim() || "Job type");
  const action = opts.actionUrl.trim();
  const email = opts.email.trim();
  const hasAction = /^https?:\/\//i.test(action);

  const req = (on: boolean) => (on ? " required" : "");
  const star = (on: boolean) => (on ? ' <span class="' + id + '__req">*</span>' : "");

  const jobOptions = opts.jobTypes
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `        <option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`)
    .join("\n");

  // Form open tag + the photo control differ by mode:
  //  - action URL set → real multipart POST (photos ride along, stored &
  //    emailed by the provider).
  //  - no action URL → mailto fallback that carries TEXT only; we say so.
  const formOpen = hasAction
    ? `<form class="${id}__form" action="${escapeHtml(action)}" method="post" enctype="multipart/form-data" data-mode="post">`
    : `<form class="${id}__form" data-mode="mailto" data-email="${escapeHtml(email)}" data-subject="${title}">`;

  const photoBlock = hasAction
    ? `      <label class="${id}__field ${id}__photos">
        <span class="${id}__label">Photos of the job${star(false)}</span>
        <input type="file" name="photos" accept="image/*" multiple />
        <span class="${id}__hint">Attach as many photos as you like — close-ups help most.</span>
      </label>`
    : `      <div class="${id}__field ${id}__photos ${id}__photos--note">
        <span class="${id}__label">Photos of the job</span>
        <p class="${id}__hint">This form isn't connected to a photo endpoint yet, so photos can't be attached here. Send your request below and we'll reply with an email address to send photos to.</p>
      </div>`;

  const notConfigured =
    !hasAction && !email
      ? `  <p class="${id}__warn">This form isn't connected yet. The owner needs to add a form endpoint or an email address.</p>\n`
      : "";

  // mailto fallback script — only emitted in mailto mode. Builds a prefilled
  // email from the TEXT fields; photos are intentionally excluded (mailto
  // cannot attach files) and the UI already says so.
  const mailtoScript = hasAction
    ? ""
    : `<script>
(function(){
  var f=document.currentScript.previousElementSibling;
  while(f&&!(f.classList&&f.classList.contains("${id}"))){f=f.previousElementSibling;}
  if(!f)return;
  var form=f.querySelector(".${id}__form");
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var to=form.getAttribute("data-email");
    if(!to){return;}
    var fd=new FormData(form),lines=[];
    fd.forEach(function(v,k){ if(typeof v==="string"&&v) lines.push(k+": "+v); });
    var subject=form.getAttribute("data-subject")||"Photo quote request";
    var href="mailto:"+encodeURIComponent(to)+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(lines.join("\\n"));
    window.location.href=href;
  });
})();
</script>
`;

  return `<!-- WeFixTrades Photo-quote Intake -->
<div class="${id}">
  <h3 class="${id}__title">${title}</h3>
${intro ? `  <p class="${id}__intro">${intro}</p>\n` : ""}${notConfigured}  ${formOpen}
      <label class="${id}__field">
        <span class="${id}__label">Your name${star(opts.requireName)}</span>
        <input type="text" name="name" autocomplete="name"${req(opts.requireName)} />
      </label>
      <label class="${id}__field">
        <span class="${id}__label">Phone${star(opts.requirePhone)}</span>
        <input type="tel" name="phone" autocomplete="tel"${req(opts.requirePhone)} />
      </label>
      <label class="${id}__field">
        <span class="${id}__label">Email${star(opts.requireEmail)}</span>
        <input type="email" name="email" autocomplete="email"${req(opts.requireEmail)} />
      </label>
      <label class="${id}__field">
        <span class="${id}__label">${jobLabel}</span>
        <select name="job_type">
          <option value="">Choose…</option>
${jobOptions}
        </select>
      </label>
      <label class="${id}__field">
        <span class="${id}__label">Describe the job</span>
        <textarea name="description" rows="4"></textarea>
      </label>
${photoBlock}
      <button type="submit" class="${id}__submit">Send my request</button>
  </form>
</div>
<style>
.${id}{max-width:520px;margin:0 auto;font-family:inherit;color:rgba(17,24,39,0.92);box-sizing:border-box}
.${id} *{box-sizing:border-box}
.${id}__title{margin:0 0 6px;font-size:20px;font-weight:700;line-height:1.3}
.${id}__intro{margin:0 0 16px;font-size:14px;line-height:1.5;color:rgba(55,65,81,0.9)}
.${id}__warn{margin:0 0 14px;padding:10px 12px;font-size:13px;border-radius:8px;background:rgba(245,158,11,0.12);color:rgba(146,64,14,1);border:1px solid rgba(245,158,11,0.35)}
.${id}__form{display:flex;flex-direction:column;gap:12px}
.${id}__field{display:flex;flex-direction:column;gap:4px}
.${id}__label{font-size:12px;font-weight:600;letter-spacing:.02em;color:rgba(55,65,81,0.95)}
.${id}__req{color:rgba(220,38,38,0.9)}
.${id}__hint{font-size:12px;line-height:1.4;color:rgba(107,114,128,0.95)}
.${id} input,.${id} select,.${id} textarea{width:100%;padding:10px 12px;font:inherit;font-size:14px;line-height:1.4;border:1px solid rgba(209,213,219,1);border-radius:8px;background:rgba(255,255,255,1);color:inherit}
.${id} input[type=file]{padding:8px 12px}
.${id} textarea{resize:vertical;min-height:88px}
.${id} input:focus,.${id} select:focus,.${id} textarea:focus{outline:none;border-color:rgba(37,99,235,0.9);box-shadow:0 0 0 3px rgba(37,99,235,0.18)}
.${id}__photos--note{gap:6px;padding:12px;border:1px dashed rgba(209,213,219,1);border-radius:8px;background:rgba(249,250,251,1)}
.${id}__submit{margin-top:4px;padding:12px 16px;font:inherit;font-size:15px;font-weight:600;color:rgba(255,255,255,1);background:rgba(37,99,235,1);border:0;border-radius:8px;cursor:pointer}
.${id}__submit:hover{background:rgba(29,78,216,1)}
.${id}__submit:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(37,99,235,0.45)}
@media (max-width:420px){.${id}__title{font-size:18px}}
</style>
${mailtoScript}<!-- /WeFixTrades Photo-quote Intake -->`;
}

export default function PhotoQuoteIntake() {
  usePageTitle("Photo-quote Intake Form");
  const { toast } = useToast();

  const [trade, setTrade] = useState<string>("roofer");
  const preset = PRESETS.find((p) => p.key === trade) ?? PRESETS[0];

  const [title, setTitle] = useState("Get a free photo quote");
  const [intro, setIntro] = useState(PRESETS[0].intro);
  const [email, setEmail] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [jobLabel, setJobLabel] = useState(PRESETS[0].jobLabel);
  const [jobTypesText, setJobTypesText] = useState(PRESETS[0].jobTypes.join("\n"));
  const [requireName, setRequireName] = useState(true);
  const [requirePhone, setRequirePhone] = useState(true);
  const [requireEmail, setRequireEmail] = useState(true);

  const [copied, setCopied] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  const jobTypes = useMemo(
    () => jobTypesText.split("\n").map((t) => t.trim()).filter(Boolean),
    [jobTypesText],
  );

  const hasAction = /^https?:\/\//i.test(actionUrl.trim());
  const connected = hasAction || !!email.trim();

  const snippet = useMemo(
    () =>
      buildSnippet({
        title,
        intro,
        email,
        actionUrl,
        jobLabel,
        jobTypes,
        requireName,
        requirePhone,
        requireEmail,
      }),
    [title, intro, email, actionUrl, jobLabel, jobTypes, requireName, requirePhone, requireEmail],
  );

  useCopilotForm({
    formLabel: "Photo-quote Intake Form",
    fields: [
      { key: "title", label: "Form title", required: false },
      { key: "intro", label: "Intro line", required: false },
      { key: "email", label: "Notification email", required: false },
      { key: "actionUrl", label: "Form endpoint URL", required: false },
      { key: "jobLabel", label: "Job-type field label", required: false },
    ],
    values: { title, intro, email, actionUrl, jobLabel },
    onApply: (fills) => {
      for (const f of fills) {
        const v = String(f.value ?? "");
        if (f.field_key === "title") setTitle(v);
        else if (f.field_key === "intro") setIntro(v);
        else if (f.field_key === "email") setEmail(v);
        else if (f.field_key === "actionUrl") setActionUrl(v);
        else if (f.field_key === "jobLabel") setJobLabel(v);
      }
    },
    enabled: true,
  });

  const applyPreset = (p: TradePreset) => {
    setTrade(p.key);
    setIntro(p.intro);
    setJobLabel(p.jobLabel);
    setJobTypesText(p.jobTypes.join("\n"));
  };

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
          <span>Photo-quote Intake</span>
        </span>
      }
    >
      <div data-theme="light" className="qq-paper-surface space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <Camera className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h2 className="text-2xl font-bold text-gray-900">Photo-quote Intake</h2>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            A lead-capture form built for trades who quote off visuals. The
            homeowner describes the job and attaches photos, so you can price it
            without a site visit. The embed is fully self-contained — paste it
            once and submissions go straight to your form endpoint or inbox. No
            script to host, no account to load.
          </p>
        </header>

        {!connected && (
          <div
            className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900"
            data-testid="pq-not-connected-banner"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-medium">Connect a destination to receive leads</p>
              <p className="text-xs mt-0.5">
                Paste a free form endpoint (Formspree, Getform, Basin) to receive
                the job details <strong>and photos</strong>, or add an email for a
                text-only fallback. Without a backend, photos can only be
                delivered through a form endpoint — a plain email link can't carry
                attachments.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration column */}
          <div className="lg:col-span-1 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Trade preset"
                  help="Pick your trade to pre-fill sensible job-type options and helper copy. You can edit everything below afterwards."
                />
                <div className="flex flex-wrap gap-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => applyPreset(p)}
                      aria-pressed={trade === p.key}
                      className={
                        trade === p.key
                          ? "px-2.5 py-1 text-xs font-medium rounded-full border border-brand-blue text-brand-blue bg-brand-blue/5"
                          : "px-2.5 py-1 text-xs font-medium rounded-full border border-gray-200 text-gray-700 hover:border-brand-blue hover:text-brand-blue transition-colors"
                      }
                      data-testid={`pq-preset-${p.key}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Headline & intro"
                  help="The title and one-line intro shown above the form to the homeowner."
                />
                <div className="space-y-0.5">
                  <TitleInField
                    id="pq-title"
                    label="Form title"
                    value={title}
                    onChange={setTitle}
                    placeholder="Get a free photo quote"
                    maxLength={80}
                    testid="pq-title"
                  />
                  <TitleInFieldTextarea
                    id="pq-intro"
                    label="Intro line"
                    value={intro}
                    onChange={setIntro}
                    placeholder="Send a few photos and I'll quote without a visit."
                    rows={2}
                    help="A short sentence that tells the customer what to do."
                    testid="pq-intro"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Where leads go"
                  help="A form endpoint accepts photos AND text and forwards them to your inbox. An email alone is a text-only fallback (no photos — a mailto link can't attach files)."
                />
                <div className="space-y-0.5">
                  <TitleInField
                    id="pq-action"
                    label="Form endpoint URL"
                    value={actionUrl}
                    onChange={setActionUrl}
                    placeholder="https://formspree.io/f/xxxx"
                    type="url"
                    help="Paste a free Formspree / Getform / Basin endpoint. These accept file uploads, so photos are delivered. Recommended."
                    testid="pq-action"
                  />
                  <TitleInField
                    id="pq-email"
                    label="Notification email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@yourbusiness.com"
                    type="email"
                    help="Used only if no endpoint is set. The form then opens a prefilled email with the TEXT details — photos can't be attached via email link."
                    testid="pq-email"
                  />
                </div>
                <div
                  className={
                    hasAction
                      ? "flex items-start gap-2 text-xs rounded-md p-2 border border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "flex items-start gap-2 text-xs rounded-md p-2 border border-amber-200 bg-amber-50 text-amber-900"
                  }
                  data-testid="pq-photo-status"
                >
                  <Upload className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    {hasAction
                      ? "Endpoint set — photos upload with the form and are delivered to you."
                      : "No endpoint — the form sends text only via email. Add an endpoint to receive photos."}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Contact fields"
                  help="Choose which contact details are required. All are shown on the form; toggling makes them optional."
                />
                <div className="space-y-1.5">
                  {(
                    [
                      ["Name", requireName, setRequireName] as const,
                      ["Phone", requirePhone, setRequirePhone] as const,
                      ["Email", requireEmail, setRequireEmail] as const,
                    ]
                  ).map(([label, val, set]) => (
                    <label key={label} className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={val}
                        onChange={(e) => set(e.target.checked)}
                        className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/20"
                        data-testid={`pq-require-${label.toLowerCase()}`}
                      />
                      Require {label}
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Job fields"
                  help="The label for the job-type dropdown and its options (one per line). The description box and photo upload are always included."
                />
                <div className="space-y-0.5">
                  <TitleInField
                    id="pq-job-label"
                    label="Job-type field label"
                    value={jobLabel}
                    onChange={setJobLabel}
                    placeholder="Job type"
                    maxLength={40}
                    testid="pq-job-label"
                  />
                  <TitleInFieldTextarea
                    id="pq-job-types"
                    label="Job-type options"
                    value={jobTypesText}
                    onChange={setJobTypesText}
                    placeholder={"Leak / repair\nFull re-roof\nInspection"}
                    rows={5}
                    help="One option per line. Shown as a dropdown the customer picks from."
                    testid="pq-job-types"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview + snippet */}
          <div className="lg:col-span-2 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Live preview"
                  help="Exactly what the homeowner sees. The photo control appears when a form endpoint is set; otherwise the form falls back to a text-only email and says so."
                />
                <FormPreview
                  title={title}
                  intro={intro}
                  jobLabel={jobLabel}
                  jobTypes={jobTypes}
                  requireName={requireName}
                  requirePhone={requirePhone}
                  requireEmail={requireEmail}
                  hasAction={hasAction}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Embed snippet"
                  help="Self-contained HTML — paste it once wherever you want the form. No external script, no account; your settings are baked in."
                  right={
                    /* DS rule 4 — single .btn-primary-premium per page. */
                    <Button
                      type="button"
                      onClick={handleCopy}
                      className="btn-primary-premium"
                      data-testid="pq-copy-snippet"
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
                  data-testid="pq-snippet"
                >
                  <code>{snippet}</code>
                </pre>
                <p className="text-xs text-gray-500">
                  Honest about photos: with no backend, images can only be
                  delivered through a form endpoint (Formspree / Getform / Basin —
                  free tiers accept uploads). Set one above and the embed posts the
                  photos to it. Without one, the form emails the text details only
                  and tells the customer photos can't be attached.
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
                      <strong>Get a free endpoint:</strong> sign up at Formspree,
                      Getform, or Basin, create a form, and copy its endpoint URL
                      into "Form endpoint URL" above. It will email you each lead
                      with the photos attached.
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

/* ─── Live in-portal preview — mirrors the embedded form. Inert (no submit);
   shows the photo control only when an endpoint is configured. ─── */
function FormPreview({
  title,
  intro,
  jobLabel,
  jobTypes,
  requireName,
  requirePhone,
  requireEmail,
  hasAction,
}: {
  title: string;
  intro: string;
  jobLabel: string;
  jobTypes: string[];
  requireName: boolean;
  requirePhone: boolean;
  requireEmail: boolean;
  hasAction: boolean;
}) {
  const reqMark = (on: boolean) =>
    on ? <span className="text-red-500 ml-0.5">*</span> : null;

  const fieldLabel = "text-xs font-semibold text-gray-700";
  const fieldInput =
    "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue";

  return (
    <div
      className="mx-auto max-w-[520px] rounded-xl border border-gray-200 bg-slate-50 p-5"
      data-testid="pq-preview"
    >
      <h3 className="text-lg font-bold text-gray-900 mb-1">
        {title.trim() || "Get a photo quote"}
      </h3>
      {intro.trim() && <p className="text-sm text-gray-600 mb-4">{intro.trim()}</p>}
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Your name{reqMark(requireName)}</span>
          <input type="text" className={fieldInput} disabled />
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Phone{reqMark(requirePhone)}</span>
          <input type="tel" className={fieldInput} disabled />
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Email{reqMark(requireEmail)}</span>
          <input type="email" className={fieldInput} disabled />
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>{jobLabel.trim() || "Job type"}</span>
          <select className={fieldInput} disabled>
            <option>Choose…</option>
            {jobTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Describe the job</span>
          <textarea className={fieldInput} rows={3} disabled />
        </label>
        {hasAction ? (
          <label className="flex flex-col gap-1">
            <span className={fieldLabel}>Photos of the job</span>
            <div className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-500">
              <Upload className="w-4 h-4 text-gray-400" aria-hidden="true" />
              Attach photos (multiple)
            </div>
            <span className="text-xs text-gray-500">Close-ups help most.</span>
          </label>
        ) : (
          <div className="flex flex-col gap-1">
            <span className={fieldLabel}>Photos of the job</span>
            <div className="px-3 py-2.5 text-xs text-gray-600 border border-dashed border-gray-300 rounded-lg bg-gray-50">
              Not connected to a photo endpoint yet — add a form endpoint URL so
              customers can attach photos. (A plain email link can't carry
              attachments.)
            </div>
          </div>
        )}
        <button
          type="button"
          disabled
          className="mt-1 px-4 py-2.5 text-sm font-semibold rounded-lg text-white bg-brand-blue opacity-90 cursor-default"
        >
          Send my request
        </button>
      </div>
    </div>
  );
}
