import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Copy,
  Check,
  TrendingUp,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  FieldGroupHeader,
  TitleInField,
} from "./_shared";

/**
 * Stats / Trust Counter — free-tools self-contained widget.
 *
 * A small animated credibility strip ("15 yrs · 600+ jobs · 24/7 · 30-mile
 * radius"). Numbers count up when scrolled into view; respects
 * prefers-reduced-motion.
 *
 * Like SchemaGenerator / BeforeAfterSlider, this is purely client-side: it
 * bakes the configured stats + count-up into a SELF-CONTAINED inline
 * HTML/CSS/JS snippet. No backend, no API, no hosted script.
 *
 * DS compliance: title-in-field + top-left help cue + 2px input-cluster
 * gaps + single .btn-primary-premium (Copy snippet) + theme tokens (accent
 * color comes from a user-picked hex, validated; structural colors use
 * neutral rgba tokens, no bare #fff/#000 literals).
 */

interface Stat {
  id: string;
  value: string;
  label: string;
}

let idSeq = 0;
const newId = () => `stat-${++idSeq}`;

const DEFAULT_STATS: Stat[] = [
  { id: newId(), value: "15", label: "Years in business" },
  { id: newId(), value: "600+", label: "Jobs completed" },
  { id: newId(), value: "24/7", label: "Emergency service" },
  { id: newId(), value: "30mi", label: "Service radius" },
];

const PRESET_STATS: Omit<Stat, "id">[] = [
  { value: "15", label: "Years in business" },
  { value: "600+", label: "Jobs completed" },
  { value: "24/7", label: "Emergency service" },
  { value: "30mi", label: "Service radius" },
];

const DEFAULT_ACCENT = "#2563EB"; // brand-blue — matches focus-ring token.
const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

/** Normalise a user hex to a safe `#rrggbb`; fall back to brand-blue. */
function safeAccent(input: string): string {
  const v = input.trim();
  if (!HEX_RE.test(v)) return DEFAULT_ACCENT;
  return v.startsWith("#") ? v : `#${v}`;
}

/** Split a stat value into its numeric core + any prefix/suffix (e.g.
 *  "600+" → {prefix:"", num:600, suffix:"+"}). Values with no number
 *  (e.g. "24/7") are emitted as static text — no count-up. */
function splitValue(value: string): { prefix: string; num: number | null; suffix: string } {
  const m = value.match(/^(\D*?)(\d[\d,]*)(.*)$/);
  if (!m) return { prefix: "", num: null, suffix: "" };
  const num = parseInt(m[2].replace(/,/g, ""), 10);
  return { prefix: m[1], num: Number.isFinite(num) ? num : null, suffix: m[3] };
}

/** Build the self-contained, no-backend embed snippet. */
function buildSnippet(stats: Stat[], accent: string): string {
  const id = "wft-stats";
  const acc = safeAccent(accent);
  const clean = stats
    .filter((s) => s.value.trim() || s.label.trim())
    .map((s) => ({ value: s.value.trim(), label: s.label.trim() }));

  const items = clean
    .map((s) => {
      const { prefix, num, suffix } = splitValue(s.value);
      // data-count carries the numeric target; the script counts to it.
      const countAttr = num !== null ? ` data-count="${num}"` : "";
      const display = escapeHtml(s.value);
      const pfx = escapeHtml(prefix);
      const sfx = escapeHtml(suffix);
      const label = escapeHtml(s.label);
      return `    <div class="${id}__item">
      <div class="${id}__value"${countAttr} data-prefix="${pfx}" data-suffix="${sfx}">${display}</div>
      <div class="${id}__label">${label}</div>
    </div>`;
    })
    .join("\n");

  return `<!-- WeFixTrades Stats Counter -->
<div class="${id}" style="--wft-accent:${acc}">
${items}
</div>
<style>
.${id}{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 28px;padding:18px 14px;font-family:inherit;text-align:center}
.${id}__item{flex:1 1 120px;min-width:110px}
.${id}__value{font-size:30px;font-weight:800;line-height:1.1;color:var(--wft-accent)}
.${id}__label{margin-top:4px;font-size:13px;font-weight:500;color:rgba(75,85,99,0.95)}
@media (max-width:480px){.${id}__value{font-size:24px}.${id}{gap:8px 16px}}
</style>
<script>
(function(){
  var root=document.currentScript.previousElementSibling;
  while(root&&!(root.classList&&root.classList.contains("${id}"))){root=root.previousElementSibling;}
  if(!root)return;
  var reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var vals=root.querySelectorAll(".${id}__value");
  function fmt(n){return n.toLocaleString();}
  function run(el){
    var target=parseInt(el.getAttribute("data-count"),10);
    if(isNaN(target))return;
    var pfx=el.getAttribute("data-prefix")||"";
    var sfx=el.getAttribute("data-suffix")||"";
    if(reduce){el.textContent=pfx+fmt(target)+sfx;return;}
    var dur=1200,t0=null;
    function tick(ts){
      if(!t0)t0=ts;
      var p=Math.min(1,(ts-t0)/dur);
      var eased=1-Math.pow(1-p,3);
      el.textContent=pfx+fmt(Math.round(target*eased))+sfx;
      if(p<1)requestAnimationFrame(tick);else el.textContent=pfx+fmt(target)+sfx;
    }
    requestAnimationFrame(tick);
  }
  if("IntersectionObserver" in window){
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(e){if(e.isIntersecting){run(e.target);io.unobserve(e.target);}});
    },{threshold:0.4});
    vals.forEach(function(el){if(el.hasAttribute("data-count"))io.observe(el);});
  }else{
    vals.forEach(run);
  }
})();
</script>
<!-- /WeFixTrades Stats Counter -->`;
}

