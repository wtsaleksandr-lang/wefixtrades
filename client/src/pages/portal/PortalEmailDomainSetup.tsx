/**
 * Pro-tier portal page for claiming + verifying a custom email sender domain.
 *
 * Mounted at /portal/tradeline/email-domain/setup.
 *
 * Starter tier sees a Pro-upsell card with an explainer of what the
 * upgrade unlocks. Pro tier (or trial-active) sees the claim/verify flow.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useCopilotForm } from "@/context/CopilotFormContext";
import PortalLayout from "@/components/portal/PortalLayout";
import BackButton from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, AlertCircle, Sparkles, Copy, RotateCw, Trash2 } from "lucide-react";

interface DnsRecord {
  type: string;
  host: string;
  value: string;
  purpose: string;
}

interface StateResponse {
  proAccess: boolean;
  identity: {
    displayName: string;
    customDomain: string | null;
    customDomainVerifiedAt: string | null;
    sendingMethod: "wefixtrades_subdomain" | "custom_domain";
    lastVerifyAttemptAt: string | null;
    lastVerifyError: string | null;
  };
  requiredRecords: DnsRecord[] | null;
}

interface VerifyResponse {
  result: {
    domain: string;
    spf: { ok: boolean; details: string };
    dkim: { ok: boolean; details: string };
    dmarc: { ok: boolean; details: string };
    allPassed: boolean;
  };
  requiredRecords: DnsRecord[];
}

export default function PortalEmailDomainSetup() {
  usePageTitle("Email sender domain");
  const queryClient = useQueryClient();
  const [domainInput, setDomainInput] = useState("");
  const [displayInput, setDisplayInput] = useState("");
  const [latestVerify, setLatestVerify] = useState<VerifyResponse["result"] | null>(null);

  const state = useQuery<StateResponse>({
    queryKey: ["/api/portal/email-domain"],
    queryFn: () => fetch("/api/portal/email-domain", { credentials: "include" }).then((r) => r.json()),
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal/email-domain/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ domain: domainInput.trim(), displayName: displayInput.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save domain");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/email-domain"] });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (): Promise<VerifyResponse> => {
      const res = await fetch("/api/portal/email-domain/verify", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Verification failed");
      return res.json();
    },
    onSuccess: (data) => {
      setLatestVerify(data.result);
      queryClient.invalidateQueries({ queryKey: ["/api/portal/email-domain"] });
    },
  });

  const revertMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal/email-domain", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to revert");
      return res.json();
    },
    onSuccess: () => {
      setLatestVerify(null);
      setDomainInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/portal/email-domain"] });
    },
  });

  /* Phase 1c: register the claim-domain form with the copilot. Only enabled
   * when the claim flow is actually visible (Pro tier, no domain claimed
   * yet) — the same condition that renders the Domain / Display name inputs. */
  const claimFlowVisible = !!state.data?.proAccess && !state.data?.identity.customDomain;
  useCopilotForm({
    formLabel: "Email sender domain",
    fields: [
      { key: "domain", label: "Custom domain (e.g. joesplumbing.com)", required: true },
      { key: "displayName", label: "Display name (optional)" },
    ],
    values: { domain: domainInput, displayName: displayInput },
    onApply: (fills) => {
      for (const f of fills) {
        if (f.field_key === "domain") setDomainInput(f.value);
        else if (f.field_key === "displayName") setDisplayInput(f.value);
      }
    },
    enabled: claimFlowVisible,
  });

  if (state.isLoading) {
    return (
      <PortalLayout>
        <div className="max-w-3xl mx-auto p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64" />
        </div>
      </PortalLayout>
    );
  }

  if (!state.data) {
    return (
      <PortalLayout>
        <div className="max-w-3xl mx-auto p-6 text-sm text-rose-700">Couldn't load settings. Try refreshing.</div>
      </PortalLayout>
    );
  }

  const { proAccess, identity, requiredRecords } = state.data;

  return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        <BackButton to="/portal/settings" label="Back to settings" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email sender domain</h1>
          <p className="text-sm text-gray-600 mt-1">
            Choose what customers see in the "from" field of every email we send on your behalf.
          </p>
        </div>

        {/* Current state */}
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Current setup</p>
              <p className="text-sm text-gray-900">
                <span className="font-semibold">{identity.displayName}</span>{" "}
                <span className="text-gray-500">
                  &lt;{identity.sendingMethod === "custom_domain" && identity.customDomain
                    ? `hello@${identity.customDomain}`
                    : `${identity.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "")}@em.wefixtrades.com`}&gt;
                </span>
              </p>
            </div>
            {identity.sendingMethod === "custom_domain" && identity.customDomainVerifiedAt && (
              <Badge variant="outline" className="bg-emerald-50 border-emerald-200 text-emerald-800">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
              </Badge>
            )}
          </div>
        </Card>

        {/* Starter tier: Pro upsell card */}
        {!proAccess && (
          <Card className="p-5 border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">Custom domain is a Pro feature</h3>
                <p className="text-sm text-gray-700 mb-3">
                  Send emails from your own domain instead of <code>em.wefixtrades.com</code>. Customers see emails from
                  you directly, improving open rates and brand recognition. Pro tier unlocks this plus advanced AI
                  training, in-chat Stripe payments, and social DM channels.
                </p>
                <Button asChild variant="default" size="sm">
                  <a href="/pricing">Upgrade to Pro</a>
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Pro tier: claim flow */}
        {proAccess && !identity.customDomain && (
          <Card className="p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">Claim your own domain</h3>
              <p className="text-sm text-gray-600">
                Enter a domain you own (e.g. <code>joesplumbing.com</code>). We'll show you the DNS records to add at
                your registrar.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1 block">Domain</label>
                <Input
                  type="text"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="joesplumbing.com"
                  className="text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1 block">
                  Display name (optional)
                </label>
                <Input
                  type="text"
                  value={displayInput}
                  onChange={(e) => setDisplayInput(e.target.value)}
                  placeholder={identity.displayName}
                  className="text-sm"
                />
              </div>
            </div>
            <Button
              type="button"
              onClick={() => claimMutation.mutate()}
              disabled={claimMutation.isPending || !domainInput.trim()}
              className="w-full sm:w-auto"
            >
              {claimMutation.isPending ? "Saving…" : "Save and see DNS records"}
            </Button>
            {claimMutation.error && (
              <p className="text-xs text-rose-700">{(claimMutation.error as Error).message}</p>
            )}
          </Card>
        )}

        {/* Pro tier: DNS records + verify */}
        {proAccess && identity.customDomain && requiredRecords && (
          <Card className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">DNS records for {identity.customDomain}</h3>
                <p className="text-xs text-gray-600">
                  Add these TXT records at your domain registrar (GoDaddy, Cloudflare, Namecheap, etc.). After they
                  propagate (usually a few minutes), click <strong>Verify now</strong>.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => revertMutation.mutate()}
                disabled={revertMutation.isPending}
                title="Stop using this domain — revert to em.wefixtrades.com"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Revert
              </Button>
            </div>

            <div className="space-y-3">
              {requiredRecords.map((r) => (
                <DnsRecordRow key={r.host} record={r} />
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <div className="text-xs text-gray-500">
                {identity.lastVerifyAttemptAt
                  ? `Last checked ${new Date(identity.lastVerifyAttemptAt).toLocaleString()}`
                  : "Not yet verified"}
              </div>
              <Button
                type="button"
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
              >
                {verifyMutation.isPending ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 mr-1 animate-spin" /> Checking DNS…
                  </>
                ) : (
                  <>
                    <RotateCw className="w-3.5 h-3.5 mr-1" /> Verify now
                  </>
                )}
              </Button>
            </div>

            {(latestVerify || identity.lastVerifyError) && (
              <VerifyResult result={latestVerify} fallbackError={identity.lastVerifyError} />
            )}
          </Card>
        )}
      </div>
    </PortalLayout>
  );
}

