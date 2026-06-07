import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Link } from "wouter";
import {
  Copy,
  Check,
  Images,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
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
 * "Our Work" Photo Gallery — free-tools self-contained widget.
 *
 * A responsive image grid + optional lightbox that showcases a
 * tradesperson's finished jobs (re-roofs, driveways, bathroom refits).
 *
 * Like SchemaGenerator / BeforeAfterSlider, this tool is purely
 * client-side: the owner pastes public image URLs (no upload, no backend)
 * and we bake them — plus captions/alt text — straight into a
 * SELF-CONTAINED inline HTML/CSS/JS snippet they paste once. No external
 * script, no account to load. All user values are HTML-escaped.
 *
 * DS compliance: title-in-field + top-left help cue + 2px input-cluster
 * gaps + single .btn-primary-premium (Copy snippet) + theme tokens only
 * (no bare #fff/#000 literals — the embedded CSS uses neutral rgba tokens
 * that read on any host background).
 */

/* ─── Column + radius option sets. ─── */
const COLUMNS = [
  { value: "2", label: "2 columns" },
  { value: "3", label: "3 columns" },
  { value: "4", label: "4 columns" },
] as const;
type ColumnCount = (typeof COLUMNS)[number]["value"];

interface RadiusOption {
  value: string;
  label: string;
  px: number;
}
const RADII: RadiusOption[] = [
  { value: "none", label: "Square (0)", px: 0 },
  { value: "sm", label: "Subtle (6px)", px: 6 },
  { value: "md", label: "Rounded (12px)", px: 12 },
  { value: "lg", label: "Soft (20px)", px: 20 },
];

interface GalleryImage {
  id: string;
  url: string;
  caption: string;
  alt: string;
}

interface Preset {
  key: string;
  label: string;
  captions: string[];
}

// Trade preset chips — seed sample CAPTIONS only (NOT image URLs, since
// those must be the customer's own photos). Each fills 3-4 captions onto
// the existing rows (top-down), adding empty rows if needed.
const PRESETS: Preset[] = [
  {
    key: "roofer",
    label: "Roofer",
    captions: ["Re-roof — Manchester", "New flat roof", "Chimney repointed", "Gutter replacement"],
  },
  {
    key: "driveways",
    label: "Driveways",
    captions: ["New block-paved driveway", "Resin-bound finish", "Patio relay", "Tarmac drive"],
  },
  {
    key: "bathroom",
    label: "Bathroom",
    captions: ["Bathroom refit", "Walk-in shower install", "New vanity & tiling", "Wet room conversion"],
  },
  {
    key: "garden",
    label: "Landscaping",
    captions: ["Full garden landscape", "New decking", "Artificial lawn", "Raised sleeper beds"],
  },
];

// Sample photos shown in the preview until the owner pastes their own URLs.
const SAMPLE_URLS = [
  "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=600&q=70",
  "https://images.unsplash.com/photo-1632759145351-1d592919f522?w=600&q=70",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&q=70",
  "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=600&q=70",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&q=70",
  "https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=600&q=70",
];

let idSeq = 0;
function makeImage(partial?: Partial<GalleryImage>): GalleryImage {
  idSeq += 1;
  return {
    id: `img-${idSeq}-${Math.random().toString(36).slice(2, 7)}`,
    url: "",
    caption: "",
    alt: "",
    ...partial,
  };
}

/* ─── HTML escaping for safe interpolation into the embed snippet. ───
   Escapes the five characters that could break out of an HTML attribute
   or text node, plus backtick — defends against snippet breakage and
   injection when the owner pastes arbitrary URLs / captions / alt text. */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

/** Build the self-contained, no-backend embed snippet. */
function buildSnippet(opts: {
  title: string;
  images: GalleryImage[];
  columns: ColumnCount;
  radiusPx: number;
  lightbox: boolean;
}): string {
  const id = "wft-gal";
  const title = escapeHtml(opts.title.trim() || "Our Work");
  const cols = Number(opts.columns);
  const radius = Math.max(0, Math.round(opts.radiusPx));
  const lightbox = opts.lightbox;

  // Only emit rows that actually have a URL.
  const items = opts.images
    .map((img) => ({
      url: img.url.trim(),
      caption: img.caption.trim(),
      alt: img.alt.trim(),
    }))
    .filter((img) => img.url.length > 0);

  // Each tile. When lightbox is on, the tile is a <button> carrying the
  // baked-in data; otherwise a plain non-interactive figure.
  const tiles = items
    .map((img, i) => {
      const url = escapeHtml(img.url);
      const caption = escapeHtml(img.caption);
      const altText = escapeHtml(img.alt || img.caption || `${opts.title.trim() || "Our Work"} photo ${i + 1}`);
      const captionHtml = caption
        ? `<figcaption class="${id}__cap">${caption}</figcaption>`
        : "";
      if (lightbox) {
        return `    <button type="button" class="${id}__tile" data-i="${i}" aria-label="${altText}">
      <img class="${id}__img" src="${url}" alt="${altText}" loading="lazy" />
      ${captionHtml}
    </button>`;
      }
      return `    <figure class="${id}__tile ${id}__tile--static">
      <img class="${id}__img" src="${url}" alt="${altText}" loading="lazy" />
      ${captionHtml}
    </figure>`;
    })
    .join("\n");

  // Data array baked in for the vanilla-JS lightbox (escaped already).
  const dataJson = lightbox
    ? JSON.stringify(
        items.map((img, i) => ({
          src: img.url,
          cap: img.caption,
          alt: img.alt || img.caption || `${opts.title.trim() || "Our Work"} photo ${i + 1}`,
        })),
      )
        // Escape closing-script sequences so the JSON can't break out of <script>.
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
    : "[]";

  const css = `.${id}{font-family:inherit;color:inherit;max-width:100%;margin:0 auto}
.${id}__h{font-size:18px;font-weight:700;margin:0 0 12px;line-height:1.3}
.${id}__grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px}
.${id}__tile{position:relative;display:block;width:100%;padding:0;margin:0;border:0;background:rgba(148,163,184,0.12);border-radius:${radius}px;overflow:hidden;cursor:${lightbox ? "zoom-in" : "default"};text-align:left}
.${id}__tile--static{cursor:default}
.${id}__img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}
.${id}__cap{padding:7px 10px;font-size:13px;line-height:1.35;color:rgba(15,23,42,0.92);background:rgba(248,250,252,0.92)}
.${id} button.${id}__tile:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(37,99,235,0.5)}
@media (max-width:640px){.${id}__grid{grid-template-columns:repeat(${Math.min(cols, 2)},1fr)}}
@media (max-width:400px){.${id}__grid{grid-template-columns:1fr}}`;

  const lightboxMarkup = lightbox
    ? `
  <div class="${id}__lb" role="dialog" aria-modal="true" aria-label="${title}" hidden>
    <button type="button" class="${id}__lb-close" aria-label="Close">&times;</button>
    <button type="button" class="${id}__lb-prev" aria-label="Previous image">&#8249;</button>
    <figure class="${id}__lb-fig">
      <img class="${id}__lb-img" src="" alt="" />
      <figcaption class="${id}__lb-cap"></figcaption>
    </figure>
    <button type="button" class="${id}__lb-next" aria-label="Next image">&#8250;</button>
  </div>`
    : "";

  const lightboxCss = lightbox
    ? `
.${id}__lb{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.92);padding:24px}
.${id}__lb[hidden]{display:none}
.${id}__lb-fig{margin:0;max-width:92vw;max-height:86vh;display:flex;flex-direction:column;align-items:center}
.${id}__lb-img{max-width:92vw;max-height:78vh;object-fit:contain;border-radius:6px;background:rgba(148,163,184,0.2)}
.${id}__lb-cap{margin-top:10px;color:rgba(248,250,252,0.96);font-size:14px;text-align:center;max-width:80vw}
.${id}__lb-cap:empty{display:none}
.${id}__lb-close,.${id}__lb-prev,.${id}__lb-next{position:absolute;top:50%;transform:translateY(-50%);background:rgba(248,250,252,0.14);color:rgba(248,250,252,0.96);border:0;width:44px;height:44px;border-radius:50%;font-size:26px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}
.${id}__lb-close{top:18px;right:18px;left:auto;transform:none;font-size:30px}
.${id}__lb-prev{left:14px}
.${id}__lb-next{right:14px}
.${id}__lb-close:focus-visible,.${id}__lb-prev:focus-visible,.${id}__lb-next:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(37,99,235,0.6)}`
    : "";

  const lightboxScript = lightbox
    ? `
<script>
(function(){
  var root=document.currentScript.previousElementSibling;
  while(root&&!(root.classList&&root.classList.contains("${id}"))){root=root.previousElementSibling;}
  if(!root)return;
  var data=${dataJson};
  var lb=root.querySelector(".${id}__lb");
  if(!lb||!data.length)return;
  var imgEl=lb.querySelector(".${id}__lb-img");
  var capEl=lb.querySelector(".${id}__lb-cap");
  var cur=0,lastFocus=null;
  function render(){var d=data[cur];imgEl.src=d.src;imgEl.alt=d.alt||"";capEl.textContent=d.cap||"";}
  function open(i){cur=i;lastFocus=document.activeElement;render();lb.hidden=false;document.addEventListener("keydown",onKey);lb.querySelector(".${id}__lb-close").focus();}
  function close(){lb.hidden=true;document.removeEventListener("keydown",onKey);if(lastFocus&&lastFocus.focus)lastFocus.focus();}
  function next(){cur=(cur+1)%data.length;render();}
  function prev(){cur=(cur-1+data.length)%data.length;render();}
  function onKey(e){
    if(e.key==="Escape"){e.preventDefault();close();}
    else if(e.key==="ArrowRight"){e.preventDefault();next();}
    else if(e.key==="ArrowLeft"){e.preventDefault();prev();}
    else if(e.key==="Tab"){
      var f=lb.querySelectorAll("button");if(!f.length)return;
      var first=f[0],last=f[f.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  }
  root.querySelectorAll(".${id}__tile").forEach(function(t){
    t.addEventListener("click",function(){open(parseInt(t.getAttribute("data-i"),10)||0);});
  });
  lb.querySelector(".${id}__lb-close").addEventListener("click",close);
  lb.querySelector(".${id}__lb-next").addEventListener("click",next);
  lb.querySelector(".${id}__lb-prev").addEventListener("click",prev);
  lb.addEventListener("click",function(e){if(e.target===lb)close();});
})();
</script>`
    : "";

  return `<!-- WeFixTrades "Our Work" Gallery -->
<div class="${id}">
  <h2 class="${id}__h">${title}</h2>
  <div class="${id}__grid">
${tiles}
  </div>${lightboxMarkup}
</div>
<style>
${css}${lightboxCss}
</style>${lightboxScript}
<!-- /WeFixTrades "Our Work" Gallery -->`;
}

export default function PhotoGallery() {
  usePageTitle("Our Work — Photo Gallery");
  const { toast } = useToast();

  const [title, setTitle] = useState("Our Work");
  const [images, setImages] = useState<GalleryImage[]>(() => [
    makeImage(),
    makeImage(),
    makeImage(),
  ]);
  const [columns, setColumns] = useState<ColumnCount>("3");
  const [radius, setRadius] = useState<string>("md");
  const [lightbox, setLightbox] = useState(true);
  const [copied, setCopied] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  const radiusSpec = RADII.find((r) => r.value === radius) ?? RADII[2];

  // Preview falls back to sample photos so the grid is always demonstrable.
  const previewImages: GalleryImage[] = useMemo(() => {
    const filled = images.filter((img) => img.url.trim().length > 0);
    if (filled.length > 0) return filled;
    return SAMPLE_URLS.slice(0, 6).map((url, i) =>
      makeImage({
        url,
        caption: PRESETS[0].captions[i] ?? "",
        alt: PRESETS[0].captions[i] ?? `Sample photo ${i + 1}`,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  const snippet = useMemo(
    () =>
      buildSnippet({
        title,
        images,
        columns,
        radiusPx: radiusSpec.px,
        lightbox,
      }),
    [title, images, columns, radiusSpec.px, lightbox],
  );

  const hasUrls = images.some((img) => img.url.trim().length > 0);

  useCopilotForm({
    formLabel: "Our Work — Photo Gallery",
    fields: [{ key: "title", label: "Gallery title", required: false }],
    values: { title },
    onApply: (fills) => {
      for (const f of fills) {
        if (f.field_key === "title") setTitle(String(f.value ?? ""));
      }
    },
    enabled: true,
  });

  /* ─── Image row mutations. ─── */
  const updateImage = (id: string, patch: Partial<GalleryImage>) => {
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...patch } : img)));
  };
  const addImage = () => setImages((prev) => [...prev, makeImage()]);
  const removeImage = (id: string) =>
    setImages((prev) => (prev.length > 1 ? prev.filter((img) => img.id !== id) : prev));
  const moveImage = (index: number, dir: -1 | 1) => {
    setImages((prev) => {
      const next = index + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  };

  const applyPreset = (p: Preset) => {
    setImages((prev) => {
      const copy = prev.map((img) => ({ ...img }));
      p.captions.forEach((cap, i) => {
        if (i < copy.length) copy[i] = { ...copy[i], caption: cap };
        else copy.push(makeImage({ caption: cap }));
      });
      return copy;
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast({ title: "Copied", description: "Embed snippet copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the snippet and copy manually.",
        variant: "destructive",
      });
    }
  };

  return (
    <PortalLayout
      breadcrumb={
        <span className="flex items-center gap-1.5">
          <Link href="/portal/free-tools" className="hover:text-brand-blue">Free Tools</Link>
          <span className="text-gray-400">/</span>
          <span>Our Work Gallery</span>
        </span>
      }
    >
      <div data-theme="light" className="qq-paper-surface space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <Images className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-gray-900">Our Work — Photo Gallery</h1>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            Showcase your finished jobs in a responsive grid — re-roofs,
            driveways, bathroom refits. Visitors tap a photo to open it full
            size. The embed is fully self-contained: your image URLs and
            captions are baked in, so there's no script to host and no account
            to load.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration column */}
          <div className="lg:col-span-1 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Gallery title & layout"
                  help="The heading shown above the grid, plus how many columns and how round the corners are. A trade preset below fills sample captions in one click."
                />
                <div className="flex flex-wrap gap-1 mb-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="px-2.5 py-1 text-xs font-medium rounded-full border border-gray-200 text-gray-700 hover:border-brand-blue hover:text-brand-blue transition-colors"
                      data-testid={`gal-preset-${p.key}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="space-y-0.5">
                  <TitleInField
                    id="gal-title"
                    label="Gallery title"
                    value={title}
                    onChange={setTitle}
                    placeholder="Our Work"
                    maxLength={60}
                    help="Heading shown above the photo grid."
                    testid="gal-title"
                  />
                  <div className="grid grid-cols-2 gap-0.5">
                    <TitleInFieldSelect
                      id="gal-columns"
                      label="Columns"
                      value={columns}
                      onChange={(v) => setColumns(v as ColumnCount)}
                      help="How many photos per row on desktop. Mobile automatically reduces to 1–2 columns."
                      testid="gal-columns"
                    >
                      {COLUMNS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </TitleInFieldSelect>
                    <TitleInFieldSelect
                      id="gal-radius"
                      label="Corner radius"
                      value={radius}
                      onChange={setRadius}
                      help="How rounded each photo's corners are."
                      testid="gal-radius"
                    >
                      {RADII.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </TitleInFieldSelect>
                  </div>
                  <label className="flex items-center gap-2 pl-5 pt-1 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={lightbox}
                      onChange={(e) => setLightbox(e.target.checked)}
                      className="rounded border-gray-300 text-brand-blue focus:ring-brand-blue/20"
                      data-testid="gal-lightbox-toggle"
                    />
                    Open photos in a lightbox (full-size overlay)
                  </label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Photos"
                  help="Paste the public URL of each finished-job photo (from your own site or an image host). No upload — the URLs are embedded directly so nothing is stored on our servers. Caption and alt text are optional."
                  right={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addImage}
                      aria-label="Add photo"
                      data-testid="gal-add-image"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  }
                />
                <div className="space-y-3">
                  {images.map((img, i) => (
                    <div
                      key={img.id}
                      className="rounded-lg border border-gray-200 p-2.5 space-y-0.5"
                      data-testid={`gal-image-row-${i}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          Photo {i + 1}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveImage(i, -1)}
                            disabled={i === 0}
                            className="p-1 rounded text-gray-400 hover:text-brand-blue disabled:opacity-30 disabled:hover:text-gray-400"
                            aria-label={`Move photo ${i + 1} up`}
                            data-testid={`gal-move-up-${i}`}
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveImage(i, 1)}
                            disabled={i === images.length - 1}
                            className="p-1 rounded text-gray-400 hover:text-brand-blue disabled:opacity-30 disabled:hover:text-gray-400"
                            aria-label={`Move photo ${i + 1} down`}
                            data-testid={`gal-move-down-${i}`}
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeImage(img.id)}
                            disabled={images.length <= 1}
                            className="p-1 rounded text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-gray-400"
                            aria-label={`Remove photo ${i + 1}`}
                            data-testid={`gal-remove-${i}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <TitleInField
                        id={`gal-url-${img.id}`}
                        label="Image URL"
                        value={img.url}
                        onChange={(v) => updateImage(img.id, { url: v })}
                        placeholder="https://…/job.jpg"
                        type="url"
                        help="The public URL of the photo. Host it on your own site, a CDN, or an image host."
                        testid={`gal-url-${i}`}
                      />
                      <TitleInField
                        id={`gal-caption-${img.id}`}
                        label="Caption (optional)"
                        value={img.caption}
                        onChange={(v) => updateImage(img.id, { caption: v })}
                        placeholder="Re-roof — Manchester"
                        maxLength={80}
                        testid={`gal-caption-${i}`}
                      />
                      <TitleInField
                        id={`gal-alt-${img.id}`}
                        label="Alt text (optional)"
                        value={img.alt}
                        onChange={(v) => updateImage(img.id, { alt: v })}
                        placeholder="Describe the photo for screen readers"
                        maxLength={120}
                        help="Describes the image for screen readers and SEO. Falls back to the caption if left blank."
                        testid={`gal-alt-${i}`}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview + snippet */}
          <div className="lg:col-span-2 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Live preview"
                  help="Exactly what visitors see. Click any photo to open the lightbox (when enabled) — use the arrows or ← → keys to move, Esc to close. Sample photos show until you paste your own URLs."
                />
                <GalleryPreview
                  title={title || "Our Work"}
                  images={previewImages}
                  columns={Number(columns)}
                  radiusPx={radiusSpec.px}
                  lightbox={lightbox}
                />
                {!hasUrls && (
                  <p className="text-xs text-gray-500">
                    Showing sample photos — paste your own job photo URLs on the
                    left to replace them.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Embed snippet"
                  help="Self-contained HTML — paste it once wherever you want the gallery. No external script, no account; your image URLs and captions are baked in."
                  right={
                    /* DS rule 4 — single .btn-primary-premium per page. */
                    <Button
                      type="button"
                      onClick={handleCopy}
                      className="btn-primary-premium"
                      data-testid="gal-copy-snippet"
                    >
                      {copied ? (
                        <><Check className="w-4 h-4 mr-1.5" />Copied</>
                      ) : (
                        <><Copy className="w-4 h-4 mr-1.5" />Copy snippet</>
                      )}
                    </Button>
                  }
                />
                <pre
                  className="text-xs bg-slate-50 text-gray-800 p-3 rounded-md overflow-x-auto border border-gray-200 max-h-[420px]"
                  data-testid="gal-snippet"
                >
                  <code>{snippet}</code>
                </pre>
                <p className="text-xs text-gray-500">
                  Tip: host your photos somewhere public (your own site, a CDN,
                  or an image host) and paste those URLs above before copying.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <button
                  type="button"
                  onClick={() => setHowOpen((v) => !v)}
                  className="flex items-center justify-between w-full text-left"
                  aria-expanded={howOpen}
                >
                  <h2 className="text-sm font-semibold text-gray-900">How to install</h2>
                  {howOpen ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>
                {howOpen && (
                  <ul className="mt-3 space-y-2 text-xs text-gray-700">
                    <li><strong>WordPress:</strong> add a Custom HTML block and paste the snippet.</li>
                    <li><strong>Wix:</strong> Add → Embed Code → paste.</li>
                    <li><strong>Squarespace:</strong> Add Block → Code → paste.</li>
                    <li><strong>Shopify:</strong> place in a section template or <code>theme.liquid</code>.</li>
                    <li><strong>Plain HTML:</strong> paste anywhere in <code>&lt;body&gt;</code>.</li>
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}

/* ─── Live in-portal preview — mirrors the embedded gallery's behaviour
   (responsive grid, accessible lightbox with prev/next, Esc, focus trap). ─── */
function GalleryPreview({
  title,
  images,
  columns,
  radiusPx,
  lightbox,
}: {
  title: string;
  images: GalleryImage[];
  columns: number;
  radiusPx: number;
  lightbox: boolean;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const next = useCallback(
    () => setOpenIndex((i) => (i === null ? i : (i + 1) % images.length)),
    [images.length],
  );
  const prev = useCallback(
    () => setOpenIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length)),
    [images.length],
  );

  // Keyboard handling + focus management while the lightbox is open.
  useEffect(() => {
    if (openIndex === null) return;
    lastFocusRef.current = document.activeElement as HTMLElement;
    const dialog = dialogRef.current;
    const closeBtn = dialog?.querySelector<HTMLButtonElement>("[data-lb-close]");
    closeBtn?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "Tab" && dialog) {
        const focusable = dialog.querySelectorAll<HTMLElement>("button");
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      lastFocusRef.current?.focus?.();
    };
  }, [openIndex, close, next, prev]);

  const radiusStyle = { borderRadius: `${radiusPx}px` };
  const active = openIndex !== null ? images[openIndex] : null;

  return (
    <div data-testid="gal-preview">
      <h2 className="text-lg font-bold text-gray-900 mb-3">{title}</h2>
      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {images.map((img, i) => {
          const altText = img.alt || img.caption || `${title} photo ${i + 1}`;
          const TileInner = (
            <>
              <img
                src={img.url}
                alt={altText}
                loading="lazy"
                className="w-full aspect-[4/3] object-cover"
              />
              {img.caption && (
                <figcaption className="px-2.5 py-1.5 text-xs text-gray-800 bg-slate-50">
                  {img.caption}
                </figcaption>
              )}
            </>
          );
          return lightbox ? (
            <button
              key={img.id}
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={altText}
              className="relative block w-full overflow-hidden border border-gray-200 bg-slate-100 text-left cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
              style={radiusStyle}
              data-testid={`gal-tile-${i}`}
            >
              {TileInner}
            </button>
          ) : (
            <figure
              key={img.id}
              className="relative block w-full overflow-hidden border border-gray-200 bg-slate-100"
              style={radiusStyle}
              data-testid={`gal-tile-${i}`}
            >
              {TileInner}
            </figure>
          );
        })}
      </div>

      {lightbox && active && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-gray-900/90 p-6"
          data-testid="gal-lightbox"
        >
          <button
            type="button"
            data-lb-close
            onClick={close}
            aria-label="Close"
            style={{ width: 44, height: 44 }}
            className="absolute top-4 right-4 flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            <X className="w-5 h-5" />
          </button>
          {images.length > 1 && (
            <button
              type="button"
              onClick={prev}
              aria-label="Previous image"
              style={{ width: 44, height: 44 }}
              className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <figure className="m-0 max-w-[92vw] max-h-[86vh] flex flex-col items-center">
            <img
              src={active.url}
              alt={active.alt || active.caption || `${title} photo`}
              className="max-w-[92vw] max-h-[78vh] object-contain rounded-md bg-slate-200"
            />
            {active.caption && (
              <figcaption className="mt-2.5 text-sm text-white text-center max-w-[80vw]">
                {active.caption}
              </figcaption>
            )}
          </figure>
          {images.length > 1 && (
            <button
              type="button"
              onClick={next}
              aria-label="Next image"
              style={{ width: 44, height: 44 }}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
