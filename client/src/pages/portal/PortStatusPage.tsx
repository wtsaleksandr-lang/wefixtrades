/**
 * /portal/tradeline/port-status — Wave 86 Layer 7.
 *
 * Customer-facing live tracker for an in-flight number port. Polls
 * /api/portal/tradeline/setup/port/status every 30s, surfaces:
 *   - current status as a plain-English headline + timeline
 *   - estimated completion date
 *   - last update timestamp
 *   - rejection title + fix instructions when port_failed
 *   - "Resend status SMS" button
 *   - "Cancel port request" button (with confirmation modal)
 *
 * Theme-aware, semantic tokens only, 2px gaps. Mirrors the design rules
 * locked into DESIGN-SYSTEM.md.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PortalLayout from "@/components/portal/PortalLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  XCircle,
  Send,
  Clock,
} from "lucide-react";

interface PortStatusResponse {
  ok: true;
  port: {
    status: string | null;
    phoneNumber: string | null;
    submittedAt: string | null;
    targetDate: string | null;
    estimatedCompletion: string | null;
    lastPolledAt: string | null;
    twilioOrderSid: string | null;
    rejectionCode: string | null;
    rejectionReason: string | null;
    translation: {
      title: string;
      fixInstructions: string;
      customerFixable: boolean;
      category: string;
    } | null;
    canceledAt: string | null;
    canceledBy: string | null;
    resolvedAt: string | null;
  } | null;
}

/* ─── Headline + timeline label per status ─── */

const STATUS_META: Record<
  string,
  { headline: string; subhead: string; tone: "neutral" | "positive" | "warn" | "danger" | "info" }
> = {
  draft: {
    headline: "Port draft in progress",
    subhead: "Finish the wizard to submit your port request.",
    tone: "neutral",
  },
  bill_uploaded: {
    headline: "Bill received",
    subhead: "Confirm details and sign the LOA next.",
    tone: "info",
  },
  bill_extracted: {
    headline: "Bill scanned",
    subhead: "Review the extracted fields and sign the LOA.",
    tone: "info",
  },
  loa_signed: {
    headline: "LOA signed",
    subhead: "Ready to submit your port request to Twilio.",
    tone: "info",
  },
  submitted: {
    headline: "Port submitted to carrier",
    subhead: "Typical timeline is 7-14 business days. We'll update you at each milestone.",
    tone: "info",
  },
  pending_carrier_action: {
    headline: "Your current carrier is reviewing",
    subhead: "Account is in good standing. No action needed from you.",
    tone: "info",
  },
  pending_loa: {
    headline: "Quick action needed",
    subhead: "Twilio needs additional info. Check your email for the next step.",
    tone: "warn",
  },
  in_progress: {
    headline: "Port in progress",
    subhead: "Carrier processing is underway.",
    tone: "info",
  },
  approved: {
    headline: "Port approved",
    subhead: "Final activation in progress.",
    tone: "positive",
  },
  port_complete: {
    headline: "Port complete — your number is live!",
    subhead: "Try calling the number to test it.",
    tone: "positive",
  },
  rejected: {
    headline: "Port was not accepted",
    subhead: "Review the fix details below.",
    tone: "danger",
  },
  port_failed: {
    headline: "Port was not accepted",
    subhead: "Review the fix details below.",
    tone: "danger",
  },
  canceled: {
    headline: "Port canceled",
    subhead: "The port request has been canceled.",
    tone: "neutral",
  },
  test_submitted: {
    headline: "Test-mode submission",
    subhead: "Test mode is active — no real porting traffic was sent.",
    tone: "neutral",
  },
};

const TIMELINE_ORDER = [
  "bill_uploaded",
  "loa_signed",
  "submitted",
  "pending_carrier_action",
  "in_progress",
  "port_complete",
];

