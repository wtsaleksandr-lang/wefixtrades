import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Star,
  Copy,
  Check,
  Save,
  Download,
  Shield,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { cn } from "@/lib/utils";
import {
  FieldGroupHeader,
  TitleInField,
  TitleInFieldSelect,
} from "./_shared";

/**
 * Review Link funnel — free-tools batch 2.
 *
 * /r/{slug} sends customers to a star-rating gate. Above the threshold they
 * go to Google / Facebook / Yelp; below it they leave private feedback.
 *
 * DS compliance (PR #692 audit): title-in-field + top-left help cue + 2px
 * input-cluster gaps + single .btn-primary-premium (Save changes).
 */

interface ReviewLinkResponse {
  slug: string;
  google_url: string | null;
  facebook_url: string | null;
  yelp_url: string | null;
  threshold: number;
  heading: string | null;
  widgetToken: string;
  publicUrl: string;
}

interface FeedbackEvent {
  id: string;
  rating: number | null;
  feedback: string | null;
  visitor_ip: string | null;
  created_at: string;
}

interface StatsResponse {
  visits: number;
  routed: number;
  feedback: number;
  stars: Record<string, number>;
}

export default function ReviewLink() {
  usePageTitle("Review Link");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data } = useQuery<ReviewLinkResponse>({
    queryKey: ["/api/portal/free-tools/review-link"],
    queryFn: async () => {
      const r = await fetch("/api/portal/free-tools/review-link", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });

  const feedbackQuery = useQuery<{ items: FeedbackEvent[] }>({
    queryKey: ["/api/portal/free-tools/review-link/feedback"],
    queryFn: async () => {
      const r = await fetch("/api/portal/free-tools/review-link/feedback", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load feedback");
      return r.json();
    },
  });

  const statsQuery = useQuery<StatsResponse>({
    queryKey: ["/api/portal/free-tools/review-link/stats"],
    queryFn: async () => {
      const r = await fetch("/api/portal/free-tools/review-link/stats", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load stats");
      return r.json();
    },
  });

  const [slug, setSlug] = useState("");
  const [googleUrl, setGoogleUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [yelpUrl, setYelpUrl] = useState("");
  const [threshold, setThreshold] = useState(4);
  const [heading, setHeading] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!data) return;
    setSlug(data.slug);
    setGoogleUrl(data.google_url ?? "");
    setFacebookUrl(data.facebook_url ?? "");
    setYelpUrl(data.yelp_url ?? "");
    setThreshold(data.threshold);
    setHeading(data.heading ?? "");
  }, [data]);

  useCopilotForm({
    formLabel: "Review Link",
    fields: [
      { key: "slug", label: "Link slug (lowercase letters + dashes)", required: true },
      { key: "google_url", label: "Google review URL", required: false },
      { key: "facebook_url", label: "Facebook review URL", required: false },
      { key: "yelp_url", label: "Yelp review URL", required: false },
      { key: "heading", label: "Optional custom heading on the landing page", required: false },
    ],
    values: { slug, google_url: googleUrl, facebook_url: facebookUrl, yelp_url: yelpUrl, heading },
    onApply: (fills) => {
      for (const f of fills) {
        const v = String(f.value ?? "");
        if (f.field_key === "slug") setSlug(v);
        if (f.field_key === "google_url") setGoogleUrl(v);
        if (f.field_key === "facebook_url") setFacebookUrl(v);
        if (f.field_key === "yelp_url") setYelpUrl(v);
        if (f.field_key === "heading") setHeading(v);
      }
    },
    enabled: true,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/portal/free-tools/review-link", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          google_url: googleUrl || undefined,
          facebook_url: facebookUrl || undefined,
          yelp_url: yelpUrl || undefined,
          threshold,
          heading: heading || undefined,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Save failed");
      }
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Review link updated." });
      qc.invalidateQueries({ queryKey: ["/api/portal/free-tools/review-link"] });
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  const publicUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.protocol}//${window.location.host}/r/${slug}`;
  }, [slug]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast({ title: "Copied", description: "Link copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Select the link and copy manually.", variant: "destructive" });
    }
  };

  const downloadPdf = () => {
    window.open("/api/portal/free-tools/review-card.pdf", "_blank");
  };

  return (
    <PortalLayout
      breadcrumb={
        <span className="flex items-center gap-1.5">
          <Link href="/portal/free-tools" className="hover:text-brand-blue">Free Tools</Link>
          <span className="text-gray-400">/</span>
          <span>Review Link</span>
        </span>
      }
    >
      <div data-theme="light" className="space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-gray-900">Review Link</h1>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            A short, branded URL that asks customers for a star rating. Happy
            customers (≥ threshold) get sent to Google / Facebook / Yelp.
            Unhappy ones leave private feedback that lands here — not in public.
          </p>
        </header>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card data-testid="stat-visits">
            <CardContent className="p-4">
              <div className="text-xs font-medium text-gray-500 mb-1">Visits (this month)</div>
              <div className="text-2xl font-bold text-gray-900">{statsQuery.data?.visits ?? "—"}</div>
            </CardContent>
          </Card>
          <Card data-testid="stat-routed">
            <CardContent className="p-4">
              <div className="text-xs font-medium text-gray-500 mb-1">Routed to review</div>
              <div className="text-2xl font-bold text-green-600">{statsQuery.data?.routed ?? "—"}</div>
            </CardContent>
          </Card>
          <Card data-testid="stat-feedback">
            <CardContent className="p-4">
              <div className="text-xs font-medium text-gray-500 mb-1">Private feedback</div>
              <div className="text-2xl font-bold text-amber-600">{statsQuery.data?.feedback ?? "—"}</div>
            </CardContent>
          </Card>
          <Card data-testid="stat-stars">
            <CardContent className="p-4">
              <div className="text-xs font-medium text-gray-500 mb-1">Star distribution</div>
              <div className="flex items-end gap-1 h-8">
                {[1, 2, 3, 4, 5].map((n) => {
                  const count = statsQuery.data?.stars?.[String(n)] ?? 0;
                  const max = Math.max(1, ...(statsQuery.data ? [1, 2, 3, 4, 5].map(k => statsQuery.data!.stars[String(k)] ?? 0) : [1]));
                  const h = Math.max(2, Math.round((count / max) * 28));
                  return (
                    <div key={n} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="w-full bg-brand-blue/70 rounded-sm" style={{ height: `${h}px` }} title={`${n}★: ${count}`} />
                      <span className="text-[9px] text-gray-500">{n}★</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Editor */}
          <div className="lg:col-span-2 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Link settings"
                  help="The slug becomes /r/your-slug on your public review link. Set at least one external review URL (Google is recommended) and a star threshold for routing."
                />

                <div className="space-y-0.5">
                  <TitleInField
                    id="rl-slug"
                    label="Link slug"
                    value={slug}
                    onChange={(v) => setSlug(v.toLowerCase())}
                    placeholder="your-business"
                    required
                    help="Lowercase letters, digits, dashes (2-42 chars). Becomes /r/<slug>."
                  />
                  <TitleInField
                    id="rl-google"
                    label="Google review URL"
                    value={googleUrl}
                    onChange={setGoogleUrl}
                    placeholder="https://search.google.com/local/writereview?placeid=..."
                    help="Direct 'Write a review' link from your Google Business Profile."
                  />
                  <TitleInField
                    id="rl-fb"
                    label="Facebook review URL"
                    value={facebookUrl}
                    onChange={setFacebookUrl}
                    placeholder="https://www.facebook.com/yourpage/reviews"
                  />
                  <TitleInField
                    id="rl-yelp"
                    label="Yelp review URL"
                    value={yelpUrl}
                    onChange={setYelpUrl}
                    placeholder="https://www.yelp.com/writeareview/biz/..."
                  />

                  <div className="grid grid-cols-2 gap-0.5">
                    <TitleInFieldSelect
                      id="rl-threshold"
                      label="Star threshold"
                      value={threshold}
                      onChange={(v) => setThreshold(Number(v))}
                      help="Ratings at or above this go straight to your public review site. Below it lands in private feedback."
                    >
                      {[3, 4, 5].map((n) => (
                        <option key={n} value={n}>≥ {n} stars → external review</option>
                      ))}
                    </TitleInFieldSelect>
                    <TitleInField
                      id="rl-heading"
                      label="Custom heading (optional)"
                      value={heading}
                      onChange={setHeading}
                      placeholder="How was your experience?"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              {/* DS rule 4 — single .btn-primary-premium per page: Save. */}
              <Button
                type="button"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || !slug}
                className="btn-primary-premium"
                data-testid="review-link-save"
              >
                <Save className="w-4 h-4 mr-1.5" />
                {saveMut.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>

            {/* Feedback inbox */}
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Private feedback inbox"
                  help="Below-threshold ratings + freeform notes land here. They never go public — use them to follow up before the customer escalates."
                />
                {feedbackQuery.isLoading ? (
                  <p className="text-xs text-gray-500">Loading…</p>
                ) : !feedbackQuery.data?.items.length ? (
                  <p className="text-xs text-gray-500">No private feedback yet. When unhappy customers fill the form, you'll see their notes here.</p>
                ) : (
                  <ul className="space-y-2">
                    {feedbackQuery.data.items.map((row) => (
                      <li key={row.id} className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={cn(
                            "text-xs font-semibold px-1.5 py-0.5 rounded",
                            (row.rating ?? 0) >= 4 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700",
                          )}>
                            {row.rating ? `${row.rating}★` : "—"}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            {new Date(row.created_at).toLocaleString()}
                          </span>
                          {row.visitor_ip && <span className="text-[11px] text-gray-400 font-mono">{row.visitor_ip}</span>}
                        </div>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{row.feedback}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Your public link"
                  help="Hand this URL to customers — print it, text it, or stick it on an invoice."
                />
                <pre className="text-xs bg-slate-50 text-gray-800 p-3 rounded-md overflow-x-auto border border-gray-200">
                  <code>{publicUrl}</code>
                </pre>
                <Button
                  type="button"
                  onClick={handleCopy}
                  disabled={!slug}
                  variant="outline"
                  className="w-full"
                  data-testid="review-link-copy"
                >
                  {copied ? <><Check className="w-4 h-4 mr-1.5" />Copied</> : <><Copy className="w-4 h-4 mr-1.5" />Copy link</>}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Printable QR card"
                  help="Business-card-sized PDF with a QR pointing at your /r/ link. Hand it to customers after every job for the highest review-conversion rates."
                />
                <p className="text-xs text-gray-600">
                  Business-card-sized PDF (3.5×2 in) with your name and a QR
                  that links to <code>/r/{slug || "your-slug"}</code>. Hand them
                  out after every job.
                </p>
                <Button
                  type="button"
                  onClick={downloadPdf}
                  disabled={!slug}
                  variant="outline"
                  className="w-full"
                  data-testid="review-link-download-pdf"
                >
                  <Download className="w-4 h-4 mr-1.5" />
                  Download QR card
                </Button>
              </CardContent>
            </Card>

            <Card className="border-brand-blue/30 bg-brand-blue/5">
              <CardContent className="p-5">
                <div className="flex items-start gap-2 mb-1.5">
                  <Shield className="w-4 h-4 text-brand-blue mt-0.5" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-gray-900">Auto-respond to negatives?</h2>
                </div>
                <p className="text-xs text-gray-700 mb-3">
                  ReputationShield can reply to private feedback within minutes
                  using your tone, recover the customer, and bury the negative
                  before it goes public.
                </p>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/products/reputationshield">See ReputationShield</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
