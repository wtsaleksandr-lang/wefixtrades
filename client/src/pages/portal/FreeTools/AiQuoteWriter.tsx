import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  PencilLine,
  FileText,
  Mail,
  Copy,
  Check,
  Sparkles,
  AlertCircle,
  Loader2,
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
 * AI Quote Writer — interactive Free Tool.
 *
 * Turns rough job notes / line items into a polished, customer-facing quote
 * scope description AND a ready-to-send estimate email, via the existing
 * QuoteQuick AI service (budget-capped, multi-provider shared Anthropic
 * client). Like AI Review Responder this is input → AI output: nothing is
 * sent for the owner — they copy (and can tweak inline first).
 *
 * DS compliance: title-in-field + top-left help cue + 2px input-cluster gaps
 * + single .btn-primary-premium (Generate). Theme-locked light.
 */

interface SettingsData {
  business_name: string;
  trade_type: string | null;
}

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "premium", label: "Premium" },
] as const;

interface OutputDraft {
  /** The original AI text — kept so we could show an "edited" marker later. */
  original: string;
  /** The user-editable working copy. */
  text: string;
}

interface ErrorState {
  title: string;
  message: string;
}

export default function AiQuoteWriter() {
  usePageTitle("AI Quote Writer");
  const { toast } = useToast();

  const { data: profile } = useQuery<SettingsData>({
    queryKey: ["/api/portal/settings"],
    queryFn: async () => {
      const res = await fetch("/api/portal/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });

  const [jobDetails, setJobDetails] = useState("");
  const [lineItems, setLineItems] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [tone, setTone] = useState<string>("professional");
  const [produce, setProduce] = useState<string>("both");

  const [description, setDescription] = useState<OutputDraft | null>(null);
  const [email, setEmail] = useState<OutputDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [copied, setCopied] = useState<"description" | "email" | null>(null);

  const wantDescription = produce === "both" || produce === "description";
  const wantEmail = produce === "both" || produce === "email";

  // Wire Copilot form-fill — the assistant can pre-fill the softer fields.
  // The job details stay user-driven (the specific job being quoted).
  useCopilotForm({
    formLabel: "AI Quote Writer",
    fields: [
      { key: "jobDetails", label: "What the job involves", required: true },
      { key: "lineItems", label: "Rough line items", required: false },
      { key: "customerName", label: "Customer name", required: false },
      { key: "tone", label: "Tone (professional / friendly / premium)", required: false },
    ],
    values: { jobDetails, lineItems, customerName, tone },
    onApply: (fills) => {
      for (const f of fills) {
        const v = String(f.value ?? "");
        switch (f.field_key) {
          case "jobDetails":
            setJobDetails(v);
            break;
          case "lineItems":
            setLineItems(v);
            break;
          case "customerName":
            setCustomerName(v);
            break;
          case "tone": {
            const norm = v.toLowerCase();
            const match = TONES.find((t) => norm.includes(t.value));
            if (match) setTone(match.value);
            break;
          }
        }
      }
    },
    enabled: true,
  });

  const canGenerate =
    jobDetails.trim().length > 0 && (wantDescription || wantEmail) && !loading;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    setDescription(null);
    setEmail(null);
    setCopied(null);
    try {
      const res = await fetch("/api/portal/free-tools/quote-writer", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDetails: jobDetails.trim(),
          lineItems: lineItems.trim(),
          customerName: customerName.trim(),
          trade: profile?.trade_type ?? "",
          tone,
          wantDescription,
          wantEmail,
        }),
      });

      if (!res.ok) {
        let payload: any = null;
        try {
          payload = await res.json();
        } catch {
          /* non-JSON error body */
        }
        if (res.status === 403 && payload?.error === "budget_exceeded") {
          setError({
            title: "AI limit reached",
            message:
              "You've hit your AI usage limit for now. It resets daily — please try again later.",
          });
        } else if (res.status === 429) {
          setError({
            title: "Too many requests",
            message: "Please wait a moment and try again.",
          });
        } else if (res.status === 503) {
          setError({
            title: "AI temporarily unavailable",
            message: "The AI service isn't reachable right now. Please try again shortly.",
          });
        } else if (res.status === 401) {
          setError({
            title: "Session expired",
            message: "Please sign in again to use this tool.",
          });
        } else {
          setError({
            title: "Couldn't generate your quote",
            message:
              payload?.message ||
              "Something went wrong drafting your quote. Please try again.",
          });
        }
        return;
      }

      const data = await res.json();
      const desc: string = typeof data?.description === "string" ? data.description : "";
      const mail: string = typeof data?.email === "string" ? data.email : "";
      if ((wantDescription && !desc) && (wantEmail && !mail)) {
        setError({
          title: "Nothing returned",
          message: "The AI couldn't draft your quote. Add more detail and try again.",
        });
        return;
      }
      if (wantDescription && desc) setDescription({ original: desc, text: desc });
      if (wantEmail && mail) setEmail({ original: mail, text: mail });
    } catch {
      setError({
        title: "Network error",
        message: "Couldn't reach the server. Check your connection and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (which: "description" | "email") => {
    const draft = which === "description" ? description : email;
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.text);
      setCopied(which);
      toast({
        title: "Copied",
        description:
          which === "description"
            ? "Quote description copied to clipboard."
            : "Estimate email copied to clipboard.",
      });
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the text and copy manually.",
        variant: "destructive",
      });
    }
  };

  const hasOutput = !!description || !!email;

  return (
    <PortalLayout
      breadcrumb={
        <span className="flex items-center gap-1.5">
          <Link href="/portal/free-tools" className="hover:text-brand-blue">
            Free Tools
          </Link>
          <span className="text-gray-400">/</span>
          <span>AI Quote Writer</span>
        </span>
      }
    >
      <div data-theme="light" className="qq-paper-surface space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <PencilLine className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h2 className="text-2xl font-bold text-gray-900">AI Quote Writer</h2>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            Turn rough notes or a few line items into a polished, persuasive quote
            your customer will love. Get a clean customer-facing scope description
            and a ready-to-send estimate email in seconds. Tweak anything, then copy
            it straight into your quote or inbox.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Input column */}
          <div className="lg:col-span-1 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="The job"
                  help="Describe what the work involves in plain words — and optionally list a few rough line items. The AI never invents prices it isn't given."
                />
                <div className="space-y-0.5">
                  <TitleInFieldTextarea
                    id="qw-job"
                    label="What the job involves"
                    value={jobDetails}
                    onChange={setJobDetails}
                    required
                    rows={5}
                    placeholder="e.g. Replace 12 m² of bathroom floor tiles, remove old tiles, level the floor…"
                    help="Rough notes are fine — the more detail, the better the quote. We never post or send anything for you."
                    testid="job-details"
                  />
                  <TitleInFieldTextarea
                    id="qw-lineitems"
                    label="Rough line items (optional)"
                    value={lineItems}
                    onChange={setLineItems}
                    rows={3}
                    placeholder="e.g. Tiles — £240 · Labour 2 days · Adhesive & grout"
                    help="One per line is ideal. Include prices if you have them — the AI will use them and won't make up figures you don't give."
                    testid="line-items"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Details & output"
                  help="Personalise the quote and choose what to generate. Trade type is taken from your profile."
                />
                <div className="space-y-0.5">
                  <TitleInField
                    id="qw-customer"
                    label="Customer name (optional)"
                    value={customerName}
                    onChange={setCustomerName}
                    maxLength={120}
                    placeholder="e.g. Sarah Jones"
                    help="Used to personalise the estimate email's greeting. Leave blank for a generic greeting."
                    testid="customer-name"
                  />
                  <TitleInFieldSelect
                    id="qw-tone"
                    label="Tone"
                    value={tone}
                    onChange={setTone}
                    help="The voice of the quote. 'Premium' leans into quality craftsmanship; 'Friendly' is warm and local."
                    testid="tone"
                  >
                    {TONES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </TitleInFieldSelect>
                  <TitleInFieldSelect
                    id="qw-produce"
                    label="What to produce"
                    value={produce}
                    onChange={(next) => {
                      // Clear the now-unwanted draft so stale cards don't
                      // contradict the new selection.
                      if (next === "description") setEmail(null);
                      else if (next === "email") setDescription(null);
                      setProduce(next);
                    }}
                    help="Generate the quote description, the estimate email, or both at once."
                    testid="produce"
                  >
                    <option value="both">Description + estimate email</option>
                    <option value="description">Quote description only</option>
                    <option value="email">Estimate email only</option>
                  </TitleInFieldSelect>
                </div>

                {/* DS rule 5 — the single .btn-primary-premium on this page. */}
                <Button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="btn-primary-premium w-full"
                  data-testid="generate-quote"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" />
                      Writing your quote…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-1.5" aria-hidden="true" />
                      Generate quote
                    </>
                  )}
                </Button>
                <p className="text-[11px] text-gray-400 text-center">
                  Drafts only — nothing is sent. Always review before you send.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Output column */}
          <div className="lg:col-span-2 space-y-3">
            {error && (
              <div
                className="flex items-start gap-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-900"
                role="alert"
                data-testid="qw-error"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1">
                  <p className="font-medium">{error.title}</p>
                  <p className="text-xs mt-0.5">{error.message}</p>
                </div>
              </div>
            )}

            {loading && !hasOutput && (
              <Card>
                <CardContent className="p-8 flex flex-col items-center justify-center text-center gap-3">
                  <Loader2 className="w-6 h-6 text-brand-blue animate-spin" aria-hidden="true" />
                  <p className="text-sm text-gray-600">
                    Crafting a polished quote for you…
                  </p>
                </CardContent>
              </Card>
            )}

            {!loading && !hasOutput && !error && (
              <Card>
                <CardContent className="p-8 flex flex-col items-center justify-center text-center gap-2">
                  <PencilLine className="w-8 h-8 text-gray-300" aria-hidden="true" />
                  <p className="text-sm font-medium text-gray-700">
                    Your polished quote will appear here
                  </p>
                  <p className="text-xs text-gray-500 max-w-sm">
                    Describe the job, choose a tone, and hit{" "}
                    <strong>Generate quote</strong>. You'll get a clean description and
                    a ready-to-send email — both editable.
                  </p>
                </CardContent>
              </Card>
            )}

            {description && (
              <Card>
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                      <FileText className="w-4 h-4 text-brand-blue" aria-hidden="true" />
                      Quote description
                    </h2>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 sm:min-h-0"
                      onClick={() => handleCopy("description")}
                      aria-label="Copy quote description"
                      data-testid="copy-description"
                    >
                      {copied === "description" ? (
                        <>
                          <Check className="w-4 h-4 mr-1.5" aria-hidden="true" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-1.5" aria-hidden="true" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <textarea
                    value={description.text}
                    onChange={(e) =>
                      setDescription((d) => (d ? { ...d, text: e.target.value } : d))
                    }
                    rows={6}
                    aria-label="Editable quote description"
                    data-testid="description-textarea"
                    className="w-full px-3 py-2 text-sm text-gray-800 border border-gray-200 rounded-lg bg-white resize-y focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
                  />
                  <p className="text-[11px] text-gray-400">
                    Edit anything above, then copy it into your quote. Nothing is sent for you.
                  </p>
                </CardContent>
              </Card>
            )}

            {email && (
              <Card>
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                      <Mail className="w-4 h-4 text-brand-blue" aria-hidden="true" />
                      Estimate email
                    </h2>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 sm:min-h-0"
                      onClick={() => handleCopy("email")}
                      aria-label="Copy estimate email"
                      data-testid="copy-email"
                    >
                      {copied === "email" ? (
                        <>
                          <Check className="w-4 h-4 mr-1.5" aria-hidden="true" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-1.5" aria-hidden="true" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <textarea
                    value={email.text}
                    onChange={(e) =>
                      setEmail((d) => (d ? { ...d, text: e.target.value } : d))
                    }
                    rows={10}
                    aria-label="Editable estimate email"
                    data-testid="email-textarea"
                    className="w-full px-3 py-2 text-sm text-gray-800 border border-gray-200 rounded-lg bg-white resize-y focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
                  />
                  <p className="text-[11px] text-gray-400">
                    Swap the [placeholders] for your details, review, then send.
                  </p>
                </CardContent>
              </Card>
            )}

            {hasOutput && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-600">
                    <strong className="text-gray-800">Tip:</strong> the AI never invents
                    prices it isn't given — fill any{" "}
                    <span className="font-mono text-gray-700">[price]</span> or{" "}
                    <span className="font-mono text-gray-700">[timescale]</span>{" "}
                    placeholders before sending.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