function DnsRecordRow({ record }: { record: DnsRecord }) {
  const [copied, setCopied] = useState<"host" | "value" | null>(null);
  async function copy(text: string, which: "host" | "value") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }
  return (
    <div data-theme="light" className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px]">{record.type}</Badge>
        <span className="text-xs text-gray-600">{record.purpose}</span>
      </div>
      <div className="grid grid-cols-[80px_1fr_auto] gap-2 items-center text-xs">
        <span className="text-gray-500 uppercase tracking-wide">Host</span>
        <code className="font-mono bg-white border border-gray-200 px-2 py-1 rounded break-all">{record.host}</code>
        <Button variant="ghost" size="sm" onClick={() => copy(record.host, "host")}>
          {copied === "host" ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
        </Button>
      </div>
      <div className="grid grid-cols-[80px_1fr_auto] gap-2 items-center text-xs">
        <span className="text-gray-500 uppercase tracking-wide">Value</span>
        <code className="font-mono bg-white border border-gray-200 px-2 py-1 rounded break-all">{record.value}</code>
        <Button variant="ghost" size="sm" onClick={() => copy(record.value, "value")}>
          {copied === "value" ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  );
}

function VerifyResult({
  result,
  fallbackError,
}: {
  result: VerifyResponse["result"] | null;
  fallbackError: string | null;
}) {
  if (!result && fallbackError) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs whitespace-pre-line text-rose-900">
        {fallbackError}
      </div>
    );
  }
  if (!result) return null;

  return (
    <div className={`rounded-lg border p-3 space-y-1.5 text-xs ${result.allPassed ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
      <Row label="SPF" check={result.spf} />
      <Row label="DKIM" check={result.dkim} />
      <Row label="DMARC" check={result.dmarc} />
      {result.allPassed && (
        <div className="pt-2 text-emerald-900 font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
          All checks passed — your custom domain is now active.
        </div>
      )}
    </div>
  );
}

function Row({ label, check }: { label: string; check: { ok: boolean; details: string } }) {
  return (
    <div className="flex items-start gap-2">
      {check.ok ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0 mt-0.5" />
      )}
      <div>
        <span className="font-semibold">{label}:</span>{" "}
        <span className={check.ok ? "text-emerald-900" : "text-rose-900"}>{check.details}</span>
      </div>
    </div>
  );
}
