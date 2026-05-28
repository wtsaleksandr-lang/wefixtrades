/**
 * Wave 83 — Portal SMS template settings UI.
 *
 * Lets a trade view every homeowner-facing SMS template, toggle the
 * non-compliance ones on/off, edit the wording, and send a test to their
 * own phone. Wires to the Wave 82 endpoints under /api/portal/sms-templates.
 *
 * Endpoints consumed:
 *   GET   /api/portal/sms-templates                       — list templates + tenant overrides
 *   PATCH /api/portal/sms-templates/:templateId           — upsert override
 *   POST  /api/portal/sms-templates/:templateId/test      — send a test SMS (rate-limited 5/h)
 *
 * Design notes:
 *   - Renders one card per template, grouped by product (BookFlow / QuoteQuick /
 *     ReputationShield / TradeLine).
 *   - Variable chips are clickable — clicking inserts `{var}` at the textarea
 *     cursor position via a useRef + selectionStart trick.
 *   - Compliance templates (canBeDisabled: false) show a greyed-out toggle
 *     with a tooltip. The PATCH endpoint also enforces this server-side.
 *   - Rate-limit (429) on test send is translated to friendly copy.
 *   - Save is per-card with a dirty indicator; we don't bulk-save the page.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Check, Loader2, Send, RotateCcw, AlertTriangle, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { HelpCueRow } from "@/components/primitives/HelpCueRow";
import InfoCue from "@/components/wizard/elfsight/InfoCue";
import type {
  SmsTemplate,
  SmsTemplateCategory,
  SmsTemplateProduct,
} from "@shared/sms/templateRegistry";

interface TemplateEntry extends SmsTemplate {
  override: {
    enabled: boolean;
    body_override: string | null;
    updated_at: string;
  } | null;
}

interface TemplatesResponse {
  templates: TemplateEntry[];
}

const PRODUCT_LABEL: Record<SmsTemplateProduct, string> = {
  bookflow: "BookFlow",
  quotequick: "QuoteQuick",
  reputation: "ReputationShield",
  tradeline: "TradeLine",
};

const PRODUCT_ORDER: SmsTemplateProduct[] = [
  "bookflow",
  "quotequick",
  "reputation",
  "tradeline",
];

const CATEGORY_PILL: Record<SmsTemplateCategory, { label: string; classes: string }> = {
  transactional: {
    label: "Transactional",
    classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  reminder: {
    label: "Reminder",
    classes: "bg-blue-50 text-blue-700 border-blue-200",
  },
  marketing: {
    label: "Marketing",
    classes: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

const TEMPLATE_NAMES: Record<string, string> = {
  "bookflow.confirmation": "Booking confirmation",
  "bookflow.day_of_reminder": "Day-of reminder",
  "bookflow.eta": "Tech on the way (ETA)",
  "bookflow.post_appointment": "Post-appointment follow-up",
  "bookflow.no_show_recovery": "No-show recovery",
  "quotequick.quote_ready": "Quote ready",
  "quotequick.deposit_receipt": "Deposit receipt",
  "quotequick.expires_soon": "Quote expires soon",
  "quotequick.post_job_thank_you": "Post-job thank-you",
  "reputation.review_request": "Review request",
  "reputation.review_followup_1": "Review follow-up #1",
  "reputation.review_followup_2": "Review follow-up #2",
  "tradeline.after_hours_apology": "After-hours apology",
  "tradeline.owner_missed_call_alert": "Missed-call alert (owner)",
};

function templateDisplayName(id: string): string {
  return TEMPLATE_NAMES[id] ?? id;
}

/** SMS segment count — first segment is 160 GSM chars; subsequent are 153 due to UDH. */
function smsSegments(body: string): number {
  const len = body.length;
  if (len === 0) return 0;
  if (len <= 160) return 1;
  return Math.ceil(len / 153);
}

