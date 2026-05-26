/**
 * WebsiteConnectStep — Wave 33 shared onboarding step.
 *
 * Captures the customer's website URL and runs a tiny heuristic CMS
 * detector. Writes:
 *   { websiteUrl, cmsType }
 *
 * Used by RankFlow, WebCare, QuoteQuick (embed-detection). CMS detection
 * mirrors WebCareSetup.tsx `guessPlatformFromUrl` so the migration of
 * that wizard keeps existing behavior.
 */

import { Globe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WizardRenderContext } from "@/components/ui/visual-primitives";

export type CmsType = "wordpress" | "wix" | "squarespace" | "shopify" | "webflow" | "custom";

export type WebsiteConnectState = {
  websiteUrl?: string;
  cmsType?: CmsType;
};

const CMS_LABEL: Record<CmsType, string> = {
  wordpress: "WordPress",
  wix: "Wix",
  squarespace: "Squarespace",
  shopify: "Shopify",
  webflow: "Webflow",
  custom: "Custom / Other",
};

export function detectCms(url: string): CmsType {
  const u = url.toLowerCase();
  if (
    u.includes("wp-content") ||
    u.includes("wp-admin") ||
    u.endsWith(".wpengine.com") ||
    u.includes("wordpress.com")
  ) {
    return "wordpress";
  }
  if (u.includes("wix.com") || u.includes("wixsite.com")) return "wix";
  if (u.includes("squarespace.com")) return "squarespace";
  if (u.includes("shopify") || u.includes("myshopify.com")) return "shopify";
  if (u.includes("webflow.io") || u.includes("webflow.com")) return "webflow";
  return "custom";
}

export function WebsiteConnectStep({ state, setState }: WizardRenderContext) {
  const url = (state.websiteUrl as string | undefined) ?? "";
  const cms = (state.cmsType as CmsType | undefined) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <Label
          htmlFor="onboarding-website"
          className="flex items-center gap-1 text-xs"
        >
          <Globe className="h-3 w-3" aria-hidden="true" />
          Website URL
        </Label>
        <Input
          id="onboarding-website"
          type="url"
          value={url}
          onChange={(e) => {
            const next = e.target.value;
            const detected = next.length > 4 ? detectCms(next) : undefined;
            setState({ websiteUrl: next, cmsType: detected });
          }}
          placeholder="https://yourbusiness.com"
          data-testid="onboarding-website-url"
        />
      </div>
      {cms && (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid="onboarding-website-cms"
        >
          Detected platform: <span className="font-medium text-foreground">{CMS_LABEL[cms]}</span>
          {cms === "wordpress" && " — we'll offer our 1-click WordPress plugin."}
          {cms === "shopify" && " — connect via the Shopify app post-setup."}
        </p>
      )}
    </div>
  );
}

export function validateWebsiteConnect(state: Record<string, unknown>): string | null {
  const url = (state.websiteUrl as string | undefined) ?? "";
  if (url.trim().length < 4) return "Website URL is required.";
  if (!/^https?:\/\//i.test(url.trim())) {
    return "URL must start with http:// or https://";
  }
  return null;
}
