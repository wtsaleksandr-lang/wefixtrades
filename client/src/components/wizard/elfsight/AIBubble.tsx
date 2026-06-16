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
import { X, Send, Paperclip, Trash2, AlertTriangle, Sparkles, Minus, ChevronDown, ChevronUp } from 'lucide-react';
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

/* Item 11 — draggable circular "Builder" badge. The launcher position is
 *  persisted (viewport coords of its top-left) so a user who drags it out of
 *  the way keeps that placement across tab navigation / reloads. `null` means
 *  "never dragged" → fall back to the CSS default corner anchor. */
const AI_BUBBLE_POS_KEY = 'qq_wizard_ai_bubble_pos';
/** Rendered diameter of the circular launcher (must match the CSS below). */
const AI_BUBBLE_SIZE = 64;
/** Min drag distance (px) before a pointer-down is treated as a drag rather
 *  than a click — so a normal tap still opens the panel. */
const AI_BUBBLE_DRAG_THRESHOLD = 4;

interface BubblePos { x: number; y: number; }

function loadBubblePos(): BubblePos | null {
  try {
    const raw = localStorage.getItem(AI_BUBBLE_POS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<BubblePos>;
    if (typeof v?.x === 'number' && typeof v?.y === 'number'
        && Number.isFinite(v.x) && Number.isFinite(v.y)) {
      return { x: v.x, y: v.y };
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

/** Clamp a desired top-left so the whole badge stays inside the viewport with
 *  an 8px margin. Guarded for SSR / zero-size windows. */
function clampBubblePos(pos: BubblePos): BubblePos {
  if (typeof window === 'undefined') return pos;
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - AI_BUBBLE_SIZE - margin);
  const maxY = Math.max(margin, window.innerHeight - AI_BUBBLE_SIZE - margin);
  return {
    x: Math.min(Math.max(margin, pos.x), maxX),
    y: Math.min(Math.max(margin, pos.y), maxY),
  };
}

export default function AIBubble(props: AIBubbleProps) {
  const { conversationId = 'default', state, seedPrompt, seedNonce, seedImage, openForUploadNonce } = props;
  const [open, setOpen] = useState(false);
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
  const bubbleDragRef = useRef<{
    pointerId: number;
    startX: number; startY: number;
    originX: number; originY: number;
    moved: boolean;
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
      originX: rect.left, originY: rect.top,
      moved: false,
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
    setBubblePos(clampBubblePos({ x: d.originX + dx, y: d.originY + dy }));
  }, [bubbleDragging]);

  const endBubbleDrag = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = bubbleDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    bubbleDragRef.current = null;
    if (d.moved) {
      // Commit + persist the final clamped position; keep `bubbleDragging`
      // true through this tick so the trailing click is swallowed, then clear.
      setBubblePos((prev) => {
        if (prev) saveBubblePos(prev);
        return prev;
      });
      // Defer clearing so the synthetic click (fired after pointerup) sees
      // `bubbleDragging === true` and is ignored by the click handler.
      window.setTimeout(() => setBubbleDragging(false), 0);
    } else {
      setBubbleDragging(false);
    }
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
      {/* Item 11 — floating CIRCULAR "Builder" badge. The word "Builder"
          follows the inner circle edge via an SVG <textPath>; the Sparkles
          glyph sits centered. The badge is DRAGGABLE (pointer-based, clamped
          to the viewport, position persisted) so the user can move it out of
          the way. A short drag threshold keeps a normal tap = open-the-panel.
          Hidden via CSS when the panel is open. */}
      <button
        type="button"
        onClick={() => { if (!bubbleDragging) setOpen(true); }}
        onPointerDown={onBubblePointerDown}
        onPointerMove={onBubblePointerMove}
        onPointerUp={endBubbleDrag}
        onPointerCancel={endBubbleDrag}
        className="qq-ai-bubble"
        data-testid="aibubble-toggle"
        aria-label="Open the QuoteQuick builder (drag to move)"
        data-open={open ? 'true' : 'false'}
        data-dragging={bubbleDragging ? 'true' : 'false'}
        data-positioned={bubblePos ? 'true' : 'false'}
        style={bubblePos
          ? { left: bubblePos.x, top: bubblePos.y, right: 'auto', bottom: 'auto' }
          : undefined}
      >
        {/* Circular text ring — "BUILDER · BUILDER ·" repeated around the
            circle edge. aria-hidden because the button already has an
            accessible label. */}
        <svg
          className="qq-ai-bubble-ring"
          viewBox="0 0 64 64"
          width={64}
          height={64}
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <path
              id={`qq-ai-bubble-textpath-${conversationId}`}
              d="M 32,32 m -23,0 a 23,23 0 1,1 46,0 a 23,23 0 1,1 -46,0"
            />
          </defs>
          <text className="qq-ai-bubble-ring-text">
            <textPath
              href={`#qq-ai-bubble-textpath-${conversationId}`}
              startOffset="0"
            >
              BUILDER · BUILDER ·&nbsp;
            </textPath>
          </text>
        </svg>
        <Sparkles className="qq-ai-bubble-spark" aria-hidden="true" />
        {/* Accessible text label, visually hidden (the ring is decorative). */}
        <span className="qq-ai-bubble-label">Builder</span>
      </button>

      {open && (
        <div
          className={`qq-ai-panel${collapsed ? ' is-collapsed' : ''}`}
          role="dialog"
          aria-label="QuoteQuick builder"
          data-testid="aibubble-panel"
          data-collapsed={collapsed ? 'true' : 'false'}
        >
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
          <div className="qq-ai-panel-header">
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
        </div>
      )}

      <style>{`
        .qq-ai-bubble {
          /* Wave 6 fix — raised bottom 18px -> 76px so the floating bubble
           *  clears the canvas zoom toolbar pill (Actual size / Recenter),
           *  which sits at the editor's bottom-right.
           *
           *  fix/wizard-mobile-firstrun — 76px still overlapped the live
           *  preview's sticky bottom CTA bar ("Get My Quote" + total), which
           *  is a ~76px position:sticky; bottom:0 footer flush to the
           *  bottom-right of the widget card. Raise the bubble to 140px so it
           *  sits clearly ABOVE both the zoom pill AND that sticky CTA bar,
           *  with comfortable separation. Still bottom-right + reachable. */
          /* Item 11 — circular draggable badge. 64px disc; the "Builder"
           *  ring text + centered spark are positioned children. */
          position: fixed; right: 18px; bottom: 140px; z-index: 1100;
          width: 64px; height: 64px; padding: 0;
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: 50%;
          background: #0d3cfc; color: #fff;
          border: none; cursor: grab;
          box-shadow: 0 10px 30px rgba(13, 60, 252, 0.35);
          transition: box-shadow 120ms ease-out, transform 120ms ease-out;
          touch-action: none; /* let pointer-drag work on touch without scroll */
          user-select: none; -webkit-user-select: none;
        }
        .qq-ai-bubble:hover { box-shadow: 0 14px 34px rgba(13, 60, 252, 0.55); }
        .qq-ai-bubble:active,
        .qq-ai-bubble[data-dragging="true"] { cursor: grabbing; }
        .qq-ai-bubble[data-dragging="true"] { transform: scale(1.04); }
        .qq-ai-bubble[data-open="true"] { display: none; }

        /* Rotating-free circular text ring, slow spin for life (paused while
         *  dragging + when reduced-motion is requested). */
        .qq-ai-bubble-ring {
          position: absolute; inset: 0; pointer-events: none;
          animation: qq-ai-bubble-spin 14s linear infinite;
        }
        .qq-ai-bubble[data-dragging="true"] .qq-ai-bubble-ring {
          animation-play-state: paused;
        }
        .qq-ai-bubble-ring-text {
          fill: rgba(255, 255, 255, 0.92);
          font-size: 8.5px;
          font-weight: 800;
          letter-spacing: 1.4px;
          text-transform: uppercase;
        }
        .qq-ai-bubble-spark {
          position: relative; z-index: 1;
          width: 20px; height: 20px; pointer-events: none;
        }
        /* The accessible label is conveyed by aria-label + the ring; keep a
         *  visually-hidden span so screen-reader/test text still reads "Builder". */
        .qq-ai-bubble-label {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
        }
        @keyframes qq-ai-bubble-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .qq-ai-bubble-ring { animation: none !important; }
        }

        .qq-ai-panel {
          position: fixed; right: 18px; bottom: 18px; z-index: 1100;
          width: 360px; height: 500px; max-height: calc(100vh - 36px);
          display: flex; flex-direction: column;
          background: #fff; color: #0f172a;
          border-radius: 14px; overflow: hidden;
          box-shadow: 0 30px 60px rgba(15, 23, 42, 0.28);
          border: 1px solid rgba(15, 23, 42, 0.08);
          /* Wave 55 — animate the fold/unfold height transition. */
          transition: height 250ms ease;
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
        @media (max-width: 768px) {
          .qq-ai-panel {
            right: 0; left: 0; bottom: 0;
            width: 100%; height: 70vh; max-height: 70vh;
            border-radius: 16px 16px 0 0;
          }
          .qq-ai-panel.is-collapsed {
            height: 46px;
          }
          /* Wave 6 fix — on mobile the bubble at bottom 12px overlapped the
           *  right edge of the full-width bottom action/Done bar (~64px tall).
           *  Sit it ABOVE that bar plus the device safe-area inset so it no
           *  longer covers the footer's Done button.
           *
           *  fix/ai-bubble-formula — the right-anchored bubble still landed on
           *  the live preview's bottom "Get My Quote" CTA + the right-aligned
           *  quote total that sit just above the bottom tab bar. The bottom
           *  tab bar (.qq-bottom-tabbar) is fixed at the viewport bottom with
           *  min-height 60px + its own safe-area padding. Reposition the
           *  bubble to the BOTTOM-LEFT corner (the preview's primary CTA +
           *  total are centre/right-weighted, and the canvas zoom pill lives
           *  bottom-RIGHT — so left clears all three).
           *
           *  fix/wizard-mobile-firstrun — even bottom-left at 76px still sat
           *  on the LEFT edge of the widget's full-width sticky CTA bar
           *  ("Get My Quote"), which renders just above the 60px tab bar. The
           *  sticky bar is ~76px tall, so a bubble whose bottom is 76px above
           *  the tab bar overlaps it. Lift the bubble to 140px above the tab
           *  bar (60px bar + ~76px sticky CTA + a small gap), keeping the
           *  device safe-area inset, so it clears the CTA bar entirely.
           *  Shrink it slightly so it reads as a secondary affordance on the
           *  narrow viewport. The chat panel is unaffected (it opens as a
           *  full-width bottom sheet via the rule above). */
          .qq-ai-bubble {
            /* fix/wizard-mobile-firstrun (v2): a fixed bottom offset can't
             *  reliably clear the live preview's sticky "Get My Quote" CTA,
             *  whose vertical position shifts with preview height. Anchor the
             *  launcher TOP-right instead — deterministically clear of the
             *  bottom CTA, the persistent tab bar, and the Build sheet. */
            left: auto;
            right: 12px;
            top: calc(72px + env(safe-area-inset-top, 0px));
            bottom: auto;
            /* Item 11 — slightly smaller circular badge on the narrow
             *  viewport so it reads as a secondary affordance. */
            width: 56px; height: 56px;
          }
          .qq-ai-bubble[data-positioned="true"] {
            /* A user-dragged position is authored inline (left/top) and must
             *  win over the mobile corner anchor above. */
            right: auto; bottom: auto;
          }
          .qq-ai-bubble-spark { width: 18px; height: 18px; }
        }

        .qq-ai-panel-header {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(15, 23, 42, 0.07);
          background: #f8fafc;
        }
        .qq-ai-panel-title {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 12.5px; font-weight: 700;
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
        [data-theme="dark"] .qq-ai-panel { background: #0f172a; color: #e2e8f0; border-color: rgba(255,255,255,0.08); }
        [data-theme="dark"] .qq-ai-panel-header { background: #1e293b; border-color: rgba(255,255,255,0.05); }
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
