// HelpModal — shared wizard help "?" modal (2026-06-12 redesign).
//
// Replaces the two previously-duplicated mailto: modals (EditorTopBar.tsx +
// WizardShell.tsx) with ONE component and two in-product actions:
//
//   1. "Ask the assistant" — closes the modal and opens the existing builder
//      chat (AIBubble). AIBubble exposes no imperative open API and must not
//      be edited (other agents own it), so we drive its OWN launcher button:
//      `[data-testid="aibubble-toggle"]` carries a `data-open` attribute and
//      a click handler that flips the panel open. If the restored
//      localStorage state left the panel collapsed, we also click
//      `[data-testid="aibubble-fold"][data-collapsed="true"]` to expand it
//      (immediately + on the next frame, since the fold button only exists
//      after the panel mounts).
//
//   2. "Message support" — an inline, in-app ticket form (no mail client):
//      · signed-in clients  → POST /api/portal/tickets (real support ticket;
//        success shows the ticket # — confirmation email + admin alert are
//        sent server-side).
//      · anonymous visitors / admins → POST /api/contact (sales_leads inbox);
//        an email field (required) lets support reply.
//      "Request a feature" survives as a topic pill, not a separate mailto.
//
// Rendering: portaled to <body> (same as the old modals) so the
// wizard-shell-modal's open-animation transform can't reparent the fixed
// layer. Reuses the existing .qq-editor-help / .qq-editor-help-card /
// .qq-editor-btn CSS (WizardShell <style> block) + the portaled dark-theme
// rules in index.css; new .qq-help-* classes live in index.css with
// [data-theme="dark"] overrides so the form is theme-aware in both modes.
// Dismissal: Escape (capture phase), backdrop click, or the explicit button.

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, LifeBuoy, Sparkles } from 'lucide-react';
import { AE } from './appleEditor';
import { useAuth } from '@/hooks/useAuth';
import FloatField from './FloatField';
import InfoCue from './InfoCue';
import type { EditorTheme } from './types';

interface Props {
  /** Editor chrome theme — stamped on the overlay for the dark-mode CSS. */
  editorTheme: EditorTheme;
  onClose: () => void;
}

/** Topic pills. `ticketCategory` maps onto the /api/portal/tickets enum
 *  (general | billing | service | onboarding | access | other) — the human
 *  label always travels in the subject line so support sees the real intent
 *  regardless of path. */
const TOPICS = [
  { id: 'question', label: 'Question', ticketCategory: 'general' },
  { id: 'bug', label: 'Bug report', ticketCategory: 'service' },
  { id: 'feature', label: 'Feature request', ticketCategory: 'other' },
] as const;
type TopicId = (typeof TOPICS)[number]['id'];

/**
 * Open the builder chat via AIBubble's own launcher (documented mechanism —
 * see file header). No-ops harmlessly when the wizard isn't mounted.
 */
