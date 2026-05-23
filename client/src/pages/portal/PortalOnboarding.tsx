import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { ArrowLeft, Loader2, CheckCircle2, HelpCircle, X, RefreshCw, Settings2, AlertTriangle } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import type { PortalChatContext } from "@/components/portal/PortalChatWidget";
import { getFieldConfig } from "@/config/onboardingFields";
import { useOnboardingResponses } from "@/context/OnboardingContext";
import { useCopilotForm } from "@/context/CopilotFormContext";

interface Step {
  key: string;
  label: string;
  type: "text" | "checkbox" | "upload" | "form" | "select";
  required: boolean;
}

interface OnboardingData {
  id: number;
  client_service_id: number | null;
  status: string;
  service_name: string | null;
  service_id: string | null;
  steps: Step[];
  responses: Record<string, { value: any; completed_at?: string }>;
  submitted_at: string | null;
  approved_at: string | null;
}

/* ─── Help Modal ─── (exported for OnboardingForm.tsx re-use) */
export function HelpModal({ field, onClose }: { field: { label: string; example?: string; helperText?: string }; onClose: () => void }) {
  return (
    <div data-theme="light" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-gray-200 shadow-lg max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">{field.label}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        {field.helperText && <p className="text-sm text-gray-600 mb-2">{field.helperText}</p>}
        {field.example && (
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Example:</p>
            <p className="text-sm text-gray-700">{field.example}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function PortalOnboarding() {
  const [, params] = useRoute("/portal/onboarding/:id");
  const submissionId = params?.id;

  const queryClient = useQueryClient();
  const [responses, setResponses] = useState<Record<string, any>>({});
  const { setResponses: syncToContext } = useOnboardingResponses();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [helpField, setHelpField] = useState<{ label: string; example?: string; helperText?: string } | null>(null);

  const { data, isLoading, error, refetch } = useQuery<OnboardingData>({
    queryKey: ["/api/portal/onboarding", submissionId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/onboarding/${submissionId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load onboarding");
      return res.json();
    },
    enabled: !!submissionId,
  });

  // Reset local state when switching between onboarding submissions
  useEffect(() => {
    setResponses({});
    syncToContext({});
  }, [submissionId]);

  useEffect(() => {
    if (data?.responses) {
      const existing: Record<string, any> = {};
      for (const [key, val] of Object.entries(data.responses)) {
        existing[key] = val?.value ?? "";
      }
      setResponses(existing);
    }
  }, [data]);

  // Sync live form state to context so PortalChatWidget can read it
  useEffect(() => { syncToContext(responses); }, [responses]);
  // Clear context when leaving this page
  useEffect(() => () => { syncToContext({}); }, []);

  const [draftSaved, setDraftSaved] = useState(false);

  function formatResponses(): Record<string, { value: any; completed_at: string }> {
    const formatted: Record<string, { value: any; completed_at: string }> = {};
    for (const [key, value] of Object.entries(responses)) {
      if (value !== "" && value !== false) {
        formatted[key] = { value, completed_at: new Date().toISOString() };
      }
    }
    return formatted;
  }

  async function saveToServer(mode: "draft" | "submit", formatted: Record<string, { value: any; completed_at: string }>) {
    const res = await fetch(`/api/portal/onboarding/${submissionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ responses: formatted, mode }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Save failed");
    }
    return res.json();
  }

  const [, setLocation] = useLocation();

  const submitMutation = useMutation({
    mutationFn: (formatted: Record<string, { value: any; completed_at: string }>) => saveToServer("submit", formatted),
    onSuccess: (result: { next_url?: string | null } | undefined) => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/onboarding", submissionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/overview"] });
      /* Wave W-AZ-1 — ContentFlow quick-setup hands off to the deeper
       * /portal/content-preferences wizard. The server returns next_url
       * after mapping the four answers into the brand profile so the
       * customer doesn't repeat themselves. */
      if (result?.next_url) {
        setLocation(result.next_url);
      }
    },
  });

  const draftMutation = useMutation({
    mutationFn: (formatted: Record<string, { value: any; completed_at: string }>) => saveToServer("draft", formatted),
    onSuccess: () => {
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["/api/portal/onboarding", submissionId] });
    },
  });

  function handleSaveDraft() {
    draftMutation.mutate(formatResponses());
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;

    const missing = data.steps.filter(
      (s) => s.required && !responses[s.key] && responses[s.key] !== true
    );
    if (missing.length > 0) {
      setValidationError(`Please fill in: ${missing.map((s) => s.label).join(", ")}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setValidationError(null);
    submitMutation.mutate(formatResponses());
  }

  const isSubmitted = data?.status === "submitted" || data?.status === "approved" || data?.status === "needs_followup" || submitMutation.isSuccess;
  const isSaving = draftMutation.isPending || submitMutation.isPending;

  // Split steps into required and optional
  const requiredSteps = data?.steps.filter((s) => s.required) ?? [];
  const optionalSteps = data?.steps.filter((s) => !s.required) ?? [];

  // Phase 1b: register the onboarding form with the copilot form registry.
  // Q23: when the assistant proposes form fills and the customer clicks Apply,
  // onApply writes the proposed values into form state. Only updates keys that
  // exist in the current step list — the server already filters but
  // defence-in-depth.
  useCopilotForm({
    formLabel: data?.service_name ? `${data.service_name} setup` : "Onboarding",
    fields: data?.steps?.map((s) => ({ key: s.key, label: s.label, required: s.required })) ?? [],
    values: responses,
    onApply: (fills) => {
      if (!data) return;
      const allowedKeys = new Set(data.steps.map((s) => s.key));
      const patch: Record<string, any> = {};
      for (const f of fills) {
        if (!allowedKeys.has(f.field_key)) continue;
        patch[f.field_key] = f.value;
      }
      if (Object.keys(patch).length > 0) {
        setResponses((prev) => ({ ...prev, ...patch }));
      }
    },
    enabled: !!(data && !isSubmitted),
  });

  // Build onboarding context for the global chat widget — reduced to the
  // non-form-fill bits; fields/current_responses/onApplyFill moved to the hook.
  const chatContext: PortalChatContext | undefined =
    data && !isSubmitted
      ? {
          service_name: data.service_name ?? "service",
          service_id: data.service_id ?? undefined,
        }
      : undefined;

  return (
    <PortalLayout chatContext={chatContext}>
      <div data-theme="light" className="max-w-2xl mx-auto space-y-6 pb-20">
        <Link href="/portal/services" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Services
        </Link>

        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm flex items-center justify-between">
            <span>We couldn't load your setup form. Refresh the page — if it keeps failing, the link may have expired and we can send a new one.</span>
            <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              <RefreshCw className="w-3 h-3" /> Try again
            </button>
          </div>
        )}

        {data && isSubmitted && (
          <PortalSetupProgress
            clientServiceId={data.client_service_id}
            approvedAt={data.approved_at}
            onboardingStatus={data.status}
            serviceId={data.service_id}
          />
        )}

        {data && !isSubmitted && (
          <>
            {/* Header */}
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Let's set up your {data.service_name ?? "service"}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Takes 2–3 minutes. Fill in what you know — we'll handle the rest.
              </p>
            </div>

            {validationError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                {validationError}
              </div>
            )}
            {submitMutation.error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                {submitMutation.error.message}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Required fields */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-[2px]">
                {requiredSteps.map((step) => (
                  <FieldRow
                    key={step.key}
                    step={step}
                    value={responses[step.key]}
                    onChange={(v) => setResponses({ ...responses, [step.key]: v })}
                    onHelp={(info) => setHelpField(info)}
                  />
                ))}
              </div>

              {/* Optional fields */}
              {optionalSteps.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 px-1">
                    Optional — fill in if you have this info
                  </p>
                  <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-[2px]">
                    {optionalSteps.map((step) => (
                      <FieldRow
                        key={step.key}
                        step={step}
                        value={responses[step.key]}
                        onChange={(v) => setResponses({ ...responses, [step.key]: v })}
                        onHelp={(info) => setHelpField(info)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={isSaving}
                  className="px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
                >
                  {draftMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                    </span>
                  ) : (
                    "Save Draft"
                  )}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 px-4 py-3 text-sm font-medium text-white bg-[#0d3cfc] rounded-lg hover:bg-[#0b34d6] transition-colors disabled:opacity-60"
                >
                  {submitMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Setting up...
                    </span>
                  ) : (
                    "Finish Setup"
                  )}
                </button>
              </div>
              {/* Draft saved confirmation */}
              {draftSaved && (
                <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Draft saved. You can come back and finish later.
                </p>
              )}
              {draftMutation.error && (
                <p className="text-xs text-red-600 mt-2">{draftMutation.error.message}</p>
              )}
            </form>
          </>
        )}
      </div>

      {/* Help modal */}
      {helpField && <HelpModal field={helpField} onClose={() => setHelpField(null)} />}
    </PortalLayout>
  );
}

/* ─── Post-Submit Progress — generic 3-step flow with TradeLine polling ─── */
function PortalSetupProgress({
  clientServiceId,
  approvedAt,
  onboardingStatus,
  serviceId,
}: {
  clientServiceId: number | null;
  approvedAt: string | null;
  onboardingStatus?: string;
  serviceId?: string | null;
}) {
  const isTradeLine = !!serviceId && serviceId.startsWith("tradeline") && !!clientServiceId;

  const [tradelineStatus, setTradelineStatus] = useState<{
    assistantStatus: string;
    setupStage: string;
  }>({ assistantStatus: "not_built", setupStage: "not_started" });

  // Only poll for TradeLine services
  useEffect(() => {
    if (!isTradeLine) return;
    let active = true;
    async function poll() {
      try {
        const res = await fetch(`/api/portal/tradeline/${clientServiceId}`, { credentials: "include" });
        if (res.ok && active) {
          const data = await res.json();
          setTradelineStatus({
            assistantStatus: data.assistantStatus ?? data.config?.assistant?.status ?? "not_built",
            setupStage: data.setupStage ?? data.config?.setupStage ?? "not_started",
          });
        }
      } catch { /* ignore */ }
    }
    poll();
    const id = setInterval(poll, 2500);
    return () => { active = false; clearInterval(id); };
  }, [clientServiceId, isTradeLine]);

  // Determine current state from onboarding status
  const isApproved = onboardingStatus === "approved" || !!approvedAt;
  const needsFollowup = onboardingStatus === "needs_followup";

  // Build steps depending on whether this is TradeLine or a generic service
  const steps = isTradeLine ? [
    { label: "Configuration received", done: true },
    { label: "System being built", done: tradelineStatus.assistantStatus === "building" || tradelineStatus.assistantStatus === "built" },
    { label: "Connecting channels", done: tradelineStatus.assistantStatus === "built" },
    { label: "Ready", done: tradelineStatus.setupStage === "ready_for_testing" || tradelineStatus.setupStage === "live" },
  ] : [
    { label: "Submitted", done: true },
    { label: "Under Review", done: isApproved || needsFollowup },
    { label: "Active", done: isApproved },
  ];

  const allDone = steps.every(s => s.done);
  const failed = isTradeLine && tradelineStatus.assistantStatus === "failed";

  // Generic headline/message for non-TradeLine services
  const headline = failed
    ? "Something needs attention"
    : allDone
      ? "Your system is ready"
      : needsFollowup
        ? "We need a bit more info"
        : isTradeLine
          ? "Your system is being prepared"
          : "Setup information received";

  const subtitle = failed
    ? "We hit a snag while setting things up."
    : allDone
      ? "Everything is configured."
      : needsFollowup
        ? "Our team has reviewed your submission and needs some additional details. Check your email or contact us via Help."
        : isTradeLine
          ? "This usually takes about a minute."
          : "Our team typically reviews within 24 hours.";

  return (
    <div data-theme="light" className="bg-white rounded-xl border border-gray-200 p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-[#EEF3FF] flex items-center justify-center mx-auto mb-5">
        {failed ? (
          <AlertTriangle className="w-6 h-6 text-amber-500" />
        ) : needsFollowup ? (
          <AlertTriangle className="w-6 h-6 text-amber-500" />
        ) : (
          <Settings2 className={`w-6 h-6 text-[#0d3cfc] ${!allDone && isTradeLine ? "animate-spin" : ""}`} style={{ animationDuration: "3s" }} />
        )}
      </div>
      <h1 className="text-lg font-semibold text-gray-900">{headline}</h1>
      <p className="text-sm text-gray-500 mt-1.5 mb-6">{subtitle}</p>

      <div className="text-left space-y-3 max-w-xs mx-auto mb-6">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            {s.done ? (
              <CheckCircle2 className="w-4 h-4 text-[#0d3cfc] flex-shrink-0" />
            ) : failed ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            ) : isTradeLine ? (
              <Loader2 className="w-4 h-4 text-gray-300 animate-spin flex-shrink-0" />
            ) : (
              <div className="w-4 h-4 rounded-full border-2 border-gray-200 flex-shrink-0" />
            )}
            <span className={`text-sm ${s.done ? "text-gray-700" : failed ? "text-amber-600" : "text-gray-400"}`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {approvedAt && (
        <p className="text-xs text-emerald-600 mb-4">
          Approved on {new Date(approvedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      )}

      {failed && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-amber-700">
            Our team has been notified and will take care of this.
          </p>
        </div>
      )}

      {(allDone || failed || (!isTradeLine && !needsFollowup)) && (
        <Link href="/portal/services">
          <button className="px-4 py-2 text-sm font-medium text-[#0d3cfc] bg-[#EEF3FF] rounded-lg hover:bg-[#e0efe8] transition-colors">
            Back to Services
          </button>
        </Link>
      )}
    </div>
  );
}

/* ─── BD-2a-polish — Shared FieldRow primitives (input-rules compliant) ───
 *
 * Design-system rule (locked 2026-05-21):
 *   1. Title INSIDE the input field — floating label, not <label> above.
 *   2. Help cue (?) anchored TOP-LEFT of each FieldRow component.
 *   3. No duplicated titles — single label, lives in the field.
 *   4. Stacked input clusters use 2px vertical gap.
 *   5. Button-choice fields: pills flush at 1-2px gap, selected #0d3cfc.
 *
 * These helpers are defined here and re-exported so OnboardingForm.tsx (the
 * public-form sibling) can reuse them without a new shared file. */

/** Top-left anchored `?` cue that opens the existing HelpModal. */
export function FieldHelpCue({
  step, config, onHelp,
}: {
  step: { label: string };
  config: { example?: string; helperText?: string };
  onHelp: (info: { label: string; example?: string; helperText?: string }) => void;
}) {
  if (!config.example && !config.helperText) return null;
  return (
    <button
      type="button"
      onClick={() => onHelp({ label: step.label, example: config.example, helperText: config.helperText })}
      aria-label={`Help: ${step.label}`}
      className="absolute top-1 left-1 z-10 p-1 rounded-full text-gray-300 hover:text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#0d3cfc]/20"
    >
      <HelpCircle className="w-3.5 h-3.5" />
    </button>
  );
}

/** Floating-label text input. Placeholder is a single space so the floating
 *  label remains the only visible title — no duplicated <label> above. */
export function FloatingLabelInput({
  id, label, value, onChange, required, placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        aria-label={label}
        className="peer w-full px-3 pt-5 pb-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0d3cfc]/20 focus:border-[#0d3cfc] transition-colors"
      />
      <label
        htmlFor={id}
        className={
          "absolute left-3 pointer-events-none transition-all duration-150 " +
          "top-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 " +
          "peer-placeholder-shown:top-2.5 peer-placeholder-shown:text-sm " +
          "peer-placeholder-shown:font-normal peer-placeholder-shown:normal-case " +
          "peer-placeholder-shown:tracking-normal peer-placeholder-shown:text-gray-400 " +
          "peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-semibold " +
          "peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-[#0d3cfc]"
        }
      >
        {label}
        {required && <span className="text-red-400 ml-1 normal-case">*</span>}
        {!required && (
          <span className="text-gray-400 ml-1 normal-case font-normal tracking-normal">(optional)</span>
        )}
      </label>
      {/* Placeholder hint (config-driven). Only renders when the field is
          empty AND unfocused, so it never collides with the floating label. */}
      {placeholder && (
        <span
          aria-hidden="true"
          className="absolute right-3 top-2.5 text-[11px] text-gray-300 peer-focus:hidden peer-[:not(:placeholder-shown)]:hidden pointer-events-none"
        >
          {placeholder}
        </span>
      )}
    </div>
  );
}

/* ─── Field Row Component ─── */
function FieldRow({
  step,
  value,
  onChange,
  onHelp,
}: {
  step: Step;
  value: any;
  onChange: (v: any) => void;
  onHelp: (info: { label: string; example?: string; helperText?: string }) => void;
}) {
  const config = getFieldConfig(step.key);

  if (step.type === "checkbox") {
    // BC-1: render boolean fields as Yes/No two-button toggle for clickable feel.
    // Value is still a boolean — onChange receives true/false.
    const boolValue: boolean | null =
      value === true ? true : value === false ? false : null;
    return (
      <div className="relative pl-6">
        <FieldHelpCue step={step} config={config} onHelp={onHelp} />
        {/* Button-choice cluster — the choice list IS the question; per
            design-system rule 5, no separate label is rendered above. Question
            text moves into the help-cue popover when the choices aren't
            self-explanatory; for boolean it's "Yes / No" which IS. */}
        <div className="flex flex-wrap gap-1">
          {[
            { v: true, label: "Yes" },
            { v: false, label: "No" },
          ].map((opt) => {
            const selected = boolValue === opt.v;
            return (
              <button
                type="button"
                key={opt.label}
                onClick={() => onChange(opt.v)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors min-h-[40px] ${
                  selected
                    ? "bg-[#0d3cfc] text-white border-[#0d3cfc]"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                } focus:outline-none focus:ring-2 focus:ring-[#0d3cfc]/20`}
                aria-label={`${step.label}: ${opt.label}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (step.type === "select" && config.options) {
    return (
      <div className="relative pl-6">
        <FieldHelpCue step={step} config={config} onHelp={onHelp} />
        {/* BC-1: button-group (pill/chip) instead of native <select>.
            BD-2a-polish: flush 1px gap per design-system rule 5. */}
        <div className="flex flex-wrap gap-1">
          {config.options.map((opt) => {
            const selected = value === opt.value;
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={`px-3.5 py-2 text-sm rounded-lg border transition-colors min-h-[40px] ${
                  selected
                    ? "bg-[#0d3cfc] text-white border-[#0d3cfc]"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                } focus:outline-none focus:ring-2 focus:ring-[#0d3cfc]/20`}
                aria-label={`${step.label}: ${opt.label}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Default: text input — floating label, help cue top-left, no duplicate title.
  return (
    <div className="relative pl-6">
      <FieldHelpCue step={step} config={config} onHelp={onHelp} />
      <FloatingLabelInput
        id={`field-${step.key}`}
        label={step.label}
        value={value}
        onChange={onChange}
        required={step.required}
        placeholder={config.placeholder}
      />
    </div>
  );
}
