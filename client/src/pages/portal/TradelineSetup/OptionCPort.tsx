/**
 * Option C subscreen — port an existing number into WeFixTrades.
 *
 * Driven by `setup.port_status` (canonical enum: shared/schemas/
 * tradelinePhoneSetups.ts `portStatusSchema`). Every status maps to a
 * sensible screen — there is NO fall-through to the bill-upload screen
 * except the genuine initial state (null / "draft"):
 *
 *   null | 'draft'        → bill upload (PDF / image), then AI OCR extract
 *   'bill_uploaded'       → LOA signature (no OCR data — manual entry)
 *   'bill_extracted'      → LOA signature, fields PRE-FILLED from OCR
 *   'loa_signed'          → submit form (business name + authorized signer)
 *   in-flight / terminal  → redirect to the live PortStatusPage tracker
 *     ('submitted' | 'test_submitted' | 'pending_carrier_action' |
 *      'pending_loa' | 'in_progress' | 'approved' | 'port_complete' |
 *      'rejected' | 'port_failed' | 'canceled')
 *
 * The previous version routed bill_extracted AND every terminal/in-progress
 * status back to the upload screen, so an owner whose OCR ran — or whose
 * port had finished or been canceled — was bounced to re-upload (re-upload
 * loop / looks broken). Fixed: explicit branch per status below.
 *
 * Tier gate is enforced by the server — this UI assumes it's already
 * cleared via choose-mode. If a 403 comes back, we show a polite block.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  Upload,
  FileText,
  Sparkles,
} from "lucide-react";
import type { TradelinePhoneSetup } from "@shared/schema";
import { apiFetch } from "./apiClient";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";
import { FieldHelpCue, TitleInField } from "../FreeTools/_shared";

/** Statuses where the live PortStatusPage tracker is the right destination. */
const TRACKER_STATUSES = new Set([
  "submitted",
  "test_submitted",
  "pending_carrier_action",
  "pending_loa",
  "in_progress",
  "approved",
  "port_complete",
  "rejected",
  "port_failed",
  "canceled",
]);

const PORT_STATUS_PAGE = "/portal/tradeline/port-status";

/** Shape of the OCR fields the LOA + submit steps care about. */
interface ExtractedFields {
  accountHolderName: string;
  accountNumber: string;
  phoneNumber: string;
  currentCarrier: string;
  serviceAddressLine1: string;
  serviceAddressLine2: string;
}

/** Flatten the persisted port_extraction_json into the flat confirmed-fields shape. */
function extractionFromSetup(setup: TradelinePhoneSetup): ExtractedFields {
  const raw = (setup.port_extraction_json ?? {}) as any;
  const svc = raw.serviceAddress ?? {};
  return {
    accountHolderName: raw.accountHolderName || "",
    accountNumber: raw.accountNumber || "",
    phoneNumber: raw.phoneNumber || setup.customer_number || "",
    currentCarrier: raw.currentCarrier || "",
    serviceAddressLine1: svc.street || "",
    serviceAddressLine2: [svc.city, svc.state, svc.zip].filter(Boolean).join(", "),
  };
}

interface Props {
  setup: TradelinePhoneSetup;
  onBack: () => void;
  onDone: () => void;
}

export function OptionCPort({ setup, onBack, onDone }: Props) {
  const [, setLocation] = useLocation();
  const status = setup.port_status;

  /* ─── In-flight + terminal states → the live tracker page ───
     submitted / canceled / completed / rejected all have a dedicated,
     polling tracker. Redirect there rather than show a wizard step. The
     effect runs before paint so the user never sees a flash of the wizard. */
  const goesToTracker = !!status && TRACKER_STATUSES.has(status);
  useEffect(() => {
    if (goesToTracker) setLocation(PORT_STATUS_PAGE);
  }, [goesToTracker, setLocation]);

  if (goesToTracker) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Opening your port tracker…
      </div>
    );
  }

  /* ─── Step 3: signed LOA, ready to submit ─── */
  if (status === "loa_signed") {
    return <PortSubmitForm setup={setup} onBack={onBack} />;
  }

  /* ─── Step 2: bill uploaded OR OCR-extracted → sign LOA ───
     bill_extracted pre-fills the LOA fields from OCR; bill_uploaded falls
     back to manual entry. Both land on the same LOA screen. */
  if (status === "bill_uploaded" || status === "bill_extracted") {
    return <LoaSignStep setup={setup} onBack={onBack} />;
  }

  /* ─── Step 1: upload bill (genuine initial state only: null / "draft") ─── */
  return <BillUploadStep setup={setup} onBack={onBack} />;
}

/* ─── Step 1: bill upload (with AI OCR extraction) ─── */