function openBuilderChat(): void {
  if (typeof document === 'undefined') return;
  const expand = () => {
    const fold = document.querySelector<HTMLButtonElement>(
      '[data-testid="aibubble-fold"][data-collapsed="true"]',
    );
    fold?.click();
  };
  const toggle = document.querySelector<HTMLButtonElement>('[data-testid="aibubble-toggle"]');
  if (toggle && toggle.dataset.open !== 'true') {
    toggle.click();
    // React flushes discrete events synchronously, so the panel normally
    // exists already; the rAF retry covers a deferred commit.
    expand();
    requestAnimationFrame(expand);
  } else {
    // Panel already open — just make sure it isn't folded to its header.
    expand();
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function HelpModal({ editorTheme, onClose }: Props) {
  const { user } = useAuth();
  // Only role="client" owns a portal client record — admins would trip
  // withClientId() on the ticket route, so they go down the contact path
  // (with their email prefilled) like anonymous visitors.
  const isClient = !!user && user.role === 'client';

  const [view, setView] = useState<'menu' | 'support' | 'success'>('menu');
  const [topic, setTopic] = useState<TopicId>('question');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Prefill the reply-to email for signed-in non-client users (admins).
  useEffect(() => {
    if (!isClient && user?.email) {
      setEmail((prev) => (prev ? prev : user.email));
    }
  }, [isClient, user?.email]);

  // Escape closes — capture phase so this wins over ancestor listeners
  // (same contract as the previous EditorTopBar modal).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const onAskAssistant = useCallback(() => {
    onClose();
    openBuilderChat();
  }, [onClose]);

  const submit = useCallback(async () => {
    const msg = message.trim();
    const topicCfg = TOPICS.find((t) => t.id === topic) ?? TOPICS[0];
    if (msg.length < 10) {
      setError('Please add a little more detail (at least 10 characters).');
      return;
    }
    const replyTo = email.trim();
    if (!isClient && !EMAIL_RE.test(replyTo)) {
      setError('Enter a valid email so we can reply to you.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      if (isClient) {
        const res = await fetch('/api/portal/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            subject: `${topicCfg.label} — QuoteQuick editor`,
            message: msg,
            category: topicCfg.ticketCategory,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Could not send your message. Please try again.');
        setTicketId(typeof data?.id === 'number' ? data.id : null);
        setSentTo(null); // replies go to the account email
      } else {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: user?.name || replyTo.split('@')[0] || 'QuoteQuick visitor',
            email: replyTo,
            subject: `QuoteQuick editor — ${topicCfg.label}`,
            message: msg,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Could not send your message. Please try again.');
        setTicketId(null);
        setSentTo(replyTo);
      }
      setView('success');
    } catch (err) {
      // Honest failure surface — the message stays in the form and the Send
      // button doubles as Retry.
      setError(err instanceof Error ? err.message : 'Could not send your message. Please try again.');
    } finally {
      setSending(false);
    }
  }, [email, isClient, message, topic, user?.name]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="qq-editor-help"
      role="dialog"
      aria-modal="true"
      aria-label="Editor help"
      data-theme={editorTheme}
      data-testid="editor-help-overlay"
      onClick={onClose}
    >
      <div className="qq-editor-help-card" onClick={(e) => e.stopPropagation()}>
        {view === 'menu' && (
          <>
            <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: AE.color.text }}>
              Need a hand?
            </p>
            <p style={{ fontSize: 13, color: AE.color.secondary, margin: '6px 0 0', lineHeight: 1.5 }}>
              Build on the left, preview on the right. Esc or click outside to close.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
              <button
                type="button"
                className="qq-help-option"
                data-testid="help-action-ask-assistant"
                aria-label="Ask the assistant — opens the builder chat"
                onClick={onAskAssistant}
              >
                <span aria-hidden="true" className="qq-help-option-icon">
                  <Sparkles style={{ width: 20, height: 20 }} />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span className="qq-help-option-title">Ask the assistant</span>
                  <span className="qq-help-option-sub">
                    Instant answers about building, pricing, and publishing.
                  </span>
                </span>
              </button>

              <button
                type="button"
                className="qq-help-option"
                data-testid="help-action-message-support"
                aria-label="Message support — send us a message from here"
                onClick={() => { setError(null); setView('support'); }}
              >
                <span aria-hidden="true" className="qq-help-option-icon">
                  <LifeBuoy style={{ width: 20, height: 20 }} />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span className="qq-help-option-title">Message support</span>
                  <span className="qq-help-option-sub">
                    Question, bug or feature request — we reply by email.
                  </span>
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              data-testid="editor-help-dismiss"
              className="qq-editor-btn"
              style={{ marginTop: 14, minHeight: 44 }}
              autoFocus
            >
              Got it
            </button>
          </>
        )}

        {view === 'support' && (
          <form
            onSubmit={(e) => { e.preventDefault(); void submit(); }}
            data-testid="help-support-form"
          >
            {/* Help cue anchored top-left of the section title (Rule 5). */}
            <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600, margin: 0, color: AE.color.text }}>
              <InfoCue
                testid="help-support"
                text="Pick a topic and tell us what's going on. Your message goes straight to the support inbox and we reply by email — usually the same day."
              />
              <span>Message support</span>
            </p>

            {/* Topic pills — selected = accent outline + tint, never a bright fill. */}
            <div
              role="radiogroup"
              aria-label="Topic"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}
            >
              {TOPICS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={topic === t.id}
                  className="qq-help-pill"
                  data-selected={topic === t.id ? 'true' : 'false'}
                  data-testid={`help-topic-${t.id}`}
                  onClick={() => setTopic(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Input cluster — 2px stack per the input-field rules. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 12 }} data-input-cluster>
              {!isClient && (
                <FloatField label="Your email" htmlFor="qq-help-email" fieldBg={editorTheme === 'dark' ? '#243149' : undefined}>
                  <input
                    id="qq-help-email"
                    type="email"
                    className="premium-input"
                    placeholder=" "
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    data-testid="help-support-email"
                  />
                </FloatField>
              )}
              <FloatField label="How can we help?" htmlFor="qq-help-message" fieldBg={editorTheme === 'dark' ? '#243149' : undefined}>
                <textarea
                  id="qq-help-message"
                  className="premium-input"
                  placeholder=" "
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  data-testid="help-support-message"
                  style={{ resize: 'vertical', minHeight: 96 }}
                />
              </FloatField>
            </div>

            {isClient && (
              <p style={{ fontSize: 12, color: AE.color.secondary, margin: '8px 0 0', lineHeight: 1.4 }}>
                We'll reply to your account email.
              </p>
            )}

            {error && (
              <div role="alert" className="qq-help-error" data-testid="help-support-error">
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                type="button"
                className="qq-editor-btn qq-editor-btn--ghost"
                style={{ minHeight: 44 }}
                onClick={() => { setError(null); setView('menu'); }}
                data-testid="help-support-back"
              >
                Back
              </button>
              <button
                type="submit"
                className="qq-editor-btn"
                style={{ minHeight: 44, flex: 1 }}
                disabled={sending}
                data-testid="help-support-send"
              >
                {sending ? 'Sending…' : error ? 'Retry' : 'Send message'}
              </button>
            </div>
          </form>
        )}

        {view === 'success' && (
          <div data-testid="help-support-success">
            <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, margin: 0, color: AE.color.text }}>
              <CheckCircle2 style={{ width: 20, height: 20, color: AE.color.success, flexShrink: 0 }} aria-hidden="true" />
              <span>Message sent</span>
            </p>
            <p style={{ fontSize: 13, color: AE.color.secondary, margin: '8px 0 0', lineHeight: 1.5 }}>
              {ticketId !== null
                ? `Ticket #${ticketId} is open — we'll reply to your account email.`
                : sentTo
                  ? `Thanks — we'll reply to ${sentTo}.`
                  : "Thanks — we'll reply by email."}
            </p>
            <button
              type="button"
              className="qq-editor-btn"
              style={{ marginTop: 14, minHeight: 44 }}
              onClick={onClose}
              data-testid="help-support-done"
              autoFocus
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
