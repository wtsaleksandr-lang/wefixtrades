/**
 * Wave 25 — SocialSync pixel-accurate platform previews.
 *
 * Competitive research surfaced that Hootsuite is the only SMM tool with
 * pixel-accurate platform-specific previews. Buffer / Later / Sprout / Vista
 * show a single generic card. ContentFlow generates AI captions + images so
 * trust requires customers see exactly what each channel will render before
 * approve.
 *
 * Four chrome simulations, all rendered from the post payload alone — no
 * live OAuth fetch, no profile-image API calls. The "preview" is structural
 * fidelity (headline UI elements + crop overlays), not a screenshot.
 *
 * Each preview replicates:
 *  - Facebook: blue header band w/ profile + timestamp + ellipsis menu;
 *    image fills width; caption below w/ "See more" truncation hint.
 *  - Instagram: square crop dominant; caption truncated to 125 chars on
 *    first view, with "...more" hint; like/comment/share icon row.
 *  - LinkedIn: white card with logo + role line; 1.91:1 image crop; "...see
 *    more" expander; reaction bar.
 *  - WhatsApp: green-tinted Business-profile message bubble; status row;
 *    image with caption beneath; delivered-ticks indicator.
 *
 * Danger-zone overlays show where each platform crops images:
 *  - Facebook: minor right/left crop on feed.
 *  - Instagram: square 1:1 (the BIG one).
 *  - LinkedIn: 1.91:1 horizontal.
 *  - WhatsApp: no crop, but max 1600px wide for inline preview.
 *
 * Tabs at top switch focus on mobile (stacked single-column under 768px),
 * side-by-side on desktop.
 *
 * Used by:
 *   - The new-post composer (parent passes the in-progress payload).
 *   - The approval inbox detail pane (parent passes the pending post).
 */

import { useMemo, useState } from "react";
import {
  Heart,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share,
  ThumbsUp,
  CheckCheck,
  Bookmark,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PLATFORMS, type SocialPlatformId } from "./platforms";

export interface PlatformPreviewPost {
  /** Caption / post body. */
  text: string;
  /** Optional image URL. If omitted, image-shaped chrome is skipped. */
  imageUrl?: string | null;
  /** Optional hashtags (without leading #). */
  hashtags?: string[] | null;
  /** Optional business handle / page name shown in the chrome header. */
  businessName?: string;
}

export interface PlatformPreviewProps {
  post: PlatformPreviewPost;
  /** Force a single platform; otherwise renders all four side-by-side. */
  focus?: SocialPlatformId;
  /** Show the danger-zone crop overlays. Defaults true. */
  showCropOverlays?: boolean;
  className?: string;
}

/* ─── chrome subcomponents ───────────────────────────────────────────── */

function ChromeShell({
  platformId,
  children,
  focused,
  onClick,
}: {
  platformId: SocialPlatformId;
  children: React.ReactNode;
  focused?: boolean;
  onClick?: () => void;
}) {
  const platform = PLATFORMS.find((p) => p.id === platformId)!;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-lg border bg-card text-left text-card-foreground shadow-sm transition-colors",
        focused
          ? "ring-2 ring-[color:hsl(var(--chart-1))] ring-inset"
          : "ring-1 ring-[color:var(--border)]",
      )}
      data-testid={`platform-preview-${platformId}`}
      data-platform={platformId}
      aria-label={`${platform.label} preview`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[color:var(--border)] bg-muted/40 px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ background: platform.color }}
            aria-hidden="true"
          />
          {platform.label}
        </span>
        <span className="text-[10px]">Preview</span>
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </button>
  );
}

function CropOverlay({ aspect, label }: { aspect: string; label: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-end justify-end p-1"
      aria-hidden="true"
    >
      <span className="rounded bg-background/70 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground ring-1 ring-[color:var(--border)]">
        {aspect} {label}
      </span>
    </div>
  );
}

/* ─── per-platform chrome ────────────────────────────────────────────── */

