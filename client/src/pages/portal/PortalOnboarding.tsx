import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";

interface Step {
  key: string;
  label: string;
  type: "text" | "checkbox" | "upload" | "form";
  required: boolean;
}

interface OnboardingData {
  id: number;
  status: string;
  service_name: string | null;
  steps: Step[];
  responses: Record<string, { value: any; completed_at?: string }>;
  submitted_at: string | null;
  approved_at: string | null;
}

export default function PortalOnboarding() {
  const [, params] = useRoute("/portal/onboarding/:id");
  const submissionId = params?.id;

  const queryClient = useQueryClient();
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<OnboardingData>({
    queryKey: ["/api/portal/onboarding", submissionId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/onboarding/${submissionId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load onboarding");
      return res.json();
    },
    enabled: !!submissionId,
  });

  // Pre-fill responses from existing data
  useEffect(() => {
    if (data?.responses) {
      const existing: Record<string, any> = {};
      for (const [key, val] of Object.entries(data.responses)) {
        existing[key] = val?.value ?? "";
      }
      setResponses(existing);
    }
  }, [data]);

  const submitMutation = useMutation({
    mutationFn: async (formatted: Record<string, { value: any; completed_at: string }>) => {
      const res = await fetch(`/api/portal/onboarding/${submissionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ responses: formatted }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Submission failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/onboarding", submissionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/overview"] });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;

    // Validate required
    const missing = data.steps.filter(
      (s) => s.required && !responses[s.key] && responses[s.key] !== true
    );
    if (missing.length > 0) {
      setValidationError(`Please fill in: ${missing.map((s) => s.label).join(", ")}`);
      return;
    }

    setValidationError(null);

    // Build responses with timestamps
    const formatted: Record<string, { value: any; completed_at: string }> = {};
    for (const [key, value] of Object.entries(responses)) {
      if (value !== "" && value !== false) {
        formatted[key] = { value, completed_at: new Date().toISOString() };
      }
    }

    submitMutation.mutate(formatted);
  }

  const isSubmitted = data?.status === "submitted" || data?.status === "approved" || submitMutation.isSuccess;

  return (
    <PortalLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back link */}
        <Link href="/portal/services" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Services
        </Link>

        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm">
            Failed to load onboarding form. Please try again.
          </div>
        )}

        {data && isSubmitted && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-[#2D6A4F] mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-gray-900">Onboarding Submitted</h1>
            <p className="text-sm text-gray-500 mt-2">
              Your information for <span className="font-medium">{data.service_name}</span> has been submitted.
              Our team will review it and get started.
            </p>
            {data.approved_at && (
              <p className="text-xs text-emerald-600 mt-3">
                Approved on {new Date(data.approved_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            )}
            <Link href="/portal/services">
              <button className="mt-6 px-4 py-2 text-sm font-medium text-[#2D6A4F] bg-[#F0F7F4] rounded-lg hover:bg-[#e0efe8] transition-colors">
                Back to Services
              </button>
            </Link>
          </div>
        )}

        {data && !isSubmitted && (
          <>
            {/* Header */}
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {data.service_name ?? "Service"} Onboarding
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Please fill in the details below so we can get started on your setup.
              </p>
            </div>

            {/* Validation error */}
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

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
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
                          {!step.required && <span className="text-gray-400 ml-1">(optional)</span>}
                        </label>
                        <input
                          value={responses[step.key] || ""}
                          onChange={(e) => setResponses({ ...responses, [step.key]: e.target.value })}
                          placeholder={step.required ? "Required" : "Optional"}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/20 focus:border-[#2D6A4F] transition-colors"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="submit"
                disabled={submitMutation.isPending}
                className="w-full mt-4 px-4 py-3 text-sm font-medium text-white bg-[#2D6A4F] rounded-lg hover:bg-[#1B4332] transition-colors disabled:opacity-60"
              >
                {submitMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                  </span>
                ) : (
                  "Submit Onboarding"
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
