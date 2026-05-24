/**
 * Option C subscreen — port an existing number into WeFixTrades.
 *
 * Three steps, driven by `setup.port_status`:
 *   null               → bill upload (PDF / image)
 *   'bill_uploaded'    → LOA signature + signer name
 *   'loa_signed'       → submit form (business name + authorized signer)
 *   'submitted' | 'test_submitted' → success state with estimated resolution date
 *   'in_progress' | 'approved' | 'rejected' → terminal states from carrier
 *
 * Tier gate is enforced by the server — this UI assumes it's already
 * cleared via choose-mode. If a 403 comes back, we show a polite block.
 */

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Upload,
  FileText,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import type { TradelinePhoneSetup } from "@shared/schema";
import { apiFetch } from "./apiClient";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";

interface Props {
  setup: TradelinePhoneSetup;
  onBack: () => void;
  onDone: () => void;
}

export function OptionCPort({ setup, onBack, onDone }: Props) {
  const queryClient = useQueryClient();
  const status = setup.port_status;

  /* ─── Submitted: terminal success state ─── */
  if (status === "submitted" || status === "test_submitted" || status === "in_progress" || status === "approved") {
    return <PortSubmittedView setup={setup} onDone={onDone} onBack={onBack} />;
  }

  /* ─── Rejected: surface reason, allow re-submission ─── */
  if (status === "rejected") {
    return <PortRejectedView setup={setup} onBack={onBack} />;
  }

  /* ─── Step 3: signed LOA, ready to submit ─── */
  if (status === "loa_signed") {
    return <PortSubmitForm setup={setup} onBack={onBack} />;
  }

  /* ─── Step 2: bill uploaded, need LOA ─── */
  if (status === "bill_uploaded") {
    return <LoaSignStep setup={setup} onBack={onBack} />;
  }

  /* ─── Step 1: upload bill ─── */
  return <BillUploadStep setup={setup} onBack={onBack} />;
}

/* ─── Step 1: bill upload ─── */

