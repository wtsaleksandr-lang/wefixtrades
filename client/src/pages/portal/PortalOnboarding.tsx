import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { ArrowLeft, Loader2, CheckCircle2, HelpCircle, X, MessageCircle, Send, RefreshCw, Settings2, Zap } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { getFieldConfig } from "@/config/onboardingFields";

interface Step {
  key: string;
  label: string;
  type: "text" | "checkbox" | "upload" | "form" | "select";
  required: boolean;
}

interface OnboardingData {
  id: number;
  status: string;
  service_name: string | null;
  service_id: string | null;
  steps: Step[];
  responses: Record<string, { value: any; completed_at?: string }>;
  submitted_at: string | null;
  approved_at: string | null;
}

/* ─── Help Modal ─── */
function HelpModal({ field, onClose }: { field: { label: string; example?: string; helperText?: string }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
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

/* ─── AI Chat Panel ─── */
function AiChatPanel({
  serviceName,
  serviceId,
  steps,
  responses,
  onClose,
}: {
  serviceName: string;
  serviceId: string;
  steps: Step[];
  responses: Record<string, any>;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: `Hi! I'm here to help you fill out the ${serviceName} setup form. Ask me anything about any of the fields, or I can suggest answers based on your business.` },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const updated = [...messages, { role: "user" as const, content: text }];
    setMessages(updated);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/portal/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: updated.map((m) => ({ role: m.role, content: m.content })),
          context: {
            service_name: serviceName,
            service_id: serviceId,
            fields: steps.map((s) => ({ key: s.key, label: s.label, required: s.required })),
            current_responses: responses,
          },
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply || "Sorry, I couldn't process that. Try again." }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-h-[480px] flex flex-col bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-[#2D6A4F]">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-white" />
          <span className="text-sm font-medium text-white">Setup Assistant</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/20 text-white"><X className="w-4 h-4" /></button>
      </div>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[340px]">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.role === "user" ? "bg-[#2D6A4F] text-white" : "bg-gray-100 text-gray-700"
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-3 py-2"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {/* Input */}
      <div className="border-t border-gray-100 p-2 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask about any field..."
          className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/20"
        />
        <button onClick={send} disabled={loading || !input.trim()} className="p-2 rounded-lg bg-[#2D6A4F] text-white hover:bg-[#1B4332] disabled:opacity-40">
          <Send className="w-4 h-4" />
        </button>
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
  const [validationError, setValidationError] = useState<string | null>(null);
  const [helpField, setHelpField] = useState<{ label: string; example?: string; helperText?: string } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<OnboardingData>({
    queryKey: ["/api/portal/onboarding", submissionId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/onboarding/${submissionId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load onboarding");
      return res.json();
    },
    enabled: !!submissionId,
  });

  useEffect(() => {
    if (data?.responses) {
      const existing: Record<string, any> = {};
      for (const [key, val] of Object.entries(data.responses)) {
        existing[key] = val?.value ?? "";
      }
      setResponses(existing);
    }
  }, [data]);

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

  const submitMutation = useMutation({
    mutationFn: (formatted: Record<string, { value: any; completed_at: string }>) => saveToServer("submit", formatted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/onboarding", submissionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/overview"] });
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

  const isSubmitted = data?.status === "submitted" || data?.status === "approved" || submitMutation.isSuccess;
  const isSaving = draftMutation.isPending || submitMutation.isPending;

  // Split steps into required and optional
  const requiredSteps = data?.steps.filter((s) => s.required) ?? [];
  const optionalSteps = data?.steps.filter((s) => !s.required) ?? [];

  return (
    <PortalLayout>
      <div className="max-w-2xl mx-auto space-y-6 pb-20">
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
            <span>Failed to load the setup form.</span>
            <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {data && isSubmitted && (
          <PortalSetupProgress
            serviceName={data.service_name ?? "service"}
            approvedAt={data.approved_at}
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
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
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
                  <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
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
                  className="flex-1 px-4 py-3 text-sm font-medium text-white bg-[#2D6A4F] rounded-lg hover:bg-[#1B4332] transition-colors disabled:opacity-60"
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

      {/* AI Chat FAB */}
      {data && !isSubmitted && !chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full bg-[#2D6A4F] text-white shadow-lg hover:bg-[#1B4332] flex items-center justify-center transition-colors"
          title="Need help? Ask our AI assistant"
        >
          <MessageCircle className="w-5 h-5" />
        </button>
      )}

      {/* AI Chat Panel */}
      {data && chatOpen && (
        <AiChatPanel
          serviceName={data.service_name ?? "service"}
          serviceId={data.service_id ?? ""}
          steps={data.steps}
          responses={responses}
          onClose={() => setChatOpen(false)}
        />
      )}
    </PortalLayout>
  );
}

/* ─── Post-Submit Progress ─── */
function PortalSetupProgress({ serviceName, approvedAt }: { serviceName: string; approvedAt: string | null }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 800),
      setTimeout(() => setStage(2), 2000),
      setTimeout(() => setStage(3), 3500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const steps = [
    { label: "Configuration received", done: stage >= 0 },
    { label: "System being built", done: stage >= 1 },
    { label: "Connecting channels", done: stage >= 2 },
    { label: "Finalizing", done: stage >= 3 },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-[#F0F7F4] flex items-center justify-center mx-auto mb-5">
        <Settings2 className={`w-6 h-6 text-[#2D6A4F] ${stage < 3 ? "animate-spin" : ""}`} style={{ animationDuration: "3s" }} />
      </div>
      <h1 className="text-lg font-semibold text-gray-900">Your system is being prepared</h1>
      <p className="text-sm text-gray-500 mt-1.5 mb-6">This takes about 1–2 minutes</p>

      <div className="text-left space-y-3 max-w-xs mx-auto mb-6">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            {s.done ? (
              <CheckCircle2 className="w-4 h-4 text-[#2D6A4F] flex-shrink-0" />
            ) : (
              <Loader2 className="w-4 h-4 text-gray-300 animate-spin flex-shrink-0" />
            )}
            <span className={`text-sm ${s.done ? "text-gray-700" : "text-gray-400"}`}>
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

      {stage >= 3 && (
        <>
          <div className="bg-[#F0F7F4] rounded-lg p-3 mb-4">
            <p className="text-sm text-[#2D6A4F] font-medium flex items-center justify-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Setup complete
            </p>
          </div>
          <Link href="/portal/services">
            <button className="px-4 py-2 text-sm font-medium text-[#2D6A4F] bg-[#F0F7F4] rounded-lg hover:bg-[#e0efe8] transition-colors">
              Back to Services
            </button>
          </Link>
        </>
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
    return (
      <label className="flex items-start gap-3 cursor-pointer min-h-[44px] py-1">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#2D6A4F] focus:ring-[#2D6A4F]"
        />
        <div className="flex-1">
          <span className="text-sm text-gray-700">
            {step.label}
            {step.required && <span className="text-red-400 ml-1">*</span>}
          </span>
          {config.helperText && <p className="text-xs text-gray-400 mt-0.5">{config.helperText}</p>}
        </div>
      </label>
    );
  }

  if (step.type === "select" && config.options) {
    return (
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <label className="text-xs font-medium text-gray-600">
            {step.label}
            {step.required && <span className="text-red-400 ml-1">*</span>}
          </label>
          {(config.example || config.helperText) && (
            <button
              type="button"
              onClick={() => onHelp({ label: step.label, example: config.example, helperText: config.helperText })}
              className="text-gray-300 hover:text-gray-500"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {config.helperText && <p className="text-xs text-gray-400 mb-1.5">{config.helperText}</p>}
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/20 focus:border-[#2D6A4F] transition-colors"
        >
          <option value="">Select...</option>
          {config.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  // Default: text input
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-xs font-medium text-gray-600">
          {step.label}
          {step.required && <span className="text-red-400 ml-1">*</span>}
          {!step.required && <span className="text-gray-400 ml-1">(optional)</span>}
        </label>
        {(config.example || config.helperText) && (
          <button
            type="button"
            onClick={() => onHelp({ label: step.label, example: config.example, helperText: config.helperText })}
            className="text-gray-300 hover:text-gray-500"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {config.helperText && <p className="text-xs text-gray-400 mb-1.5">{config.helperText}</p>}
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={config.placeholder || (step.required ? "Required" : "Optional")}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/20 focus:border-[#2D6A4F] transition-colors"
      />
    </div>
  );
}
