/**
 * Option A subscreen — provision a fresh WeFixTrades number.
 *
 * State machine driven by `setup.provisioning_status`:
 *   null         → market + type picker, [Reserve my number] button
 *   'pending'    → in-flight spinner
 *   'queued'     → "Number reserved, email within 24h" success-soft state
 *   'provisioned'→ success: number revealed + 30-day checklist + template copy
 *   'failed'     → error + retry button
 *
 * Wave 85 — between the market/type pick and the [Reserve my number]
 * action, the user can search Twilio's inventory by area code and an
 * optional vanity pattern, then pick a specific number from a grid. The
 * "Pick for me instead" link bypasses the picker and falls back to the
 * original auto-pick behavior.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Copy, ArrowLeft, AlertTriangle, MailCheck, Search, MapPin } from "lucide-react";
import type { TradelinePhoneSetup } from "@shared/schema";
import { apiFetch } from "./apiClient";
import { buildChecklist } from "./templateCopy";

interface ProvisionResponse {
  setup: TradelinePhoneSetup;
  queued: boolean;
  reason?: string;
}

interface AvailableNumber {
  phoneNumber: string;       // E.164
  friendlyName: string;
  locality: string | null;
  region: string | null;
}

interface AvailableNumbersResponse {
  numbers: AvailableNumber[];
  cached: boolean;
  country: "US" | "CA";
  areaCode: string | null;
  contains: string | null;
  unavailable?: boolean;
  reason?: string;
  testMode?: boolean;
}

interface Props {
  setup: TradelinePhoneSetup;
  onBack: () => void;
  onDone: () => void;
}

/** Pretty-format an E.164 NANP number as XXX-XXX-XXXX. */
function prettyPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  // Strip leading "1" for NANP
  const local = digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits;
  if (local.length !== 10) return e164;
  return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
}