function FacebookPreview({
  post,
  showCrop,
  focused,
  onClick,
}: {
  post: PlatformPreviewPost;
  showCrop: boolean;
  focused?: boolean;
  onClick?: () => void;
}) {
  return (
    <ChromeShell platformId="facebook" focused={focused} onClick={onClick}>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="inline-block h-8 w-8 rounded-full bg-[rgb(24,119,242)]/15 ring-1 ring-[color:var(--border)]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">
            {post.businessName || "Your Business"}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Just now · <Globe className="h-3 w-3" />
          </span>
        </span>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="px-3 pb-2 text-sm leading-snug text-foreground">
        {truncate(post.text, 220)}
        {post.text.length > 220 ? (
          <span className="ml-1 text-muted-foreground">See more</span>
        ) : null}
      </p>
      {post.imageUrl ? (
        <div className="relative aspect-[16/9] w-full bg-muted">
          <img
            src={post.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {showCrop ? <CropOverlay aspect="16:9" label="feed" /> : null}
        </div>
      ) : null}
      <div className="flex items-center justify-around border-t border-[color:var(--border)] px-3 py-1.5 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <ThumbsUp className="h-3.5 w-3.5" /> Like
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="h-3.5 w-3.5" /> Comment
        </span>
        <span className="inline-flex items-center gap-1">
          <Share className="h-3.5 w-3.5" /> Share
        </span>
      </div>
    </ChromeShell>
  );
}

function InstagramPreview({
  post,
  showCrop,
  focused,
  onClick,
}: {
  post: PlatformPreviewPost;
  showCrop: boolean;
  focused?: boolean;
  onClick?: () => void;
}) {
  const captionFirstView = truncate(post.text, 125);
  return (
    <ChromeShell platformId="instagram" focused={focused} onClick={onClick}>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="inline-block h-8 w-8 rounded-full bg-gradient-to-br from-[rgb(225,48,108)]/30 to-[rgb(252,176,69)]/30 ring-1 ring-[color:var(--border)]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-foreground">
            {post.businessName || "your.business"}
          </span>
        </span>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>
      {post.imageUrl ? (
        <div className="relative aspect-square w-full bg-muted">
          <img
            src={post.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {showCrop ? <CropOverlay aspect="1:1" label="square crop" /> : null}
        </div>
      ) : (
        <div className="aspect-square w-full bg-muted/60" />
      )}
      <div className="flex items-center gap-3 px-3 py-1.5 text-foreground">
        <Heart className="h-4 w-4" />
        <MessageCircle className="h-4 w-4" />
        <Send className="h-4 w-4" />
        <Bookmark className="ml-auto h-4 w-4" />
      </div>
      <p className="px-3 pb-2 text-[13px] leading-snug text-foreground">
        <span className="font-semibold">
          {post.businessName || "your.business"}{" "}
        </span>
        {captionFirstView}
        {post.text.length > 125 ? (
          <span className="ml-1 text-muted-foreground">...more</span>
        ) : null}
      </p>
    </ChromeShell>
  );
}

function LinkedInPreview({
  post,
  showCrop,
  focused,
  onClick,
}: {
  post: PlatformPreviewPost;
  showCrop: boolean;
  focused?: boolean;
  onClick?: () => void;
}) {
  return (
    <ChromeShell platformId="linkedin" focused={focused} onClick={onClick}>
      <div className="flex items-start gap-2 px-3 py-2">
        <span className="inline-block h-8 w-8 rounded bg-[rgb(10,102,194)]/15 ring-1 ring-[color:var(--border)]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-foreground">
            {post.businessName || "Your Business"}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            Local trades business · Just now
          </span>
        </span>
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="px-3 pb-2 text-[13px] leading-snug text-foreground">
        {truncate(post.text, 210)}
        {post.text.length > 210 ? (
          <span className="ml-1 text-muted-foreground">…see more</span>
        ) : null}
      </p>
      {post.imageUrl ? (
        <div className="relative aspect-[1.91/1] w-full bg-muted">
          <img
            src={post.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {showCrop ? <CropOverlay aspect="1.91:1" label="landscape" /> : null}
        </div>
      ) : null}
      <div className="flex items-center justify-around border-t border-[color:var(--border)] px-3 py-1.5 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <ThumbsUp className="h-3.5 w-3.5" /> Like
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="h-3.5 w-3.5" /> Comment
        </span>
        <span className="inline-flex items-center gap-1">
          <Share className="h-3.5 w-3.5" /> Repost
        </span>
      </div>
    </ChromeShell>
  );
}

function WhatsAppPreview({
  post,
  showCrop,
  focused,
  onClick,
}: {
  post: PlatformPreviewPost;
  showCrop: boolean;
  focused?: boolean;
  onClick?: () => void;
}) {
  return (
    <ChromeShell platformId="whatsapp" focused={focused} onClick={onClick}>
      <div className="flex items-center gap-2 border-b border-[color:var(--border)] bg-[rgb(37,211,102)]/10 px-3 py-2">
        <span className="inline-block h-8 w-8 rounded-full bg-[rgb(37,211,102)]/30 ring-1 ring-[color:var(--border)]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-foreground">
            {post.businessName || "Your Business"}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">
            Business profile · online
          </span>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 bg-[rgb(229,221,213)]/30 px-3 py-3">
        <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-sm bg-[rgb(220,248,198)] px-2.5 py-1.5 shadow-sm">
          {post.imageUrl ? (
            <div className="relative mb-1 overflow-hidden rounded">
              <img
                src={post.imageUrl}
                alt=""
                className="max-h-40 w-full rounded object-cover"
                loading="lazy"
              />
              {showCrop ? <CropOverlay aspect="any" label="no crop" /> : null}
            </div>
          ) : null}
          <p className="text-[13px] leading-snug text-foreground">
            {post.text}
          </p>
          <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
            Just now <CheckCheck className="h-3 w-3" />
          </span>
        </div>
      </div>
    </ChromeShell>
  );
}

/* ─── helpers ────────────────────────────────────────────────────────── */

function truncate(s: string, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

/* ─── public component ───────────────────────────────────────────────── */

export function PlatformPreview({
  post,
  focus,
  showCropOverlays = true,
  className,
}: PlatformPreviewProps) {
  const [activeTab, setActiveTab] = useState<SocialPlatformId>(focus ?? "facebook");
  const renderable = useMemo(
    () => ({
      ...post,
      // Always coerce to string so consumers can pass partial payloads.
      text: (post.text ?? "").toString(),
    }),
    [post],
  );

  const renderOne = (id: SocialPlatformId, focused?: boolean) => {
    const onClick = () => setActiveTab(id);
    switch (id) {
      case "facebook":
        return (
          <FacebookPreview
            key="fb"
            post={renderable}
            showCrop={showCropOverlays}
            focused={focused}
            onClick={onClick}
          />
        );
      case "instagram":
        return (
          <InstagramPreview
            key="ig"
            post={renderable}
            showCrop={showCropOverlays}
            focused={focused}
            onClick={onClick}
          />
        );
      case "linkedin":
        return (
          <LinkedInPreview
            key="li"
            post={renderable}
            showCrop={showCropOverlays}
            focused={focused}
            onClick={onClick}
          />
        );
      case "whatsapp":
        return (
          <WhatsAppPreview
            key="wa"
            post={renderable}
            showCrop={showCropOverlays}
            focused={focused}
            onClick={onClick}
          />
        );
    }
  };

  // Mobile shows stacked tabs; desktop shows side-by-side grid.
  return (
    <div className={cn("w-full", className)} data-testid="platform-preview">
      <div className="mb-2 flex flex-wrap items-center gap-1.5" role="tablist">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={activeTab === p.id}
            onClick={() => setActiveTab(p.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition-colors",
              activeTab === p.id
                ? "bg-[hsl(var(--chart-1)/0.12)] text-[hsl(var(--chart-1))] ring-[color:hsl(var(--chart-1)/0.4)]"
                : "bg-muted text-muted-foreground ring-[color:var(--border)]",
            )}
            data-testid={`preview-tab-${p.id}`}
          >
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: p.color }}
              aria-hidden="true"
            />
            {p.label}
          </button>
        ))}
      </div>

      {/* Mobile: only the active tab. Desktop (md+): all four side-by-side. */}
      <div className="md:hidden">{renderOne(activeTab, true)}</div>
      <div className="hidden grid-cols-2 gap-2 md:grid xl:grid-cols-4">
        {PLATFORMS.map((p) => renderOne(p.id, p.id === activeTab))}
      </div>
    </div>
  );
}

export default PlatformPreview;
