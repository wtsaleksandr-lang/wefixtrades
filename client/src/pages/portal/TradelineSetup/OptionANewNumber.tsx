/**
 * Option A subscreen — provision a fresh WeFixTrades number.
 *
 * State machine driven by `setup.provisioning_status`:
 *   null         → market + type picker, [Reserve my number] button
 *   'pending'    → in-flight spinner
 *   'queued'     → "Number reserved, email within 24h" success-soft state
 *   'provisioned'→ success: number revealed + 30-day checklist + template copy
 *   'failed'     → error + retry button
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Copy, ArrowLeft, AlertTriangle, MailCheck } from "lucide-react";
import type { TradelinePhoneSetup } from "@shared/schema";
import { apiFetch } from "./apiClient";
import { buildChecklist } from "./templateCopy";

interface ProvisionResponse {
  setup: TradelinePhoneSetup;
  queued: boolean;
  reason?: string;
}

interface Props {
  setup: TradelinePhoneSetup;
  onBack: () => void;
  onDone: () => void;
}

export function OptionANewNumber({ setup, onBack, onDone }: Props) {
  const queryClient = useQueryClient();
  const [countryCode, setCountryCode] = useState<"US" | "CA">("US");
  const [preference, setPreference] = useState<"local" | "toll_free">("local");
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const provisionMutation = useMutation({
    mutationFn: () =>
      apiFetch<ProvisionResponse>("/api/portal/tradeline/setup/provision-new", {
        method: "POST",
        body: JSON.stringify({ countryCode, preference }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline/setup"] });
    },
  });

  const status = setup.provisioning_status;

  /* ─── Provisioned: success + checklist ─── */
  if (status === "provisioned" && setup.assigned_number) {
    const checklist = buildChecklist(setup.assigned_number);
    const allChecked = checklist.every((c) => checkedKeys.has(c.key));
    return (
      <div data-theme="light" className="space-y-5">
        <BackLink onBack={onBack} />
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
          <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Your new number</p>
          <p className="text-2xl font-bold text-emerald-900 tracking-tight">{setup.assigned_number}</p>
          <p className="text-xs text-emerald-700">Live now — connected to your AI assistant.</p>
        </div>

        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-2">Your 30-day rollout checklist</h3>
          <p className="text-sm text-gray-600 mb-3">
            No rush — work through these over the next month. Tap a row to mark it done.
          </p>
          <div className="space-y-2">
            {checklist.map((item) => {
              const done = checkedKeys.has(item.key);
              return (
                <div
                  key={item.key}
                  className="rounded-lg border border-gray-200 bg-white p-3 hover:border-gray-300"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setCheckedKeys((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.key)) next.delete(item.key); else next.add(item.key);
                        return next;
                      });
                    }}
                    className="w-full text-left flex items-start gap-3"
                  >
                    <div
                      className={
                        done
                          ? "w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5"
                          : "w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0 mt-0.5"
                      }
                    >
                      {done && <CheckCircle2 className="w-4 h-4 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={done ? "font-medium text-gray-500 line-through" : "font-medium text-gray-900"}>
                        {item.label}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">{item.hint}</p>
                    </div>
                  </button>
                  {item.templateCopy && !done && (
                    <div className="mt-2 pl-8 flex items-start gap-2">
                      <pre className="flex-1 text-xs bg-gray-50 border border-gray-100 rounded p-2 text-gray-700 whitespace-pre-wrap font-sans">{item.templateCopy}</pre>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(item.templateCopy!);
                          setCopiedKey(item.key);
                          setTimeout(() => setCopiedKey((k) => (k === item.key ? null : k)), 1800);
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 mt-0.5 flex-shrink-0"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedKey === item.key ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Button onClick={onDone} className="w-full">
          {allChecked ? "All done — go to dashboard" : "Finish later — go to dashboard"}
        </Button>
      </div>
    );
  }

  /* ─── Queued: friendly waiting state ─── */
  if (status === "queued") {
    return (
      <div className="space-y-5">
        <BackLink onBack={onBack} />
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 text-center space-y-3">
          <MailCheck className="w-8 h-8 text-blue-600 mx-auto" />
          <p className="text-xs uppercase tracking-wide text-blue-700 font-semibold">Number reserved</p>
          <p className="text-sm text-blue-900 max-w-sm mx-auto">
            {setup.provisioning_failed_reason ||
              "Your number is reserved. We're finalizing the connection — you'll get an email within 24 hours when it's ready to use."}
          </p>
        </div>
        <Button onClick={onDone} className="w-full">Done — go to dashboard</Button>
      </div>
    );
  }

  /* ─── Failed: retry ─── */
  if (status === "failed") {
    return (
      <div className="space-y-5">
        <BackLink onBack={onBack} />
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 space-y-2">
          <AlertTriangle className="w-6 h-6 text-rose-600" />
          <p className="text-sm font-semibold text-rose-900">Provisioning failed</p>
          <p className="text-xs text-rose-700">{setup.provisioning_failed_reason || "Try again, or contact support."}</p>
        </div>
        <Button onClick={() => provisionMutation.mutate()} disabled={provisionMutation.isPending} className="w-full">
          {provisionMutation.isPending ? "Trying again…" : "Try again"}
        </Button>
      </div>
    );
  }

  /* ─── Initial: market + type picker ─── */
  return (
    <div className="space-y-5">
      <BackLink onBack={onBack} />

      <div>
        <h2 className="text-xl font-bold text-gray-900">Pick your new number</h2>
        <p className="text-sm text-gray-600 mt-1">
          We'll grab a number from your area and connect it to your AI assistant.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">Country</label>
          <div className="grid grid-cols-2 gap-2">
            {(["US", "CA"] as const).map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCountryCode(c)}
                className={
                  countryCode === c
                    ? "rounded-lg border-2 border-indigo-500 bg-indigo-50 p-3 text-sm font-medium text-indigo-900"
                    : "rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 hover:border-gray-300"
                }
              >
                {c === "US" ? "🇺🇸 United States" : "🇨🇦 Canada"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">Number type</label>
          <div className="grid grid-cols-2 gap-2">
            <TypeOption
              selected={preference === "local"}
              onClick={() => setPreference("local")}
              title="Local"
              subtitle="Local area code"
            />
            <TypeOption
              selected={preference === "toll_free"}
              onClick={() => setPreference("toll_free")}
              title="Toll-free"
              subtitle="800, 833, 844…"
            />
          </div>
        </div>
      </div>

      {provisionMutation.isError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          {(provisionMutation.error as Error).message}
        </div>
      )}

      <Button
        onClick={() => provisionMutation.mutate()}
        disabled={provisionMutation.isPending}
        className="w-full"
      >
        {provisionMutation.isPending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reserving your number…</>
        ) : (
          "Reserve my number"
        )}
      </Button>
    </div>
  );
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      Back to options
    </button>
  );
}

function TypeOption({ selected, onClick, title, subtitle }: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        selected
          ? "rounded-lg border-2 border-indigo-500 bg-indigo-50 p-3 text-left"
          : "rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-gray-300"
      }
    >
      <p className={selected ? "text-sm font-semibold text-indigo-900" : "text-sm font-semibold text-gray-900"}>
        {title}
      </p>
      <p className={selected ? "text-xs text-indigo-700" : "text-xs text-gray-500"}>
        {subtitle}
      </p>
    </button>
  );
}
