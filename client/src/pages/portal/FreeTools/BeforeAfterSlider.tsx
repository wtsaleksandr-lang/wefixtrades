import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Link } from "wouter";
import {
  Copy,
  Check,
  SplitSquareHorizontal,
  ChevronDown,
  ChevronUp,
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
 * Before / After Slider — free-tools self-contained widget.
 *
 * The marquee trades trust widget: a draggable divider that reveals an
 * "after" image over a "before" image (re-roof, painted room, cleaned
 * driveway, transformed yard).
 *
 * Unlike the token-backed siblings (Hours / Trust Badges) that reference a
 * saved server config via the hosted v1 loader, this tool is purely
 * client-side — same scaffold as SchemaGenerator: it bakes the two image
 * URLs + labels straight into a SELF-CONTAINED inline HTML/CSS/JS snippet
 * the customer pastes. No backend, no API, no external script.
 *
 * DS compliance: title-in-field + top-left help cue + 2px input-cluster
 * gaps + single .btn-primary-premium (Copy snippet) + theme tokens only
 * (no bare #fff/#000 literals — the embedded CSS uses neutral tokens that
 * read on any host background).
 */

type Aspect = "4:3" | "16:9" | "1:1" | "3:2";

const ASPECTS: { value: Aspect; label: string; pad: string; ratio: number }[] = [
  { value: "4:3", label: "4 : 3 (standard)", pad: "75%", ratio: 3 / 4 },
  { value: "16:9", label: "16 : 9 (wide)", pad: "56.25%", ratio: 9 / 16 },
  { value: "3:2", label: "3 : 2 (photo)", pad: "66.6667%", ratio: 2 / 3 },
  { value: "1:1", label: "1 : 1 (square)", pad: "100%", ratio: 1 },
];

interface Preset {
  key: string;
  label: string;
  before: string;
  after: string;
}

// Trade preset chips — fill sample labels/captions only (NOT image URLs,
// since those must be the customer's own photos).
const PRESETS: Preset[] = [
  { key: "roof", label: "Roof", before: "Old Roof", after: "New Roof" },
  { key: "driveway", label: "Driveway", before: "Before Clean", after: "After Clean" },
  { key: "room", label: "Room", before: "Before", after: "Repainted" },
  { key: "garden", label: "Garden", before: "Overgrown", after: "Landscaped" },
];

const SAMPLE_BEFORE =
  "https://images.unsplash.com/photo-1632759145351-1d592919f522?w=800&q=70";
const SAMPLE_AFTER =
  "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&q=70";

/* ─── HTML escaping for safe interpolation into the embed snippet. ───
   Escapes the five characters that could break out of an HTML attribute
   or text node, plus backtick — defends against snippet breakage and
   injection when the customer pastes arbitrary URLs / labels. */
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
  beforeUrl: string;
  afterUrl: string;
  beforeLabel: string;
  afterLabel: string;
  pad: string;
  start: number;
}): string {
  const id = "wft-ba";
  const before = escapeHtml(opts.beforeUrl.trim());
  const after = escapeHtml(opts.afterUrl.trim());
  const bl = escapeHtml(opts.beforeLabel.trim() || "Before");
  const al = escapeHtml(opts.afterLabel.trim() || "After");
  const start = Math.max(0, Math.min(100, Math.round(opts.start)));
  // Scoped class prefix avoids collisions on the host page. Colors use
  // neutral rgba tokens (no bare #fff/#000) that read on any background.
  return `<!-- WeFixTrades Before/After Slider -->
<div class="${id}" style="--ba-start:${start}%">
  <div class="${id}__frame" style="padding-bottom:${opts.pad}">
    <img class="${id}__img ${id}__before" src="${before}" alt="${bl}" draggable="false" />
    <div class="${id}__after-wrap"><img class="${id}__img" src="${after}" alt="${al}" draggable="false" /></div>
    <span class="${id}__tag ${id}__tag--l">${bl}</span>
    <span class="${id}__tag ${id}__tag--r">${al}</span>
    <div class="${id}__handle" role="slider" tabindex="0" aria-label="Drag to compare before and after" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${start}">
      <span class="${id}__grip"></span>
    </div>
  </div>
</div>
<style>
.${id}{position:relative;max-width:100%;margin:0 auto;font-family:inherit;-webkit-user-select:none;user-select:none}
.${id}__frame{position:relative;width:100%;height:0;overflow:hidden;border-radius:12px}
.${id}__img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.${id}__after-wrap{position:absolute;inset:0;width:var(--ba-start);overflow:hidden}
.${id}__after-wrap .${id}__img{width:auto;min-width:100%;max-width:none}
.${id}__tag{position:absolute;bottom:10px;padding:3px 9px;font-size:12px;font-weight:600;line-height:1.4;color:rgba(255,255,255,0.96);background:rgba(17,24,39,0.7);border-radius:6px;pointer-events:none}
.${id}__tag--l{left:10px}
.${id}__tag--r{right:10px}
.${id}__handle{position:absolute;top:0;bottom:0;left:var(--ba-start);width:2px;background:rgba(255,255,255,0.9);transform:translateX(-1px);cursor:ew-resize;touch-action:none}
.${id}__grip{position:absolute;top:50%;left:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(255,255,255,0.96);box-shadow:0 1px 4px rgba(17,24,39,0.35)}
.${id}__grip::before,.${id}__grip::after{content:"";position:absolute;top:50%;width:0;height:0;border-top:5px solid transparent;border-bottom:5px solid transparent}
.${id}__grip::before{left:8px;border-right:6px solid rgba(17,24,39,0.55)}
.${id}__grip::after{right:8px;border-left:6px solid rgba(17,24,39,0.55)}
.${id}__handle:focus{outline:none}
.${id}__handle:focus-visible .${id}__grip{box-shadow:0 0 0 3px rgba(37,99,235,0.5)}
</style>
<script>
(function(){
  var root=document.currentScript.previousElementSibling;
  while(root&&!(root.classList&&root.classList.contains("${id}"))){root=root.previousElementSibling;}
  if(!root)return;
  var frame=root.querySelector(".${id}__frame");
  var handle=root.querySelector(".${id}__handle");
  function set(p){p=Math.max(0,Math.min(100,p));root.style.setProperty("--ba-start",p+"%");handle.setAttribute("aria-valuenow",Math.round(p));}
  function fromX(clientX){var r=frame.getBoundingClientRect();return ((clientX-r.left)/r.width)*100;}
  var dragging=false;
  function down(e){dragging=true;handle.focus();move(e);e.preventDefault();}
  function move(e){if(!dragging)return;var x=e.touches?e.touches[0].clientX:e.clientX;set(fromX(x));}
  function up(){dragging=false;}
  handle.addEventListener("pointerdown",down);
  frame.addEventListener("pointerdown",down);
  window.addEventListener("pointermove",move);
  window.addEventListener("pointerup",up);
  handle.addEventListener("keydown",function(e){
    var cur=parseFloat(getComputedStyle(root).getPropertyValue("--ba-start"))||0;
    var step=(e.key==="ArrowLeft")?-4:(e.key==="ArrowRight")?4:(e.key==="Home")?-100:(e.key==="End")?100:0;
    if(step){e.preventDefault();set(cur+step);}
  });
})();
</script>
<!-- /WeFixTrades Before/After Slider -->`;
}