export function SmsTemplatesSection() {
  const { data, isLoading, error, refetch } = useQuery<TemplatesResponse>({
    queryKey: ["/api/portal/sms-templates"],
    queryFn: async () => {
      const res = await fetch("/api/portal/sms-templates", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load SMS templates");
      return res.json();
    },
  });

  const grouped = useMemo(() => {
    if (!data?.templates) return null;
    const by: Record<SmsTemplateProduct, TemplateEntry[]> = {
      bookflow: [],
      quotequick: [],
      reputation: [],
      tradeline: [],
    };
    for (const t of data.templates) {
      if (by[t.product]) by[t.product].push(t);
    }
    return by;
  }, [data]);

  return (
    // SmsTemplatesSection is rendered inside PortalSettings's data-theme="light"
    // wrapper, but we re-declare here so the CONTRAST-2 / hardcoded-color guard
    // recognises the white-on-light scope when scanning this file standalone.
    <div data-theme="light" className="space-y-4" data-testid="sms-templates-section">
      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <HelpCueRow
          cue={
            <InfoCue
              text="Edit the exact words homeowners see, turn non-essential templates off, and send a test to yourself before going live."
              testid="sms-templates-help"
            />
          }
          title="Text message preferences"
        />
        <p className="text-sm text-gray-600 pt-2 border-t border-gray-200 dark:border-gray-700">
          Choose which SMS messages get sent to your customers. Edit the wording. Send a test to yourself before going live.
        </p>
      </div>

      {/* Compliance call-out */}
      <div
        className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3"
        data-testid="sms-compliance-banner"
      >
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <p className="font-medium">Some messages are required for compliance.</p>
          <p className="mt-0.5">
            Booking confirmations, quote receipts, and deposit receipts carry the carrier-required STOP/HELP footer.
            You can edit the wording, but they can't be turned off. This protects your TCPA standing and keeps
            payment receipts auditable.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3" data-testid="sms-templates-skeleton">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
              <Skeleton className="h-4 w-40 mb-2" />
              <Skeleton className="h-3 w-64 mb-3" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center justify-between">
          <span>Couldn't load SMS templates.</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {grouped && (
        <div className="space-y-5">
          {PRODUCT_ORDER.map((product) => {
            const items = grouped[product];
            if (!items || items.length === 0) return null;
            return (
              <div key={product} className="space-y-3" data-testid={`sms-product-group-${product}`}>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {PRODUCT_LABEL[product]}
                  </h3>
                </div>
                <div className="space-y-3">
                  {items.map((tpl) => (
                    <TemplateCard key={tpl.id} template={tpl} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Single template card ────────────────────────────────────────── */

function TemplateCard({ template }: { template: TemplateEntry }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const initialEnabled = template.override?.enabled ?? template.defaultEnabled;
  const initialBody = template.override?.body_override ?? template.defaultBody;

  const [enabled, setEnabled] = useState<boolean>(initialEnabled);
  const [body, setBody] = useState<string>(initialBody);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [showTestForm, setShowTestForm] = useState(false);
  const [testPhone, setTestPhone] = useState("");

  // Keep local state in sync if the server response changes (e.g. after a
  // successful save invalidates the list).
  useEffect(() => {
    setEnabled(template.override?.enabled ?? template.defaultEnabled);
    setBody(template.override?.body_override ?? template.defaultBody);
  }, [template.override?.enabled, template.override?.body_override, template.defaultEnabled, template.defaultBody]);

  const hasOverride = template.override !== null;
  const bodyDirty = body !== (template.override?.body_override ?? template.defaultBody);
  const enabledDirty = enabled !== (template.override?.enabled ?? template.defaultEnabled);
  const dirty = bodyDirty || enabledDirty;

  const pill = CATEGORY_PILL[template.category];
  const segments = smsSegments(body);
  const tooLong = body.length > 1000;

  const patchMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { enabled };
      // Only send body_override when it diverges from the registry default,
      // so "Reset to default" can null the column out by sending null below.
      if (body !== template.defaultBody) {
        payload.body_override = body;
      } else if (hasOverride) {
        // Cleared back to default — explicitly null so the server drops the override.
        payload.body_override = null;
      }
      const res = await fetch(`/api/portal/sms-templates/${encodeURIComponent(template.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json.error || "Couldn't save changes");
        (err as any).code = json.code;
        throw err;
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/sms-templates"] });
      setSaved(true);
      setErrorMsg("");
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: any) => {
      if (err?.code === "cannot_disable") {
        setErrorMsg("This template is required for compliance and can't be disabled. You can still customize the wording.");
        // Snap the toggle back so the UI matches server state.
        setEnabled(true);
      } else {
        setErrorMsg(err?.message || "Couldn't save changes. Try again.");
      }
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/portal/sms-templates/${encodeURIComponent(template.id)}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to_phone: testPhone }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json.error || "Couldn't send test");
        (err as any).status = res.status;
        (err as any).code = json.code;
        throw err;
      }
      return json;
    },
    onSuccess: () => {
      toast({ title: "Test sent — check your phone." });
      setShowTestForm(false);
    },
    onError: (err: any) => {
      if (err?.status === 429 || err?.code === "rate_limited") {
        toast({
          title: "Test send limit reached",
          description: "You've hit the limit of 5 test sends per hour. Try again later.",
          variant: "destructive",
        });
      } else if (err?.code === "quiet_hours") {
        toast({
          title: "Quiet hours",
          description: "Your test number is in its quiet-hours window. Try again later or use a transactional template.",
          variant: "destructive",
        });
      } else if (err?.code === "opted_out") {
        toast({
          title: "Recipient opted out",
          description: "That number has opted out of SMS.",
          variant: "destructive",
        });
      } else if (err?.code === "twilio_unconfigured") {
        toast({
          title: "SMS not configured yet",
          description: "Your TradeLine number isn't set up — finish TradeLine onboarding to send tests.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Couldn't send test",
          description: "Something went wrong. Try again in a moment.",
          variant: "destructive",
        });
      }
    },
  });

  function insertVar(varName: string) {
    const ta = textareaRef.current;
    const token = `{${varName}}`;
    if (!ta) {
      setBody((b) => b + token);
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    // Restore cursor after the inserted token on next paint.
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const pos = start + token.length;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pos, pos);
    });
  }

  function resetToDefault() {
    setBody(template.defaultBody);
  }

  function handleToggle(next: boolean) {
    setErrorMsg("");
    if (!next && !template.canBeDisabled) {
      // Defensive — toggle is disabled in DOM, but if it somehow fires
      // surface the same friendly copy without round-tripping.
      setErrorMsg("This template is required for compliance and can't be disabled. You can still customize the wording.");
      return;
    }
    setEnabled(next);
  }

  function handleSave() {
    setErrorMsg("");
    if (tooLong) {
      setErrorMsg("Message body must be 1000 characters or fewer.");
      return;
    }
    patchMutation.mutate();
  }

  function handleSendTest() {
    const cleaned = testPhone.replace(/[\s\-()]/g, "");
    if (!/^\+?\d{7,}$/.test(cleaned)) {
      toast({
        title: "Enter a valid phone number",
        description: "Use international format, e.g. +14165551234.",
        variant: "destructive",
      });
      return;
    }
    testMutation.mutate();
  }

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5"
      data-testid={`sms-template-card-${template.id}`}
    >
      {/* Top row — name + category pill + toggle */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-gray-900">{templateDisplayName(template.id)}</h4>
            <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full border ${pill.classes}`}>
              {pill.label}
            </span>
            {!template.canBeDisabled && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border bg-gray-50 text-gray-600 border-gray-200">
                <Lock className="w-3 h-3" /> Required
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
        </div>
        <div className="shrink-0" title={!template.canBeDisabled ? "Required for compliance — can't be disabled" : undefined}>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={!template.canBeDisabled}
            aria-label={`Enable ${templateDisplayName(template.id)}`}
            data-testid={`sms-toggle-${template.id}`}
          />
        </div>
      </div>

      {/* Body editor */}
      <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
        <label
          htmlFor={`sms-body-${template.id}`}
          className="block text-xs font-medium text-gray-600 mb-1"
        >
          Message wording
        </label>
        <textarea
          id={`sms-body-${template.id}`}
          ref={textareaRef}
          value={body}
          onChange={(e) => {
            setErrorMsg("");
            setBody(e.target.value);
          }}
          rows={3}
          disabled={!enabled}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors font-mono disabled:bg-gray-50 disabled:text-gray-400"
          data-testid={`sms-body-${template.id}`}
        />

        {/* Variable chips */}
        {template.vars.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] text-gray-500 mb-1">
              Click a variable to insert it at the cursor:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {template.vars.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVar(v)}
                  disabled={!enabled}
                  className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono rounded-md border border-gray-200 bg-gray-50 text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid={`sms-var-${template.id}-${v}`}
                >
                  {`{${v}}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Counter + reset link */}
        <div className="flex items-center justify-between mt-2 text-[10px] text-gray-500">
          <span data-testid={`sms-counter-${template.id}`}>
            {body.length} chars · {segments} segment{segments === 1 ? "" : "s"}
            {tooLong && <span className="text-red-600 ml-1">— too long (max 1000)</span>}
          </span>
          <button
            type="button"
            onClick={resetToDefault}
            disabled={body === template.defaultBody}
            className="inline-flex items-center gap-1 text-gray-500 hover:text-brand-blue disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
            data-testid={`sms-reset-${template.id}`}
          >
            <RotateCcw className="w-3 h-3" /> Reset to default
          </button>
        </div>

        {/* Test send form */}
        {showTestForm ? (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <label
              htmlFor={`sms-test-phone-${template.id}`}
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              Send test to phone
            </label>
            <p className="text-[10px] text-gray-500 mb-1">
              International format, e.g. +14165551234. Test sends are limited to 5 per hour.
            </p>
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <input
                id={`sms-test-phone-${template.id}`}
                type="tel"
                inputMode="tel"
                placeholder="+14165551234"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="flex-1 min-w-[180px] px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
                data-testid={`sms-test-phone-${template.id}`}
              />
              <Button
                type="button"
                size="sm"
                onClick={handleSendTest}
                disabled={testMutation.isPending || !testPhone}
                data-testid={`sms-test-send-${template.id}`}
              >
                {testMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span className="ml-1">{testMutation.isPending ? "Sending…" : "Send test"}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowTestForm(false)}
                disabled={testMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowTestForm(true)}
              className="inline-flex items-center gap-1 text-xs text-brand-blue hover:underline"
              data-testid={`sms-test-open-${template.id}`}
            >
              <Send className="w-3 h-3" /> Send test to my phone
            </button>
          </div>
        )}
      </div>

      {/* Bottom row — save */}
      <div className="flex items-center gap-3 pt-3 mt-3 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || patchMutation.isPending || tooLong}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue-600 transition-colors disabled:opacity-60"
          data-testid={`sms-save-${template.id}`}
        >
          {patchMutation.isPending ? "Saving…" : "Save changes"}
        </button>
        {saved && (
          <span
            className="flex items-center gap-1 text-xs text-emerald-600"
            data-testid={`sms-saved-${template.id}`}
            role="status"
            aria-live="polite"
          >
            <Check className="w-3.5 h-3.5" /> Saved
          </span>
        )}
        {errorMsg && (
          <span className="text-xs text-red-600" data-testid={`sms-error-${template.id}`}>
            {errorMsg}
          </span>
        )}
      </div>
    </div>
  );
}