function BillUploadStep({ setup, onBack }: { setup: TradelinePhoneSetup; onBack: () => void }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Surfaced when OCR couldn't read the bill but the upload still succeeded —
  // honest note, NOT a dead-end. The owner continues with manual entry.
  const [ocrNotice, setOcrNotice] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const fileBase64 = await fileToBase64(file);
      const contentType = file.type as "application/pdf" | "image/jpeg" | "image/png";

      // Wire the OCR (Wave 86): /extract-bill uploads the bill AND runs the
      // AI extraction in one call, advancing port_status to "bill_extracted"
      // and persisting port_extraction_json for the LOA step to pre-fill.
      //
      // Fail-open: if extraction fails (422) or errors, fall back to the
      // plain /upload-bill endpoint so the owner can still proceed by hand.
      try {
        await apiFetch<{ ok: true; setup: TradelinePhoneSetup }>(
          "/api/portal/tradeline/setup/port/extract-bill",
          { method: "POST", body: JSON.stringify({ fileBase64, contentType }) },
        );
        return { extracted: true as const };
      } catch (e) {
        const err = e as Error & { status?: number };
        // 422 = bill uploaded fine but OCR couldn't read it; the server has
        // already persisted the bill under port_status "bill_uploaded", so
        // we can advance straight to manual entry. Any other error means the
        // extract call didn't persist — retry via the plain upload endpoint.
        if (err.status === 422) {
          return {
            extracted: false as const,
            notice:
              "We couldn't auto-read your bill, so you'll enter a few details by hand on the next step. Your bill was still uploaded securely.",
          };
        }
        await apiFetch<{ setup: TradelinePhoneSetup }>(
          "/api/portal/tradeline/setup/port/upload-bill",
          { method: "POST", body: JSON.stringify({ fileBase64, contentType }) },
        );
        return {
          extracted: false as const,
          notice:
            "We saved your bill but couldn't auto-read it — you'll fill in a few details by hand on the next step.",
        };
      }
    },
    onSuccess: (r) => {
      if (!r.extracted && r.notice) setOcrNotice(r.notice);
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
          works best — our AI reads the carrier and account details so you don't have to retype them.
        </p>
      </div>

      {/* Drop zone is self-labelling ("Tap to choose a file") — the old
          "Phone bill" micro-label above it moved into the top-left help cue
          per the locked input rules. */}
      <div className="relative pl-5 space-y-0.5">
        <span className="absolute top-1 left-0">
          <FieldHelpCue label="Phone bill" help="A bill from the last 90 days for the number you're porting — it proves the number belongs to you. PDF, JPG, or PNG up to 5 MB." />
        </span>
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
              <Upload className="w-8 h-8 text-gray-400 mx-auto" />
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
        {ocrNotice && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {ocrNotice}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        <p className="font-medium text-gray-800 mb-1">Your bill is encrypted before storage.</p>
        We use AES-256-GCM with a key only we hold, and delete bills 90 days after your port resolves.
      </div>

      <Button
        onClick={() => submitMutation.mutate()}
        disabled={!file || submitMutation.isPending}
        className="w-full"
      >
        {submitMutation.isPending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reading your bill…</>
        ) : (
          <><Sparkles className="w-4 h-4 mr-2" /> Upload bill and continue</>
        )}
      </Button>
    </div>
  );
}

/* ─── Step 2: LOA signature (fields pre-filled from OCR when available) ─── */

