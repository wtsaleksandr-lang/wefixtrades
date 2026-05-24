/**
 * ContentFlowPreviewModal — per-row preview for ContentFlow drafts.
 *
 * Renders a platform-themed mock of how the draft will look once
 * published, varying by content type:
 *
 *   - post     → social-card style (avatar + handle + body + platform chrome)
 *   - article  → blog hero (title + image + first paragraph + read-more link)
 *   - image    → centered lightbox of the generated image
 *   - video    → embedded <video controls> player with poster thumbnail
 *
 * No new deps — uses the existing shadcn Dialog + brand utility classes.
 * Designed to be opened from ContentFlowQueuePage row "Preview" buttons.
 */
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Facebook, Instagram, Globe, Mail, Linkedin, Youtube, Pin,
  ImageIcon, Video as VideoIcon, FileText, Megaphone, ExternalLink,
} from "lucide-react";

export type PreviewKind = "post" | "article" | "image" | "video";

export interface PreviewDraft {
  id: number;
  kind: string;
  title: string | null;
  excerpt?: string | null;
  body?: string | null;
  target_platform: string | null;
  metadata: any;
  client_name?: string | null;
}

/* Map raw draft.kind → coarse preview kind. */
export function previewKindFor(d: { kind: string; metadata?: any }): PreviewKind {
  const k = d.kind;
  if (k === "article") return "article";
  if (k === "video" || k === "video_script") return "video";
  if (k === "infographic") return "image";
  // Default: post-style. If a post has a media image and no body, still show post.
  return "post";
}

const PLATFORM_CHROME: Record<string, { label: string; icon: React.ReactNode; accent: string }> = {
  facebook: { label: "Facebook", icon: <Facebook className="h-4 w-4 text-blue-600" />, accent: "border-blue-200 bg-blue-50" },
  instagram: { label: "Instagram", icon: <Instagram className="h-4 w-4 text-pink-600" />, accent: "border-pink-200 bg-pink-50" },
  linkedin: { label: "LinkedIn", icon: <Linkedin className="h-4 w-4 text-sky-700" />, accent: "border-sky-200 bg-sky-50" },
  google_business: { label: "Google Business", icon: <Globe className="h-4 w-4 text-green-600" />, accent: "border-green-200 bg-green-50" },
  pinterest: { label: "Pinterest", icon: <Pin className="h-4 w-4 text-red-600" />, accent: "border-red-200 bg-red-50" },
  youtube: { label: "YouTube", icon: <Youtube className="h-4 w-4 text-red-600" />, accent: "border-red-200 bg-red-50" },
  email: { label: "Email", icon: <Mail className="h-4 w-4 text-gray-600" />, accent: "border-gray-200 bg-gray-50" },
  website: { label: "Website", icon: <Globe className="h-4 w-4 text-indigo-600" />, accent: "border-indigo-200 bg-indigo-50" },
};

function pickImageUrl(meta: any): string | null {
  if (!meta || typeof meta !== "object") return null;
  return (
    meta?.media_plan?.image_url ||
    meta?.media_plan?.public_image_url ||
    meta?.image?.url ||
    meta?.hero_image?.url ||
    null
  );
}

