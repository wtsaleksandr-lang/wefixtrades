/**
 * Wave K — Floating AI assistant bubble inside the QuoteQuick editor.
 *
 * Anchored to the bottom-right of the editor shell so it doesn't collide
 * with the left pane's resize handle. Click the bubble to open the chat
 * panel; on mobile (<= 768px) the panel becomes a full-width bottom sheet.
 *
 * Streaming wire format (server-sent events from /api/quotequick/ai/chat):
 *   event: open      → { model, estimate_usd }
 *   event: text      → { delta }
 *   event: tool_use  → { id, name, input }
 *   event: done      → { cost_usd, snapshot, warn }
 *   event: error     → { message }
 *
 * Each tool_use event is applied locally via `applyAiToolCall`, which
 * mutates ShellState through the setters passed in.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Paperclip, Trash2, AlertTriangle, Sparkles, Minus, ChevronDown, ChevronUp, ChevronLeft } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import CalcAssemblySpinner from '@/components/quote-widget/CalcAssemblySpinner';
import { applyAiToolCall, describeDroppedStyleKeys, type AiToolCall } from './aiToolApplier';
import { imageTemplateToConfig, type ImageTemplate } from './imageTemplateToConfig';
import type {
  ShellState, ShellHeader, ShellResults, ShellStyle, ShellSettings,
} from './types';
import type { TemplateField, TemplateCalculation, TemplateConfig } from '@shared/templatePresets';

const p = platformTheme;

/* ─── Public props ─── */

export interface AIBubbleProps {
  /** Stable id for persisting per-calculator chat history. `default` is fine when no draft exists yet. */
  conversationId?: string;
  /** The whole shell state — read-only here; mutations happen through setters. */
  state: ShellState;
  /** Setters — match the names used in WizardShell. */
  setFields: (next: TemplateField[]) => void;
  setCalculations: (next: TemplateCalculation[]) => void;
  setHeader: (next: ShellHeader) => void;
  setResults: (next: ShellResults) => void;
  setStyle: (next: ShellStyle) => void;
  setSettings: (next: ShellSettings) => void;
  setLogo: (next: string | null) => void;
  /** AI-gen quality (gap 1) — props double as the AiApplierContext
   *  (`applyAiToolCall(call, props)`), so the replace_template applier's
   *  `business_name` support needs this setter threaded through. */
  setBusinessName: (v: string) => void;
  applyTemplatePreset: (presetId: string) => void;
  replaceTemplate: (cfg: TemplateConfig) => void;
  /**
   * "Generate with AI" entry-point seed (Build-tab card). When `seedNonce`
   * increments (and is > 0), the bubble opens, un-collapses, sets the input
   * to `seedPrompt`, and auto-sends ONCE — so generation runs immediately and
   * the user can refine via chat afterwards. Additive + optional: when no seed
   * is sent the bubble behaves exactly as before.
   */
  seedPrompt?: string;
  seedNonce?: number;
  /**
   * Optional reference screenshot fused with `seedPrompt` for the one-shot
   * auto-send (the Build-tab "Generate with AI" card's "+ Add screenshot").
   * A data URL (jpeg/png/webp/gif). When set on a seed, it's attached as the
   * pending image so the auto-sent turn flows into the existing
   * { message, image } request body — the server then switches to the vision
   * model and FUSES the text + image. Optional + additive: omit it and the
   * seed is text-only exactly as before.
   */
  seedImage?: string;
  /**
   * ?ai-upload=1 entry-point — when this nonce increments (and is > 0), the
   * bubble opens, un-collapses, and injects a one-line hint message into the
   * chat ("Attach your quote to get started…") and highlights the paperclip.
   * Browsers block auto-opening the file picker without a user gesture, so
   * NO picker is triggered automatically. The user clicks the paperclip.
   */
  openForUploadNonce?: number;
}

/* ─── Persisted state ─── */

/** Wave 65.1 — one answer option the AI returns with a clarification question. */
interface ClarificationOption {
  label: string;
  hint?: string;
}

/** Wave 65.1 — clarification question the AI returned when it couldn't
 *  confidently extract pricing. Rendered as quick-reply tappable buttons. */
interface PendingClarification {
  question: string;
  options: ClarificationOption[];
  /** When the AI returned a best-effort partial template alongside the
   *  clarification, the client offers a "Use best guess" option that applies it
   *  immediately without another round-trip. */
  bestGuessTemplate?: ImageTemplate;
  /** The original upload source to re-POST when the user picks an option. */
  originalSource: string | File;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Visible "tool used" chips beneath the assistant message. */
  toolChips?: string[];
  /** Pending destructive tool calls awaiting explicit user confirmation. */
  pendingConfirms?: PendingConfirm[];
  imageThumb?: string;
  /** Wave AR-1 — set on the assistant placeholder while we're still waiting
   *  for the first stream event. Used to render the CalcAssemblySpinner with
   *  a context-aware label ("Analyzing your screenshot…" when an image was
   *  attached, "Building your calculator…" otherwise) instead of an empty
   *  bubble. Cleared as soon as text or a tool_use arrives. */
  pendingLabel?: string;
  /** BF-5 — when true, render the 280×120 image-to-template progress card
   *  instead of a plain message bubble. Set while the new wizard
   *  /api/ai/wizard/image-to-template endpoint is running. */
  buildingTemplate?: boolean;
  /** BF-5 — when set, render an error retry CTA inline on the assistant
   *  message bubble (image-to-template failure path). */
  imageError?: string;
  /** Wave 65.1 — when set, render the clarification question + quick-reply
   *  buttons instead of plain message text. */
  clarification?: PendingClarification;
  /** Gap 6 — post-apply follow-up: scripted LOCAL quick-reply chips appended
   *  after a successful replace_template / apply_template confirm. Each chip
   *  either routes its `send` text through the normal send path as a user
   *  message, or (logo chip sentinel) opens the file picker. `consumed`
   *  flips true after one click and disables every chip on the card.
   *  MUST be included in hasVisibleContent or the message is dropped as an
   *  empty husk at render + save time. */
  followUp?: {
    options: Array<{ label: string; send: string }>;
    consumed?: boolean;
  };
}

/** A destructive tool call (replace_template / apply_template) queued for
 *  user confirmation before it's applied to ShellState. */
interface PendingConfirm {
  /** Stable key for React + dedup. */
  key: string;
  call: AiToolCall;
  /** Becomes true once the user clicks Apply or Cancel — keeps the card
   *  in-place as a record but disables the buttons. */
  resolved?: 'applied' | 'cancelled';
}

interface BudgetSnapshot {
  cumulative_usd: number;
  today_usd: number;
  images_used: number;
  // `config` is null for ANONYMOUS users — they have no DB budget; usage is
  // bounded by per-IP rate limits instead. Every consumer must null-guard it.
  config: {
    cap_lifetime_usd: number;
    soft_warn_pct: number;
    per_call_max_usd: number;
    daily_ceiling_usd: number;
    image_lifetime_cap: number;
  } | null;
  scope?: string;
  tier?: string | null;
}

const HISTORY_KEY_PREFIX = 'qq_ai_chat_';
const MAX_IMAGE_WIDTH = 1024;
const JPEG_QUALITY = 0.78;
/** Hard cap on the original IMAGE upload — 10 MB client-side; server resizes
 *  to ~5 MB. Rejecting huge originals up-front saves a slow base64 encode
 *  + an API round-trip. Wave 64 adds separate caps per non-image type. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Wave 64 — non-image upload caps. Mirror server (aiImageToTemplateRoutes.ts):
 *  PDFs up to 15 MB, Excel up to 5 MB, email/text up to 1 MB. */
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_EXCEL_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_BYTES = 1 * 1024 * 1024;

const IMAGE_UPLOAD_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const PDF_UPLOAD_TYPES = new Set(['application/pdf']);
const EXCEL_UPLOAD_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);
const TEXT_UPLOAD_TYPES = new Set(['text/plain', 'message/rfc822']);

type UploadKind = 'image' | 'pdf' | 'excel' | 'email' | null;

/** Browsers often miss the MIME for .eml / .xls — fall back to extension. */
function matchByMimeOrExt(
  mime: string,
  mimeSet: Set<string>,
  filename: string,
  extensions: string[],
): boolean {
  if (mimeSet.has(mime)) return true;
  const lower = filename.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}

function classifyUpload(file: File): UploadKind {
  const t = (file.type || '').toLowerCase();
  if (IMAGE_UPLOAD_TYPES.has(t)) return 'image';
  if (PDF_UPLOAD_TYPES.has(t)) return 'pdf';
  if (matchByMimeOrExt(t, EXCEL_UPLOAD_TYPES, file.name, ['.xlsx', '.xls'])) return 'excel';
  if (matchByMimeOrExt(t, TEXT_UPLOAD_TYPES, file.name, ['.eml', '.txt'])) return 'email';
  return null;
}

/** Native <input accept> attr — mixes MIME + filename extensions for the
 *  picker since browser MIME detection on .eml / .xls is unreliable. */
const WIZARD_ACCEPT_ATTR =
  'image/png,image/jpeg,image/webp,application/pdf,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.ms-excel,.xlsx,.xls,' +
  'text/plain,message/rfc822,.eml,.txt';

function uid(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/* ─── Brand mark (chat rebrand, 2026-06-12) ─────────────────────────────────
 * The QuoteQuick builder is branded with the canonical checkmark mark — the
 * same locked asset the editor top bar uses (`/favicon.svg`, all-blue so it
 * survives light AND dark surfaces; see client/public/brand/README.md).
 * Used in the panel header and as the small avatar beside assistant
 * messages. Decorative only — hidden from AT. */
function BrandMark({ size = 14 }: { size?: number }) {
  return (
    <img
      src="/favicon.svg"
      alt=""
      aria-hidden="true"
      style={{ width: size, height: size, display: 'block' }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

/** A message with nothing visible inside would render as a bare gray bubble
 *  (the "empty placeholders" bug: a streaming placeholder keeps `content: ''`
 *  when the stream errors/aborts before the first token, and those husks were
 *  also persisted to localStorage). Skip them at render AND at save time. */
function hasVisibleContent(m: ChatMessage): boolean {
  return Boolean(
    m.content
    || m.imageThumb
    || m.pendingLabel
    || m.buildingTemplate
    || m.imageError
    || m.clarification
    || m.followUp
    || (m.toolChips && m.toolChips.length > 0)
    || (m.pendingConfirms && m.pendingConfirms.length > 0),
  );
}

function loadHistory(convId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY_PREFIX + convId);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.slice(-40); // cap stored history
    return [];
  } catch { return []; }
}

function saveHistory(convId: string, msgs: ChatMessage[]): void {
  // Drop invisible husks (empty streamed placeholders) so they never pile up
  // in localStorage and re-render as empty gray bubbles on reopen.
  try { localStorage.setItem(HISTORY_KEY_PREFIX + convId, JSON.stringify(msgs.filter(hasVisibleContent).slice(-40))); } catch {}
}

/** Client-side resize a data URL down to <= MAX_IMAGE_WIDTH and JPEG-encode. */
async function resizeImage(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_IMAGE_WIDTH / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no 2d ctx')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = dataUrl;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Tools that wipe the calculator state — require explicit user confirmation
 *  before applying. The model can still call them, but the chip stays "Pending"
 *  until the user clicks [Apply]. */
const DESTRUCTIVE_TOOL_NAMES = new Set(['replace_template', 'apply_template']);

/** Human description of a pending destructive call (shown in the confirm card). */
function describePendingConfirm(call: AiToolCall): { title: string; body: string } {
  const i: any = call.input || {};
  if (call.name === 'apply_template') {
    const name = String(i.preset_id ?? 'a template');
    return {
      title: `Apply "${name}"?`,
      body: 'Your current fields and calculations will be replaced.',
    };
  }
  // replace_template
  const cfg: any = i.template_config ?? {};
  const fieldCount = Array.isArray(cfg.fields) ? cfg.fields.length : 0;
  const calcCount = Array.isArray(cfg.calculations) ? cfg.calculations.length : 0;
  const title = (cfg.header?.title && String(cfg.header.title).trim()) || 'a new calculator';
  return {
    title: `Build "${title}"?`,
    body: `Your current fields will be replaced with ${fieldCount} new field${fieldCount === 1 ? '' : 's'}` +
      (calcCount ? ` and ${calcCount} calculation${calcCount === 1 ? '' : 's'}.` : '.'),
  };
}

/* Sentinel prefix marking a toolChip as a FAILED apply (rendered ⚠, not ✓).
 * toolChips is a string[]; we encode failure in-band so we don't widen the
 * Message type just for one flag. (anti-hallucination Fix 4)
 *
 * TOOL_CHIP_NOTE_PREFIX marks a partial-drop NOTE (rendered subtly — not a ✓
 * success nor a ⚠ failure). Used when an apply succeeded for the VALID
 * remainder but the U6 sanitiser DROPPED some invalid values: the user is told
 * honestly what didn't take, alongside the normal success chip. Same in-band
 * NUL-leader encoding so it can never collide with a real describeTool()
 * label. (U6 restyle-integrity return channel) */
const TOOL_CHIP_FAIL_PREFIX = ' fail:';

/* U6 restyle-integrity — partial-drop note prefix (see TOOL_CHIP_FAIL_PREFIX
 * above). The leading char is the same NUL sentinel the fail prefix uses. */
const TOOL_CHIP_NOTE_PREFIX = ' note:';

/* ─── Gap 6 — post-apply follow-up quick replies ───────────────────────────
 * Scripted LOCAL assistant message appended after a successful
 * replace_template / apply_template confirm. No model round-trip — it only
 * asks a question and offers next actions, claiming nothing beyond what the
 * green "Applied" card already proves, so it cannot violate the
 * anti-hallucination rules. The logo chip is special-cased via sentinel:
 * it opens the existing file picker instead of sending a chat message. */
const FOLLOWUP_UPLOAD_LOGO_SENTINEL = '__followup_upload_logo__';
const FOLLOWUP_QUESTION = 'Your calculator is in the editor — how does it look?';
const FOLLOWUP_OPTIONS: Array<{ label: string; send: string }> = [
  { label: "Looks good — what's next?", send: 'The calculator looks good. What should I do next to finish and publish it?' },
  { label: 'Make some changes', send: "I'd like to make some changes to the calculator." },
  { label: 'Upload my logo', send: FOLLOWUP_UPLOAD_LOGO_SENTINEL },
  { label: 'Fix the pricing logic', send: "The pricing logic needs fixing — let me walk you through what's wrong." },
  { label: 'How do I publish?', send: 'How do I publish this calculator on my website?' },
];

/* ─── Tool-chip label (one-liner the user sees) ─── */
function describeTool(call: AiToolCall): string {
  const i: any = call.input || {};
  switch (call.name) {
    case 'add_field': return `Added field "${i.label ?? i.type ?? 'new field'}"`;
    case 'remove_field': return `Removed field`;
    case 'edit_field': return `Edited field`;
    case 'add_calculation': return `Added calculation "${i.name ?? 'new'}"`;
    case 'remove_calculation': return `Removed calculation`;
    case 'edit_calculation': return `Edited calculation`;
    case 'set_header': return `Updated header`;
    case 'set_results': return `Updated results panel`;
    case 'set_style': return `Restyled the calculator`;
    case 'set_settings': return `Updated settings`;
    case 'set_logo': return `Set the logo`;
    case 'apply_template': return `Applied template "${i.preset_id ?? ''}"`;
    case 'replace_template': return `Built a new calculator`;
    case 'prefill_fields': return `Prefilled fields`;
    default: return call.name;
  }
}

/* ─── Streaming reader ─── */

interface StreamHandlers {
  onOpen?: (meta: { model: string; estimate_usd: number }) => void;
  onText: (delta: string) => void;
  onToolUse: (call: AiToolCall) => void;
  onDone: (final: { cost_usd: number; snapshot: BudgetSnapshot; warn?: boolean }) => void;
  onError: (msg: string) => void;
}

async function streamChat(
  body: Record<string, unknown>,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/quotequick/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let parsed: any = null;
    try { parsed = await res.json(); } catch {}
    if (res.status === 403 && parsed?.error === 'budget_exceeded') {
      handlers.onError(`budget:${parsed.code}`);
      return;
    }
    // Wave AD-2 — surface auth errors as a distinct code so the UI can render
    // a clear "sign in to use AI" message instead of the generic
    // "Authentication required" string the middleware returns. Common case:
    // the wizard was opened via `/wizard?token=...` from a logged-out
    // browser, so the user has token-scoped read access but no session
    // cookie for the AI chat endpoint.
    if (res.status === 401) {
      handlers.onError('auth:required');
      return;
    }
    handlers.onError(parsed?.error || `HTTP ${res.status}`);
    return;
  }
  if (!res.body) { handlers.onError('no_body'); return; }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  // Parse SSE frames: each event terminates with a blank line.
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
      let event = 'message'; let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (!data) continue;
      let parsed: any = null;
      try { parsed = JSON.parse(data); } catch { continue; }
      if (event === 'open') handlers.onOpen?.(parsed);
      else if (event === 'text') handlers.onText(String(parsed.delta || ''));
      else if (event === 'tool_use') handlers.onToolUse(parsed as AiToolCall);
      else if (event === 'done') handlers.onDone(parsed);
      else if (event === 'error') handlers.onError(String(parsed.message || 'error'));
    }
  }
}