export default function StatsCounter() {
  usePageTitle("Stats / Trust Counter");
  const { toast } = useToast();

  const [stats, setStats] = useState<Stat[]>(DEFAULT_STATS);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [copied, setCopied] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const snippet = useMemo(() => buildSnippet(stats, accent), [stats, accent]);
  const resolvedAccent = safeAccent(accent);

  useCopilotForm({
    formLabel: "Stats / Trust Counter",
    fields: [
      { key: "accent", label: "Accent color (hex like #2563EB)", required: false },
    ],
    values: { accent },
    onApply: (fills) => {
      for (const f of fills) {
        if (f.field_key === "accent") setAccent(String(f.value ?? ""));
      }
    },
    enabled: true,
  });

  const updateStat = (id: string, patch: Partial<Stat>) =>
    setStats((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addStat = () => {
    if (stats.length >= 4) return;
    setStats((prev) => [...prev, { id: newId(), value: "", label: "" }]);
  };

  const removeStat = (id: string) => {
    if (stats.length <= 2) return;
    setStats((prev) => prev.filter((s) => s.id !== id));
  };

  const applyPreset = () => {
    setStats(PRESET_STATS.map((s) => ({ id: newId(), ...s })));
    setPreviewKey((k) => k + 1);
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
          <span>Stats / Trust Counter</span>
        </span>
      }
    >
      <div data-theme="light" className="qq-paper-surface space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-5 h-5 text-brand-blue" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-gray-900">Stats / Trust Counter</h1>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            A compact credibility strip — years in business, jobs completed,
            response time. The numbers count up the moment they scroll into
            view. The embed is fully self-contained: no script to host, no
            account to load.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration column */}
          <div className="lg:col-span-1 space-y-3">
            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Your stats"
                  help="Add 2–4 stats. Each has a value (e.g. 600+, 15, 24/7) and a label. Numbers count up on view; values without a number (like 24/7) show as-is."
                  right={
                    <button
                      type="button"
                      onClick={applyPreset}
                      className="text-xs font-medium text-brand-blue hover:underline"
                      data-testid="stats-preset"
                    >
                      Use trade preset
                    </button>
                  }
                />
                <ul className="space-y-2">
                  {stats.map((s, i) => (
                    <li
                      key={s.id}
                      className="border border-gray-200 rounded-lg p-3 bg-white space-y-0.5"
                      data-testid={`stat-row-${i}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 grid grid-cols-2 gap-0.5">
                          <TitleInField
                            id={`stat-value-${s.id}`}
                            label="Value"
                            value={s.value}
                            onChange={(v) => updateStat(s.id, { value: v })}
                            placeholder="600+"
                            maxLength={12}
                            help="e.g. 600+, 15, 24/7, 30mi. A leading number counts up."
                          />
                          <TitleInField
                            id={`stat-label-${s.id}`}
                            label="Label"
                            value={s.label}
                            onChange={(v) => updateStat(s.id, { label: v })}
                            placeholder="Jobs completed"
                            maxLength={32}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeStat(s.id)}
                          disabled={stats.length <= 2}
                          className="mt-1 text-gray-400 hover:text-red-600 disabled:opacity-30"
                          aria-label={`Remove stat ${i + 1}`}
                          data-testid={`stat-remove-${i}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {/* Secondary CTA — premium accent reserved for Copy snippet. */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addStat}
                  disabled={stats.length >= 4}
                  data-testid="stats-add"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add stat
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Accent color"
                  help="The colour of the big numbers. Pick anything that matches your brand — defaults to WeFixTrades blue."
                />
                <div className="flex items-center gap-2 pl-5">
                  <input
                    type="color"
                    aria-label="Accent color picker"
                    value={resolvedAccent}
                    onChange={(e) => setAccent(e.target.value)}
                    /* 40px color-picker input (not an icon — inline size avoids
                       the icon-ladder lint while keeping a comfortable target). */
                    style={{ width: 40, height: 40 }}
                    className="rounded-lg border border-gray-200 bg-white cursor-pointer p-0.5"
                    data-testid="stats-accent-picker"
                  />
                  <div className="flex-1">
                    <TitleInField
                      id="stats-accent-hex"
                      label="Hex color"
                      value={accent}
                      onChange={setAccent}
                      placeholder="#2563EB"
                      maxLength={7}
                      help="6-digit hex like #2563EB. Invalid values fall back to brand blue."
                    />
                  </div>
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
                  help="The strip as visitors see it. Numbers count up when it scrolls into view (or instantly if you prefer reduced motion). Use the trade preset to reset the demo."
                  right={
                    <button
                      type="button"
                      onClick={() => setPreviewKey((k) => k + 1)}
                      className="text-xs font-medium text-brand-blue hover:underline"
                      data-testid="stats-replay"
                    >
                      Replay
                    </button>
                  }
                />
                <div className="border border-gray-200 rounded-lg bg-slate-50 p-2">
                  <StatsPreview key={previewKey} stats={stats} accent={resolvedAccent} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <FieldGroupHeader
                  title="Embed snippet"
                  help="Self-contained HTML — paste it once wherever you want the strip. No external script, no account; your stats and accent colour are baked in."
                  right={
                    /* DS rule 4 — single .btn-primary-premium per page. */
                    <Button
                      type="button"
                      onClick={handleCopy}
                      className="btn-primary-premium"
                      data-testid="stats-copy-snippet"
                    >
                      {copied ? <><Check className="w-4 h-4 mr-1.5" />Copied</> : <><Copy className="w-4 h-4 mr-1.5" />Copy snippet</>}
                    </Button>
                  }
                />
                <pre
                  className="text-xs bg-slate-50 text-gray-800 p-3 rounded-md overflow-x-auto border border-gray-200 max-h-[420px]"
                  data-testid="stats-snippet"
                >
                  <code>{snippet}</code>
                </pre>
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

/* ─── Live in-portal preview — mirrors the embed: count-up on view via
   IntersectionObserver, respects prefers-reduced-motion. ─── */
function StatsPreview({ stats, accent }: { stats: Stat[]; accent: string }) {
  const cleaned = stats.filter((s) => s.value.trim() || s.label.trim());
  return (
    <div
      className="flex flex-wrap justify-center items-start gap-y-2 gap-x-7 py-3 px-2 text-center"
      data-testid="stats-preview"
    >
      {cleaned.map((s, i) => (
        <StatItem key={`${s.id}-${i}`} value={s.value.trim()} label={s.label.trim()} accent={accent} />
      ))}
    </div>
  );
}

function StatItem({ value, label, accent }: { value: string; label: string; accent: string }) {
  const { prefix, num, suffix } = splitValue(value);
  const [display, setDisplay] = useState(num !== null ? `${prefix}0${suffix}` : value);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (num === null) { setDisplay(value); return; }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setDisplay(`${prefix}${num.toLocaleString()}${suffix}`); return; }

    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let t0: number | null = null;
    const dur = 1200;
    const animate = (ts: number) => {
      if (t0 === null) t0 = ts;
      const p = Math.min(1, (ts - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(`${prefix}${Math.round(num * eased).toLocaleString()}${suffix}`);
      if (p < 1) raf = requestAnimationFrame(animate);
      else setDisplay(`${prefix}${num.toLocaleString()}${suffix}`);
    };

    let started = false;
    const start = () => { if (!started) { started = true; raf = requestAnimationFrame(animate); } };

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => entries.forEach((e) => { if (e.isIntersecting) { start(); io.disconnect(); } }),
        { threshold: 0.4 },
      );
      io.observe(el);
      return () => { io.disconnect(); cancelAnimationFrame(raf); };
    }
    start();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, accent]);

  return (
    <div ref={ref} className="flex-1 min-w-[100px]">
      <div className="text-3xl font-extrabold leading-tight" style={{ color: accent }}>
        {display}
      </div>
      <div className="mt-1 text-xs font-medium text-gray-600">{label}</div>
    </div>
  );
}
