import { useState, useEffect, useCallback } from "react";
import { useRoute } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Loader2, AlertCircle, ArrowRight, Settings2, Zap, AlertTriangle } from "lucide-react";

interface Step {
  key: string;
  label: string;
  type: "text" | "checkbox" | "upload" | "form" | "select";
  required: boolean;
}

interface FormData {
  status: string;
  clientName: string;
  serviceName: string;
  steps: Step[];
  responses: Record<string, { value: any; completed_at?: string }>;
  submittedAt: string | null;
}

/* ─── Helper text for known onboarding field keys ─── */
const FIELD_HINTS: Record<string, string> = {
  trade_type: "e.g. Plumber, Electrician, HVAC, Roofer",
  service_area: "e.g. London, Greater Manchester, within 30 miles",
  top_services: "e.g. drain cleaning, panel upgrade, furnace repair",
  pricing_ranges: "e.g. £50–£200 for small jobs, £500+ for installs",
  business_hours: "e.g. Mon–Fri 8am–6pm, Sat 9am–1pm",
  primary_phone: "Your main business number",
  escalation_number: "For urgent or overflow calls",
  website_url: "e.g. https://yoursite.co.uk",
  website_access: "If yes, we'll install it for you. If not, we'll give you a hosted version — no problem.",
  install_mode: "Direct embed goes on your site. Hosted fallback is a page we create for you.",
  brand_colors: "e.g. #003366, or just describe: dark blue",
  ring_timeout: "Seconds before AI picks up (default 20)",
  callback_number: "If different from your main number",
};

/* ─── Step grouping: split fields into logical wizard pages ─── */
const STEP_GROUPS = [
  {
    title: "Business Info",
    keys: ["business_name", "trade_type", "service_area"],
  },
  {
    title: "Work Details",
    keys: ["top_services", "pricing_ranges", "business_hours"],
  },
  {
    title: "Contact & Setup",
    keys: [
      "primary_phone", "escalation_number", "callback_number",
      "forwarding_preference", "ring_timeout",
      "website_url", "website_access", "install_mode",
      "brand_colors", "lead_destination",
      "booking_enabled", "tone",
    ],
  },
];

function getStepGroup(step: Step): number {
  for (let i = 0; i < STEP_GROUPS.length; i++) {
    if (STEP_GROUPS[i].keys.includes(step.key)) return i;
  }
  return STEP_GROUPS.length - 1; // default to last group
}

