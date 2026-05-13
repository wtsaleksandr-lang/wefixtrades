/**
 * Option B subscreen — forward an existing number to a hidden WeFixTrades number.
 *
 * State machine, driven by `setup` row fields:
 *   no customer_number              → phone-number entry form
 *   customer_number, no carrier     → lookup in flight (transient)
 *   carrier set, not yet activated  → MMI code + tap-to-activate (or Bell fallback)
 *   forwarding_test_call_sid, not verified → "Placing test call..." with retry + manual confirm
 *   forwarding_verified_at          → success
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, PhoneCall, AlertTriangle, RefreshCw } from "lucide-react";
import type { TradelinePhoneSetup } from "@shared/schema";
import {
  buildActivationTelUri,
  getCarrierEntry,
  type CarrierEntry,
  type CarrierKey,
  UNKNOWN_CARRIER_FALLBACK,
} from "@shared/api-types/carrierCodes";
import { apiFetch } from "./apiClient";
import { BellDeviceSettings } from "./BellDeviceSettings";

interface Props {
  setup: TradelinePhoneSetup;
  onBack: () => void;
  onDone: () => void;
}

interface LookupResponse {
  carrierKey: CarrierKey;
  carrierEntry: CarrierEntry | null;
  market: "US" | "CA" | null;
  carrierName: string | null;
}

export function OptionBForward({ setup, onBack, onDone }: Props) {
  const queryClient = useQueryClient();
  const [phoneInput, setPhoneInput] = useState(setup.customer_number ?? "");

  /* ─── Mutations ─── */

  const lookupMutation = useMutation({
    mutationFn: (phoneNumber: string) =>
      apiFetch<LookupResponse>("/api/portal/tradeline/setup/forward/lookup-carrier", {
        method: "POST",
        body: JSON.stringify({ phoneNumber }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline/setup"] });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ setup: TradelinePhoneSetup; callSid: string; verified: boolean }>(
        "/api/portal/tradeline/setup/forward/verify-test-call",
        { method: "POST" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline/setup"] });
    },
  });

  const manualConfirmMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ setup: TradelinePhoneSetup }>(
        "/api/portal/tradeline/setup/forward/manual-confirm",
        { method: "POST" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline/setup"] });
    },
  });

  /* ─── Polling for verification ─── */

  const isAwaitingVerification = !!setup.forwarding_test_call_sid && !setup.forwarding_verified_at;

  const pollQuery = useQuery({
    queryKey: ["/api/portal/tradeline/setup/forward/test-call-status"],
    queryFn: () =>
      apiFetch<{ verified: boolean; status: string; checkedAt: string }>(
        "/api/portal/tradeline/setup/forward/test-call-status",
      ),
    enabled: isAwaitingVerification,
    refetchInterval: 5000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (pollQuery.data?.verified) {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline/setup"] });
    }
  }, [pollQuery.data?.verified, queryClient]);

  /* ─── Render branches ─── */

  // 1. Verified → success
  if (setup.forwarding_verified_at) {
    const method = setup.forwarding_verified_method;
    return (
      <div className="space-y-5">
        <BackLink onBack={onBack} />
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
          <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">Forwarding active</p>
          <p className="text-sm text-emerald-900 max-w-sm mx-auto">
            Calls to <span className="font-semibold">{setup.customer_number}</span> will route to your AI assistant when you don't pick up.
          </p>
          <p className="text-[10px] text-emerald-700 mt-1">
            Verified via {method === "twilio_test_call" ? "automatic test call" : "manual confirmation"}.
          </p>
        </div>
        <Button onClick={onDone} className="w-full">Done — go to dashboard</Button>
      </div>
    );
  }

  // 2. Test call placed, not yet verified → polling + manual fallback
  if (isAwaitingVerification) {
    return (
      <div className="space-y-5">
        <BackLink onBack={onBack} />
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-center space-y-2">
          <Loader2 className="w-6 h-6 text-blue-600 mx-auto animate-spin" />
          <p className="text-sm font-semibold text-blue-900">Placing a test call…</p>
          <p className="text-xs text-blue-700">
            We're calling <span className="font-mono">{setup.customer_number}</span> from your WeFixTrades number.
            If forwarding is active, the call will hand off to AI automatically. This usually takes 15–30 seconds.
          </p>
          {pollQuery.data?.checkedAt && (
            <p className="text-[10px] text-blue-600 mt-1">
              Last checked {timeSince(pollQuery.data.checkedAt)}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm space-y-2">
          <p className="font-medium text-gray-900">Not seeing the call?</p>
          <p className="text-xs text-gray-600">
            Sometimes carriers take a minute or two to enable forwarding. Try calling your own number
            from another phone — if it rings your AI, forwarding is working.
          </p>
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => verifyMutation.mutate()}
              disabled={verifyMutation.isPending}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Try test call again
            </Button>
            <Button
              size="sm"
              onClick={() => manualConfirmMutation.mutate()}
              disabled={manualConfirmMutation.isPending}
            >
              I confirm it's working
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Carrier identified → show code + tap to activate
  if (setup.carrier && setup.carrier !== "unknown") {
    const entry = getCarrierEntry(setup.carrier as CarrierKey);
    return (
      <ActivateForwarding
        setup={setup}
        carrierEntry={entry}
        onBack={onBack}
        onContinueToVerify={() => verifyMutation.mutate()}
        verifyPending={verifyMutation.isPending}
      />
    );
  }

  // 4. Phone number entered but carrier=unknown → generic GSM code
  if (setup.customer_number && setup.carrier === "unknown") {
    return (
      <UnknownCarrierFallback
        setup={setup}
        onBack={onBack}
        onContinueToVerify={() => verifyMutation.mutate()}
        verifyPending={verifyMutation.isPending}
      />
    );
  }

  // 5. Default: phone number entry
  return (
    <div className="space-y-5">
      <BackLink onBack={onBack} />

      <div>
        <h2 className="text-xl font-bold text-gray-900">Forward your existing number</h2>
        <p className="text-sm text-gray-600 mt-1">
          Enter the number your customers already know. We'll detect your carrier and show the exact code to set up forwarding.
        </p>
      </div>

      <div>
        <label htmlFor="customer-number" className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">
          Your existing phone number
        </label>
        <input
          id="customer-number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+1 555 123 4567"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
        />
        <p className="text-[11px] text-gray-500 mt-1">Include country code (+1 for USA/Canada).</p>
      </div>

      {lookupMutation.isError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          {(lookupMutation.error as Error).message}
        </div>
      )}

      <Button
        onClick={() => lookupMutation.mutate(normalisePhone(phoneInput))}
        disabled={lookupMutation.isPending || !isPhoneValid(phoneInput)}
        className="w-full"
      >
        {lookupMutation.isPending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Detecting your carrier…</>
        ) : (
          <>Continue <ArrowRight className="w-4 h-4 ml-1.5" /></>
        )}
      </Button>
    </div>
  );
}

/* ─── Carrier-identified activation step ─── */

function ActivateForwarding({
  setup,
  carrierEntry,
  onBack,
  onContinueToVerify,
  verifyPending,
}: {
  setup: TradelinePhoneSetup;
  carrierEntry: CarrierEntry | null;
  onBack: () => void;
  onContinueToVerify: () => void;
  verifyPending: boolean;
}) {
  // Bell / Virgin → device-settings fallback (no MMI code available)
  if (carrierEntry?.style === "device_settings_only") {
    return (
      <div className="space-y-4">
        <BackLink onBack={onBack} />
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            We detected: {carrierEntry.displayName} ({carrierEntry.market === "US" ? "United States" : "Canada"})
          </h2>
        </div>
        <BellDeviceSettings
          weFixTradesNumber="(your WeFixTrades number)"
          onContinueToVerify={onContinueToVerify}
          onUseUnconditional={onContinueToVerify}
        />
      </div>
    );
  }

  // Regular GSM/CDMA — show the code + tap-to-activate
  // The WeFixTrades number isn't assigned yet for Option B (it's a hidden number,
  // provisioned at submit-time). For the wizard preview, we use a placeholder.
  const placeholderNumber = "(your WeFixTrades number)";
  const telUri = carrierEntry ? buildActivationTelUri(carrierEntry, "5555555555") : null;
  const codePreview = carrierEntry?.codes.activateAll?.replace("{num}", placeholderNumber);

  return (
    <div className="space-y-4">
      <BackLink onBack={onBack} />

      <div>
        <h2 className="text-xl font-bold text-gray-900">
          We detected: {carrierEntry?.displayName ?? "your carrier"}
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          One tap activates conditional call forwarding on your phone.
        </p>
      </div>

      {carrierEntry?.preconditionNote && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <span className="font-semibold">Important:</span> {carrierEntry.preconditionNote}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
          The code we'll dial
        </p>
        <p className="text-lg font-mono text-gray-900">{codePreview}</p>
        <p className="text-[10px] text-gray-500">
          Tap the button below to dial. Your phone will ask you to confirm — tap Call.
        </p>
      </div>

      {telUri ? (
        <a
          href={telUri}
          className="block w-full rounded-lg bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <PhoneCall className="w-4 h-4 inline-block mr-2" />
          Call now to activate forwarding
        </a>
      ) : null}

      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs text-gray-600 mb-2">
          After you've dialed the code and heard the confirmation tone, come back here and we'll verify forwarding is active.
        </p>
        <Button
          onClick={onContinueToVerify}
          disabled={verifyPending}
          className="w-full"
        >
          {verifyPending ? "Placing test call…" : "I've activated — verify forwarding"}
        </Button>
      </div>
    </div>
  );
}

/* ─── Unknown carrier fallback (try generic GSM code) ─── */

function UnknownCarrierFallback({
  setup,
  onBack,
  onContinueToVerify,
  verifyPending,
}: {
  setup: TradelinePhoneSetup;
  onBack: () => void;
  onContinueToVerify: () => void;
  verifyPending: boolean;
}) {
  return (
    <div className="space-y-4">
      <BackLink onBack={onBack} />
      <div>
        <h2 className="text-xl font-bold text-gray-900">Carrier not identified</h2>
        <p className="text-sm text-gray-600 mt-1">{UNKNOWN_CARRIER_FALLBACK.note}</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center space-y-1">
        <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Try this code</p>
        <p className="text-lg font-mono text-gray-900">{UNKNOWN_CARRIER_FALLBACK.activateAll}</p>
      </div>
      <Button onClick={onContinueToVerify} disabled={verifyPending} className="w-full">
        {verifyPending ? "Placing test call…" : "I've dialed it — verify forwarding"}
      </Button>
    </div>
  );
}

/* ─── Utilities ─── */

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

function normalisePhone(s: string): string {
  const digits = s.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits;
}

function isPhoneValid(s: string): boolean {
  const digits = s.replace(/[^\d]/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function timeSince(iso: string): string {
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (elapsed < 5) return "just now";
  if (elapsed < 60) return `${elapsed}s ago`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
  return `${Math.floor(elapsed / 3600)}h ago`;
}