export function OptionANewNumber({ setup, onBack, onDone }: Props) {
  const queryClient = useQueryClient();
  const [countryCode, setCountryCode] = useState<"US" | "CA">("US");
  const [preference, setPreference] = useState<"local" | "toll_free">("local");
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  /* Wave 85 — picker-step local state */
  const [areaCodeInput, setAreaCodeInput] = useState<string>("");
  const [vanityInput, setVanityInput] = useState<string>("");
  const [pickerResults, setPickerResults] = useState<AvailableNumber[] | null>(null);
  const [pickerUnavailable, setPickerUnavailable] = useState<string | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const [forceAutoPick, setForceAutoPick] = useState<boolean>(false);

  const provisionMutation = useMutation<ProvisionResponse, Error, string | undefined>({
    mutationFn: (targetPhoneNumber) =>
      apiFetch<ProvisionResponse>("/api/portal/tradeline/setup/provision-new", {
        method: "POST",
        body: JSON.stringify({
          countryCode,
          preference,
          ...(targetPhoneNumber ? { targetPhoneNumber } : {}),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline/setup"] });
    },
  });

  const searchMutation = useMutation({
    mutationFn: () =>
      apiFetch<AvailableNumbersResponse>("/api/portal/tradeline/setup/available-numbers", {
        method: "POST",
        body: JSON.stringify({
          country: countryCode,
          ...(areaCodeInput.trim() ? { areaCode: areaCodeInput.trim() } : {}),
          ...(vanityInput.trim() ? { contains: vanityInput.trim() } : {}),
        }),
      }),
    onSuccess: (data) => {
      setPickerResults(data.numbers);
      setSelectedNumber(null);
      setPickerUnavailable(data.unavailable ? data.reason || "Number search isn't ready yet." : null);
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
                        className="text-xs text-brand-blue-600 hover:text-brand-blue-700 inline-flex items-center gap-1 mt-0.5 flex-shrink-0"
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
        <Button onClick={() => provisionMutation.mutate(undefined)} disabled={provisionMutation.isPending} className="w-full">
          {provisionMutation.isPending ? "Trying again…" : "Try again"}
        </Button>
      </div>
    );
  }

  /* ─── Initial: market + type picker, then number-picker for local ─── */
  // Wave 85 — picker is local-only. Toll-free still uses the auto-pick
  // path because Twilio's toll-free inventory doesn't expose meaningful
  // locality/region metadata for the per-area-code UX.
  const showPicker = preference === "local" && !forceAutoPick;

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
                onClick={() => {
                  setCountryCode(c);
                  setPickerResults(null);
                  setSelectedNumber(null);
                }}
                className={
                  countryCode === c
                    ? "rounded-lg border-2 border-brand-blue-500 bg-brand-blue-50 p-3 text-sm font-medium text-brand-blue-900"
                    : "rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 hover:border-gray-300"
                }
              >
                {c === "US" ? "United States" : "Canada"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">Number type</label>
          <div className="grid grid-cols-2 gap-2">
            <TypeOption
              selected={preference === "local"}
              onClick={() => {
                setPreference("local");
                setForceAutoPick(false);
              }}
              title="Local"
              subtitle="Local area code"
            />
            <TypeOption
              selected={preference === "toll_free"}
              onClick={() => {
                setPreference("toll_free");
                setPickerResults(null);
                setSelectedNumber(null);
              }}
              title="Toll-free"
              subtitle="800, 833, 844…"
            />
          </div>
        </div>
      </div>

      {/* Wave 85 — number picker (local only) */}
      {showPicker && (
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">Search for a number</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Enter an area code and (optionally) a vanity pattern like "777" or "LOVE".
            </p>
          </div>

          <div className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
            <div>
              <label htmlFor="wave85-area-code" className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide block mb-1">Area code</label>
              <input
                id="wave85-area-code"
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={areaCodeInput}
                onChange={(e) => setAreaCodeInput(e.target.value.replace(/\D/g, "").slice(0, 3))}
                placeholder="415"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-blue-500 focus:outline-none focus:ring-1 focus:ring-brand-blue-500"
                data-testid="wave85-area-code-input"
              />
            </div>
            <div>
              <label htmlFor="wave85-vanity" className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide block mb-1">Contains (optional)</label>
              <input
                id="wave85-vanity"
                type="text"
                maxLength={8}
                value={vanityInput}
                onChange={(e) => setVanityInput(e.target.value.replace(/[^A-Za-z0-9*]/g, "").slice(0, 8))}
                placeholder="777 or LOVE"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-blue-500 focus:outline-none focus:ring-1 focus:ring-brand-blue-500"
                data-testid="wave85-vanity-input"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                onClick={() => searchMutation.mutate()}
                disabled={searchMutation.isPending}
                className="h-[38px]"
                data-testid="wave85-search-button"
              >
                {searchMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <><Search className="w-4 h-4 mr-1.5" /> Search</>
                )}
              </Button>
            </div>
          </div>

          {searchMutation.isError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
              {(searchMutation.error as Error).message}
            </div>
          )}

          {pickerUnavailable && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {pickerUnavailable}
            </div>
          )}

          {pickerResults && pickerResults.length === 0 && !pickerUnavailable && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              No numbers found{areaCodeInput ? ` for area code ${areaCodeInput}` : ""}{vanityInput ? ` matching "${vanityInput}"` : ""}. Try a different area code or pattern.
            </div>
          )}

          {pickerResults && pickerResults.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="wave85-results-grid">
              {pickerResults.map((n) => {
                const isSelected = selectedNumber === n.phoneNumber;
                return (
                  <button
                    type="button"
                    key={n.phoneNumber}
                    onClick={() => setSelectedNumber(n.phoneNumber)}
                    data-testid={`wave85-number-${n.phoneNumber}`}
                    className={
                      isSelected
                        ? "rounded-lg border-2 border-brand-blue-500 bg-brand-blue-50 p-3 text-left"
                        : "rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-gray-300"
                    }
                  >
                    <p className={isSelected ? "text-sm font-bold text-brand-blue-900 tracking-tight" : "text-sm font-bold text-gray-900 tracking-tight"}>
                      {prettyPhone(n.phoneNumber)}
                    </p>
                    {(n.locality || n.region) && (
                      <p className={isSelected ? "text-xs text-brand-blue-700 mt-0.5 inline-flex items-center gap-1" : "text-xs text-gray-500 mt-0.5 inline-flex items-center gap-1"}>
                        <MapPin className="w-3 h-3" />
                        {[n.locality, n.region].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setForceAutoPick(true);
              setPickerResults(null);
              setSelectedNumber(null);
            }}
            className="text-xs text-brand-blue-600 hover:text-brand-blue-700 underline-offset-2 hover:underline"
            data-testid="wave85-pick-for-me"
          >
            Pick for me instead →
          </button>
        </div>
      )}

      {provisionMutation.isError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          {(provisionMutation.error as Error).message}
        </div>
      )}

      <Button
        onClick={() => provisionMutation.mutate(showPicker ? (selectedNumber || undefined) : undefined)}
        disabled={provisionMutation.isPending || (showPicker && !selectedNumber && (pickerResults?.length ?? 0) > 0)}
        className="w-full"
        data-testid="wave85-reserve-button"
      >
        {provisionMutation.isPending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reserving your number…</>
        ) : selectedNumber ? (
          `Reserve ${prettyPhone(selectedNumber)}`
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
          ? "rounded-lg border-2 border-brand-blue-500 bg-brand-blue-50 p-3 text-left"
          : "rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-gray-300"
      }
    >
      <p className={selected ? "text-sm font-semibold text-brand-blue-900" : "text-sm font-semibold text-gray-900"}>
        {title}
      </p>
      <p className={selected ? "text-xs text-brand-blue-700" : "text-xs text-gray-500"}>
        {subtitle}
      </p>
    </button>
  );
}