function pickVideoUrl(meta: any): { url: string | null; poster: string | null } {
  if (!meta || typeof meta !== "object") return { url: null, poster: null };
  return {
    url: meta?.media_plan?.video_url || meta?.video?.url || null,
    poster: meta?.media_plan?.thumbnail_url || meta?.media_plan?.image_url || null,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: PreviewDraft | null;
}

export default function ContentFlowPreviewModal({ open, onOpenChange, draft }: Props) {
  if (!draft) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Preview unavailable</DialogTitle>
            <DialogDescription>No draft selected.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const kind = previewKindFor(draft);
  const platformKey = draft.target_platform || "website";
  const platform = PLATFORM_CHROME[platformKey] || PLATFORM_CHROME.website;
  const imageUrl = pickImageUrl(draft.metadata);
  const { url: videoUrl, poster } = pickVideoUrl(draft.metadata);
  const handle = (draft.client_name || `Client #${draft.id}`).toLowerCase().replace(/\s+/g, "");
  const bodyText = draft.body || draft.excerpt || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={kind === "image" || kind === "video" ? "max-w-3xl" : "max-w-xl"}
        data-testid={`contentflow-preview-${draft.id}`}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span>Preview</span>
            <Badge variant="outline" className={`text-[10px] font-normal ${platform.accent}`}>
              <span className="mr-1 inline-flex items-center">{platform.icon}</span>
              {platform.label}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-normal capitalize">
              {kindLabel(kind)}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            How draft #{draft.id} will appear once published.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-1">
          {kind === "post" && (
            <PostPreview
              platform={platformKey}
              clientName={draft.client_name || "Your business"}
              handle={handle}
              body={bodyText}
              imageUrl={imageUrl}
            />
          )}
          {kind === "article" && (
            <ArticlePreview
              title={draft.title || "Untitled article"}
              imageUrl={imageUrl}
              excerpt={draft.excerpt || firstParagraph(bodyText)}
            />
          )}
          {kind === "image" && (
            <ImagePreview imageUrl={imageUrl} title={draft.title} />
          )}
          {kind === "video" && (
            <VideoPreview videoUrl={videoUrl} poster={poster} title={draft.title} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function kindLabel(k: PreviewKind): string {
  if (k === "post") return "Post";
  if (k === "article") return "Article";
  if (k === "image") return "Image";
  return "Video";
}

function firstParagraph(body: string): string {
  if (!body) return "";
  const trimmed = body.trim();
  const idx = trimmed.indexOf("\n\n");
  return idx > 0 ? trimmed.slice(0, idx) : trimmed.slice(0, 320);
}

/* ─── POST ────────────────────────────────────────────────────────────── */

function PostPreview({
  platform, clientName, handle, body, imageUrl,
}: {
  platform: string;
  clientName: string;
  handle: string;
  body: string;
  imageUrl: string | null;
}) {
  const chrome = PLATFORM_CHROME[platform] || PLATFORM_CHROME.website;
  const initials = clientName
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-sky-500 text-xs font-semibold text-white">
          {initials || "C"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-900">{clientName}</div>
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <span>@{handle}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-0.5">
              {chrome.icon}
              {chrome.label}
            </span>
          </div>
        </div>
      </div>
      <div className="px-4 py-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
          {body || <span className="italic text-gray-400">No body text yet.</span>}
        </p>
      </div>
      {imageUrl && (
        <div className="border-t bg-gray-50">
          <img
            src={imageUrl}
            alt=""
            className="max-h-96 w-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="flex items-center justify-around border-t px-4 py-2 text-[11px] font-medium text-gray-500">
        <span>Like</span>
        <span>Comment</span>
        <span>Share</span>
      </div>
    </div>
  );
}

/* ─── ARTICLE ─────────────────────────────────────────────────────────── */

function ArticlePreview({
  title, imageUrl, excerpt,
}: {
  title: string;
  imageUrl: string | null;
  excerpt: string;
}) {
  return (
    <article className="overflow-hidden rounded-xl border bg-white shadow-sm">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-48 w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-indigo-50 to-sky-50 text-indigo-300">
          <FileText className="h-10 w-10" />
        </div>
      )}
      <div className="space-y-3 px-5 py-4">
        <h1 className="text-xl font-bold leading-tight text-gray-900">{title}</h1>
        {excerpt ? (
          <p className="line-clamp-4 text-sm leading-relaxed text-gray-700">{excerpt}</p>
        ) : (
          <p className="text-sm italic text-gray-400">No excerpt available.</p>
        )}
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Read more
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </article>
  );
}

/* ─── IMAGE ───────────────────────────────────────────────────────────── */

function ImagePreview({
  imageUrl, title,
}: { imageUrl: string | null; title: string | null }) {
  if (!imageUrl) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed bg-gray-50 text-sm text-gray-400">
        <div className="flex flex-col items-center gap-2">
          <ImageIcon className="h-8 w-8" />
          <span>No image available yet</span>
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border bg-gray-900">
      <img
        src={imageUrl}
        alt={title || ""}
        className="mx-auto max-h-[70vh] w-auto object-contain"
      />
    </div>
  );
}

/* ─── VIDEO ───────────────────────────────────────────────────────────── */

function VideoPreview({
  videoUrl, poster, title,
}: { videoUrl: string | null; poster: string | null; title: string | null }) {
  if (!videoUrl) {
    return (
      <div className="space-y-3">
        {poster ? (
          <div className="relative overflow-hidden rounded-lg border bg-gray-900">
            <img src={poster} alt="" className="mx-auto max-h-[60vh] w-auto object-contain opacity-80" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-white shadow-lg">
                <VideoIcon className="h-7 w-7" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-72 items-center justify-center rounded-lg border border-dashed bg-gray-50 text-sm text-gray-400">
            <div className="flex flex-col items-center gap-2">
              <VideoIcon className="h-8 w-8" />
              <span>Video not yet generated</span>
            </div>
          </div>
        )}
        {title && <p className="text-sm text-gray-600">{title}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border bg-black">
        <video
          controls
          poster={poster ?? undefined}
          className="mx-auto max-h-[70vh] w-full"
          data-testid="preview-video-player"
        >
          <source src={videoUrl} />
          Your browser does not support the video tag.
        </video>
      </div>
      {title && <p className="text-sm font-medium text-gray-700">{title}</p>}
    </div>
  );
}

/* ─── small inline helpers exported for row affordances ───────────────── */

/** Compact icon + label used in row "Type" cell. */
export function PreviewTypeBadge({ kind }: { kind: PreviewKind }) {
  const meta = TYPE_BADGE[kind];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${meta.className}`}
      title={meta.label}
      aria-label={meta.label}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

const TYPE_BADGE: Record<PreviewKind, { label: string; icon: React.ReactNode; className: string }> = {
  post: { label: "Post", icon: <Megaphone className="h-3 w-3" />, className: "border-sky-200 bg-sky-50 text-sky-700" },
  article: { label: "Article", icon: <FileText className="h-3 w-3" />, className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  image: { label: "Image", icon: <ImageIcon className="h-3 w-3" />, className: "border-violet-200 bg-violet-50 text-violet-700" },
  video: { label: "Video", icon: <VideoIcon className="h-3 w-3" />, className: "border-red-200 bg-red-50 text-red-700" },
};

/** Tiny thumbnail (used in row when an image is available). */
export function PreviewThumb({
  imageUrl, kind, onClick,
}: { imageUrl: string | null; kind: PreviewKind; onClick: () => void }) {
  if (!imageUrl) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="inline-flex h-8 w-8 items-center justify-center rounded border bg-gray-50 text-gray-400 hover:bg-gray-100"
        title="Preview"
        aria-label="Preview"
      >
        {kind === "video" ? <VideoIcon className="h-3.5 w-3.5" /> :
         kind === "article" ? <FileText className="h-3.5 w-3.5" /> :
         kind === "image" ? <ImageIcon className="h-3.5 w-3.5" /> :
         <Megaphone className="h-3.5 w-3.5" />}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="relative inline-block h-8 w-8 overflow-hidden rounded border bg-gray-100 hover:ring-2 hover:ring-indigo-400"
      title="Preview"
      aria-label="Preview"
    >
      <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      {kind === "video" && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
          <VideoIcon className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
}
