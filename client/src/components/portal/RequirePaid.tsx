import { Link } from "wouter";
import { ArrowRight, Lock, Sparkles } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useIsPaid } from "@/hooks/useIsPaid";
import { usePageTitle } from "@/hooks/usePageTitle";

/**
 * RequirePaid — DRY paid-feature gate for the /portal/free-tools/* toolbox.
 *
 * The embeddable widget suite + premium tools are a PAID perk. This wrapper:
 *   • shows a quiet loading state while the account tier resolves,
 *   • renders the tool unchanged for PAID accounts (current behavior),
 *   • renders a clean "upgrade to unlock" upsell for FREE accounts, with the
 *     tool's name, an Upgrade CTA → /portal/billing, and a back-to-tools link.
 *
 * FAIL-SAFE: useIsPaid() defaults to NOT paid on loading-error/malformed
 * responses, so an undetermined tier LOCKS the tool rather than leaking it.
 *
 * The free-tools INDEX is intentionally NOT wrapped — free users browse the
 * catalog (locked cards) there to drive conversion; only the individual tool
 * routes are gated.
 */
export default function RequirePaid({
  toolName,
  children,
}: {
  /** Human-readable tool name shown in the upsell ("AI Review Responder"). */
  toolName: string;
  children: React.ReactNode;
}) {
  const { isPaid, isLoading } = useIsPaid();

  /* Set a per-route browser-tab title for EVERY state (loading / paywalled /
   * paid) so the tab never falls back to the generic site default. For paid
   * accounts the tool itself mounts and may call usePageTitle() with a more
   * specific title, which simply overrides this one. */
  usePageTitle(toolName);

  if (isLoading) {
    return (
      <PortalLayout breadcrumb="Free Tools">
        <div data-theme="light" className="qq-paper-surface flex justify-center py-16">
          <Card className="h-20 w-full max-w-md animate-pulse" data-testid="free-tool-gate-loading">
            <CardContent className="flex h-full items-center justify-center p-4">
              <p className="text-xs text-gray-500">Checking your plan…</p>
            </CardContent>
          </Card>
        </div>
      </PortalLayout>
    );
  }

  if (isPaid) {
    return <>{children}</>;
  }

  // Free account → upgrade gate (the tool itself is never rendered).
  return (
    <PortalLayout breadcrumb="Free Tools">
      <div data-theme="light" className="qq-paper-surface flex justify-center py-12">
        <Card className="w-full max-w-lg" data-testid="free-tool-gate-upsell">
          <CardContent className="flex flex-col items-center p-8 text-center">
            <span
              style={{ width: 48, height: 48 }}
              className="mb-4 flex items-center justify-center rounded-full bg-amber-50"
              aria-hidden="true"
            >
              <Lock className="h-5 w-5 text-amber-600" />
            </span>
            <h1 className="mb-2 text-xl font-bold text-gray-900">
              {toolName} is a paid feature
            </h1>
            <p className="mb-6 max-w-sm text-sm text-gray-600">
              Upgrade to any paid plan to unlock the full toolbox — every
              embeddable widget and premium tool, ready to drop into your site.
            </p>
            <Button asChild className="btn-primary-premium w-full max-w-xs">
              <Link href="/portal/billing" data-testid="free-tool-gate-upgrade-cta">
                <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Upgrade to unlock
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Link
              href="/portal/free-tools"
              className="mt-4 text-sm text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
              data-testid="free-tool-gate-back"
            >
              Back to all tools
            </Link>
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
