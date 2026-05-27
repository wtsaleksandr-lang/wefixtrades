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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, X, Send, Paperclip, Trash2, AlertTriangle, Sparkles, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import CalcAssemblySpinner from '@/components/quote-widget/CalcAssemblySpinner';
import { applyAiToolCall, type AiToolCall } from './aiToolApplier';
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
  applyTemplatePreset: (presetId: string) => void;
  replaceTemplate: (cfg: TemplateConfig) => void;
}

/* ─── Persisted state ─── */

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
  config: {
    cap_lifetime_usd: number;
    soft_warn_pct: number;
    per_call_max_usd: number;
    daily_ceiling_usd: number;
    image_lifetime_cap: number;
  };
}

const HISTORY_KEY_PREFIX = 'qq_ai_chat_';
const MAX_IMAGE_WIDTH = 1024;
const JPEG_QUALITY = 0.78;
/** Hard cap on the original upload — 10 MB. Server caps the resized payload
 *  at ~2 MB, but rejecting huge originals up-front saves a slow base64
 *  encode + an API round-trip. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_UPLOAD_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

function uid(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
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
  try { localStorage.setItem(HISTORY_KEY_PREFIX + convId, JSON.stringify(msgs.slice(-40))); } catch {}
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
      title: `AI wants to apply "${name}"`,
      body: 'Your current fields and calculations will be replaced.',
    };
  }
  // replace_template
  const cfg: any = i.template_config ?? {};
  const fieldCount = Array.isArray(cfg.fields) ? cfg.fields.length : 0;
  const calcCount = Array.isArray(cfg.calculations) ? cfg.calculations.length : 0;
  const title = (cfg.header?.title && String(cfg.header.title).trim()) || 'a new calculator';
  return {
    title: `AI wants to build "${title}"`,
    body: `Your current fields will be replaced with ${fieldCount} new field${fieldCount === 1 ? '' : 's'}` +
      (calcCount ? ` and ${calcCount} calculation${calcCount === 1 ? '' : 's'}.` : '.'),
  };
}

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
    if (res.status === 402 && parsed?.error === 'business_tier_required') {
      handlers.onError('tier:business_required');
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

export default function AIBubble(props: AIBubbleProps) {
  const { conversationId = 'default', state } = props;
  const [open, setOpen] = useState(false);
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
          const pct = data.config.cap_lifetime_usd > 0
            ? data.cumulative_usd / data.config.cap_lifetime_usd
            : 0;
          if (data.cumulative_usd >= data.config.cap_lifetime_usd) setCapExceeded(true);
          else if (pct >= data.config.soft_warn_pct / 100) setWarn(true);
        }
      } catch {}
      if (!cancelled) setBudgetLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [open, budgetLoaded]);

  /* ─── Compose helpers ─── */

  const onPickImage = useCallback(async (file: File) => {
    // Wave AR-1 — validate up-front so the user gets an actionable error
    // before we burn time on base64-encoding a 50 MB photo.
    if (file.type && !ACCEPTED_UPLOAD_TYPES.has(file.type.toLowerCase())) {
      setStreamErr('Use a PNG, JPG or WEBP image.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setStreamErr('Image is too large — keep it under 10 MB.');
      return;
    }
    try {
      const raw = await fileToDataUrl(file);
      const resized = await resizeImage(raw);
      setPendingImage(resized);
      setStreamErr(null);
    } catch (err: any) {
      setStreamErr(String(err?.message || err));
    }
  }, []);

  /* ─── BF-5 — image-to-template: image with no text routes to the dedicated
   *  vision endpoint. Returns a strict JSON template the wizard can drop in
   *  via `replaceTemplate()` (which feeds the BD-3a undo stack). The chat
   *  shows a 280×120 progress card during the call (3 sub-rows pulsing in
   *  sequence) instead of a generic spinner.                                */
  const onImageToTemplate = useCallback(async (imageDataUrl: string) => {
    if (sending) return;
    const userMsgId = uid();
    const assistantId = uid();
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: 'user',
        content: 'Build a calculator from this image',
        imageThumb: imageDataUrl,
      },
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        buildingTemplate: true,
      },
    ]);
    setPendingImage(null);
    setSending(true);
    setStreamErr(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Decode the data URL into a Blob → FormData. Multer needs the
      // original mime type so it can apply the file-type filter.
      const match = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(imageDataUrl);
      let blob: Blob;
      if (match) {
        const bin = atob(match[2]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        blob = new Blob([bytes], { type: match[1] });
      } else {
        // Fallback: best-effort fetch (works for blob:/http: URLs too).
        const res = await fetch(imageDataUrl);
        blob = await res.blob();
      }
      const form = new FormData();
      const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
      form.append('image', blob, `quote.${ext}`);

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
          (res.status === 401 ? 'Sign in to use the AI assistant.' :
           res.status === 429 ? 'You can only generate 5 templates per hour. Try again later.' :
           res.status === 413 ? 'Image is too large — keep it under 5 MB.' :
           'Sorry, I couldn’t read that image. Try a clearer photo or paste your details as text.');
        setMessages((prev) => prev.map(m =>
          m.id === assistantId
            ? { ...m, buildingTemplate: false, content: '', imageError: message }
            : m
        ));
        return;
      }

      const data = await res.json() as { template: ImageTemplate };
      const cfg = imageTemplateToConfig(data.template);

      // Apply directly via the existing `replaceTemplate` setter — same path
      // the AI's `replace_template` tool uses, so it joins the undo stack.
      try {
        props.replaceTemplate(cfg);
      } catch (err: any) {
        setStreamErr(`apply failed: ${err?.message ?? err}`);
      }

      // Notify the rest of the shell (analytics, BD-3a undo banner, etc.).
      try {
        window.dispatchEvent(new CustomEvent('qq-wizard:template-generated', {
          detail: { source: 'image', raw: data.template, config: cfg },
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
            ? { ...m, buildingTemplate: false, content: '', imageError: 'Sorry, I couldn’t read that image. Try a clearer photo or paste your details as text.' }
            : m
        ));
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [sending, props]);

  const onSend = useCallback(async () => {
    const trimmed = input.trim();
    if ((!trimmed && !pendingImage) || sending) return;
    if (capExceeded) return;

    // BF-5 — image-only send → dedicated image-to-template endpoint.
    if (!trimmed && pendingImage) {
      const img = pendingImage;
      setInput('');
      await onImageToTemplate(img);
      return;
    }

    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: trimmed,
      imageThumb: pendingImage ?? undefined,
    };
    const assistantId = uid();
    // Wave AR-1 — choose a label up-front so we can render an inline
    // CalcAssemblySpinner inside the empty placeholder. Image flow gets the
    // multi-stage label; text-only chat gets "Thinking…".
    const placeholderLabel = pendingImage ? 'Analyzing your screenshot…' : 'Thinking…';
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
    setInput('');
    const imageToSend = pendingImage;
    setPendingImage(null);
    setSending(true);
    setStreamErr(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        {
          message: trimmed,
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
            try { applyAiToolCall(call, props); } catch (err: any) {
              // Even on apply failure, surface the attempt to the user.
              setStreamErr(`tool ${call.name} failed: ${err?.message ?? err}`);
            }
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? {
                  ...m,
                  pendingLabel: undefined,
                  toolChips: [...(m.toolChips ?? []), describeTool(call)],
                }
                : m
            ));
          },
          onDone: (final) => {
            setBudget(final.snapshot);
            if (final.warn) setWarn(true);
            if (final.snapshot.cumulative_usd >= final.snapshot.config.cap_lifetime_usd) {
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
  }, [input, sending, capExceeded, pendingImage, messages, state, props, onImageToTemplate]);

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

  /** User clicked [Apply] on a queued replace_template / apply_template card. */
  const onConfirmApply = useCallback((messageId: string, confirmKey: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const pending = (m.pendingConfirms ?? []).find(p => p.key === confirmKey);
      if (!pending || pending.resolved) return m;
      try {
        applyAiToolCall(pending.call, props);
      } catch (err: any) {
        setStreamErr(`tool ${pending.call.name} failed: ${err?.message ?? err}`);
        return m;
      }
      return {
        ...m,
        pendingConfirms: (m.pendingConfirms ?? []).map(p =>
          p.key === confirmKey ? { ...p, resolved: 'applied' as const } : p,
        ),
        toolChips: [...(m.toolChips ?? []), describeTool(pending.call)],
      };
    }));
  }, [props]);

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

  /* ─── Render ─── */

  const budgetMeter = useMemo(() => {
    if (!budget) return null;
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
      {/* Floating bubble (always rendered, hidden via CSS when panel is open) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="qq-ai-bubble"
        data-testid="aibubble-toggle"
        aria-label="Open AI assistant"
        data-open={open ? 'true' : 'false'}
      >
        <Sparkles className="w-4 h-4" />
        <span className="qq-ai-bubble-label">AI</span>
      </button>

      {open && (
        <div
          className={`qq-ai-panel${collapsed ? ' is-collapsed' : ''}`}
          role="dialog"
          aria-label="AI assistant"
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
            aria-label={collapsed ? 'Expand AI assistant' : 'Collapse AI assistant'}
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
              <Bot className="w-3.5 h-3.5" />
              <span>AI assistant</span>
            </div>
            {budgetMeter}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="qq-ai-panel-min"
              aria-label="Minimize AI assistant"
              title="Minimize"
              data-testid="aibubble-minimize"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="qq-ai-panel-close"
              aria-label="Close AI assistant"
              data-testid="aibubble-close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {warn && !capExceeded && (
            <div className="qq-ai-warn" data-testid="aibubble-warn">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>You're close to your AI budget cap.</span>
            </div>
          )}

          <div className="qq-ai-msgs" ref={scrollerRef} data-testid="aibubble-msgs">
            {messages.length === 0 && (
              <div className="qq-ai-empty" data-testid="aibubble-empty">
                <p style={{ margin: 0, fontWeight: 700 }}>Hi — I can build your calculator with you.</p>
                <p style={{ margin: '6px 0 0', color: p.colors.muted }}>
                  Ask me to add fields, change pricing, or restyle. Or attach a photo of your regular
                  quote / invoice — I'll replicate the pricing into a calculator for you.
                </p>
              </div>
            )}
            {messages.map(m => (
              <div key={m.id} className={`qq-ai-msg qq-ai-msg-${m.role}`} data-testid={`aibubble-msg-${m.role}`}>
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
                {m.content && <div className="qq-ai-msg-text">{m.content}</div>}
                {m.toolChips && m.toolChips.length > 0 && (
                  <div className="qq-ai-chips">
                    {m.toolChips.map((chip, i) => (
                      <span key={i} className="qq-ai-chip" data-testid="aibubble-tool-chip">✓ {chip}</span>
                    ))}
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
                          aria-label="Confirm destructive AI action"
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
            ))}
          </div>

          {streamErr && (
            <div className="qq-ai-err" data-testid="aibubble-error" role="alert">
              {streamErr.startsWith('budget:')
                ? 'AI budget reached for this calculator.'
                : streamErr === 'auth:required'
                  ? 'Sign in to use the AI assistant. Open this calculator from your dashboard, or refresh the page.'
                  : streamErr === 'tier:business_required'
                    ? 'The AI assistant is a Business-plan feature. Upgrade to unlock it.'
                    : `Something went wrong: ${streamErr}`}
            </div>
          )}

          {capExceeded ? (
            <div className="qq-ai-capped" data-testid="aibubble-cap-reached">
              <p style={{ margin: 0, fontWeight: 700 }}>AI budget reached</p>
              <p style={{ margin: '6px 0 0', color: p.colors.muted, fontSize: 12 }}>
                You've used your AI assistant budget for this account. Upgrade your plan to unlock more.
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
              <div className="qq-ai-compose-row">
                <button
                  type="button"
                  className="qq-ai-iconbtn"
                  aria-label="Attach screenshot"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="aibubble-upload"
                  disabled={sending}
                >
                  <Paperclip style={{ width: 20, height: 20 }} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
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
                  placeholder="Ask the AI to build or change anything…"
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
                    disabled={!input.trim() && !pendingImage}
                    className="qq-ai-sendbtn"
                    data-testid="aibubble-send"
                    aria-label={pendingImage && !input.trim() ? 'Build calculator from image' : 'Send'}
                    title={pendingImage && !input.trim() ? 'Build calculator from image' : 'Send'}
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
          position: fixed; right: 18px; bottom: 18px; z-index: 1100;
          display: inline-flex; align-items: center; gap: 6px;
          padding: 10px 14px; border-radius: 999px;
          background: #0d3cfc; color: #fff;
          border: none; cursor: pointer;
          font-weight: 700; font-size: 12.5px;
          box-shadow: 0 10px 30px rgba(13, 60, 252, 0.35);
          transition: box-shadow 120ms ease-out;
        }
        .qq-ai-bubble:hover { box-shadow: 0 14px 34px rgba(13, 60, 252, 0.55); }
        .qq-ai-bubble[data-open="true"] { display: none; }
        .qq-ai-bubble-label { letter-spacing: 0.04em; }

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
          .qq-ai-bubble { right: 12px; bottom: 12px; padding: 9px 12px; font-size: 12px; }
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
        .qq-ai-msg {
          max-width: 86%; padding: 8px 11px;
          border-radius: 12px; font-size: 13px; line-height: 1.45;
          word-wrap: break-word;
        }
        .qq-ai-msg-user {
          background: #0d3cfc; color: #fff;
          align-self: flex-end; border-bottom-right-radius: 4px;
        }
        .qq-ai-msg-assistant {
          background: #f1f5f9; color: #0f172a;
          align-self: flex-start; border-bottom-left-radius: 4px;
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

        .qq-ai-chips {
          display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;
        }
        .qq-ai-chip {
          font-size: 10.5px; font-weight: 600;
          padding: 2px 8px; border-radius: 999px;
          background: rgba(13, 60, 252, 0.08);
          color: #0d3cfc;
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
        [data-theme="dark"] .qq-ai-msg-assistant { background: #1e293b; color: #e2e8f0; }
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
