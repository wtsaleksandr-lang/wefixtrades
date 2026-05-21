/**
 * Onboarding form for the chat widget install service.
 *
 * Mounted at /portal/tradeline/chat-widget/install-onboarding?id={requestId}.
 *
 * Captures: website URL, platform, access method, widget position,
 * greeting message, excluded pages. Submits to:
 *   POST /api/portal/tradeline/chat-widget/install/:id/form
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import PortalLayout from "@/components/portal/PortalLayout";
import BackButton from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2 } from "lucide-react";

const PLATFORMS = [
  { value: "wordpress", label: "WordPress" },
  { value: "wix", label: "Wix" },
  { value: "squarespace", label: "Squarespace" },
  { value: "shopify", label: "Shopify" },
  { value: "custom", label: "Custom (HTML / other)" },
  { value: "unknown", label: "I'm not sure" },
];

const POSITIONS = [
  { value: "bottom-right", label: "Bottom-right (default)" },
  { value: "bottom-left", label: "Bottom-left" },
  { value: "floating", label: "Floating button (no anchor)" },
];

const ACCESS_OPTIONS = [
  { value: "credentials", label: "I'll share login credentials securely" },
  { value: "collaborator", label: "I'll add your email as a site collaborator/admin" },
  { value: "other", label: "Other — I'll explain in notes" },
];

interface InstallRequest {
  id: number;
  status: string;
  website_url: string | null;
  website_platform: string | null;
  access_method: string | null;
  access_credentials_encrypted: string | null;
  widget_position: string | null;
  greeting_message: string | null;
  excluded_pages: string[] | null;
  customer_notes: string | null;
  paid_at: string | null;
  is_pro_at_request: number;
}

export default function ChatWidgetInstallOnboarding() {
  usePageTitle("Install widget — onboarding");
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const justPaid = params.get("paid") === "1";

  const detail = useQuery<InstallRequest>({
    queryKey: [`/api/portal/tradeline/chat-widget/install/${id}`],
    queryFn: () =>
      fetch(`/api/portal/tradeline/chat-widget/install/${id}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!id,
  });

  const [websiteUrl, setWebsiteUrl] = useState("");
  const [platform, setPlatform] = useState("wordpress");
  const [accessMethod, setAccessMethod] = useState("collaborator");
  const [accessCredentials, setAccessCredentials] = useState("");
  const [position, setPosition] = useState("bottom-right");
  const [greeting, setGreeting] = useState("");
  const [excludedRaw, setExcludedRaw] = useState("");
  const [notes, setNotes] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      const excluded = excludedRaw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch(`/api/portal/tradeline/chat-widget/install/${id}/form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          website_url: websiteUrl.trim(),
          website_platform: platform,
          access_method: accessMethod,
          access_credentials_encrypted: accessMethod === "credentials" ? accessCredentials : undefined,
          widget_position: position,
          greeting_message: greeting.trim() || undefined,
          excluded_pages: excluded.length ? excluded : undefined,
          customer_notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to submit form");
      return res.json();
    },
    onSuccess: () => {
      setLocation("/portal");
    },
  });

  if (!id) {
    return (
      <PortalLayout>
        <div className="max-w-3xl mx-auto p-6 text-sm text-rose-700">No install request id in URL.</div>
      </PortalLayout>
    );
  }

  if (detail.isLoading) {
    return (
      <PortalLayout>
        <div className="max-w-3xl mx-auto p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-96" />
        </div>
      </PortalLayout>
    );
  }

  if (!detail.data) {
    return (
      <PortalLayout>
        <div className="max-w-3xl mx-auto p-6 text-sm text-rose-700">Couldn't load the install request.</div>
      </PortalLayout>
    );
  }

  if (detail.data.status === "form_submitted" || detail.data.status === "in_progress" || detail.data.status === "completed") {
    return (
      <PortalLayout>
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          <Card className="p-5 border-emerald-200 bg-emerald-50">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Form submitted</h3>
                <p className="text-sm text-gray-700">
                  We're on it. Status: <strong>{detail.data.status}</strong>. We'll email you within 1 business day with
                  the install confirmation.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
        <BackButton to="/portal/tradeline/chat-widget/install" label="Back" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tell us about your site</h1>
          <p className="text-sm text-gray-600 mt-1">
            {justPaid
              ? "Thanks — payment received. A few quick details and we'll handle the rest."
              : detail.data.is_pro_at_request === 1
                ? "Pro tier — your install is free. Fill these in and we'll get to work."
                : "Onboarding form for your chat widget install."}
          </p>
        </div>

        <Card className="p-5 space-y-5">
          <div>
            <Label htmlFor="website_url">Website URL</Label>
            <Input
              id="website_url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://yourcompany.com"
            />
          </div>

          <div>
            <Label>Website platform</Label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <Label>How will we get access?</Label>
            <div className="space-y-2 mt-1">
              {ACCESS_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="access"
                    value={o.value}
                    checked={accessMethod === o.value}
                    onChange={() => setAccessMethod(o.value)}
                    className="mt-1"
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
            {accessMethod === "credentials" && (
              <Textarea
                placeholder="Login URL, username, password — we encrypt at rest"
                value={accessCredentials}
                onChange={(e) => setAccessCredentials(e.target.value)}
                rows={3}
                className="mt-2 text-sm font-mono"
              />
            )}
            {accessMethod === "collaborator" && (
              <p className="text-xs text-gray-500 mt-2">
                We'll send you the email address to add as a collaborator/admin once you submit this form.
              </p>
            )}
          </div>

          <div>
            <Label>Widget position</Label>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {POSITIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="greeting">Greeting message (optional)</Label>
            <Input
              id="greeting"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="Hi there — how can we help with your project?"
            />
          </div>

          <div>
            <Label htmlFor="excluded">Pages to exclude (optional, one per line)</Label>
            <Textarea
              id="excluded"
              value={excludedRaw}
              onChange={(e) => setExcludedRaw(e.target.value)}
              placeholder={"/checkout\n/login\n/admin/*"}
              rows={3}
              className="text-sm font-mono"
            />
          </div>

          <div>
            <Label htmlFor="notes">Anything else we should know?</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <Button
            type="button"
            onClick={() => submit.mutate()}
            disabled={submit.isPending || !websiteUrl.trim()}
            className="w-full sm:w-auto"
          >
            {submit.isPending ? "Submitting…" : "Submit — we'll install within 1 business day"}
          </Button>
          {submit.error && <p className="text-xs text-rose-700">{(submit.error as Error).message}</p>}
        </Card>
      </div>
    </PortalLayout>
  );
}