export default function BeforeAfterSlider() {
  usePageTitle("Before / After Slider");
  const { toast } = useToast();

  const [beforeUrl, setBeforeUrl] = useState("");
  const [afterUrl, setAfterUrl] = useState("");
  const [beforeLabel, setBeforeLabel] = useState("Before");
  const [afterLabel, setAfterLabel] = useState("After");
  const [aspect, setAspect] = useState<Aspect>("4:3");
  const [start, setStart] = useState(50);
  const [copied, setCopied] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  const aspectSpec = ASPECTS.find((a) => a.value === aspect) ?? ASPECTS[0];

  // Preview falls back to sample photos so the slider is always demonstrable.
  const previewBefore = beforeUrl.trim() || SAMPLE_BEFORE;
  const previewAfter = afterUrl.trim() || SAMPLE_AFTER;

  const snippet = useMemo(
    () =>
      buildSnippet({
        beforeUrl: beforeUrl.trim() || SAMPLE_BEFORE,
        afterUrl: afterUrl.trim() || SAMPLE_AFTER,
        beforeLabel,
        afterLabel,
        pad: aspectSpec.pad,
        start,
      }),
    [beforeUrl, afterUrl, beforeLabel, afterLabel, aspectSpec.pad, start],
  );

  useCopilotForm({
    formLabel: "Before / After Slider",
    fields: [
      { key: "beforeUrl", label: "Before image URL", required: false },
      { key: "afterUrl", label: "After image URL", required: false },
      { key: "beforeLabel", label: "Before label", required: false },
      { key: "afterLabel", label: "After label", required: false },
    ],
    values: { beforeUrl, afterUrl, beforeLabel, afterLabel },
    onApply: (fills) => {
      for (const f of fills) {
        const v = String(f.value ?? "");
        if (f.field_key === "beforeUrl") setBeforeUrl(v);
        else if (f.field_key === "afterUrl") setAfterUrl(v);
        else if (f.field_key === "beforeLabel") setBeforeLabel(v);
        else if (f.field_key === "afterLabel") setAfterLabel(v);
      }
    },
    enabled: true,
  });

  const applyPreset = (p: Preset) => {
    setBeforeLabel(p.before);
    setAfterLabel(p.after);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast({ title: "Copied", description: "Embed snippet copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Select the snippet and copy manually.", variant: "destructive" });
    }
  };

  return (
    <PortalLayout
      breadcrumb={
        <span className="flex items-center gap-1.5">
          <Link href="/portal/free-tools" className="hover:text-brand-blue">Free Tools</Link>
          <span className="text-gray-400">/</span>
          <span>Before / After Slider</span>
        </span>
      }
    >
      <div data-theme="light" className="space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <SplitSquareHorizontal className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-gray-900">Before / After Slider</h1>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            Show off a transformation — a re-roof, a repainted room, a cleaned
            driveway. Visitors drag the divider to reveal the after shot. The
            embed is fully self-contained: your two image URLs are baked in, so
            there's no script to host and no account to load.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration column */}
          <div className="lg:col-span-1 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Your photos"
                  help="Paste the public URL of each image (e.g. from your own site or an image host). No upload — the URLs are embedded directly so nothing is stored on our servers."
                />
                <div className="space-y-0.5">
                  <TitleInField
                    id="ba-before-url"
                    label="Before image URL"
                    value={beforeUrl}
                    onChange={setBeforeUrl}
                    placeholder="https://…/before.jpg"
                    type="url"
                    help="The 'before' photo — shown on the left as the divider moves right."
                    testid="ba-before-url"
                  />
                  <TitleInField
                    id="ba-after-url"
                    label="After image URL"
                    value={afterUrl}
                    onChange={setAfterUrl}
                    placeholder="https://…/after.jpg"
                    type="url"
                    help="The 'after' photo — revealed as the visitor drags the divider."
                    testid="ba-after-url"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Labels & layout"
                  help="Corner captions and the frame shape. Use a trade preset below to fill sensible captions in one click."
                />
                <div className="flex flex-wrap gap-1 mb-1">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="px-2.5 py-1 text-xs font-medium rounded-full border border-gray-200 text-gray-700 hover:border-brand-blue hover:text-brand-blue transition-colors"
                      data-testid={`ba-preset-${p.key}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="space-y-0.5">
                  <div className="grid grid-cols-2 gap-0.5">
                    <TitleInField
                      id="ba-before-label"
                      label="Before label"
                      value={beforeLabel}
                      onChange={setBeforeLabel}
                      placeholder="Before"
                      maxLength={24}
                    />
                    <TitleInField
                      id="ba-after-label"
                      label="After label"
                      value={afterLabel}
                      onChange={setAfterLabel}
                      placeholder="After"
                      maxLength={24}
                    />
                  </div>
                  <TitleInFieldSelect
                    id="ba-aspect"
                    label="Aspect ratio"
                    value={aspect}
                    onChange={(v) => setAspect(v as Aspect)}
                    help="The shape of the comparison frame. Match it to your photos to avoid cropping."
                  >
                    {ASPECTS.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </TitleInFieldSelect>
                  <TitleInField
                    id="ba-start"
                    label="Start position (%)"
                    value={String(start)}
                    onChange={(v) => {
                      const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
                      setStart(Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0);
                    }}
                    type="number"
                    min={0}
                    max={100}
                    placeholder="50"
                    help="Where the divider sits when the widget first loads (0 = all before, 100 = all after)."
                  />
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
                  help="Drag the divider (or use the arrow keys when focused) to compare. This is exactly what visitors see. Sample photos show until you paste your own URLs."
                />
                <SliderPreview
                  beforeUrl={previewBefore}
                  afterUrl={previewAfter}
                  beforeLabel={beforeLabel || "Before"}
                  afterLabel={afterLabel || "After"}
                  ratio={aspectSpec.ratio}
                  start={start}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Embed snippet"
                  help="Self-contained HTML — paste it once wherever you want the slider. No external script, no account; your image URLs and labels are baked in."
                  right={
                    /* DS rule 4 — single .btn-primary-premium per page. */
                    <Button
                      type="button"
                      onClick={handleCopy}
                      className="btn-primary-premium"
                      data-testid="ba-copy-snippet"
                    >
                      {copied ? <><Check className="w-4 h-4 mr-1.5" />Copied</> : <><Copy className="w-4 h-4 mr-1.5" />Copy snippet</>}
                    </Button>
                  }
                />
                <pre
                  className="text-xs bg-slate-50 text-gray-800 p-3 rounded-md overflow-x-auto border border-gray-200 max-h-[420px]"
                  data-testid="ba-snippet"
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
                  {howOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
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

/* ─── Live in-portal preview — mirrors the embedded slider's behaviour
   (pointer + touch drag, keyboard arrows, accessible role=slider). ─── */
function SliderPreview({
  beforeUrl,
  afterUrl,
  beforeLabel,
  afterLabel,
  ratio,
  start,
}: {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel: string;
  afterLabel: string;
  ratio: number;
  start: number;
}) {
  const [pos, setPos] = useState(start);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  // Sync when the configured start position changes.
  useEffect(() => { setPos(start); }, [start]);

  const fromClientX = useCallback((clientX: number) => {
    const el = frameRef.current;
    if (!el) return pos;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
  }, [pos]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      setPos(fromClientX(e.clientX));
    };
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [fromClientX]);

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    setPos(fromClientX(e.clientX));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    let step = 0;
    if (e.key === "ArrowLeft") step = -4;
    else if (e.key === "ArrowRight") step = 4;
    else if (e.key === "Home") step = -100;
    else if (e.key === "End") step = 100;
    if (step) {
      e.preventDefault();
      setPos((p) => Math.max(0, Math.min(100, p + step)));
    }
  };

  return (
    <div
      ref={frameRef}
      onPointerDown={onPointerDown}
      className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-slate-100 select-none"
      style={{ aspectRatio: `1 / ${ratio}` }}
      data-testid="ba-preview"
    >
      {/* Before fills the frame. */}
      <img
        src={beforeUrl}
        alt={beforeLabel}
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* After is clipped to the divider position. */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
        <img
          src={afterUrl}
          alt={afterLabel}
          draggable={false}
          className="absolute inset-0 h-full object-cover"
          style={{ width: frameRef.current ? `${frameRef.current.clientWidth}px` : "100%", maxWidth: "none" }}
        />
      </div>
      <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 text-xs font-semibold rounded-md bg-gray-900/70 text-white pointer-events-none">
        {beforeLabel}
      </span>
      <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 text-xs font-semibold rounded-md bg-gray-900/70 text-white pointer-events-none">
        {afterLabel}
      </span>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Drag to compare before and after"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        onKeyDown={onKeyDown}
        className="absolute top-0 bottom-0 w-0.5 bg-white/90 -translate-x-1/2 cursor-ew-resize touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        style={{ left: `${pos}%` }}
      >
        <span className="absolute top-1/2 left-1/2 w-8 h-8 -mt-4 -ml-4 rounded-full bg-white shadow-md flex items-center justify-center">
          <SplitSquareHorizontal className="w-4 h-4 text-gray-600" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}