function LoaSignStep({ setup, onBack }: { setup: TradelinePhoneSetup; onBack: () => void }) {
  const queryClient = useQueryClient();
  const padRef = useRef<SignaturePadHandle | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from the persisted OCR extraction (bill_extracted). When the
  // bill couldn't be read (bill_uploaded), these come back empty and the
  // owner fills them in — same fields either way, no separate code path.
  const ocr = extractionFromSetup(setup);
  const wasExtracted = setup.port_status === "bill_extracted";
  const [signerName, setSignerName] = useState(ocr.accountHolderName);
  const [businessName, setBusinessName] = useState(ocr.accountHolderName);
  const [accountNumber, setAccountNumber] = useState(ocr.accountNumber);
  const [currentCarrier, setCurrentCarrier] = useState(ocr.currentCarrier);
  const [phoneNumber, setPhoneNumber] = useState(ocr.phoneNumber);
  const [addressLine1, setAddressLine1] = useState(ocr.serviceAddressLine1);
  const [addressLine2, setAddressLine2] = useState(ocr.serviceAddressLine2);

  const signMutation = useMutation({
    mutationFn: async () => {
      if (!padRef.current || padRef.current.isEmpty()) throw new Error("Please sign before continuing.");
      if (!signerName.trim()) throw new Error("Please type your name.");
      if (!businessName.trim()) throw new Error("Please enter the business or account name.");
      const dataUrl = padRef.current.toDataURL();
      const signatureBase64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      return apiFetch<{ setup: TradelinePhoneSetup }>(
        "/api/portal/tradeline/setup/port/sign-loa",
        {
          method: "POST",
          body: JSON.stringify({
            signatureBase64,
            signerName: signerName.trim(),
            businessName: businessName.trim(),
            // The owner reviews/edits the OCR-extracted fields before signing;
            // the LOA PDF is rendered from exactly these confirmed values.
            confirmedFields: {
              accountHolderName: signerName.trim(),
              accountNumber: accountNumber.trim(),
              phoneNumber: phoneNumber.trim(),
              currentCarrier: currentCarrier.trim(),
              serviceAddressLine1: addressLine1.trim(),
              serviceAddressLine2: addressLine2.trim(),
            },
          }),
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline/setup"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <div data-theme="light" className="space-y-5">
      <BackLink onBack={onBack} />

      <div>
        <h2 className="text-xl font-bold text-gray-900">Confirm details and sign the LOA</h2>
        <p className="text-sm text-gray-600 mt-1">
          Your carrier needs your written consent to transfer your number. This is the LOA.
        </p>
      </div>

      {wasExtracted && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex items-start gap-2">
          <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
          <span>We pre-filled these from your bill. Please check each field and fix anything that's off before signing.</span>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-1">
        <p>
          <span className="font-semibold">You authorize WeFixTrades</span> to act on your behalf with your current carrier
          to port your phone number into the WeFixTrades / Twilio platform.
        </p>
        <p>Your existing number continues working normally during the transfer.</p>
      </div>

      <div className="space-y-0.5">
        <Field
          label="Full name (as on the bill)"
          value={signerName}
          onChange={setSignerName}
          autoComplete="name"
          help="Type your legal name exactly as it appears on the phone bill you uploaded."
          testid="optionc-signer-name-input"
        />
        <Field
          label="Business / account name"
          value={businessName}
          onChange={setBusinessName}
          autoComplete="organization"
          help="The name the carrier has on the account — often the same as your name for a personal line."
        />
        <Field
          label="Number being ported"
          value={phoneNumber}
          onChange={setPhoneNumber}
          autoComplete="tel"
          help="The phone number you want to bring to WeFixTrades, in full (e.g. +1 415 555 1234)."
        />
        <Field
          label="Current carrier"
          value={currentCarrier}
          onChange={setCurrentCarrier}
          help="The company you pay for this number today — e.g. Verizon, AT&T, Rogers."
        />
        <Field
          label="Account number"
          value={accountNumber}
          onChange={setAccountNumber}
          help="Your account number with the current carrier, as shown on the bill."
        />
        <Field
          label="Service address"
          value={addressLine1}
          onChange={setAddressLine1}
          autoComplete="address-line1"
          help="The street address on the bill for this number."
        />
        <Field
          label="City, state, ZIP"
          value={addressLine2}
          onChange={setAddressLine2}
          autoComplete="address-line2"
          help="The city, state/province, and postal code on the bill."
        />

        <div className="relative pl-5">
          <span className="absolute top-1 left-0">
            <FieldHelpCue label="Your signature" help="Draw your signature in the box with your finger or mouse — it goes on the Letter of Authorization." />
          </span>
          <SignaturePad ref={padRef} onChange={setHasInk} />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{error}</div>
      )}

      <Button
        onClick={() => signMutation.mutate()}
        disabled={signMutation.isPending || !hasInk || !signerName.trim() || !businessName.trim()}
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
  const [, setLocation] = useLocation();
  const ocr = extractionFromSetup(setup);
  const [businessName, setBusinessName] = useState(ocr.accountHolderName);
  const [authorizedSignerName, setAuthorizedSignerName] = useState(ocr.accountHolderName);
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
      // Submission flips port_status into a tracker state — invalidate so any
      // mounted setup query refetches, then send the owner to the live
      // tracker (single source of truth for the post-submit experience).
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline/setup"] });
      setLocation(PORT_STATUS_PAGE);
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <div data-theme="light" className="space-y-5">
      <BackLink onBack={onBack} />
      <div>
        <h2 className="text-xl font-bold text-gray-900">Submit your port</h2>
        <p className="text-sm text-gray-600 mt-1">
          One more set of details for Twilio's porting request.
        </p>
      </div>

      <div className="space-y-0.5">
        <Field
          label="Business name (as on the bill)"
          value={businessName}
          onChange={setBusinessName}
          autoComplete="organization"
          help="Your company name exactly as the carrier has it on the bill."
        />
        <Field
          label="Authorized signer"
          value={authorizedSignerName}
          onChange={setAuthorizedSignerName}
          autoComplete="name"
          help="The person allowed to approve the transfer — usually the account holder on the bill."
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

/* Thin wrapper over the canonical TitleInField (locked input rules) — keeps
 * the existing call sites while the label floats inside the field and the
 * help cue anchors top-left. */
function Field({ label, value, onChange, autoComplete, help, testid }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  help?: string;
  testid?: string;
}) {
  const id = `port-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  return (
    <TitleInField
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      autoComplete={autoComplete}
      help={help}
      testid={testid}
    />
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
