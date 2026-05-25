/**
 * BusinessAssetsList — portal "Business Assets" surface backed by the
 * `business_management` OAuth scope.
 *
 * Reads the list of Meta Business Manager accounts the connected
 * Facebook user admins from
 *   GET  /api/portal/socialsync/businesses
 * and POSTs the customer's Tech Provider acceptance to
 *   POST /api/portal/socialsync/tech-provider-attestation
 *
 * Renders nothing unless we have a connected Facebook account (looked up
 * via the existing /api/portal/socialsync-connections/facebook endpoint).
 * Read-only by design — Meta heavily restricts writes against Business
 * Manager assets, so this component is intentionally a list + a single
 * attestation action per row.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Building2, CheckCircle, Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface FacebookConnectionStatus {
  connected: boolean;
  status: string;
  external_page_id: string | null;
  external_account_id: string | null;
}

interface BusinessSummary {
  id: string;
  name: string;
  verification_status: string | null;
  primary_page: { id: string; name: string | null } | null;
  owned_ad_account_count: number;
  owned_page_count: number;
}

/**
 * Map Meta's verification_status enum to a friendlier label + badge
 * variant. Unknown / missing values render as a neutral "Unverified".
 */
function verificationBadge(status: string | null) {
  switch (status) {
    case "verified":
      return { label: "Verified", variant: "default" as const };
    case "pending":
    case "pending_submission":
    case "pending_need_more_info":
      return { label: "Pending verification", variant: "secondary" as const };
    case "rejected":
    case "revoked":
      return { label: "Verification rejected", variant: "destructive" as const };
    default:
      return { label: "Unverified", variant: "outline" as const };
  }
}

export default function BusinessAssetsList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: connection } = useQuery<FacebookConnectionStatus>({
    queryKey: ["/api/portal/socialsync-connections/facebook"],
  });

  const enabled = !!connection?.connected;

  const { data, isLoading, error } = useQuery<{ businesses: BusinessSummary[] }>({
    queryKey: ["/api/portal/socialsync/businesses"],
    enabled,
  });

  const attestMutation = useMutation({
    mutationFn: async (businessId: string) => {
      const res = await apiRequest("POST", "/api/portal/socialsync/tech-provider-attestation", {
        business_id: businessId,
        accepted: true,
        timestamp: new Date().toISOString(),
      });
      return res.json() as Promise<{ ok: boolean; business_name: string | null }>;
    },
    onSuccess: (resp) => {
      toast({
        title: "Tech Provider attestation recorded",
        description: resp.business_name
          ? `WeFixTrades is now logged as your Tech Provider for ${resp.business_name}.`
          : "Your acceptance has been logged.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/socialsync/businesses"] });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't record attestation",
        description: err?.message || "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  // No connected Facebook account → empty-state card so customers see
  // the right next step rather than a silently-empty section.
  if (!enabled) {
    return (
      <Card className="p-5" data-testid="business-assets-empty">
        <div className="flex items-start gap-3">
          <Building2 className="w-5 h-5 text-gray-300 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-700">Business Assets</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Connect a Facebook account that has Business Manager access to see your business assets here.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5" data-testid="business-assets-list">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#1877F2]" />
          <h3 className="text-sm font-semibold text-gray-900">Your Meta Business Assets</h3>
        </div>
        <span className="text-[10px] text-gray-400">Read-only</span>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        These are the Meta Business Manager accounts you currently admin. Setting one
        as your primary records a Tech Provider attestation so WeFixTrades can act on
        your behalf for that business.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your Business Manager accounts…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-700">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{(error as any)?.message || "Could not load Business Manager accounts from Facebook."}</span>
        </div>
      )}

      {!isLoading && !error && data && data.businesses.length === 0 && (
        <div className="text-xs text-gray-500 py-3">
          You don't admin any Meta Business Manager accounts yet. Create one in
          Meta Business Suite and re-connect Facebook to see it here.
        </div>
      )}

      {!isLoading && !error && data && data.businesses.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {data.businesses.map((b) => {
            const badge = verificationBadge(b.verification_status);
            const busy = attestMutation.isPending && attestMutation.variables === b.id;
            return (
              <li key={b.id} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate" title={b.name}>
                      {b.name || "(unnamed business)"}
                    </p>
                    <Badge variant={badge.variant} className="text-[10px]">
                      {badge.label}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {b.owned_page_count} owned page{b.owned_page_count === 1 ? "" : "s"}
                    {" · "}
                    {b.owned_ad_account_count} owned ad account{b.owned_ad_account_count === 1 ? "" : "s"}
                    {b.primary_page?.name ? (
                      <> · primary: <span className="text-gray-700">{b.primary_page.name}</span></>
                    ) : null}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Business ID: {b.id}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs whitespace-nowrap"
                  disabled={busy}
                  onClick={() => attestMutation.mutate(b.id)}
                  data-testid={`set-primary-${b.id}`}
                >
                  {busy ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3 h-3 mr-1" />
                  )}
                  Set as primary
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {attestMutation.isSuccess && (
        <div className="mt-3 flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-md p-3 text-xs text-emerald-700">
          <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Attestation recorded. WeFixTrades is logged as your Tech Provider.</span>
        </div>
      )}
    </Card>
  );
}