function BillUploadStep({ setup, onBack }: { setup: TradelinePhoneSetup; onBack: () => void }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const fileBase64 = await fileToBase64(file);
      return apiFetch<{ setup: TradelinePhoneSetup }>(
        "/api/portal/tradeline/setup/port/upload-bill",
        {
          method: "POST",
          body: JSON.stringify({
            fileBase64,
            contentType: file.type as "application/pdf" | "image/jpeg" | "image/png",
          }),
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline/setup"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  function onPick(f: File | null) {
    setError(null);
    if (!f) return;
    const okTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!okTypes.includes(f.type)) {
      setError("Please upload a PDF, JPG, or PNG.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("File too large — please upload under 5 MB.");
      return;
    }
    setFile(f);
  }

  return (
    <div data-theme="light" className="space-y-5">
      <BackLink onBack={onBack} />

      <div>
        <h2 className="text-xl font-bold text-gray-900">Upload a recent phone bill</h2>
        <p className="text-sm text-gray-600 mt-1">
          We need to verify the number you're porting belongs to you. A bill from the last 90 days
          works best.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Phone bill</p>
        <label
          htmlFor="bill-file"
          className="block rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-100"
        >
          {file ? (
            <div className="flex items-center justify-center gap-3 text-sm text-gray-700">
              <FileText className="w-5 h-5 text-emerald-600" />
              <span className="font-medium">{file.name}</span>
              <span className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Upload className="w-7 h-7 text-gray-400 mx-auto" />
              <p className="text-sm font-medium text-gray-700">Tap to choose a file</p>
              <p className="text-[11px] text-gray-500">PDF, JPG, or PNG. Up to 5 MB.</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            id="bill-file"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </label>
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
            {error}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        <p className="font-medium text-gray-800 mb-1">Your bill is encrypted before storage.</p>
        We use AES-256-GCM with a key only we hold, and delete bills 90 days after your port resolves.
      </div>

      <Button
        onClick={() => uploadMutation.mutate()}
        disabled={!file || uploadMutation.isPending}
        className="w-full"
      >
        {uploadMutation.isPending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading…</>
        ) : (
          "Upload bill and continue"
        )}
      </Button>
    </div>
  );
}

/* ─── Step 2: LOA signature ─── */

function LoaSignStep({ setup, onBack }: { setup: TradelinePhoneSetup; onBack: () => void }) {
  const queryClient = useQueryClient();
  const padRef = useRef<SignaturePadHandle | null>(null);
  const [signerName, setSignerName] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signMutation = useMutation({
    mutationFn: async () => {
      if (!padRef.current || padRef.current.isEmpty()) throw new Error("Please sign before continuing.");
      if (!signerName.trim()) throw new Error("Please type your name.");
      const dataUrl = padRef.current.toDataURL();
      const signatureBase64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      return apiFetch<{ setup: TradelinePhoneSetup }>(
        "/api/portal/tradeline/setup/port/sign-loa",
        {
          method: "POST",
          body: JSON.stringify({ signatureBase64, signerName: signerName.trim() }),
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline/setup"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <div className="space-y-5">
      <BackLink onBack={onBack} />

      <div>
        <h2 className="text-xl font-bold text-gray-900">Sign the Letter of Authorization</h2>
        <p className="text-sm text-gray-600 mt-1">
          Your carrier needs your written consent to transfer your number. This is the LOA.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-1">
        <p>
          <span className="font-semibold">You authorize WeFixTrades</span> to act on your behalf with your current carrier
          to port your phone number into the WeFixTrades / Twilio platform.
        </p>
        <p>Your existing number continues working normally during the transfer.</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="signer-name" className="text-xs font-semibold text-gray-700 uppercase tracking-wide block">
          Type your full name (as it appears on the bill)
        </label>
        <input
          id="signer-name"
          type="text"
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue-500 focus:ring-2 focus:ring-brand-blue-100 focus:outline-none"
          autoComplete="name"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Your signature</p>
        <SignaturePad ref={padRef} onChange={setHasInk} />
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{error}</div>
      )}

      <Button
        onClick={() => signMutation.mutate()}
        disabled={signMutation.isPending || !hasInk || !signerName.trim()}
        className="w-full"
      >
        {signMutation.isPending ? "Saving signature…" : "Sign and continue"}
      </Button>
    </div>
  );
}

/* ─── Step 3: submit form ─── */

function PortSubmitForm({ setup, onBack }: { setup: TradelinePhoneSetup; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [businessName, setBusinessName] = useState("");
  const [authorizedSignerName, setAuthorizedSignerName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ setup: TradelinePhoneSetup; portRequestId: string; estimatedResolutionDays: { min: number; max: number } }>(
        "/api/portal/tradeline/setup/port/submit",
        {
          method: "POST",
          body: JSON.stringify({ businessName: businessName.trim(), authorizedSignerName: authorizedSignerName.trim() }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline/setup"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <div className="space-y-5">
      <BackLink onBack={onBack} />
      <div>
        <h2 className="text-xl font-bold text-gray-900">Submit your port</h2>
        <p className="text-sm text-gray-600 mt-1">
          One more set of details for Twilio's porting request.
        </p>
      </div>

      <div className="space-y-3">
        <Field
          label="Business name (as on the bill)"
          value={businessName}
          onChange={setBusinessName}
          autoComplete="organization"
        />
        <Field
          label="Authorized signer"
          value={authorizedSignerName}
          onChange={setAuthorizedSignerName}
          autoComplete="name"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{error}</div>
      )}

      <Button
        onClick={() => submitMutation.mutate()}
        disabled={submitMutation.isPending || !businessName.trim() || !authorizedSignerName.trim()}
        className="w-full"
      >
        {submitMutation.isPending ? "Submitting port…" : "Submit port to carrier"}
      </Button>
    </div>
  );
}

/* ─── Submitted: success state ─── */

function PortSubmittedView({ setup, onDone, onBack }: { setup: TradelinePhoneSetup; onDone: () => void; onBack: () => void }) {
  const expectedDate = setup.port_submitted_at
    ? new Date(new Date(setup.port_submitted_at).getTime() + 21 * 24 * 60 * 60 * 1000)
    : null;
  return (
    <div className="space-y-5">
      <BackLink onBack={onBack} />
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 text-center space-y-3">
        <CheckCircle2 className="w-8 h-8 text-blue-600 mx-auto" />
        <p className="text-xs uppercase tracking-wide text-blue-700 font-semibold">Port submitted</p>
        <p className="text-sm text-blue-900 max-w-sm mx-auto">
          We've sent your port request to the carrier. Your existing number keeps working normally
          while the transfer is in progress.
        </p>
        {expectedDate && (
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-800 bg-blue-100 px-2.5 py-1 rounded-full">
            <Calendar className="w-3.5 h-3.5" />
            Expected by {formatDate(expectedDate)}
          </div>
        )}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600 space-y-1">
        <p className="font-semibold text-gray-800">What happens next</p>
        <p>We'll email you with status updates: when the carrier receives the port, if they need anything, and when it completes.</p>
        <p>Most ports complete in 14–21 days. Some carriers are faster, some need the full window.</p>
      </div>
      <Button onClick={onDone} className="w-full">Go to dashboard</Button>
    </div>
  );
}

/* ─── Rejected ─── */

function PortRejectedView({ setup, onBack }: { setup: TradelinePhoneSetup; onBack: () => void }) {
  return (
    <div className="space-y-5">
      <BackLink onBack={onBack} />
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 space-y-2">
        <AlertTriangle className="w-6 h-6 text-rose-600" />
        <p className="text-sm font-semibold text-rose-900">Port request was rejected</p>
        <p className="text-xs text-rose-700">
          {setup.port_rejection_reason || "The carrier rejected the port. The most common reasons are an outdated bill, a name mismatch, or an active contract on the number."}
        </p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600">
        <p className="font-medium text-gray-800 mb-1">What you can do</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>Verify the bill is from the last 90 days and shows the same name we received.</li>
          <li>Check with your carrier that the number isn't under contract.</li>
          <li>Contact our support — we can help interpret the carrier's response.</li>
        </ul>
      </div>
    </div>
  );
}

/* ─── Shared ─── */

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

function Field({ label, value, onChange, autoComplete }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1 block">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-blue-500 focus:ring-2 focus:ring-brand-blue-100 focus:outline-none"
      />
    </div>
  );
}

function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      const base64 = result.replace(/^data:[^;]+;base64,/, "");
      resolve(base64);
    };
    r.onerror = () => reject(new Error("File read error"));
    r.readAsDataURL(f);
  });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}