/* ─── Post-submit progress — polls real backend status ─── */
function SetupProgress({ token }: { token: string }) {
  const [status, setStatus] = useState<{
    onboardingStatus: string;
    assistantStatus: string;
    setupStage: string;
    buildError: string | null;
  }>({ onboardingStatus: "submitted", assistantStatus: "not_built", setupStage: "not_started", buildError: null });

  const isTerminal = status.setupStage === "ready_for_testing"
    || status.setupStage === "live"
    || status.assistantStatus === "failed";

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/onboarding/${token}/status`);
      if (res.ok) setStatus(await res.json());
    } catch { /* ignore network blips */ }
  }, [token]);

  useEffect(() => {
    poll(); // immediate first fetch
    const id = setInterval(poll, 2500);
    return () => clearInterval(id);
  }, [poll]);

  // Stop polling once terminal
  useEffect(() => {
    if (isTerminal) return;
  }, [isTerminal]);

  const steps = [
    { label: "Configuration received", done: status.onboardingStatus === "submitted" || status.onboardingStatus === "approved" },
    { label: "System being built", done: status.assistantStatus === "building" || status.assistantStatus === "built" },
    { label: "Connecting channels", done: status.assistantStatus === "built" },
    { label: "Ready", done: status.setupStage === "ready_for_testing" || status.setupStage === "live" },
  ];

  const allDone = steps.every(s => s.done);
  const failed = status.assistantStatus === "failed";

  return (
    <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-[#EEF3FF] flex items-center justify-center mx-auto mb-5">
          {failed ? (
            <AlertTriangle className="w-6 h-6 text-amber-500" />
          ) : (
            <Settings2 className={`w-6 h-6 text-[#0d3cfc] ${!allDone ? "animate-spin" : ""}`} style={{ animationDuration: "3s" }} />
          )}
        </div>

        <h1 className="text-lg font-semibold text-gray-900">
          {failed ? "Something needs attention" : allDone ? "Your system is ready" : "Your system is being prepared"}
        </h1>
        <p className="text-sm text-gray-500 mt-1.5 mb-6">
          {failed ? "We hit a snag while setting things up." : allDone ? "Everything is configured." : "This usually takes about a minute."}
        </p>

        <div className="text-left space-y-3 mb-6">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              {s.done ? (
                <CheckCircle2 className="w-4 h-4 text-[#0d3cfc] flex-shrink-0" />
              ) : failed ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              ) : (
                <Loader2 className="w-4 h-4 text-gray-300 animate-spin flex-shrink-0" />
              )}
              <span className={`text-sm ${s.done ? "text-gray-700" : failed ? "text-amber-600" : "text-gray-400"}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {failed && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
            <p className="text-sm text-amber-700">
              Our team has been notified and will take care of this. You can close this page.
            </p>
          </div>
        )}

        {allDone && (
          <div className="bg-[#EEF3FF] rounded-lg p-3 mt-2">
            <p className="text-sm text-[#0d3cfc] font-medium flex items-center justify-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Setup complete — you can close this page
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function OnboardingForm() {
  const [, params] = useRoute("/onboarding/:token");
  const token = params?.token || "";

  const [data, setData] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Load form data
  useEffect(() => {
    if (!token) return;
    fetch(`/api/onboarding/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Form not found");
        return res.json();
      })
      .then((d: FormData) => {
        setData(d);
        const existing: Record<string, any> = {};
        if (d.responses) {
          for (const [key, val] of Object.entries(d.responses)) {
            existing[key] = (val as any)?.value ?? "";
          }
        }
        setResponses(existing);
        if (d.status === "submitted" || d.status === "approved") {
          setSubmitted(true);
        }
      })
      .catch(() => setError("This onboarding form was not found or has expired."))
      .finally(() => setLoading(false));
  }, [token]);

  // Group steps into wizard pages
  const groupedSteps = data
    ? STEP_GROUPS.map((group, idx) => ({
        ...group,
        fields: data.steps.filter((s) => getStepGroup(s) === idx),
      })).filter((g) => g.fields.length > 0)
    : [];

  const totalSteps = groupedSteps.length;
  const currentGroup = groupedSteps[currentStep];

  function validateCurrentStep(): boolean {
    if (!currentGroup) return true;
    const missing = currentGroup.fields.filter(
      (s) => s.required && !responses[s.key] && responses[s.key] !== true
    );
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.map((s) => s.label).join(", ")}`);
      return false;
    }
    setError(null);
    return true;
  }

  function goNext() {
    if (!validateCurrentStep()) return;
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function goBack() {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setError(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data || submitting) return;
    if (!validateCurrentStep()) return;

    setSubmitting(true);

    const formatted: Record<string, { value: any; completed_at: string }> = {};
    for (const [key, value] of Object.entries(responses)) {
      if (value !== "" && value !== false) {
        formatted[key] = { value, completed_at: new Date().toISOString() };
      }
    }

    try {
      const res = await fetch(`/api/onboarding/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses: formatted }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Submission failed");
      }
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-300 animate-spin" />
      </div>
    );
  }

  // Error (form not found)
  if (!data) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900">Form Not Found</h1>
          <p className="text-sm text-gray-500 mt-2">{error || "This link may be invalid or expired."}</p>
        </Card>
      </div>
    );
  }

  // Post-submit progress
  if (submitted) {
    return <SetupProgress token={token} />;
  }

  const isLastStep = currentStep === totalSteps - 1;

  // Multi-step form
  return (
    <div className="min-h-screen bg-[#F6F7F9] py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="text-center mb-2">
          <div className="flex items-center justify-center gap-2 mb-3">
            <svg viewBox="0 0 24 24" width={28} height={28} fill="none" aria-label="WeFixTrades">
              <path d="M12 7 H4 V20 H17 V12.5" stroke="#1E1E1E" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 13 11.5 16.5 21 5" stroke="#0d3cfc" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-sm font-bold text-gray-900">We<span className="text-[#0d3cfc]">Fix</span>Trades</span>
          </div>
          <p className="text-sm text-gray-500">
            We'll set everything up for you based on your answers.
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-3 px-1">
          <div className="flex-1 flex gap-1.5">
            {groupedSteps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= currentStep ? "bg-[#0d3cfc]" : "bg-gray-200"
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap">
            Step {currentStep + 1} of {totalSteps}
          </span>
        </div>

        {/* Step title */}
        <h2 className="text-lg font-semibold text-gray-900 px-1">
          {currentGroup?.title}
        </h2>

        {/* Error banner */}
        {error && (
          <Card className="p-3 border-red-200 bg-red-50">
            <p className="text-sm text-red-700">{error}</p>
          </Card>
        )}

        {/* Current step fields */}
        <form onSubmit={isLastStep ? handleSubmit : (e) => { e.preventDefault(); goNext(); }}>
          <Card className="p-5 space-y-5">
            {currentGroup?.fields.map((step) => (
              <div key={step.key}>
                {step.type === "checkbox" ? (
                  <label className="flex items-start gap-3 cursor-pointer min-h-[44px] py-1">
                    <input
                      type="checkbox"
                      checked={!!responses[step.key]}
                      onChange={(e) => setResponses({ ...responses, [step.key]: e.target.checked })}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#0d3cfc] focus:ring-[#0d3cfc]"
                    />
                    <div>
                      <span className="text-sm text-gray-700">
                        {step.label}
                        {step.required && <span className="text-red-400 ml-1">*</span>}
                      </span>
                      {FIELD_HINTS[step.key] && (
                        <p className="text-xs text-gray-400 mt-0.5">{FIELD_HINTS[step.key]}</p>
                      )}
                    </div>
                  </label>
                ) : (
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      {step.label}
                      {step.required && <span className="text-red-400 ml-1">*</span>}
                      {!step.required && <span className="text-gray-400 ml-1">(optional)</span>}
                    </label>
                    {FIELD_HINTS[step.key] && (
                      <p className="text-xs text-gray-400 mb-1.5">{FIELD_HINTS[step.key]}</p>
                    )}
                    <Input
                      value={responses[step.key] || ""}
                      onChange={(e) => setResponses({ ...responses, [step.key]: e.target.value })}
                      placeholder={step.required ? "Required" : "Optional"}
                    />
                  </div>
                )}
              </div>
            ))}
          </Card>

          {/* Navigation */}
          <div className="flex items-center gap-3 mt-4">
            {currentStep > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={goBack}
                className="min-h-[44px]"
              >
                Back
              </Button>
            )}
            {isLastStep ? (
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-[#0d3cfc] hover:bg-[#0b34d6] min-h-[44px]"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Setting up...
                  </span>
                ) : (
                  "Finish Setup"
                )}
              </Button>
            ) : (
              <Button
                type="submit"
                className="flex-1 bg-[#0d3cfc] hover:bg-[#0b34d6] min-h-[44px]"
              >
                Continue <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </form>

        <p className="text-[11px] text-gray-400 text-center">
          Powered by WeFixTrades
        </p>
      </div>
    </div>
  );
}
