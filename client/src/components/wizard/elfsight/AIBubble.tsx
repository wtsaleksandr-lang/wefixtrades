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
import { Bot, X, Send, Image as ImageIcon, Trash2, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { applyAiToolCall, type AiToolCall } from './aiToolApplier';
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

export default function AIBubble(props: AIBubbleProps) {
  const { conversationId = 'default', state } = props;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory(conversationId));
  const [input, setInput] = useState('');
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
    try {
      const raw = await fileToDataUrl(file);
      const resized = await resizeImage(raw);
      setPendingImage(resized);
    } catch (err: any) {
      setStreamErr(String(err?.message || err));
    }
  }, []);

  const onSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    if (capExceeded) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: trimmed,
      imageThumb: pendingImage ?? undefined,
    };
    const assistantId = uid();
    const placeholder: ChatMessage = { id: assistantId, role: 'assistant', content: '', toolChips: [] };

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
              m.id === assistantId ? { ...m, content: m.content + delta } : m
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
                ? { ...m, toolChips: [...(m.toolChips ?? []), describeTool(call)] }
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
    }
  }, [input, sending, capExceeded, pendingImage, messages, state, props]);

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

  return (
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
        <div className="qq-ai-panel" role="dialog" aria-label="AI assistant" data-testid="aibubble-panel">
          <div className="qq-ai-panel-header">
            <div className="qq-ai-panel-title">
              <Bot className="w-3.5 h-3.5" />
              <span>AI assistant</span>
            </div>
            {budgetMeter}
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
                  Ask me to add fields, change pricing, restyle, or paste a screenshot of a calculator
                  you'd like me to replicate.
                </p>
              </div>
            )}
            {messages.map(m => (
              <div key={m.id} className={`qq-ai-msg qq-ai-msg-${m.role}`} data-testid={`aibubble-msg-${m.role}`}>
                {m.imageThumb && (
                  <img src={m.imageThumb} alt="" className="qq-ai-msg-thumb" data-testid="aibubble-msg-thumb" />
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
                  <ImageIcon className="w-3.5 h-3.5" />
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
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      onSend();
                    }
                  }}
                  placeholder="Ask the AI to build or change anything…"
                  rows={1}
                  data-testid="aibubble-input"
                  disabled={sending}
                />
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!input.trim() || sending}
                  className="qq-ai-sendbtn"
                  data-testid="aibubble-send"
                  aria-label="Send"
                >
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
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
          transition: transform 120ms ease-out, box-shadow 120ms ease-out;
        }
        .qq-ai-bubble:hover { transform: translateY(-1px); box-shadow: 0 14px 34px rgba(13, 60, 252, 0.42); }
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
        }
        @media (max-width: 768px) {
          .qq-ai-panel {
            right: 0; left: 0; bottom: 0;
            width: 100%; height: 70vh; max-height: 70vh;
            border-radius: 16px 16px 0 0;
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
        .qq-ai-panel-close {
          background: transparent; border: none; cursor: pointer;
          padding: 4px; border-radius: 6px; color: #475569;
        }
        .qq-ai-panel-close:hover { background: rgba(15,23,42,0.06); color: #0f172a; }

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
          min-height: 32px; max-height: 120px;
        }
        .qq-ai-input:focus { outline: 2px solid rgba(13,60,252,0.35); outline-offset: 0; border-color: #0d3cfc; }
        .qq-ai-sendbtn {
          background: #0d3cfc; color: #fff; border: none; cursor: pointer;
          width: 32px; height: 32px; border-radius: 8px;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .qq-ai-sendbtn:disabled { background: #cbd5e1; cursor: not-allowed; }
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
}
