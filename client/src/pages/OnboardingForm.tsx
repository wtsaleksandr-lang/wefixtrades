import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

interface Step {
  key: string;
  label: string;
  type: "text" | "checkbox" | "upload" | "form";
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

export default function OnboardingForm() {
  const [, params] = useRoute("/onboarding/:token");
  const token = params?.token || "";

  const [data, setData] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
        // Pre-fill existing responses
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data || submitting) return;

    // Validate required fields
    const missing = data.steps.filter(
      (s) => s.required && !responses[s.key] && responses[s.key] !== true
    );
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.map((s) => s.label).join(", ")}`);
      return;
    }

    setError(null);
    setSubmitting(true);

    // Build responses with timestamps
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

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-300 animate-spin" />
      </div>
    );
  }

  // Error state (form not found)
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

  // Thank you state
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-[#2D6A4F] mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-gray-900">Thank you!</h1>
          <p className="text-sm text-gray-500 mt-2">
            Your onboarding information has been submitted. Our team will review it and get started on your {data.serviceName} setup.
          </p>
          <p className="text-xs text-gray-400 mt-4">You can close this page.</p>
        </Card>
      </div>
    );
  }

  // Form
  return (
    <div className="min-h-screen bg-[#F6F7F9] py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-[#1a1f1e] border border-[rgba(102,232,250,0.15)] flex items-center justify-center">
              <svg viewBox="0 0 22 22" width={14} height={14} fill="none">
                <path d="M8 3H4C3.4 3 3 3.4 3 4V8" stroke="#66E8FA" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 3H18C18.6 3 19 3.4 19 4V8" stroke="#66E8FA" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 19H4C3.4 19 3 18.6 3 18V14" stroke="#66E8FA" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 19H18C18.6 19 19 18.6 19 18V14" stroke="#66E8FA" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7.5 11.5L10 14L14.5 9" stroke="#66E8FA" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-sm font-bold text-gray-900">We<span className="text-[#2D6A4F]">Fix</span>Trades</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">{data.serviceName}</h1>
          <p className="text-sm text-gray-500 mt-1">Onboarding for {data.clientName}</p>
          <p className="text-xs text-gray-400 mt-1">Please fill in the details below so we can get started.</p>
        </div>

        {/* Error banner */}
        {error && (
          <Card className="p-3 border-red-200 bg-red-50">
            <p className="text-sm text-red-700">{error}</p>
          </Card>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <Card className="p-5 space-y-4">
            {data.steps.map((step) => (
              <div key={step.key}>
                {step.type === "checkbox" ? (
                  <label className="flex items-start gap-3 cursor-pointer min-h-[44px] py-1">
                    <input
                      type="checkbox"
                      checked={!!responses[step.key]}
                      onChange={(e) => setResponses({ ...responses, [step.key]: e.target.checked })}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#2D6A4F] focus:ring-[#2D6A4F]"
                    />
                    <span className="text-sm text-gray-700">
                      {step.label}
                      {step.required && <span className="text-red-400 ml-1">*</span>}
                    </span>
                  </label>
                ) : (
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      {step.label}
                      {step.required && <span className="text-red-400 ml-1">*</span>}
                    </label>
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

          <Button
            type="submit"
            disabled={submitting}
            className="w-full mt-4 bg-[#2D6A4F] hover:bg-[#1B4332] min-h-[44px]"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
              </span>
            ) : (
              "Submit"
            )}
          </Button>
        </form>

        <p className="text-[11px] text-gray-400 text-center">
          Powered by WeFixTrades
        </p>
      </div>
    </div>
  );
}