function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function formatDateShort(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

export default function PortStatusPage() {
  usePageTitle("Port Status — TradeLine");
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const statusQuery = useQuery<PortStatusResponse>({
    queryKey: ["/api/portal/tradeline/setup/port/status"],
    queryFn: async () => {
      const res = await fetch("/api/portal/tradeline/setup/port/status", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load port status");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const cancelMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal/tradeline/setup/port/cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Cancellation failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setConfirmCancel(false);
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline/setup/port/status"] });
    },
  });

  if (statusQuery.isLoading) {
    return (
      <PortalLayout>
        <div className="p-8 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading port status...
        </div>
      </PortalLayout>
    );
  }

  const port = statusQuery.data?.port;
  if (!port || !port.status) {
    return (
      <PortalLayout>
        <div className="p-8 max-w-3xl mx-auto">
          <Link href="/portal/tradeline/setup" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to TradeLine setup
          </Link>
          <Card className="mt-2 p-6">
            <h1 className="text-xl font-semibold">No port request on file</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              You haven't started porting an existing number yet. Start the wizard to keep your number on TradeLine.
            </p>
            <div className="mt-2">
              <Link href="/portal/tradeline/setup">
                <Button>Start port wizard</Button>
              </Link>
            </div>
          </Card>
        </div>
      </PortalLayout>
    );
  }

  const meta = STATUS_META[port.status] ?? STATUS_META.draft;
  const currentIdx = TIMELINE_ORDER.indexOf(port.status);
  const showCancel = ["bill_uploaded", "bill_extracted", "loa_signed", "submitted", "pending_carrier_action", "pending_loa", "in_progress"].includes(
    port.status,
  );

  return (
    <PortalLayout>
      <div className="p-8 max-w-3xl mx-auto space-y-2">
        <Link href="/portal/tradeline/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to TradeLine dashboard
        </Link>

        {/* Headline card */}
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <ToneIcon tone={meta.tone} />
            <div className="flex-1">
              <h1 className="text-xl font-semibold">{meta.headline}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{meta.subhead}</p>
              {port.phoneNumber && (
                <div className="mt-2 text-sm">
                  Number: <span className="font-medium">{port.phoneNumber}</span>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="mt-4 flex items-center gap-1">
            {TIMELINE_ORDER.map((s, i) => {
              const reached = currentIdx >= 0 && i <= currentIdx;
              const isCurrent = i === currentIdx;
              return (
                <div
                  key={s}
                  className={`flex-1 h-1 rounded-full ${
                    reached ? "bg-primary" : "bg-muted"
                  } ${isCurrent ? "opacity-100" : "opacity-90"}`}
                  aria-label={s}
                />
              );
            })}
          </div>

          {/* Fact grid */}
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <Fact label="Submitted" value={formatDateShort(port.submittedAt)} />
            <Fact label="Target completion" value={formatDateShort(port.estimatedCompletion)} />
            <Fact label="Last update" value={formatDate(port.lastPolledAt)} />
            <Fact label="Reference" value={port.twilioOrderSid || port.phoneNumber || "—"} />
          </div>
        </Card>

        {/* Rejection details (port_failed) */}
        {(port.status === "port_failed" || port.status === "rejected") && port.translation && (
          <Card className="p-6 border-l-4 border-l-destructive">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <h2 className="font-semibold">{port.translation.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {port.translation.fixInstructions}
                </p>
                {port.translation.customerFixable && (
                  <div className="mt-2">
                    <Link href="/portal/tradeline/setup">
                      <Button size="sm">Resubmit port</Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Actions */}
        <Card className="p-6">
          <h2 className="font-semibold">Actions</h2>
          <div className="mt-2 flex flex-col gap-2">
            <Link href="/portal/tradeline/dashboard">
              <Button variant="outline" size="sm">
                <Send className="h-4 w-4 mr-1" />
                Back to dashboard
              </Button>
            </Link>
            {showCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmCancel(true)}
                disabled={cancelMut.isPending}
                data-testid="cancel-port"
              >
                <XCircle className="h-4 w-4 mr-1" />
                Cancel port request
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            <Clock className="inline h-3 w-3 mr-1" />
            Updates run every 4 hours; this page refreshes every 30 seconds.
          </p>
        </Card>

        {/* Confirm cancel modal */}
        {confirmCancel && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          >
            <Card className="p-6 max-w-md w-full">
              <h3 className="font-semibold">Cancel port request?</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Once submitted to your carrier, cancellation has a limited window. After cancellation you can restart the port wizard at any time.
              </p>
              {cancelMut.isError && (
                <p className="mt-2 text-sm text-destructive">
                  {(cancelMut.error as Error)?.message || "Cancellation failed"}
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmCancel(false)}
                  disabled={cancelMut.isPending}
                >
                  Keep request
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => cancelMut.mutate()}
                  disabled={cancelMut.isPending}
                >
                  {cancelMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Cancel port"
                  )}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function ToneIcon({ tone }: { tone: "neutral" | "positive" | "warn" | "danger" | "info" }) {
  if (tone === "positive") return <CheckCircle2 className="h-6 w-6 text-success" aria-hidden />;
  if (tone === "danger") return <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />;
  if (tone === "warn") return <AlertTriangle className="h-6 w-6 text-warning" aria-hidden />;
  if (tone === "info") return <Loader2 className="h-6 w-6 text-primary animate-spin" aria-hidden />;
  return <Clock className="h-6 w-6 text-muted-foreground" aria-hidden />;
}