/* ─── Component ─── */

/** Wave 55 — persisted collapse state for the wizard AI chat panel.
 *  When collapsed, the panel shrinks to just its header bar (~46px tall)
 *  with the fold chevron still visible at top-center. Click toggles. */
const AI_COLLAPSE_KEY = 'qq_wizard_ai_chat_collapsed';

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(AI_COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveCollapsed(v: boolean): void {
  try {
    localStorage.setItem(AI_COLLAPSE_KEY, v ? '1' : '0');
  } catch {
    /* ignore quota / privacy-mode */
  }
}

/* #13 — frosted-glass SIDE TAB launcher. The tab is docked to the RIGHT edge
 *  of the viewport; the user can drag it VERTICALLY to reposition it along
 *  that edge (the persisted value is the tab's top in viewport px). `null`
 *  means "never dragged" → fall back to the CSS default vertical anchor. The
 *  old circular-badge X coordinate is intentionally dropped — the tab is
 *  edge-docked, so only its vertical offset is user-controllable. */
const AI_BUBBLE_POS_KEY = 'qq_wizard_ai_tab_pos';
/** Rendered height of the icon-first side tab (must match the CSS below). Used
 *  only to clamp the drag so the whole tab stays on-screen. */
const AI_TAB_HEIGHT = 64;
/** Min drag distance (px) before a pointer-down is treated as a drag rather
 *  than a click — so a normal tap still opens the panel. */
const AI_BUBBLE_DRAG_THRESHOLD = 4;
/** Horizontal pull (px, leftward = negative dx) past which a drag is treated
 *  as "drag-to-open" — the user grabbed the tab and pulled it out into the
 *  chat window, mirroring the bottom-sheet grab affordance. */
const AI_TAB_OPEN_PULL = 36;

/** Vertical-only tab position: `y` is the tab's top in viewport px. */
interface BubblePos { y: number }

function loadBubblePos(): BubblePos | null {
  try {
    const raw = localStorage.getItem(AI_BUBBLE_POS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<BubblePos>;
    if (typeof v?.y === 'number' && Number.isFinite(v.y)) {
      return { y: v.y };
    }
    return null;
  } catch {
    return null;
  }
}

function saveBubblePos(pos: BubblePos): void {
  try {
    localStorage.setItem(AI_BUBBLE_POS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore quota / privacy-mode */
  }
}

/** Clamp a desired tab-top so the whole tab stays inside the viewport with an
 *  8px margin. Guarded for SSR / zero-size windows. */
function clampBubblePos(pos: BubblePos): BubblePos {
  if (typeof window === 'undefined') return pos;
  const margin = 8;
  const maxY = Math.max(margin, window.innerHeight - AI_TAB_HEIGHT - margin);
  return {
    y: Math.min(Math.max(margin, pos.y), maxY),
  };
}

/* ─── Mobile middle-floating panel — free resize (2026-06-16) ───────────────
 * On mobile (≤768px) the open chat is a frosted-glass card floating in the
 * MIDDLE of the screen (preview visible above AND below), not a docked bottom
 * sheet. The user free-resizes its HEIGHT by dragging a handle on the bottom
 * edge of the card — mirroring MobileBottomSheet's pointer drag-to-resize:
 *   - pointer capture + a tap-vs-drag threshold,
 *   - live pixel height during the drag, rest at the released height,
 *   - clamped to [MIN, max-that-keeps-margins], and
 *   - persisted as a FRACTION of the viewport so it restores proportionally
 *     across viewport sizes / orientations (localStorage). Reduced-motion is
 *     honoured by the CSS (transition killed during drag anyway).
 * A separate grab handle on the TOP edge of the card is drag-to-FOLD: grab it
 * and drag inward (down) to fold the card back to the tab — the inverse of the
 * tab's drag-to-open. Both keep a tap fallback (the header min/close buttons). */
const AI_PANEL_HEIGHT_FRAC_KEY = 'qq_wizard_ai_panel_height_frac';
/** Smallest open height (px) the floating card ever rests at. */
const AI_PANEL_MIN_PX = 240;
/** Vertical margin (px) kept ABOVE and BELOW the card so the preview is always
 *  partly visible top and bottom — the "floating in the middle" look. */
const AI_PANEL_MARGIN_PX = 64;
/** Default height as a fraction of the viewport for a first / unpersisted open
 *  (~0.6 → card ≈ 60% tall, leaving ≈ 20% preview above + 20% below). */
const AI_PANEL_DEFAULT_FRAC = 0.6;
/** Tap-vs-drag threshold (px) for the resize / fold handles — mirrors the
 *  MobileBottomSheet TAP_THRESHOLD_PX. */
const AI_PANEL_DRAG_THRESHOLD = 6;
/** Downward drag (px) on the top grab handle past which a release folds the
 *  card back to the tab — the inverse of AI_TAB_OPEN_PULL. */
const AI_PANEL_FOLD_PULL = 72;

const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Live max open height (px): viewport minus a top+bottom margin so the card
 *  always floats with preview visible above and below. SSR-safe. */
function panelMaxPx(): number {
  if (typeof window === 'undefined') return 480;
  return Math.max(AI_PANEL_MIN_PX, window.innerHeight - AI_PANEL_MARGIN_PX * 2);
}

function loadPanelHeightFrac(): number {
  if (typeof window === 'undefined') return AI_PANEL_DEFAULT_FRAC;
  try {
    const raw = localStorage.getItem(AI_PANEL_HEIGHT_FRAC_KEY);
    if (raw !== null) {
      const n = parseFloat(raw);
      if (Number.isFinite(n) && n > 0 && n <= 1) return n;
    }
  } catch { /* private mode — use default */ }
  return AI_PANEL_DEFAULT_FRAC;
}

function savePanelHeightFrac(frac: number): void {
  if (typeof window === 'undefined' || !Number.isFinite(frac) || frac <= 0) return;
  try {
    localStorage.setItem(AI_PANEL_HEIGHT_FRAC_KEY, String(clampNum(frac, 0.05, 1)));
  } catch { /* ignore quota / privacy-mode */ }
}

/** Resolve the persisted fraction to an open height (px), clamped to the live
 *  geometry so it never starves the top/bottom margins. */
function panelHeightFromFrac(frac: number): number {
  if (typeof window === 'undefined') return AI_PANEL_MIN_PX;
  return clampNum(frac * window.innerHeight, AI_PANEL_MIN_PX, panelMaxPx());
}

export default function AIBubble(props: AIBubbleProps) {
  const { conversationId = 'default', state, seedPrompt, seedNonce, seedImage, openForUploadNonce } = props;
  const [open, setOpen] = useState(false);
  /** Premium fold/unfold — transient "animating" phase so the side-tab and the
   *  chat window can cross-fade via a GPU transform (translate+scale+opacity).
   *  Set the instant `open` flips, cleared after the transition window. Drives
   *  `data-state="animating"` on the toggle + panel for the visual-review gate
   *  and lets reduced-motion short-circuit it to instant. */
  const [animating, setAnimating] = useState(false);
  const reduceMotionRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    try { reduceMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch { /* ignore */ }
  }, []);
  // Pulse the animating phase whenever the panel opens or closes.
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current === open) return;
    prevOpenRef.current = open;
    if (reduceMotionRef.current) { setAnimating(false); return; }
    setAnimating(true);
    const t = window.setTimeout(() => setAnimating(false), 300);
    return () => window.clearTimeout(t);
  }, [open]);
  /** "Generate with AI" auto-send latch. Set true when a new seed arrives;
   *  the second effect below clears it after firing onSend exactly once. */
  const autoSendRef = useRef(false);
  /** Wave 55 — fold/unfold the open chat panel down to just its header bar.
   *  Distinct from `open` (which controls the bubble↔panel toggle). When
   *  collapsed, the body + footer hide but the header (with the fold
   *  chevron at top-center) remains so the user can re-expand without
   *  closing the conversation. State persists to localStorage. */
  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed());
  useEffect(() => { saveCollapsed(collapsed); }, [collapsed]);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory(conversationId));
  const [input, setInput] = useState('');
  /** UX fix bundle (2026-05-22) — wizard AIBubble was still using the original
   *  ~36px single-line textarea even though BD-3c shipped expand-on-click on
   *  the customer-facing bubble. Mirror the same pattern here so the wizard
   *  user gets the same comfortable typing area. Default 64px → 120px on
   *  focus; collapse back on blur when empty. */
  const [inputFocused, setInputFocused] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  /** Wave 64 — non-image uploads (PDF / Excel / email). Held alongside
   *  `pendingImage` so the existing image flow stays untouched. When the
   *  user clicks Send and this is set, we POST the raw File to the multi-
   *  format endpoint (no client-side resize). */
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [streamErr, setStreamErr] = useState<string | null>(null);
  const [budget, setBudget] = useState<BudgetSnapshot | null>(null);
  const [budgetLoaded, setBudgetLoaded] = useState(false);
  const [warn, setWarn] = useState(false);
  const [capExceeded, setCapExceeded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ─── B3 fix (2026-05-20) ───────────────────────────────────────────────
   * The editor frame (`.qq-editor-frame`) has `transform` + `will-change:
   * transform`, which makes it a containing block for any descendant with
   * `position: fixed`. That meant the bubble's `bottom: 18px` resolved
   * relative to the SCROLLABLE frame (whose bottom is far below the
   * viewport on the Build tab), pushing the bubble ~305px below the fold.
   *
   * Fix: portal the floating bubble + panel out of the editor frame to
   * `document.body`, so `position: fixed` resolves against the real
   * viewport. We mirror the editor shell's `data-theme` onto the portal
   * root so the existing `[data-theme="dark"] .qq-ai-...` rules keep
   * working unchanged. An anchor span is rendered in-tree so we can locate
   * the originating editor shell at mount time (and observe theme changes).
   * ──────────────────────────────────────────────────────────────────── */
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [portalEl, setPortalEl] = useState<HTMLDivElement | null>(null);

  /* Item 11 — draggable circular badge. `bubblePos` (top-left viewport
   *  coords) overrides the CSS corner anchor once the user drags. The drag is
   *  pointer-based with a small threshold so a tap still opens the panel.
   *  `dragging` suppresses the click-to-open that would otherwise fire on
   *  pointer-up at the end of a drag. */
  const [bubblePos, setBubblePos] = useState<BubblePos | null>(() => loadBubblePos());
  const [bubbleDragging, setBubbleDragging] = useState(false);
  /** #13 — live leftward pull (0..1) while drag-to-open is in progress, so the
   *  tab can give a small visual "peel out" cue as the user pulls it. */
  const [tabPull, setTabPull] = useState(0);
  const bubbleDragRef = useRef<{
    pointerId: number;
    startX: number; startY: number;
    originY: number;
    moved: boolean;
    /** Set once the leftward pull crosses AI_TAB_OPEN_PULL — pointer-up then
     *  opens the panel instead of just repositioning. */
    willOpen: boolean;
  } | null>(null);

  // Re-clamp a persisted position into the current viewport on mount / resize
  // so a position saved at one window size never strands the badge off-screen.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => {
      setBubblePos((prev) => (prev ? clampBubblePos(prev) : prev));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onBubblePointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    // Only primary button / touch / pen.
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const rect = e.currentTarget.getBoundingClientRect();
    bubbleDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      originY: rect.top,
      moved: false,
      willOpen: false,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
  }, []);

  const onBubblePointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = bubbleDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < AI_BUBBLE_DRAG_THRESHOLD) return;
    d.moved = true;
    if (!bubbleDragging) setBubbleDragging(true);
    // #13 — a LEFTWARD pull (the tab lives on the right edge) reads as
    // "drag me out into the chat" — mirror the bottom-sheet grab. Vertical
    // movement repositions the tab along the edge.
    const leftPull = Math.max(0, -dx);
    d.willOpen = leftPull >= AI_TAB_OPEN_PULL;
    setTabPull(Math.min(1, leftPull / AI_TAB_OPEN_PULL));
    setBubblePos(clampBubblePos({ y: d.originY + dy }));
  }, [bubbleDragging]);

  const endBubbleDrag = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = bubbleDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    bubbleDragRef.current = null;
    setTabPull(0);
    if (d.moved) {
      // Commit + persist the final clamped vertical position.
      setBubblePos((prev) => {
        if (prev) saveBubblePos(prev);
        return prev;
      });
      // Drag-to-open: a sufficient leftward pull unfolds the panel.
      if (d.willOpen) {
        setOpen(true);
        setCollapsed(false);
      }
      // Defer clearing so the synthetic click (fired after pointerup) sees
      // `bubbleDragging === true` and is ignored by the click handler.
      window.setTimeout(() => setBubbleDragging(false), 0);
    } else {
      setBubbleDragging(false);
    }
  }, []);

  /* ─── Swipe-to-close on the panel header ─────────────────────────────────
   * Touch the header and swipe RIGHT (toward the tab edge it folds back into)
   * or DOWN (dismiss like a bottom sheet) past a threshold to CLOSE the chat —
   * mirroring the swipe-to-open on the folded tab. Tap on the header is left
   * untouched (no movement → no close). Pointer-based so it works for touch +
   * pen; mouse drags on the header are ignored so text selection still works. */
  const HEADER_SWIPE_CLOSE_PX = 56;
  const headerSwipeRef = useRef<{ pointerId: number; startX: number; startY: number; fired: boolean } | null>(null);
  const onHeaderPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return; // touch/pen affordance only
    headerSwipeRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, fired: false };
  }, []);
  const onHeaderPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const s = headerSwipeRef.current;
    if (!s || s.pointerId !== e.pointerId || s.fired) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    // Rightward (fold back to the edge) OR downward (dismiss) past threshold.
    if (dx >= HEADER_SWIPE_CLOSE_PX || dy >= HEADER_SWIPE_CLOSE_PX) {
      s.fired = true;
      setOpen(false);
    }
  }, []);
  const onHeaderPointerEnd = useCallback(() => {
    headerSwipeRef.current = null;
  }, []);

  /* ─── Mobile middle-floating card — free resize + drag-to-fold ────────────
   * Mirrors MobileBottomSheet's pointer drag model: pointer capture, a
   * tap-vs-drag threshold, a live pixel height during the drag, rest-at-release
   * (clamped), and the resting height persisted as a viewport fraction. Two
   * handles drive it:
   *   - BOTTOM edge handle → free resize the card height.
   *   - TOP edge grab handle → drag DOWN past a pull threshold to FOLD back to
   *     the tab (the inverse of the tab's drag-to-open).
   * Desktop is unaffected — these handles are display:none above 768px and the
   * inline height only applies inside the mobile CSS branch. */
  const [panelHeightPx, setPanelHeightPx] = useState<number>(() => panelHeightFromFrac(loadPanelHeightFrac()));
  // Live pixel height while a resize drag is in progress (null = use resting).
  const [panelDragHeight, setPanelDragHeight] = useState<number | null>(null);
  const [panelResizing, setPanelResizing] = useState(false);
  const panelResizeRef = useRef<
    { pointerId: number; startY: number; startH: number; moved: number } | null
  >(null);

  // Re-derive the resting height from the persisted fraction on resize /
  // orientation change so the card stays proportional and never strands itself
  // off-screen at a new viewport size.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => {
      setPanelHeightPx(panelHeightFromFrac(loadPanelHeightFrac()));
      setPanelDragHeight((cur) => (cur === null ? null : Math.min(cur, panelMaxPx())));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // The rendered mobile card height (live drag → resting). Clamped to geometry.
  const panelCurrentHeight = panelDragHeight !== null
    ? clampNum(panelDragHeight, AI_PANEL_MIN_PX, panelMaxPx())
    : panelHeightPx;

  const onPanelResizeDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    panelResizeRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startH: panelCurrentHeight,
      moved: 0,
    };
    setPanelResizing(true);
    setPanelDragHeight(panelCurrentHeight);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
  }, [panelCurrentHeight]);

  const onPanelResizeMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = panelResizeRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const delta = e.clientY - d.startY; // down = positive
    d.moved = Math.max(d.moved, Math.abs(delta));
    // The handle is on the BOTTOM edge: drag DOWN grows the card, UP shrinks it.
    const next = clampNum(d.startH + delta, AI_PANEL_MIN_PX, panelMaxPx());
    setPanelDragHeight(next);
  }, []);

  const onPanelResizeEnd = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = panelResizeRef.current;
    panelResizeRef.current = null;
    setPanelResizing(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!d) { setPanelDragHeight(null); return; }
    // Sub-threshold = a tap → no-op (the handle is a resize affordance only).
    if (d.moved < AI_PANEL_DRAG_THRESHOLD) { setPanelDragHeight(null); return; }
    // Real drag → rest at the released height + persist as a viewport fraction.
    const rested = clampNum(panelDragHeight ?? d.startH, AI_PANEL_MIN_PX, panelMaxPx());
    setPanelHeightPx(rested);
    if (typeof window !== 'undefined' && window.innerHeight > 0) {
      savePanelHeightFrac(rested / window.innerHeight);
    }
    setPanelDragHeight(null);
  }, [panelDragHeight]);

  /* TOP grab handle — drag DOWN to fold the card back to the tab. A short
   * sub-threshold tap toggles the collapse (header-only) state as a fallback,
   * matching the bottom sheet's grabber tap behaviour. */
  const panelGrabRef = useRef<
    { pointerId: number; startY: number; moved: number; willFold: boolean } | null
  >(null);
  const [panelGrabbing, setPanelGrabbing] = useState(false);
  const onPanelGrabDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    panelGrabRef.current = { pointerId: e.pointerId, startY: e.clientY, moved: 0, willFold: false };
    setPanelGrabbing(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
  }, []);
  const onPanelGrabMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = panelGrabRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = e.clientY - d.startY; // down = positive
    d.moved = Math.max(d.moved, Math.abs(dy));
    d.willFold = dy >= AI_PANEL_FOLD_PULL;
  }, []);
  const onPanelGrabEnd = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = panelGrabRef.current;
    panelGrabRef.current = null;
    setPanelGrabbing(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!d) return;
    if (d.moved < AI_PANEL_DRAG_THRESHOLD) {
      // Tap fallback → toggle the header-only collapse.
      setCollapsed((v) => !v);
      return;
    }
    // Dragged inward far enough → fold the card back to the tab.
    if (d.willFold) setOpen(false);
  }, []);

  useEffect(() => {
    const div = document.createElement('div');
    div.className = 'qq-ai-portal';
    // Embed mode (or pre-mount) → fallback to "light".
    const shell = anchorRef.current?.closest<HTMLElement>('[data-theme]');
    div.setAttribute('data-theme', shell?.getAttribute('data-theme') ?? 'light');
    document.body.appendChild(div);
    setPortalEl(div);

    // Mirror live data-theme changes from the shell (day/night toggle).
    let mo: MutationObserver | null = null;
    if (shell) {
      mo = new MutationObserver(() => {
        div.setAttribute('data-theme', shell.getAttribute('data-theme') ?? 'light');
      });
      mo.observe(shell, { attributes: true, attributeFilter: ['data-theme'] });
    }
    return () => {
      mo?.disconnect();
      div.remove();
    };
  }, []);

  // Persist history on every change.
  useEffect(() => { saveHistory(conversationId, messages); }, [conversationId, messages]);

  // Auto-scroll the message list when new content arrives.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // Lazy-load the budget snapshot when the panel first opens.
  useEffect(() => {
    if (!open || budgetLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/quotequick/ai/budget', { credentials: 'include' });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setBudget(data);
          // Anonymous users get `config: null` (no DB budget cap — bounded by
          // per-IP rate limits). Only evaluate the cap/warn thresholds when a
          // config is present.
          const cfg = data.config;
          if (cfg) {
            const pct = cfg.cap_lifetime_usd > 0
              ? data.cumulative_usd / cfg.cap_lifetime_usd
              : 0;
            if (data.cumulative_usd >= cfg.cap_lifetime_usd) setCapExceeded(true);
            else if (pct >= cfg.soft_warn_pct / 100) setWarn(true);
          }
        }
      } catch {}
      if (!cancelled) setBudgetLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [open, budgetLoaded]);

  /* ─── Compose helpers ─── */

  const onPickImage = useCallback(async (file: File) => {
    // Wave 64 — accept image / PDF / Excel / email. Image is the original
    // path (resize on canvas → data URL); non-image kinds are handed to the
    // server as the raw File via FormData (no client-side resize).
    const kind = classifyUpload(file);
    if (!kind) {
      setStreamErr('Use a photo, PDF, Excel sheet, or email.');
      return;
    }
    // Per-MIME size guard. The server enforces the same caps; this one is
    // just so the user doesn't wait through a slow upload.
    if (kind === 'image' && file.size > MAX_UPLOAD_BYTES) {
      setStreamErr('Image is too large — keep it under 10 MB.');
      return;
    }
    if (kind === 'pdf' && file.size > MAX_PDF_BYTES) {
      setStreamErr('PDF is too large — keep it under 15 MB.');
      return;
    }
    if (kind === 'excel' && file.size > MAX_EXCEL_BYTES) {
      setStreamErr('Spreadsheet is too large — keep it under 5 MB.');
      return;
    }
    if (kind === 'email' && file.size > MAX_TEXT_BYTES) {
      setStreamErr('Email/text file is too large — keep it under 1 MB.');
      return;
    }
    setStreamErr(null);
    if (kind === 'image') {
      try {
        const raw = await fileToDataUrl(file);
        const resized = await resizeImage(raw);
        setPendingImage(resized);
        setPendingFile(null);
      } catch (err: any) {
        setStreamErr(String(err?.message || err));
      }
      return;
    }
    // Non-image kinds: hold the raw File until the user clicks Send.
    setPendingImage(null);
    setPendingFile(file);
  }, []);

  /* ─── BF-5 + Wave 64 — pricing-doc-to-template.
   *  Routes images (no text) or any uploaded pricing doc (PDF / Excel /
   *  email) to the dedicated multi-format endpoint. Returns a strict JSON
   *  template the wizard can drop in via `replaceTemplate()` (which feeds
   *  the BD-3a undo stack). The chat shows the 280×120 progress card while
   *  the request is in flight.
   *
   *  Accepts either:
   *    - a data-URL string (legacy image path; already-resized by
   *      `resizeImage`).
   *    - a raw File   (Wave 64 multi-format path; sent as-is).
   */
  const onImageToTemplate = useCallback(async (source: string | File) => {
    if (sending) return;
    const isFile = source instanceof File;
    const sourceKind: UploadKind = isFile ? classifyUpload(source) : 'image';
    const userMsgId = uid();
    const assistantId = uid();
    const userContent =
      sourceKind === 'image' ? 'Build a calculator from this image'
        : sourceKind === 'pdf' ? 'Build a calculator from this PDF'
          : sourceKind === 'excel' ? 'Build a calculator from this spreadsheet'
            : sourceKind === 'email' ? 'Build a calculator from this email'
              : 'Build a calculator from this file';
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: 'user',
        content: userContent,
        // Only attach a thumbnail when we have an actual image data URL.
        imageThumb: !isFile ? source : undefined,
      },
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        buildingTemplate: true,
      },
    ]);
    setPendingImage(null);
    setPendingFile(null);
    setSending(true);
    setStreamErr(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const form = new FormData();
      if (isFile) {
        // Wave 64 — non-image (or any) raw File path. Multer's fieldname is
        // still `image` for backward compatibility with the server route.
        form.append('image', source, source.name);
      } else {
        // Legacy image-data-URL path: decode → Blob → FormData. Multer needs
        // the original mime type so it can apply the file-type filter.
        const match = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(source);
        let blob: Blob;
        if (match) {
          const bin = atob(match[2]);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          blob = new Blob([bytes], { type: match[1] });
        } else {
          // Fallback: best-effort fetch (works for blob:/http: URLs too).
          const res = await fetch(source);
          blob = await res.blob();
        }
        const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
        form.append('image', blob, `quote.${ext}`);
      }

      const res = await fetch('/api/ai/wizard/image-to-template', {
        method: 'POST',
        body: form,
        credentials: 'include',
        signal: controller.signal,
      });

      if (!res.ok) {
        let body: any = null;
        try { body = await res.json(); } catch {}
        const message =
          body?.message ||
          (res.status === 401 ? 'Sign in to use the builder.' :
           res.status === 429 ? 'You can only generate 5 templates per hour. Try again later.' :
           res.status === 413 ? 'File is too large — keep images under 5 MB and PDFs/Excel/email under 15 MB.' :
           'Sorry, I couldn\'t read that file. Try a clearer copy or paste your details as text.');
        setMessages((prev) => prev.map(m =>
          m.id === assistantId
            ? { ...m, buildingTemplate: false, content: '', imageError: message }
            : m
        ));
        return;
      }

      const data = await res.json() as {
        template: ImageTemplate;
        clarification?: { question: string; options: ClarificationOption[]; reason?: string };
        styling?: unknown;
      };

      /* Wave 65.1 — when the AI returned a clarification question, render it
       * as quick-reply buttons instead of applying a template. The user taps an
       * option (or types a free-text reply) and we re-POST the same file with
       * the answer. We pass the best-effort partial template through so the
       * "Use best guess" button can apply it without another round-trip. */
      if (data.clarification) {
        setMessages((prev) => prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                buildingTemplate: false,
                content: '',
                clarification: {
                  question: data.clarification!.question,
                  options: data.clarification!.options,
                  // If a partial template came alongside the clarification,
                  // offer a "Use best guess" escape hatch.
                  bestGuessTemplate:
                    (data.template?.basePrice != null || (data.template?.lineItems?.length ?? 0) > 0)
                      ? data.template
                      : undefined,
                  originalSource: source,
                },
              }
            : m
        ));
        return;
      }

      const cfg = imageTemplateToConfig(data.template);

      // Apply directly via the existing `replaceTemplate` setter — same path
      // the AI's `replace_template` tool uses, so it joins the undo stack.
      try {
        props.replaceTemplate(cfg);
      } catch (err: any) {
        setStreamErr(`apply failed: ${err?.message ?? err}`);
      }

      // Notify the rest of the shell (analytics, BD-3a undo banner, etc.).
      // `source` stays as "image" for image inputs to keep existing analytics
      // event names stable; Wave 64 emits the new fine-grained kinds for
      // non-image inputs.
      try {
        window.dispatchEvent(new CustomEvent('qq-wizard:template-generated', {
          detail: { source: sourceKind ?? 'image', raw: data.template, config: cfg },
        }));
      } catch { /* best-effort */ }

      const summary = `Built "${cfg.name}" with ${cfg.fields.length} field${cfg.fields.length === 1 ? '' : 's'} and ${cfg.calculations.length} calculation${cfg.calculations.length === 1 ? '' : 's'}.`;
      setMessages((prev) => prev.map(m =>
        m.id === assistantId
          ? {
              ...m,
              buildingTemplate: false,
              content: summary,
              toolChips: [...(m.toolChips ?? []), 'Replaced template from image'],
            }
          : m
      ));
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setMessages((prev) => prev.map(m =>
          m.id === assistantId ? { ...m, buildingTemplate: false, content: 'Cancelled.' } : m
        ));
      } else {
        setMessages((prev) => prev.map(m =>
          m.id === assistantId
            ? { ...m, buildingTemplate: false, content: '', imageError: "Sorry, I couldn't read that file. Try a clearer copy or paste your details as text." }
            : m
        ));
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [sending, props]);

  /* ─── Wave 65.1 — clarification answer handler ───────────────────────────
   * Called when the user taps a quick-reply option OR sends a free-text reply
   * while a clarification is pending. Re-POSTs the original file with the
   * answer so the server can complete the extraction in a second AI call.
   * The "Use best guess" path applies the partial template without a round-trip.
   */
  const onClarificationAnswer = useCallback(async (
    messageId: string,
    answer: string,
    clarification: PendingClarification,
  ) => {
    // "Use best guess" — apply the partial template immediately, no round-trip.
    if (answer === '__best_guess__' && clarification.bestGuessTemplate) {
      const cfg = imageTemplateToConfig(clarification.bestGuessTemplate);
      try { props.replaceTemplate(cfg); } catch { /* best-effort */ }
      setMessages((prev) => prev.map(m =>
        m.id === messageId
          ? { ...m, clarification: undefined, content: `Applied best-guess template: "${cfg.name}".` }
          : m
      ));
      return;
    }

    if (sending) return;

    // Re-POST the original file with the clarification answer attached.
    setMessages((prev) => prev.map(m =>
      m.id === messageId
        ? {
            ...m,
            clarification: undefined,
            content: '',
            buildingTemplate: true,
          }
        : m
    ));
    setSending(true);
    setStreamErr(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const form = new FormData();
      const src = clarification.originalSource;
      if (src instanceof File) {
        form.append('image', src, src.name);
      } else {
        // Data URL → Blob
        const match = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(src);
        let blob: Blob;
        if (match) {
          const bin = atob(match[2]);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          blob = new Blob([bytes], { type: match[1] });
        } else {
          const r = await fetch(src);
          blob = await r.blob();
        }
        const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
        form.append('image', blob, `quote.${ext}`);
      }
      form.append('clarificationAnswer', answer);

      const res = await fetch('/api/ai/wizard/image-to-template', {
        method: 'POST',
        body: form,
        credentials: 'include',
        signal: controller.signal,
      });

      if (!res.ok) {
        let body: any = null;
        try { body = await res.json(); } catch {}
        const message = body?.message || 'Sorry, I couldn\'t extract the pricing. Try again.';
        setMessages((prev) => prev.map(m =>
          m.id === messageId
            ? { ...m, buildingTemplate: false, content: '', imageError: message }
            : m
        ));
        return;
      }

      const data = await res.json() as { template: ImageTemplate };
      const cfg = imageTemplateToConfig(data.template);
      try { props.replaceTemplate(cfg); } catch (err: any) {
        setStreamErr(`apply failed: ${err?.message ?? err}`);
      }
      try {
        window.dispatchEvent(new CustomEvent('qq-wizard:template-generated', {
          detail: { source: 'image', raw: data.template, config: cfg },
        }));
      } catch { /* best-effort */ }

      const summary = `Got it — built "${cfg.name}" with ${cfg.fields.length} field${cfg.fields.length === 1 ? '' : 's'}.`;
      setMessages((prev) => prev.map(m =>
        m.id === messageId
          ? {
              ...m,
              buildingTemplate: false,
              content: summary,
              toolChips: [...(m.toolChips ?? []), 'Replaced template from image'],
            }
          : m
      ));
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setMessages((prev) => prev.map(m =>
          m.id === messageId ? { ...m, buildingTemplate: false, content: 'Cancelled.' } : m
        ));
      } else {
        setMessages((prev) => prev.map(m =>
          m.id === messageId
            ? { ...m, buildingTemplate: false, content: '', imageError: 'Sorry, something went wrong. Try again.' }
            : m
        ));
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [sending, props]);

  /** Gap 6 — core send path shared by the composer (onSend) and the
   *  follow-up quick-reply chips. Appends `text` as a user message, streams
   *  the model reply, and applies/queues tool calls — exactly the path the
   *  typed input takes. Callers own composer-state cleanup (input/pending
   *  image); this function never touches them. */
  const sendText = useCallback(async (text: string, imageToSend: string | null = null) => {
    if (!text || sending || capExceeded) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text,
      imageThumb: imageToSend ?? undefined,
    };
    const assistantId = uid();
    // Wave AR-1 — choose a label up-front so we can render an inline
    // CalcAssemblySpinner inside the empty placeholder. Image flow gets the
    // multi-stage label; text-only chat gets "Thinking…".
    const placeholderLabel = imageToSend ? 'Analyzing your screenshot…' : 'Thinking…';
    const placeholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      toolChips: [],
      pendingLabel: placeholderLabel,
    };

    // Build the history snapshot we'll send to the server BEFORE adding the
    // new user message (server signature expects history excluding the
    // current turn).
    const historyForServer = messages.map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, userMsg, placeholder]);
    setSending(true);
    setStreamErr(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        {
          message: text,
          image: imageToSend ?? undefined,
          history: historyForServer,
          shellState: state,
        },
        {
          onText: (delta) => {
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, content: m.content + delta, pendingLabel: undefined }
                : m
            ));
          },
          onToolUse: (call) => {
            // Destructive tools (replace_template / apply_template) wipe the
            // calculator state. Queue them for user confirmation rather than
            // applying immediately — the user clicks [Apply] in the inline
            // card to commit. Every other tool applies right away.
            if (DESTRUCTIVE_TOOL_NAMES.has(call.name)) {
              const confirmKey = call.id ?? `pending_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? {
                    ...m,
                    pendingLabel: undefined,
                    pendingConfirms: [...(m.pendingConfirms ?? []), { key: confirmKey, call }],
                  }
                  : m
              ));
              return;
            }
            let applyFailed = false;
            let droppedKeys: string[] = [];
            try {
              const result = applyAiToolCall(call, props);
              // U6 restyle-integrity return channel — set_style DROPS invalid
              // colour/radius/font values and keeps the valid remainder. Capture
              // the dropped keys so we can tell the user honestly what didn't
              // take, instead of letting the ✓ chip claim the whole change landed.
              droppedKeys = result?.droppedKeys ?? [];
            } catch (err: any) {
              // Even on apply failure, surface the attempt to the user — both as
              // a stream error AND as a visible failure chip, so the chip (the
              // real source of truth the user reads) never claims a success the
              // edit didn't achieve. (anti-hallucination Fix 4)
              applyFailed = true;
              setStreamErr(`tool ${call.name} failed: ${err?.message ?? err}`);
            }
            const chips = applyFailed
              ? [`${TOOL_CHIP_FAIL_PREFIX}Couldn't apply: ${call.name}`]
              // Success → the normal ✓ chip; PLUS a subtle drop note when the
              // sanitiser discarded part of the patch (nothing dropped = chip
              // only, unchanged behaviour).
              : droppedKeys.length
                ? [describeTool(call), `${TOOL_CHIP_NOTE_PREFIX}${describeDroppedStyleKeys(droppedKeys)}`]
                : [describeTool(call)];
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? {
                  ...m,
                  pendingLabel: undefined,
                  toolChips: [...(m.toolChips ?? []), ...chips],
                }
                : m
            ));
          },
          onDone: (final) => {
            setBudget(final.snapshot);
            if (final.warn) setWarn(true);
            // Null config = anonymous (no DB cap) → never cap-exceeded here.
            if (final.snapshot.config && final.snapshot.cumulative_usd >= final.snapshot.config.cap_lifetime_usd) {
              setCapExceeded(true);
            }
          },
          onError: (msg) => {
            if (msg.startsWith('budget:')) {
              setCapExceeded(true);
              setStreamErr(msg);
            } else {
              setStreamErr(msg);
            }
          },
        },
        controller.signal,
      );
    } catch (err: any) {
      if (err?.name !== 'AbortError') setStreamErr(String(err?.message ?? err));
    } finally {
      setSending(false);
      abortRef.current = null;
      // Clear any lingering placeholder spinner — covers abort + error paths
      // where neither onText nor onToolUse fired.
      setMessages(prev => prev.map(m =>
        m.id === assistantId && m.pendingLabel ? { ...m, pendingLabel: undefined } : m
      ));
    }
  }, [sending, capExceeded, messages, state, props]);

  const onSend = useCallback(async () => {
    const trimmed = input.trim();
    if ((!trimmed && !pendingImage && !pendingFile) || sending) return;
    if (capExceeded) return;

    // BF-5 + Wave 64 — pricing-doc-only send (no text typed) → dedicated
    // multi-format endpoint. Image data URLs and raw Files both work.
    if (!trimmed && (pendingImage || pendingFile)) {
      const src = pendingFile ?? pendingImage!;
      setInput('');
      await onImageToTemplate(src);
      return;
    }

    // Wave 65.1 — if there's a pending clarification in the last assistant
    // message and the user typed a free-text reply, route it as the answer.
    if (trimmed) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.clarification) {
        setInput('');
        // Show the user's typed answer as a user bubble first.
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: 'user' as const, content: trimmed },
        ]);
        await onClarificationAnswer(lastMsg.id, trimmed, lastMsg.clarification);
        return;
      }
    }

    const imageToSend = pendingImage;
    setInput('');
    setPendingImage(null);
    await sendText(trimmed, imageToSend);
  }, [input, sending, capExceeded, pendingImage, pendingFile, messages, onImageToTemplate, onClarificationAnswer, sendText]);

  /* ─── "Generate with AI" seed-and-autosend (Build-tab card entry point) ───
   * Effect 1: when a NEW seed arrives (nonce changes, > 0) open + un-collapse
   * the panel, drop the prompt into the input, and arm the auto-send latch.
   * We set the input via state so the existing onSend (which reads `input`
   * from its closure) picks it up on the next commit. */
  useEffect(() => {
    if (!seedNonce || seedNonce <= 0) return;
    setOpen(true);
    setCollapsed(false);
    setInput(seedPrompt ?? '');
    // Fused text+image seed — attach the reference screenshot as the pending
    // image so the one-shot auto-send (Effect 2 below) carries it into the
    // existing { message, image } request body. Clear it when the seed is
    // text-only so a prior pending image never leaks into a later seed.
    setPendingImage(seedImage ?? null);
    if (seedImage) setPendingFile(null);
    autoSendRef.current = true;
  }, [seedNonce, seedPrompt, seedImage]);

  /* Effect 2: once the seeded input has committed (input matches the seed),
   * fire onSend exactly once. Guards: latch armed, not already sending, the
   * input is non-empty AND equals the current seed (so we never auto-send the
   * user's own subsequent typing). The latch is cleared before onSend so it
   * can only fire once per seed. */
  useEffect(() => {
    if (autoSendRef.current && !sending && input.trim() && input === (seedPrompt ?? '')) {
      autoSendRef.current = false;
      onSend();
    }
  }, [input, seedPrompt, sending, onSend]);

  /* ─── ?ai-upload=1 entry-point ────────────────────────────────────────────
   * When `openForUploadNonce` increments the bubble opens + un-collapses and
   * injects a hint assistant message ("Attach your quote…") into the chat so
   * the user knows exactly what to do. The paperclip button is highlighted via
   * the `data-upload-hint` attribute the CSS rule below picks up.
   * Browsers block auto-opening a <input type="file"> without a user gesture,
   * so we intentionally do NOT call fileInputRef.current.click() here. */
  const [uploadHintActive, setUploadHintActive] = useState(false);
  useEffect(() => {
    if (!openForUploadNonce || openForUploadNonce <= 0) return;
    setOpen(true);
    setCollapsed(false);
    // Inject a hint message only when the chat is empty so it reads naturally.
    setMessages((prev) => {
      if (prev.length > 0) return prev;
      return [
        {
          id: uid(),
          role: 'assistant' as const,
          content: 'Attach your quote to get started — photo, PDF or spreadsheet.',
        },
      ];
    });
    setUploadHintActive(true);
    // Remove the highlight after the user has had a chance to see it.
    const t = window.setTimeout(() => setUploadHintActive(false), 4000);
    return () => window.clearTimeout(t);
  }, [openForUploadNonce]);

  /** Wave AR-1 — let the user bail out of a slow vision request. The
   *  AbortController already exists; this just exposes a button. */
  const onCancelSend = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const onReset = useCallback(() => {
    setMessages([]);
    setStreamErr(null);
    try { localStorage.removeItem(HISTORY_KEY_PREFIX + conversationId); } catch {}
  }, [conversationId]);

  /* ─── Destructive-tool confirmation ─── */

  /** User clicked [Apply] on a queued replace_template / apply_template card.
   *
   *  fix/wizard-same-tick-state-clobber (2026-06-12) — `applyAiToolCall` used
   *  to run INSIDE the setMessages updater. Side-effects in a state updater
   *  are illegal (this was the source of React's "Cannot update a component
   *  (WizardShell) while rendering a different component (AIBubble)" warning)
   *  and StrictMode double-invokes updaters, double-firing the apply. The
   *  flow is now: (1) decide from the current messages snapshot, (2) run the
   *  apply HERE in the event handler, (3) call setMessages purely to record
   *  the outcome. `appliedConfirmKeysRef` keeps the apply idempotent on a
   *  same-tick double-click, before `resolved` re-renders the button away. */
  const appliedConfirmKeysRef = useRef<Set<string>>(new Set());
  const onConfirmApply = useCallback((messageId: string, confirmKey: string) => {
    // (1) Decide. `messages` is the latest committed snapshot — the [Apply]
    // button can only be clicked once the pendingConfirm card has rendered,
    // so the queued call is guaranteed to be present here.
    const msg = messages.find(m => m.id === messageId);
    const pending = (msg?.pendingConfirms ?? []).find(p => p.key === confirmKey);
    if (!pending || pending.resolved || appliedConfirmKeysRef.current.has(confirmKey)) return;
    appliedConfirmKeysRef.current.add(confirmKey);
    // (2) Side-effect — outside any updater, so WizardShell state updates fire
    // from a plain event handler, never mid-render.
    let appliedOk = true;
    try {
      applyAiToolCall(pending.call, props);
    } catch (err: any) {
      // Surface the failed apply as a warning chip, and mark the card itself
      // 'cancelled' (not 'applied') so the UI never claims it landed. (Fix 4)
      appliedOk = false;
      setStreamErr(`tool ${pending.call.name} failed: ${err?.message ?? err}`);
    }
    // (3) Pure state update from the outcome. Safe under StrictMode
    // double-invocation: no side-effects, and the `resolved` re-check makes
    // the map idempotent against an already-resolved card.
    setMessages(prev => {
      const next = prev.map(m => {
        if (m.id !== messageId) return m;
        const stillPending = (m.pendingConfirms ?? []).find(p => p.key === confirmKey);
        if (!stillPending || stillPending.resolved) return m;
        if (!appliedOk) {
          return {
            ...m,
            pendingConfirms: (m.pendingConfirms ?? []).map(p =>
              p.key === confirmKey ? { ...p, resolved: 'cancelled' as const } : p,
            ),
            toolChips: [...(m.toolChips ?? []), `${TOOL_CHIP_FAIL_PREFIX}Couldn't apply: ${pending.call.name}`],
          };
        }
        return {
          ...m,
          pendingConfirms: (m.pendingConfirms ?? []).map(p =>
            p.key === confirmKey ? { ...p, resolved: 'applied' as const } : p,
          ),
          toolChips: [...(m.toolChips ?? []), describeTool(pending.call)],
        };
      });
      // Failure → cancelled card + fail chip, NO follow-up question.
      if (!appliedOk) return next;
      // Gap 6 — scripted LOCAL follow-up (no model round-trip). The apply DID
      // succeed (green "Applied" card just landed), so "Your calculator is in
      // the editor" is tool-confirmed truth, not a model claim. Skip if the
      // chat already ends with a live follow-up so cards never stack.
      const last = next[next.length - 1];
      if (last?.followUp && !last.followUp.consumed) return next;
      return [
        ...next,
        {
          id: uid(),
          role: 'assistant' as const,
          content: FOLLOWUP_QUESTION,
          followUp: { options: FOLLOWUP_OPTIONS.map(o => ({ ...o })) },
        },
      ];
    });
  }, [messages, props]);

  /** User clicked [Cancel] — drop the queued call. We don't send a follow-up
   *  tool_result here because the chat stream has already completed; the
   *  cancellation only affects local state. */
  const onConfirmCancel = useCallback((messageId: string, confirmKey: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      return {
        ...m,
        pendingConfirms: (m.pendingConfirms ?? []).map(p =>
          p.key === confirmKey ? { ...p, resolved: 'cancelled' as const } : p,
        ),
      };
    }));
  }, []);

  /** Gap 6 — follow-up chip click. One-shot: the first click consumes the
   *  whole card (all chips dim + disable), then either opens the file picker
   *  (logo sentinel — a real user gesture, so the browser allows .click())
   *  or routes the chip's scripted text through the normal send path as a
   *  user message, exactly like the Wave 65.1 clarification quick replies. */
  const onFollowUpChip = useCallback((messageId: string, opt: { label: string; send: string }) => {
    if (sending || capExceeded) return;
    setMessages(prev => prev.map(m =>
      m.id === messageId && m.followUp && !m.followUp.consumed
        ? { ...m, followUp: { ...m.followUp, consumed: true } }
        : m,
    ));
    if (opt.send === FOLLOWUP_UPLOAD_LOGO_SENTINEL) {
      fileInputRef.current?.click();
      return;
    }
    void sendText(opt.send);
  }, [sending, capExceeded, sendText]);

  /* ─── Render ─── */

  const budgetMeter = useMemo(() => {
    // No meter for anonymous users (config null = no DB budget cap; their
    // ceiling is the per-IP rate limit). This guard is also what prevents the
    // panel from crashing on open for anonymous sessions.
    if (!budget || !budget.config) return null;
    const cap = budget.config.cap_lifetime_usd || 0;
    const used = budget.cumulative_usd;
    return (
      <span className="qq-ai-budget-meter" data-testid="aibubble-budget-meter">
        ${used.toFixed(2)} <span aria-hidden="true">/</span> ${cap.toFixed(2)}
      </span>
    );
  }, [budget]);

  // Anchor span: in-tree presence so we can locate the originating editor
  // shell (for theme mirroring) and so React's reconciliation has a stable
  // host node. The actual bubble + panel are portaled below.
  const anchor = <span ref={anchorRef} aria-hidden="true" style={{ display: 'none' }} data-testid="aibubble-anchor" />;

  const portaledUi = (
    <>
      {/* #13 — frosted-glass SIDE TAB launcher. A slim, half-transparent
          (backdrop-blur) vertical tab docked to the right edge of the editor
          — a sibling of the frosted bottom bar. TAP unfolds it into the AI
          chat window (the panel below); DRAG it leftward (the bottom-sheet
          grab affordance) to pull it open; drag it vertically to reposition
          along the edge. Position + open/folded persist. Hidden via CSS when
          the panel is open (the panel IS the unfolded form of this tab). The
          `aibubble-toggle` testid + plain-click-to-open are preserved so the
          existing Playwright suite keeps passing. */}
      <button
        type="button"
        onClick={() => { if (!bubbleDragging) { setOpen(true); setCollapsed(false); } }}
        onPointerDown={onBubblePointerDown}
        onPointerMove={onBubblePointerMove}
        onPointerUp={endBubbleDrag}
        onPointerCancel={endBubbleDrag}
        className="qq-ai-tab"
        data-testid="aibubble-toggle"
        aria-label="Open the QuoteQuick builder (tap, or swipe left, to open)"
        data-open={open ? 'true' : 'false'}
        data-state={open ? 'unfolded' : animating ? 'animating' : 'folded'}
        data-dragging={bubbleDragging ? 'true' : 'false'}
        data-positioned={bubblePos ? 'true' : 'false'}
        style={{
          ...(bubblePos ? { top: bubblePos.y, bottom: 'auto' } : null),
          // Live "peel out" cue: the tab slides a few px left as it's pulled.
          ...(tabPull > 0 ? { transform: `translateX(${-tabPull * 10}px)` } : null),
        }}
      >
        {/* Premium ICON-FIRST tab (2026-06-16). No rotated wordmark. The
            markup stacks just two affordances: the spark/AI glyph (the
            identity) inside a soft glass disc, and a subtle pull-open chevron
            beneath it. Soft brand glow + frosted surface come from CSS. */}
        <span className="qq-ai-tab-glyph" aria-hidden="true">
          <Sparkles className="qq-ai-tab-spark" aria-hidden="true" />
        </span>
        <ChevronLeft className="qq-ai-tab-chevron" aria-hidden="true" />
        {/* Accessible text label kept for screen-reader / test text parity. */}
        <span className="qq-ai-bubble-label">Builder</span>
      </button>

      {open && (
        <div
          className={`qq-ai-panel${collapsed ? ' is-collapsed' : ''}${animating ? ' is-animating' : ''}${panelResizing ? ' is-resizing' : ''}${panelGrabbing ? ' is-grabbing' : ''}`}
          role="dialog"
          aria-label="QuoteQuick builder"
          data-testid="aibubble-panel"
          data-collapsed={collapsed ? 'true' : 'false'}
          data-state={animating ? 'animating' : 'unfolded'}
          /* Mobile middle-floating card: drive the live height via a CSS var so
             only the ≤768px branch consumes it (desktop keeps its fixed size).
             During a drag the transition is killed (.is-resizing) so it tracks
             the finger. */
          style={{ ['--qq-ai-panel-h' as any]: `${Math.round(panelCurrentHeight)}px` }}
        >
          {/* Mobile drag-to-fold grab handle — top edge of the floating card.
              Grab + drag DOWN to fold back to the tab (inverse of the tab's
              drag-to-open); a short tap toggles the header-only collapse. Drag
              affordance only (decorative bar); the fold/min/close buttons are
              the explicit tap controls. Hidden on desktop via CSS. */}
          <div
            className="qq-ai-panel-grab"
            data-testid="aibubble-grab"
            aria-hidden="true"
            onPointerDown={onPanelGrabDown}
            onPointerMove={onPanelGrabMove}
            onPointerUp={onPanelGrabEnd}
            onPointerCancel={onPanelGrabEnd}
          >
            <span className="qq-ai-panel-grab-bar" />
          </div>

          {/* Wave 55 — top-center fold/unfold chevron. Toggles the panel
           *  between full (500px) and header-only (~46px tall). Matches the
           *  pattern used by the preview-pane fold/unfold (Wave M) so the
           *  collapse affordance is stylistically consistent. */}
          <button
            type="button"
            className="qq-ai-panel-fold"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand the builder panel' : 'Collapse the builder panel'}
            aria-pressed={collapsed}
            data-collapsed={collapsed ? 'true' : 'false'}
            data-testid="aibubble-fold"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
          <div
            className="qq-ai-panel-header"
            data-testid="aibubble-header"
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={onHeaderPointerEnd}
            onPointerCancel={onHeaderPointerEnd}
          >
            <div className="qq-ai-panel-title">
              <span className="qq-ai-title-mark" aria-hidden="true"><BrandMark size={14} /></span>
              <span>QuoteQuick builder</span>
            </div>
            {budgetMeter}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="qq-ai-panel-min"
              aria-label="Minimize the builder panel"
              title="Minimize"
              data-testid="aibubble-minimize"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="qq-ai-panel-close"
              aria-label="Close the builder panel"
              data-testid="aibubble-close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {warn && !capExceeded && (
            <div className="qq-ai-warn" data-testid="aibubble-warn">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>You're close to your included usage limit.</span>
            </div>
          )}

          <div className="qq-ai-msgs" ref={scrollerRef} data-testid="aibubble-msgs">
            {messages.filter(hasVisibleContent).length === 0 && (
              <div className="qq-ai-empty" data-testid="aibubble-empty">
                <p className="qq-ai-empty-title" style={{ margin: 0, fontWeight: 700 }}>Hi — I can build your calculator with you.</p>
                <p className="qq-ai-empty-sub" style={{ margin: '6px 0 0' }}>
                  Ask me to add fields, change pricing, or restyle. Or attach your existing pricing
                  — a photo, PDF, Excel sheet, or email — and I'll build the calculator for you.
                </p>
              </div>
            )}
            {messages.filter(hasVisibleContent).map(m => (
              <div key={m.id} className={`qq-ai-row qq-ai-row-${m.role}`}>
                {/* Branded avatar beside assistant messages — same mark as the
                    panel header so the speaker is "QuoteQuick", not a generic
                    gray placeholder. User messages stay avatar-free. */}
                {m.role === 'assistant' && (
                  <span className="qq-ai-avatar" aria-hidden="true" data-testid="aibubble-avatar">
                    <BrandMark size={14} />
                  </span>
                )}
              <div className={`qq-ai-msg qq-ai-msg-${m.role}`} data-testid={`aibubble-msg-${m.role}`}>
                {m.imageThumb && (
                  <img src={m.imageThumb} alt="" className="qq-ai-msg-thumb" data-testid="aibubble-msg-thumb" />
                )}
                {/* Wave AR-1 — inline "building calculator" indicator while we
                    wait for the first stream event. Keeps the user informed
                    during vision processing (3-10s typical). */}
                {m.role === 'assistant' && m.pendingLabel && !m.content && (
                  <div className="qq-ai-thinking" data-testid="aibubble-thinking">
                    <CalcAssemblySpinner size={36} label={m.pendingLabel} />
                    <span className="qq-ai-thinking-label">{m.pendingLabel}</span>
                  </div>
                )}
                {/* BF-5 — image-to-template progress card. 280×120, three
                    stacked sub-rows pulsing in sequence with the brand
                    accent. Replaces the message bubble while the dedicated
                    /api/ai/wizard/image-to-template call is running. */}
                {m.role === 'assistant' && m.buildingTemplate && (
                  <div className="qq-ai-build-card" data-testid="aibubble-build-card" role="status" aria-live="polite">
                    <div className="qq-ai-build-glow" aria-hidden="true" />
                    <div className="qq-ai-build-rows">
                      <div className="qq-ai-build-row qq-ai-build-row-1">
                        <span className="qq-ai-build-dot" />
                        <span className="qq-ai-build-label">Reading image…</span>
                      </div>
                      <div className="qq-ai-build-row qq-ai-build-row-2">
                        <span className="qq-ai-build-dot" />
                        <span className="qq-ai-build-label">Extracting prices…</span>
                      </div>
                      <div className="qq-ai-build-row qq-ai-build-row-3">
                        <span className="qq-ai-build-dot" />
                        <span className="qq-ai-build-label">Applying to your calculator…</span>
                      </div>
                    </div>
                  </div>
                )}
                {/* BF-5 — inline error + retry for image-to-template failures. */}
                {m.role === 'assistant' && m.imageError && (
                  <div className="qq-ai-build-err" data-testid="aibubble-build-error">
                    <div className="qq-ai-build-err-text">{m.imageError}</div>
                    <button
                      type="button"
                      className="qq-ai-build-retry"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="aibubble-build-retry"
                    >
                      Try again
                    </button>
                  </div>
                )}
                {/* Wave 65.1 — clarification quick-reply card. Rendered as a
                    question bubble with tappable option chips (chat-style
                    quick replies; min 44px touch target). The user taps one
                    to re-POST the original file with the answer. A "Use best
                    guess" option is offered when the AI returned a partial
                    template alongside the clarification question. */}
                {m.role === 'assistant' && m.clarification && (
                  <div className="qq-ai-clarify" data-testid="aibubble-clarification">
                    <div className="qq-ai-clarify-q" data-testid="aibubble-clarify-question">
                      {m.clarification.question}
                    </div>
                    <div className="qq-ai-clarify-options" data-testid="aibubble-clarify-options">
                      {m.clarification.options.map((opt, i) => (
                        <button
                          key={i}
                          type="button"
                          className="qq-ai-clarify-opt"
                          data-testid="aibubble-clarify-opt"
                          disabled={sending}
                          onClick={() => {
                            setMessages((prev) => [
                              ...prev,
                              { id: uid(), role: 'user' as const, content: opt.label },
                            ]);
                            onClarificationAnswer(m.id, opt.label, m.clarification!);
                          }}
                          title={opt.hint}
                        >
                          {opt.label}
                          {opt.hint && <span className="qq-ai-clarify-hint">{opt.hint}</span>}
                        </button>
                      ))}
                      {m.clarification.bestGuessTemplate && (
                        <button
                          type="button"
                          className="qq-ai-clarify-opt qq-ai-clarify-opt-guess"
                          data-testid="aibubble-clarify-best-guess"
                          disabled={sending}
                          onClick={() => {
                            setMessages((prev) => [
                              ...prev,
                              { id: uid(), role: 'user' as const, content: 'Use best guess' },
                            ]);
                            onClarificationAnswer(m.id, '__best_guess__', m.clarification!);
                          }}
                        >
                          Use best guess
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {m.content && <div className="qq-ai-msg-text">{m.content}</div>}
                {/* Gap 6 — post-apply follow-up quick replies. Reuses the
                    clarify chip styles (≥44px touch targets); row layout that
                    wraps cleanly at 375px. After one click the whole card is
                    consumed: every chip dims + disables, mirroring
                    disabled={sending} on the clarify options. */}
                {m.role === 'assistant' && m.followUp && (
                  <div
                    className="qq-ai-clarify-options qq-ai-followup-options"
                    data-testid="aibubble-followup-options"
                    data-consumed={m.followUp.consumed ? 'true' : undefined}
                  >
                    {m.followUp.options.map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        className="qq-ai-clarify-opt qq-ai-followup-opt"
                        data-testid="aibubble-followup-opt"
                        disabled={sending || Boolean(m.followUp?.consumed)}
                        onClick={() => onFollowUpChip(m.id, opt)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                {m.toolChips && m.toolChips.length > 0 && (
                  <div className="qq-ai-chips">
                    {m.toolChips.map((chip, i) => {
                      // A chip prefixed with the failure sentinel is an edit that
                      // failed to apply — render it as a warning, not a ✓.
                      const failed = chip.startsWith(TOOL_CHIP_FAIL_PREFIX);
                      // A chip prefixed with the note sentinel is a partial-drop
                      // note (the apply succeeded for the valid remainder but the
                      // sanitiser discarded some invalid values). Rendered subtly
                      // with a neutral marker — not a ✓ success nor a ⚠ failure.
                      const note = !failed && chip.startsWith(TOOL_CHIP_NOTE_PREFIX);
                      const label = failed
                        ? chip.slice(TOOL_CHIP_FAIL_PREFIX.length)
                        : note
                          ? chip.slice(TOOL_CHIP_NOTE_PREFIX.length)
                          : chip;
                      const marker = failed ? '⚠' : note ? 'ⓘ' : '✓';
                      return (
                        <span
                          key={i}
                          className={`qq-ai-chip${failed ? ' qq-ai-chip-failed' : note ? ' qq-ai-chip-note' : ''}`}
                          data-testid={failed ? 'aibubble-tool-chip-failed' : note ? 'aibubble-tool-chip-note' : 'aibubble-tool-chip'}
                          data-failed={failed ? 'true' : undefined}
                          data-note={note ? 'true' : undefined}
                        >
                          {marker} {label}
                        </span>
                      );
                    })}
                  </div>
                )}
                {m.pendingConfirms && m.pendingConfirms.length > 0 && (
                  <div className="qq-ai-confirms">
                    {m.pendingConfirms.map(pc => {
                      const { title, body } = describePendingConfirm(pc.call);
                      const resolved = pc.resolved;
                      return (
                        <div
                          key={pc.key}
                          className={`qq-ai-confirm qq-ai-confirm-${resolved ?? 'pending'}`}
                          data-testid="aibubble-confirm-card"
                          data-state={resolved ?? 'pending'}
                          role="group"
                          aria-label="Confirm this change"
                        >
                          <div className="qq-ai-confirm-title" data-testid="aibubble-confirm-title">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>{title}</span>
                          </div>
                          <div className="qq-ai-confirm-body">{body}</div>
                          {resolved === 'applied' && (
                            <div className="qq-ai-confirm-status" data-testid="aibubble-confirm-applied">
                              Applied
                            </div>
                          )}
                          {resolved === 'cancelled' && (
                            <div className="qq-ai-confirm-status" data-testid="aibubble-confirm-cancelled">
                              Cancelled
                            </div>
                          )}
                          {!resolved && (
                            <div className="qq-ai-confirm-actions">
                              <button
                                type="button"
                                className="qq-ai-confirm-cancel"
                                onClick={() => onConfirmCancel(m.id, pc.key)}
                                data-testid="aibubble-confirm-cancel"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="qq-ai-confirm-apply"
                                onClick={() => onConfirmApply(m.id, pc.key)}
                                data-testid="aibubble-confirm-apply"
                              >
                                Apply
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              </div>
            ))}
          </div>

          {streamErr && (
            <div className="qq-ai-err" data-testid="aibubble-error" role="alert">
              {streamErr.startsWith('budget:')
                ? 'Usage limit reached for this calculator.'
                : streamErr === 'auth:required'
                  ? 'Sign in to use the builder. Open this calculator from your dashboard, or refresh the page.'
                  : `Something went wrong: ${streamErr}`}
            </div>
          )}

          {capExceeded ? (
            <div className="qq-ai-capped" data-testid="aibubble-cap-reached">
              <p style={{ margin: 0, fontWeight: 700 }}>Usage limit reached</p>
              <p style={{ margin: '6px 0 0', color: p.colors.muted, fontSize: 12 }}>
                You've used this account's included builder budget. Upgrade your plan to unlock more.
              </p>
            </div>
          ) : (
            <div className="qq-ai-compose">
              {pendingImage && (
                <div className="qq-ai-pending-image" data-testid="aibubble-pending-image">
                  <img src={pendingImage} alt="" />
                  <button type="button" onClick={() => setPendingImage(null)} aria-label="Remove image">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {pendingFile && (
                <div className="qq-ai-pending-file" data-testid="aibubble-pending-file">
                  <div className="qq-ai-pending-file-name">{pendingFile.name}</div>
                  <div className="qq-ai-pending-file-meta">
                    {(() => {
                      const k = classifyUpload(pendingFile);
                      const kb = Math.round(pendingFile.size / 1024);
                      const label = k === 'pdf' ? 'PDF' : k === 'excel' ? 'Spreadsheet' : k === 'email' ? 'Email / text' : 'File';
                      return `${label} · ${kb.toLocaleString()} KB`;
                    })()}
                  </div>
                  <button type="button" onClick={() => setPendingFile(null)} aria-label="Remove file">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <div className="qq-ai-compose-row">
                <button
                  type="button"
                  className="qq-ai-iconbtn"
                  aria-label="Attach pricing doc (photo, PDF, Excel, or email)"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="aibubble-upload"
                  data-upload-hint={uploadHintActive ? 'true' : undefined}
                  disabled={sending}
                >
                  <Paperclip style={{ width: 20, height: 20 }} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={WIZARD_ACCEPT_ATTR}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onPickImage(f);
                    e.currentTarget.value = '';
                  }}
                  data-testid="aibubble-file-input"
                />
                <textarea
                  className="qq-ai-input"
                  data-expanded={inputFocused || !!input ? 'true' : 'false'}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      onSend();
                    }
                  }}
                  placeholder="Ask me to build or change anything…"
                  rows={3}
                  data-testid="aibubble-input"
                  disabled={sending}
                />
                {sending ? (
                  <button
                    type="button"
                    onClick={onCancelSend}
                    className="qq-ai-sendbtn qq-ai-cancelbtn"
                    data-testid="aibubble-cancel"
                    aria-label="Cancel"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSend}
                    disabled={!input.trim() && !pendingImage && !pendingFile}
                    className="qq-ai-sendbtn"
                    data-testid="aibubble-send"
                    aria-label={(pendingImage || pendingFile) && !input.trim() ? 'Build calculator from upload' : 'Send'}
                    title={(pendingImage || pendingFile) && !input.trim() ? 'Build calculator from upload' : 'Send'}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="qq-ai-footer">
                <button
                  type="button"
                  className="qq-ai-reset"
                  onClick={onReset}
                  disabled={messages.length === 0 || sending}
                  data-testid="aibubble-reset"
                >
                  <Trash2 className="w-3 h-3" /> Reset conversation
                </button>
              </div>
            </div>
          )}

          {/* Mobile free-resize handle — bottom edge of the floating card.
              Drag DOWN to grow, UP to shrink; the card rests at the released
              height (clamped, persisted as a viewport fraction). Mirrors
              MobileBottomSheet's drag-to-resize. Hidden on desktop via CSS. */}
          <div
            className="qq-ai-panel-resize"
            data-testid="aibubble-resize"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize the builder panel"
            onPointerDown={onPanelResizeDown}
            onPointerMove={onPanelResizeMove}
            onPointerUp={onPanelResizeEnd}
            onPointerCancel={onPanelResizeEnd}
          >
            <span className="qq-ai-panel-resize-bar" aria-hidden="true" />
          </div>
        </div>
      )}

      <style>{`
        /* #13 — frosted-glass SIDE TAB launcher. A slim vertical tab docked to
         *  the RIGHT edge, half-transparent via backdrop-filter so the preview
         *  partly shows through — a sibling of the frosted bottom bar. The
         *  vertical "Builder" text + spark read top-to-bottom along the tab.
         *  Default vertical anchor is centred-ish on the right edge; a dragged
         *  position overrides top inline. */
        /* ── Premium ICON-FIRST side-tab launcher (2026-06-16) ──────────────
         *  Apple/Linear-class: a small, confident frosted-glass pill docked
         *  flush to the right edge — NOT a faded vertical strip. No rotated
         *  wordmark. Just a spark/AI glyph in a soft glass disc with a subtle
         *  pull-open chevron beneath it. A clear 1px edge + soft brand glow
         *  keep it from blending into a white preview. ~44px wide tap target.
         *  Tap, swipe-left, or drag to open. */
        .qq-ai-tab {
          /* Docked to the preview PANE's right edge, not the viewport: the shell
             has an 8px outer gutter (dashboardTheme.layout.shellPad), so right:0
             made the tab overflow past the preview boundary. right:8px tucks its
             flat right edge flush against the pane edge. Width trimmed 10%. */
          position: fixed; right: 8px; top: 50%; z-index: 9998;
          transform: translateY(-50%);
          width: 41px; height: 64px; padding: 0;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 4px;
          border: 1px solid rgba(255, 255, 255, 0.45);
          border-right: none;
          border-radius: 16px 0 0 16px;
          /* Frosted glass with a soft brand gradient + a crisp top sheen — a
             well-defined surface, not a translucent smudge. */
          background:
            linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 50%),
            linear-gradient(210deg, rgba(45, 96, 255, 0.92) 0%, rgba(13, 60, 252, 0.92) 70%, rgba(10, 44, 200, 0.94) 100%);
          -webkit-backdrop-filter: blur(14px) saturate(150%);
          backdrop-filter: blur(14px) saturate(150%);
          color: #fff; cursor: grab;
          /* Soft brand glow (so it never blends into white) + crisp inset edge. */
          box-shadow:
            -8px 0 26px rgba(13, 60, 252, 0.34),
            -1px 0 0 rgba(13, 60, 252, 0.20),
            inset 0 1px 0 rgba(255, 255, 255, 0.42);
          transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
                      box-shadow 200ms ease-out,
                      width 200ms cubic-bezier(0.22, 1, 0.36, 1),
                      opacity 220ms ease-out;
          touch-action: none; /* pointer-drag on touch without scrolling */
          user-select: none; -webkit-user-select: none;
        }
        /* Fallback for browsers without backdrop-filter: a fully opaque brand
         *  fill so the pill stays crisp without the blur. */
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
          .qq-ai-tab {
            background: linear-gradient(210deg, rgba(45, 96, 255, 1) 0%, rgba(13, 60, 252, 1) 100%);
          }
        }
        .qq-ai-tab:hover {
          width: 47px;
          box-shadow:
            -12px 0 34px rgba(13, 60, 252, 0.46),
            -1px 0 0 rgba(13, 60, 252, 0.28),
            inset 0 1px 0 rgba(255, 255, 255, 0.5);
        }
        .qq-ai-tab:hover .qq-ai-tab-chevron { transform: translateX(-2px); opacity: 1; }
        .qq-ai-tab:hover .qq-ai-tab-glyph { transform: scale(1.06); }
        .qq-ai-tab:active,
        .qq-ai-tab[data-dragging="true"] { cursor: grabbing; }
        .qq-ai-tab[data-dragging="true"] {
          box-shadow:
            -14px 0 38px rgba(13, 60, 252, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.5);
        }
        /* Folding away into the chat window — fade + slide off the right edge so
         *  the unfold reads as the tab smoothly becoming the panel. */
        .qq-ai-tab[data-state="animating"] {
          opacity: 0;
          transform: translateY(-50%) translateX(24px) scale(0.9);
        }
        .qq-ai-tab[data-open="true"] { display: none; }
        .qq-ai-tab:focus-visible {
          outline: 2px solid #fff; outline-offset: 2px;
        }
        /* The spark glyph in a soft glass disc — the tab's identity. */
        .qq-ai-tab-glyph {
          display: inline-flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; border-radius: 999px;
          background: rgba(255, 255, 255, 0.16);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.30);
          flex-shrink: 0; pointer-events: none;
          transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .qq-ai-tab-spark {
          width: 18px; height: 18px; flex-shrink: 0; pointer-events: none;
          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.20));
        }
        /* Pull-open chevron — the subtle "open me" affordance beneath the glyph. */
        .qq-ai-tab-chevron {
          width: 13px; height: 13px; flex-shrink: 0; pointer-events: none;
          color: rgba(255, 255, 255, 0.88);
          opacity: 0.8;
          transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1),
                      opacity 200ms ease-out;
        }
        /* The accessible label is conveyed by aria-label; keep a visually-hidden
         *  span so screen-reader/test text still reads "Builder". */
        .qq-ai-bubble-label {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
        }
        @media (prefers-reduced-motion: reduce) {
          .qq-ai-tab,
          .qq-ai-tab-glyph,
          .qq-ai-tab-chevron { transition: none !important; }
          .qq-ai-tab[data-state="animating"] {
            opacity: 1;
            transform: translateY(-50%);
          }
        }

        .qq-ai-panel {
          /* z-index 10000 — the OPEN chat panel must sit ABOVE the mobile
             resize sheet (MobileBottomSheet, z-index 9998) so the chat is
             never covered when both are docked open. On desktop there is no
             sheet/nav at this layer, so the high value is harmless. */
          position: fixed; right: 18px; bottom: 18px; z-index: 10000;
          width: 372px; height: 520px; max-height: calc(100vh - 36px);
          display: flex; flex-direction: column;
          /* Elevated frosted card — a touch of translucency + blur so it reads
             as a premium floating surface, not a flat box. */
          background: rgba(255, 255, 255, 0.94);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          backdrop-filter: blur(24px) saturate(160%);
          color: #0f172a;
          border-radius: 18px; overflow: hidden;
          /* Soft layered shadow + a faint brand-tinted ambient glow. */
          box-shadow:
            0 24px 60px rgba(15, 23, 42, 0.26),
            0 2px 8px rgba(13, 60, 252, 0.10);
          border: 1px solid rgba(255, 255, 255, 0.6);
          /* Wave 55 — animate the fold/unfold height transition. */
          transition: height 250ms cubic-bezier(0.22, 1, 0.36, 1);
          /* The panel is the UNFOLDED form of the side tab. Play a quick,
           *  GPU-friendly unfold (translate + scale + fade from the right edge,
           *  ~260ms ease-out) so it reads as the tab smoothly opening into the
           *  chat window. */
          transform-origin: 100% 50%;
          animation: qq-ai-unfold 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: transform, opacity;
        }
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
          .qq-ai-panel { background: #fff; }
        }
        @keyframes qq-ai-unfold {
          from { opacity: 0; transform: translateX(28px) scale(0.9); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .qq-ai-panel { animation: none !important; }
        }
        /* Wave 55 — collapsed state shrinks the panel to just the header
         *  bar (~46px). Body + footer hide via the descendant rules below. */
        .qq-ai-panel.is-collapsed {
          height: 46px;
        }
        .qq-ai-panel.is-collapsed .qq-ai-warn,
        .qq-ai-panel.is-collapsed .qq-ai-msgs,
        .qq-ai-panel.is-collapsed .qq-ai-compose,
        .qq-ai-panel.is-collapsed .qq-ai-capped,
        .qq-ai-panel.is-collapsed .qq-ai-err,
        .qq-ai-panel.is-collapsed .qq-ai-footer {
          display: none !important;
        }
        /* Wave 55 — fold chevron, top-center of the panel. A small pill
         *  that sits just inside the rounded top edge so the click target
         *  is obvious without competing with the header's existing
         *  minimize / close buttons (top-right). */
        .qq-ai-panel-fold {
          position: absolute;
          top: 4px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2;
          display: inline-flex; align-items: center; justify-content: center;
          width: 28px; height: 16px;
          padding: 0;
          background: rgba(13, 60, 252, 0.10);
          color: #0d3cfc;
          border: 1px solid rgba(13, 60, 252, 0.25);
          border-radius: 999px;
          cursor: pointer;
          transition: background 120ms ease, color 120ms ease;
        }
        .qq-ai-panel-fold:hover {
          background: rgba(13, 60, 252, 0.18);
          color: #0d3cfc;
        }
        .qq-ai-panel-fold:focus-visible {
          outline: 2px solid #0d3cfc;
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .qq-ai-panel { transition: none !important; }
        }
        /* The top grab handle + bottom resize handle are mobile-only — desktop
           keeps its corner-docked fixed-size panel and never shows them. */
        .qq-ai-panel-grab,
        .qq-ai-panel-resize { display: none; }

        @media (max-width: 768px) {
          /* ── Mobile: frosted-glass card FLOATING in the MIDDLE ────────────
             A fixed card centred vertically via top:50% + translateY(-50%), with
             a guaranteed margin ABOVE and BELOW (the clamped height keeps the
             preview visible top + bottom). NOT a docked bottom sheet. The card
             is more translucent/glassy than desktop so the preview reads through
             above + below + behind. */
          .qq-ai-panel {
            /* Alex wants a BIG window — near edge-to-edge horizontally. */
            left: 8px; right: 8px; width: auto;
            /* Centre the card vertically and override the desktop bottom anchor. */
            top: 50%; bottom: auto;
            transform: translateY(-50%);
            display: flex; flex-direction: column;
            /* Resizable card height (clamped in JS); default ~66vh opens as a
               clearly big window while still leaving preview visible above +
               below. max-height keeps the top/bottom margin even if a stale
               persisted px value is large. */
            height: var(--qq-ai-panel-h, 66vh);
            max-height: calc(100vh - 128px);
            background: rgba(255, 255, 255, 0.62) !important;
            -webkit-backdrop-filter: blur(26px) saturate(160%);
            backdrop-filter: blur(26px) saturate(160%);
            border: 1px solid rgba(255, 255, 255, 0.55);
            border-radius: 20px;
            box-shadow:
              0 24px 70px rgba(15, 23, 42, 0.30),
              0 2px 10px rgba(13, 60, 252, 0.12);
            overflow: hidden;
            position: fixed;
            pointer-events: auto;
            /* Smooth settle on resize; killed during an active drag below. The
               desktop unfold animation is dropped on mobile. */
            animation: none;
            transition: height 220ms cubic-bezier(0.22, 1, 0.36, 1);
          }
          /* @supports fallback — without backdrop-filter, go near-solid so the
             card text/input never washes out over the preview behind it. */
          @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
            .qq-ai-panel { background: rgba(255, 255, 255, 0.97) !important; }
          }
          /* FROSTED-THROUGH — Alex (2x): the ENTIRE chat window must read as
             frosted glass, not just the card edge. The inner surfaces ship
             opaque (#fff body/compose/input, near-solid header), which paints
             over the card's backdrop-blur and kills the glass effect. Make them
             translucent so the blurred preview shows through the whole window.
             Scoped to '.qq-ai-panel x' (two classes) so these win over the
             global single-class rules regardless of source order, and only on
             mobile (desktop keeps its opaque corner popup). When backdrop-filter
             is unsupported the card goes near-solid (above) so legibility holds.*/
          .qq-ai-panel .qq-ai-panel-header {
            background: linear-gradient(180deg, rgba(13, 60, 252, 0.08) 0%, rgba(255, 255, 255, 0.06) 100%);
          }
          .qq-ai-panel .qq-ai-msgs { background: transparent; }
          .qq-ai-panel .qq-ai-compose {
            background: rgba(255, 255, 255, 0.16);
          }
          .qq-ai-panel .qq-ai-input {
            background: rgba(255, 255, 255, 0.60);
          }
          .qq-ai-panel .qq-ai-budget-meter {
            background: rgba(255, 255, 255, 0.55);
          }
          /* Assistant bubble: keep a soft fill for readability but glassy, not a
             solid slab, so the frost reads behind the conversation too. */
          .qq-ai-panel .qq-ai-msg-assistant {
            background: rgba(241, 245, 249, 0.72);
          }
          /* No height transition while dragging the resize handle → tracks the
             finger 1:1. */
          .qq-ai-panel.is-resizing { transition: none; }
          /* Collapsed (header-only) shrinks the card; keep it centred + glassy. */
          .qq-ai-panel.is-collapsed {
            height: 54px;
          }

          /* ── Top grab handle (drag-to-fold) ──────────────────────────────
             A slim grab strip across the top of the card. Drag it DOWN to fold
             the card back to the tab; tap toggles the header-only collapse. */
          .qq-ai-panel-grab {
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
            height: 20px;
            cursor: grab;
            touch-action: none;
          }
          .qq-ai-panel-grab:active { cursor: grabbing; }
          .qq-ai-panel-grab-bar {
            width: 40px; height: 4px; border-radius: 999px;
            background: rgba(15, 23, 42, 0.22);
            transition: background 0.16s ease, width 0.16s ease;
          }
          .qq-ai-panel.is-grabbing .qq-ai-panel-grab-bar {
            background: #0d3cfc; width: 48px;
          }
          /* The fold chevron sits just under the grab strip on mobile so it
             doesn't collide with the new handle. */
          .qq-ai-panel-fold { top: 22px; }

          /* ── Bottom free-resize handle ───────────────────────────────────
             A grab strip across the bottom edge of the card; drag to resize the
             card height (down grows, up shrinks). */
          .qq-ai-panel-resize {
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
            height: 22px;
            cursor: ns-resize;
            touch-action: none;
            /* A faint top hairline separates it from the compose area. */
            border-top: 1px solid rgba(15, 23, 42, 0.06);
            background: rgba(255, 255, 255, 0.28);
          }
          .qq-ai-panel-resize-bar {
            width: 44px; height: 4px; border-radius: 999px;
            background: rgba(15, 23, 42, 0.26);
            transition: background 0.16s ease, width 0.16s ease;
          }
          .qq-ai-panel.is-resizing .qq-ai-panel-resize-bar {
            background: #0d3cfc; width: 56px;
          }
          /* Hide the resize handle while collapsed (no body to resize). */
          .qq-ai-panel.is-collapsed .qq-ai-panel-resize { display: none; }

          /* The narrow-viewport tab is THINNER + MORE TRANSPARENT (per the ask):
             a slimmer pill, lower-opacity frosted surface, softer glow — still
             tucked to the right edge with the spark + a subtle pull cue. */
          .qq-ai-tab {
            width: 27px; height: 52px;
            border-radius: 13px 0 0 13px;
            border-color: rgba(255, 255, 255, 0.28);
            background:
              linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 55%),
              linear-gradient(210deg, rgba(45, 96, 255, 0.50) 0%, rgba(13, 60, 252, 0.50) 70%, rgba(10, 44, 200, 0.52) 100%);
            -webkit-backdrop-filter: blur(12px) saturate(140%);
            backdrop-filter: blur(12px) saturate(140%);
            box-shadow:
              -5px 0 16px rgba(13, 60, 252, 0.18),
              inset 0 1px 0 rgba(255, 255, 255, 0.30);
          }
          @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
            .qq-ai-tab {
              background: linear-gradient(210deg, rgba(45, 96, 255, 0.82) 0%, rgba(13, 60, 252, 0.82) 100%);
            }
          }
          .qq-ai-tab:hover { width: 31px; }
          .qq-ai-tab-glyph {
            width: 24px; height: 24px;
            background: rgba(255, 255, 255, 0.12);
          }
          .qq-ai-tab-spark { width: 14px; height: 14px; }
          .qq-ai-tab-chevron { width: 11px; height: 11px; }
        }

        .qq-ai-panel-header {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 12px 12px 14px;
          border-bottom: 1px solid rgba(15, 23, 42, 0.06);
          /* Premium header — a soft brand-tinted wash so the title bar reads as
             a distinct, intentional zone. Doubles as the swipe-to-close
             surface (touch + drag right/down dismisses). */
          background: linear-gradient(180deg, rgba(13, 60, 252, 0.05) 0%, rgba(248, 250, 252, 0.9) 100%);
          touch-action: pan-y;
          cursor: default;
        }
        .qq-ai-panel-title {
          display: inline-flex; align-items: center; gap: 7px;
          font-size: 13px; font-weight: 700; letter-spacing: -0.01em;
          color: #0f172a;
        }
        .qq-ai-budget-meter {
          margin-left: auto;
          font-size: 11px; font-weight: 600;
          color: #475569;
          background: #fff;
          border: 1px solid rgba(15, 23, 42, 0.08);
          padding: 3px 8px; border-radius: 999px;
        }
        .qq-ai-panel-close,
        .qq-ai-panel-min {
          background: transparent; border: none; cursor: pointer;
          padding: 4px; border-radius: 6px; color: #475569;
        }
        .qq-ai-panel-close:hover,
        .qq-ai-panel-min:hover { background: rgba(15,23,42,0.06); color: #0f172a; }

        .qq-ai-warn {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 12px; background: #fffbeb; color: #92400e;
          font-size: 11.5px; border-bottom: 1px solid #fde68a;
        }
        .qq-ai-msgs {
          flex: 1 1 auto; overflow-y: auto;
          padding: 12px; background: #fff;
          display: flex; flex-direction: column; gap: 10px;
        }
        .qq-ai-empty { font-size: 13px; line-height: 1.5; color: #0f172a; }
        .qq-ai-empty-sub { color: #6b7280; }
        /* Chat rebrand — each message renders inside a row so assistant
           messages can carry the small branded avatar on the left. */
        .qq-ai-row {
          display: flex; align-items: flex-end; gap: 6px;
          max-width: 100%;
        }
        .qq-ai-row-user { justify-content: flex-end; }
        .qq-ai-avatar {
          flex-shrink: 0;
          width: 22px; height: 22px;
          border-radius: 8px;
          display: inline-flex; align-items: center; justify-content: center;
          background: #fff;
          border: 1px solid rgba(15, 23, 42, 0.12);
        }
        .qq-ai-title-mark {
          display: inline-flex; align-items: center; justify-content: center;
        }
        .qq-ai-msg {
          max-width: 86%; padding: 8px 11px;
          border-radius: 12px; font-size: 13px; line-height: 1.45;
          word-wrap: break-word;
        }
        .qq-ai-msg-user {
          background: #0d3cfc; color: #fff;
          border-bottom-right-radius: 4px;
        }
        .qq-ai-msg-assistant {
          background: #f1f5f9; color: #0f172a;
          border-bottom-left-radius: 4px;
        }
        .qq-ai-msg-thumb {
          display: block; max-width: 180px; border-radius: 6px;
          margin-bottom: 6px;
        }
        /* Wave AR-1 — inline "building calculator" indicator. */
        .qq-ai-thinking {
          display: flex; align-items: center; gap: 8px;
          padding: 2px 0;
        }
        .qq-ai-thinking-label {
          font-size: 12px; font-weight: 600; color: #475569;
        }
        [data-theme="dark"] .qq-ai-thinking-label { color: #cbd5e1; }

        /* BF-5 — image-to-template progress card. 280×120 with a conic
           accent glow + three sequential rows that fill in as the build
           progresses (timing is cosmetic — real backend is 5-15s). */
        .qq-ai-build-card {
          position: relative;
          width: 280px; max-width: 100%; height: 120px;
          border-radius: 12px;
          background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%);
          border: 1px solid rgba(13, 60, 252, 0.18);
          overflow: hidden;
          padding: 14px 16px;
          display: flex; align-items: center;
        }
        .qq-ai-build-glow {
          position: absolute; inset: -40%;
          background: conic-gradient(
            from 0deg,
            rgba(13, 60, 252, 0.0) 0deg,
            rgba(13, 60, 252, 0.18) 80deg,
            rgba(99, 102, 241, 0.0) 160deg,
            rgba(13, 60, 252, 0.0) 360deg
          );
          filter: blur(8px);
          animation: qq-ai-build-glow-spin 4s linear infinite;
          pointer-events: none;
        }
        @keyframes qq-ai-build-glow-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .qq-ai-build-rows {
          position: relative; z-index: 1;
          display: flex; flex-direction: column; gap: 6px;
          width: 100%;
        }
        .qq-ai-build-row {
          display: flex; align-items: center; gap: 8px;
          opacity: 0.45;
          transition: opacity 220ms ease-out;
        }
        .qq-ai-build-dot {
          width: 8px; height: 8px; border-radius: 999px;
          background: rgba(13, 60, 252, 0.35);
          flex-shrink: 0;
          animation: qq-ai-build-pulse 1500ms ease-in-out infinite;
        }
        .qq-ai-build-label {
          font-size: 12px; font-weight: 600; color: #334155;
          line-height: 1.3;
        }
        /* Row 1: pulse 0–600ms (then continues subtly).
           Row 2: pulse 600–1500ms.
           Row 3: pulse 1500ms→. We can't tie to real backend latency, so
           we run a 2.4s loop matching CalcAssemblySpinner's cadence. */
        .qq-ai-build-row-1 { animation: qq-ai-build-row-active 2400ms ease-in-out infinite; animation-delay: 0ms; }
        .qq-ai-build-row-2 { animation: qq-ai-build-row-active 2400ms ease-in-out infinite; animation-delay: 600ms; }
        .qq-ai-build-row-3 { animation: qq-ai-build-row-active 2400ms ease-in-out infinite; animation-delay: 1500ms; }
        @keyframes qq-ai-build-row-active {
          0%   { opacity: 0.45; }
          25%  { opacity: 1; }
          50%  { opacity: 1; }
          80%  { opacity: 0.6; }
          100% { opacity: 0.45; }
        }
        @keyframes qq-ai-build-pulse {
          0%, 100% { transform: scale(1); background: rgba(13, 60, 252, 0.35); }
          50%      { transform: scale(1.35); background: rgba(13, 60, 252, 0.9); }
        }
        @media (prefers-reduced-motion: reduce) {
          .qq-ai-build-glow,
          .qq-ai-build-row-1,
          .qq-ai-build-row-2,
          .qq-ai-build-row-3,
          .qq-ai-build-dot {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
        [data-theme="dark"] .qq-ai-build-card {
          background: linear-gradient(135deg, #1e293b 0%, #1e1b4b 100%);
          border-color: rgba(99, 102, 241, 0.35);
        }
        [data-theme="dark"] .qq-ai-build-label { color: #e2e8f0; }
        [data-theme="dark"] .qq-ai-build-dot { background: rgba(129, 140, 248, 0.5); }
        .qq-ai-build-err {
          background: #fef2f2; border: 1px solid #fecaca;
          color: #991b1b; border-radius: 10px;
          padding: 10px 12px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .qq-ai-build-err-text { font-size: 12.5px; line-height: 1.4; }
        .qq-ai-build-retry {
          align-self: flex-start;
          background: #fff; border: 1px solid #fecaca;
          color: #991b1b; cursor: pointer;
          font-size: 11.5px; font-weight: 600;
          padding: 5px 12px; border-radius: 6px;
        }
        .qq-ai-build-retry:hover { background: #fef2f2; }
        [data-theme="dark"] .qq-ai-build-err {
          background: #450a0a; border-color: #7f1d1d; color: #fecaca;
        }
        [data-theme="dark"] .qq-ai-build-retry {
          background: #1e293b; border-color: #7f1d1d; color: #fecaca;
        }

        /* Wave 65.1 — clarification quick-reply card. */
        .qq-ai-clarify {
          display: flex; flex-direction: column; gap: 10px;
        }
        .qq-ai-clarify-q {
          font-size: 13px; font-weight: 600; line-height: 1.45; color: inherit;
        }
        .qq-ai-clarify-options {
          display: flex; flex-direction: column; gap: 6px;
        }
        .qq-ai-clarify-opt {
          /* min 44px touch target for mobile */
          min-height: 44px;
          display: flex; flex-direction: column; align-items: flex-start;
          justify-content: center;
          padding: 8px 14px;
          border-radius: 10px;
          border: 1.5px solid rgba(13, 60, 252, 0.30);
          background: #fff;
          color: #0d3cfc;
          font-size: 13px; font-weight: 600;
          cursor: pointer; text-align: left;
          transition: background 120ms ease, border-color 120ms ease;
        }
        .qq-ai-clarify-opt:hover:not(:disabled) {
          background: rgba(13, 60, 252, 0.06);
          border-color: rgba(13, 60, 252, 0.55);
        }
        .qq-ai-clarify-opt:disabled { opacity: 0.5; cursor: not-allowed; }
        .qq-ai-clarify-opt:focus-visible {
          outline: 2px solid #0d3cfc; outline-offset: 2px;
        }
        /* "Use best guess" is visually de-emphasised — a subtle tertiary option. */
        .qq-ai-clarify-opt-guess {
          color: #64748b; border-color: rgba(100, 116, 139, 0.30);
          font-weight: 500; font-size: 12px; min-height: 36px;
        }
        .qq-ai-clarify-opt-guess:hover:not(:disabled) {
          background: rgba(100, 116, 139, 0.06);
          border-color: rgba(100, 116, 139, 0.55);
          color: #475569;
        }
        .qq-ai-clarify-hint {
          font-size: 11px; font-weight: 400; color: #64748b; margin-top: 2px;
        }
        [data-theme="dark"] .qq-ai-clarify-opt {
          background: #1e293b; border-color: rgba(99, 102, 241, 0.40);
          color: #818cf8;
        }
        [data-theme="dark"] .qq-ai-clarify-opt:hover:not(:disabled) {
          background: rgba(99, 102, 241, 0.10); border-color: rgba(99, 102, 241, 0.70);
        }
        [data-theme="dark"] .qq-ai-clarify-opt-guess {
          color: #94a3b8; border-color: rgba(148, 163, 184, 0.25);
        }
        [data-theme="dark"] .qq-ai-clarify-hint { color: #94a3b8; }
        @media (prefers-reduced-motion: reduce) {
          .qq-ai-clarify-opt { transition: none; }
        }

        /* Gap 6 — post-apply follow-up quick replies. Same chip skin as the
           clarify options, but laid out as a wrapping row so the five short
           labels pack tightly and wrap cleanly at 375px. Keeps the 44px
           touch-target minimum from .qq-ai-clarify-opt. */
        .qq-ai-followup-options {
          flex-direction: row; flex-wrap: wrap;
          margin-top: 8px;
        }
        .qq-ai-followup-opt {
          flex: 0 1 auto;
          max-width: 100%;
        }
        .qq-ai-followup-options[data-consumed="true"] .qq-ai-followup-opt {
          opacity: 0.5; cursor: not-allowed;
        }

        .qq-ai-chips {
          display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;
        }
        .qq-ai-chip {
          font-size: 10.5px; font-weight: 600;
          padding: 2px 8px; border-radius: 999px;
          background: rgba(13, 60, 252, 0.08);
          color: #0d3cfc;
        }
        .qq-ai-chip-failed {
          background: rgba(220, 38, 38, 0.10);
          color: #b91c1c;
        }
        /* U6 restyle-integrity — partial-drop note. Subtle, not alarming: a
           muted slate tone (NOT the red failure tone) so it reads as an
           informational aside next to the ✓ success chip. */
        .qq-ai-chip-note {
          background: rgba(100, 116, 139, 0.12);
          color: #475569;
        }
        [data-theme="dark"] .qq-ai-chip-note {
          background: rgba(148, 163, 184, 0.16);
          color: #cbd5e1;
        }

        /* Inline confirmation card for destructive AI actions
           (replace_template / apply_template). */
        .qq-ai-confirms {
          display: flex; flex-direction: column; gap: 6px;
          margin-top: 8px;
        }
        .qq-ai-confirm {
          background: #fffbeb; border: 1px solid #fde68a;
          border-radius: 10px; padding: 8px 10px;
          color: #92400e;
        }
        .qq-ai-confirm-applied { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
        .qq-ai-confirm-cancelled { background: #f1f5f9; border-color: #e2e8f0; color: #475569; }
        .qq-ai-confirm-title {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 12px; font-weight: 700;
        }
        .qq-ai-confirm-body {
          font-size: 11.5px; margin-top: 4px; line-height: 1.4;
          color: inherit; opacity: 0.85;
        }
        .qq-ai-confirm-actions {
          display: flex; gap: 6px; margin-top: 8px;
        }
        .qq-ai-confirm-apply {
          background: #0d3cfc; color: #fff; border: none; cursor: pointer;
          font-size: 11.5px; font-weight: 600;
          padding: 5px 12px; border-radius: 6px;
        }
        .qq-ai-confirm-apply:hover { background: #0b34d6; }
        .qq-ai-confirm-cancel {
          background: transparent; color: inherit;
          border: 1px solid currentColor; cursor: pointer;
          font-size: 11.5px; font-weight: 600;
          padding: 4px 11px; border-radius: 6px;
          opacity: 0.7;
        }
        .qq-ai-confirm-cancel:hover { opacity: 1; }
        .qq-ai-confirm-status {
          margin-top: 4px; font-size: 11px; font-weight: 600;
        }
        .qq-ai-err {
          padding: 7px 12px; background: #fef2f2; color: #991b1b;
          font-size: 11.5px; border-top: 1px solid #fee2e2;
        }
        .qq-ai-capped {
          padding: 14px; border-top: 1px solid #fde68a;
          background: #fffbeb;
        }

        .qq-ai-compose {
          border-top: 1px solid rgba(15,23,42,0.07);
          padding: 10px 10px 8px;
          background: #fff;
        }
        .qq-ai-pending-image {
          position: relative; display: inline-block; margin-bottom: 6px;
        }
        .qq-ai-pending-image img {
          max-width: 80px; border-radius: 6px; display: block;
        }
        .qq-ai-pending-image button {
          position: absolute; top: -6px; right: -6px;
          width: 20px; height: 20px; border-radius: 999px;
          background: #0f172a; color: #fff; border: none; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
        }
        /* Wave 64 — non-image pending-file pill (PDF / Excel / email). */
        .qq-ai-pending-file {
          position: relative;
          display: inline-flex; flex-direction: column;
          margin-bottom: 6px;
          padding: 6px 26px 6px 10px;
          border-radius: 8px;
          background: #f1f5f9;
          border: 1px solid rgba(15,23,42,0.10);
          max-width: 100%;
        }
        .qq-ai-pending-file-name {
          font-size: 12px; font-weight: 600; color: #0f172a;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          max-width: 220px;
        }
        .qq-ai-pending-file-meta {
          font-size: 10.5px; color: #64748b; margin-top: 1px;
        }
        .qq-ai-pending-file button {
          position: absolute; top: -6px; right: -6px;
          width: 20px; height: 20px; border-radius: 999px;
          background: #0f172a; color: #fff; border: none; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
        }
        [data-theme="dark"] .qq-ai-pending-file {
          background: #1e293b; border-color: rgba(255,255,255,0.10);
        }
        [data-theme="dark"] .qq-ai-pending-file-name { color: #e2e8f0; }
        [data-theme="dark"] .qq-ai-pending-file-meta { color: #94a3b8; }
        .qq-ai-compose-row {
          display: flex; align-items: flex-end; gap: 6px;
        }
        .qq-ai-iconbtn {
          background: #f1f5f9; border: none; cursor: pointer;
          width: 32px; height: 32px; border-radius: 8px;
          color: #475569; display: inline-flex; align-items: center; justify-content: center;
        }
        .qq-ai-iconbtn:hover { background: #e2e8f0; color: #0f172a; }
        .qq-ai-iconbtn:disabled { opacity: 0.5; cursor: not-allowed; }
        /* ?ai-upload=1 entry-point — pulse the paperclip for ~4s so the user
         * sees exactly where to click. Accent ring fades in/out twice. */
        .qq-ai-iconbtn[data-upload-hint="true"] {
          background: rgba(13,60,252,0.14);
          color: #0d3cfc;
          animation: qq-ai-upload-pulse 1.4s ease-in-out 2;
        }
        @keyframes qq-ai-upload-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(13,60,252,0); }
          50% { box-shadow: 0 0 0 4px rgba(13,60,252,0.30); }
        }
        @media (prefers-reduced-motion: reduce) {
          .qq-ai-iconbtn[data-upload-hint="true"] { animation: none; }
        }
        .qq-ai-input {
          flex: 1 1 auto; resize: none;
          font-family: inherit; font-size: 13px;
          padding: 7px 9px; border-radius: 8px;
          border: 1px solid rgba(15,23,42,0.12);
          background: #fff; color: #0f172a;
          /* UX fix bundle — wizard input matches BD-3c expand-on-focus
             pattern. Default ≈ 64px (3 lines), expands to 120px (~6 lines)
             on focus or when non-empty. Respects prefers-reduced-motion. */
          height: 64px; max-height: 120px;
          transition: height 180ms ease-out;
        }
        .qq-ai-input[data-expanded="true"] { height: 120px; }
        .qq-ai-input:focus { outline: 2px solid rgba(13,60,252,0.35); outline-offset: 0; border-color: #0d3cfc; }
        @media (prefers-reduced-motion: reduce) {
          .qq-ai-input { transition: none; }
        }
        .qq-ai-sendbtn {
          background: #0d3cfc; color: #fff; border: none; cursor: pointer;
          width: 32px; height: 32px; border-radius: 8px;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .qq-ai-sendbtn:disabled { background: #cbd5e1; cursor: not-allowed; }
        .qq-ai-cancelbtn { background: #e2e8f0; color: #0f172a; }
        .qq-ai-cancelbtn:hover { background: #cbd5e1; }
        [data-theme="dark"] .qq-ai-cancelbtn { background: #334155; color: #e2e8f0; }
        [data-theme="dark"] .qq-ai-cancelbtn:hover { background: #475569; }
        .qq-ai-footer {
          display: flex; justify-content: flex-end; margin-top: 6px;
        }
        .qq-ai-reset {
          background: transparent; border: none; cursor: pointer;
          font-size: 10.5px; color: #64748b;
          display: inline-flex; align-items: center; gap: 4px;
        }
        .qq-ai-reset:hover { color: #0f172a; }
        .qq-ai-reset:disabled { color: #cbd5e1; cursor: not-allowed; }

        /* Dark editor chrome respects */
        [data-theme="dark"] .qq-ai-panel {
          background: rgba(15, 23, 42, 0.92);
          color: #e2e8f0; border-color: rgba(255,255,255,0.10);
        }
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
          [data-theme="dark"] .qq-ai-panel { background: #0f172a; }
        }
        [data-theme="dark"] .qq-ai-panel-header {
          background: linear-gradient(180deg, rgba(13, 60, 252, 0.16) 0%, rgba(30, 41, 59, 0.9) 100%);
          border-color: rgba(255,255,255,0.06);
        }
        [data-theme="dark"] .qq-ai-panel-title { color: #e2e8f0; }
        [data-theme="dark"] .qq-ai-msgs { background: #0f172a; }
        [data-theme="dark"] .qq-ai-empty { color: #e2e8f0; }
        [data-theme="dark"] .qq-ai-empty-sub { color: #94a3b8; }
        [data-theme="dark"] .qq-ai-msg-assistant { background: #1e293b; color: #e2e8f0; }
        [data-theme="dark"] .qq-ai-avatar { background: #1e293b; border-color: rgba(255,255,255,0.12); }
        [data-theme="dark"] .qq-ai-compose { background: #0f172a; border-color: rgba(255,255,255,0.06); }
        [data-theme="dark"] .qq-ai-input { background: #1e293b; color: #e2e8f0; border-color: rgba(255,255,255,0.12); }
        [data-theme="dark"] .qq-ai-iconbtn { background: #1e293b; color: #94a3b8; }
        [data-theme="dark"] .qq-ai-budget-meter { background: #1e293b; color: #cbd5e1; border-color: rgba(255,255,255,0.06); }
        [data-theme="dark"] .qq-ai-confirm { background: #422006; border-color: #78350f; color: #fde68a; }
        [data-theme="dark"] .qq-ai-confirm-applied { background: #064e3b; border-color: #065f46; color: #d1fae5; }
        [data-theme="dark"] .qq-ai-confirm-cancelled { background: #1e293b; border-color: #334155; color: #cbd5e1; }

        /* ── Mobile middle-floating card — dark theme + handle tints ──────── */
        @media (max-width: 768px) {
          [data-theme="dark"] .qq-ai-panel {
            background: rgba(15, 23, 42, 0.60) !important;
            border-color: rgba(255, 255, 255, 0.12);
          }
          @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
            [data-theme="dark"] .qq-ai-panel { background: rgba(15, 23, 42, 0.97) !important; }
          }
          [data-theme="dark"] .qq-ai-panel-grab-bar { background: rgba(255, 255, 255, 0.30); }
          [data-theme="dark"] .qq-ai-panel-resize {
            background: rgba(15, 23, 42, 0.28);
            border-top-color: rgba(255, 255, 255, 0.08);
          }
          [data-theme="dark"] .qq-ai-panel-resize-bar { background: rgba(255, 255, 255, 0.30); }
        }

        /* Reduced-motion — the floating card resizes/settles instantly (the
           drag already tracks the finger; this kills the settle transition). */
        @media (prefers-reduced-motion: reduce) {
          .qq-ai-panel,
          .qq-ai-panel-grab-bar,
          .qq-ai-panel-resize-bar { transition: none !important; }
        }
      `}</style>
    </>
  );

  return (
    <>
      {anchor}
      {portalEl ? createPortal(portaledUi, portalEl) : null}
    </>
  );
}
