import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatBubbleProps {
  calculatorId: number;
  accentColor?: string;
  businessName?: string;
  theme?: any;
  /**
   * W-BB-1 — opt into multi-step agent loop. When true, the bubble POSTs
   * with `useAgentLoop: true` and consumes SSE step events so the typing
   * indicator can show "Checking schedule..." → "Confirming booking..."
   * before the final reply lands. Default true; pass false to keep the
   * legacy single-call behaviour.
   */
  useAgentLoop?: boolean;
  /** Customer identity captured by the lead form earlier in the widget. */
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  /**
   * BD-2c — visibility mode.
   *   - `'rescue'` (default): bubble stays hidden until the user has
   *     advanced beyond step 2, idles for 30s on a single step, or clicks
   *     a Help button anywhere in the widget. Once revealed, persists.
   *   - `'always'`: legacy behaviour, bubble visible from page load.
   *
   * Free-tier calculators always use `'rescue'` regardless of the stored
   * value (the caller — `calculator.tsx` — enforces the tier gate).
   */
  visibility?: 'rescue' | 'always';
}

/**
 * Human-readable status labels for the agent-loop "AI is …" indicator.
 * Keys match the auto-tier tool names in customerWidgetTools.ts.
 */
const TOOL_STATUS_LABELS: Record<string, string> = {
  fetch_customer_quote_history: 'Checking your quote history',
  propose_appointment_times: 'Finding available times',
  book_appointment: 'Confirming your booking',
  send_quote_confirmation_email: 'Sending your estimate',
  request_human_followup: 'Looping in a human teammate',
  update_my_quote_with_addons: 'Recalculating your quote',
};

function generateSessionId() {
  return 'sess_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now();
}

export default function AIChatBubble({
  calculatorId,
  accentColor = '#6366f1',
  businessName = 'AI Assistant',
  theme,
  useAgentLoop = true,
  customerEmail,
  customerPhone,
  customerName,
  visibility = 'rescue',
}: AIChatBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);
  /* BD-2c — visibility gate. `'always'` mode keeps the bubble visible from
   * mount (legacy). `'rescue'` mode starts hidden and reveals once ANY of:
   *   - widget reports `stepIndex >= 2` via the `quotequick:step` event
   *   - the user has been idle on the current step for >= 30s
   *   - any Help button anywhere in the widget dispatches `quotequick:help`
   * Once revealed, persists for the rest of the session. */
  const [revealed, setRevealed] = useState(visibility === 'always');
  useEffect(() => {
    if (visibility === 'always') { setRevealed(true); return; }
    if (typeof window === 'undefined') return;

    let idleTimer: number | undefined;
    const startIdle = () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setRevealed(true), 30_000);
    };
    startIdle();

    const onStep = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      // Restart the idle timer on each step change.
      startIdle();
      if (typeof detail.stepIndex === 'number' && detail.stepIndex >= 2) {
        setRevealed(true);
      }
    };
    const onHelp = () => setRevealed(true);
    // Generic any-input movement resets the idle timer so we don't reveal
    // while the user is actively typing or scrolling.
    const onActivity = () => startIdle();

    window.addEventListener('quotequick:step', onStep as EventListener);
    window.addEventListener('quotequick:help', onHelp as EventListener);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('pointerdown', onActivity);
    return () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      window.removeEventListener('quotequick:step', onStep as EventListener);
      window.removeEventListener('quotequick:help', onHelp as EventListener);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('pointerdown', onActivity);
    };
  }, [visibility]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trialExpired, setTrialExpired] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  /** Current in-progress step label for the typing indicator tooltip. */
  const [stepStatus, setStepStatus] = useState<string | null>(null);
  const sessionIdRef = useRef(generateSessionId());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Scroll to bottom within the chat container (not the page)
  useEffect(() => {
    if (isOpen && messagesAreaRef.current) {
      messagesAreaRef.current.scrollTo({ top: messagesAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `Hi! I'm the AI assistant for ${businessName}. How can I help you today?`,
      }]);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, businessName, messages.length]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading || trialExpired) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);
    setStepStatus(null);
    setError(null);

    try {
      const res = await fetch('/api/ai/client-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          calculator_id: calculatorId,
          session_id: sessionIdRef.current,
          useAgentLoop,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          customer_name: customerName,
        }),
      });

      // SSE branch (W-BB-1) — agent loop streams progress + final text.
      const contentType = res.headers.get('content-type') || '';
      if (useAgentLoop && contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantText = '';
        // Reserve one placeholder assistant message we keep updating.
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';
          for (const frame of frames) {
            const line = frame.startsWith('data: ') ? frame.slice(6) : frame;
            if (line === '[DONE]') continue;
            try {
              const evt = JSON.parse(line);
              if (evt.error) {
                setError(evt.error);
              } else if (evt.text) {
                assistantText += evt.text;
                setMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: 'assistant', content: assistantText };
                  return copy;
                });
              } else if (evt.step) {
                if (evt.step.type === 'tool_use') {
                  const label = TOOL_STATUS_LABELS[evt.step.payload?.name] || 'Working on it';
                  setStepStatus(label + '...');
                } else if (evt.step.type === 'tool_result') {
                  setStepStatus(null);
                }
              }
            } catch {
              // Ignore malformed frames — keep the stream alive.
            }
          }
        }
        return;
      }

      // Legacy JSON branch — single-call behavior.
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'trial_expired') {
          setTrialExpired(true);
          setMessages(prev => [...prev, { role: 'assistant', content: data.message || 'AI Assistant paused — upgrade to continue.' }]);
        } else {
          setError(data.error || 'Something went wrong. Please try again.');
        }
        return;
      }
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setError('Unable to connect. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
      setStepStatus(null);
    }
  }, [input, isLoading, trialExpired, messages, calculatorId, useAgentLoop, customerEmail, customerPhone, customerName]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
      }
    : {
        position: 'fixed',
        bottom: '88px',
        right: '24px',
        zIndex: 9999,
        width: '320px',
        height: '480px',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        background: '#fff',
      };

  // BD-2c — when the visibility gate hasn't tripped yet, render nothing at
  // all. The 200ms slide-up entrance respects `prefers-reduced-motion`
  // (the keyframe is short enough that reduced-motion users effectively
  // see the bubble pop in without distress; we additionally bypass the
  // animation when the OS-level preference is set).
  if (!revealed) return null;

  return (
    <>
      {isOpen && (
        <div style={panelStyle} data-testid="ai-chat-panel">
          <div
            style={{ background: accentColor, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}
          >
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '15px', lineHeight: 1.2 }} data-testid="text-chat-business-name">
                {businessName}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px' }}>AI Assistant</div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
              data-testid="button-chat-close"
              aria-label="Close chat"
            >
              <X size={16} />
            </button>
          </div>

          <div
            ref={messagesAreaRef}
            style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#f8f9fa' }}
            data-testid="chat-messages-area"
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
                data-testid={`chat-message-${msg.role}-${i}`}
              >
                <div
                  style={{
                    maxWidth: '82%',
                    padding: '9px 13px',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: msg.role === 'user' ? accentColor : '#fff',
                    color: msg.role === 'user' ? '#fff' : '#1a1a1a',
                    fontSize: '14px',
                    lineHeight: 1.5,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }} data-testid="chat-typing-indicator">
                <div style={{ background: '#fff', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#bbb', animation: 'ai-dot-bounce 1.2s infinite 0s' }} />
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#bbb', animation: 'ai-dot-bounce 1.2s infinite 0.2s' }} />
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#bbb', animation: 'ai-dot-bounce 1.2s infinite 0.4s' }} />
                </div>
                {stepStatus && (
                  <div
                    style={{ fontSize: '11px', color: '#6b7280', padding: '2px 6px', fontStyle: 'italic' }}
                    title={stepStatus}
                    data-testid="chat-step-status"
                  >
                    {stepStatus}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div style={{ background: '#fff3f3', border: '1px solid #fca5a5', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#dc2626' }} data-testid="chat-error-message">
                {error}
              </div>
            )}

            {trialExpired && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#92400e', textAlign: 'center' }} data-testid="chat-trial-expired">
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>AI Assistant paused</div>
                <div>The free trial has ended. Upgrade to reactivate.</div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding: '12px', background: '#fff', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={trialExpired ? 'AI paused' : 'Type your message...'}
                disabled={isLoading || trialExpired}
                style={{
                  flex: 1,
                  padding: '9px 13px',
                  borderRadius: '20px',
                  border: '1px solid #e5e7eb',
                  outline: 'none',
                  fontSize: '14px',
                  background: trialExpired ? '#f9f9f9' : '#fff',
                  color: '#1a1a1a',
                }}
                data-testid="input-chat-message"
                aria-label="Chat message input"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading || trialExpired}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: (!input.trim() || isLoading || trialExpired) ? '#e5e7eb' : accentColor,
                  border: 'none',
                  cursor: (!input.trim() || isLoading || trialExpired) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  flexShrink: 0,
                  transition: 'background 0.15s',
                }}
                data-testid="button-chat-send"
                aria-label="Send message"
              >
                {isLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />}
              </button>
            </div>
            <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '11px', color: '#9ca3af' }} data-testid="text-powered-by">
              Powered by AI
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9998,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: accentColor,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          color: '#fff',
          transition: 'transform 0.15s, box-shadow 0.15s',
          // BD-2c — subtle slide-up entrance the first time the bubble
          // reveals (rescue mode). `prefers-reduced-motion` zeros the
          // animation via the @media rule in the <style> block below.
          animation: 'qq-ai-bubble-rise 200ms ease-out both',
        }}
        data-testid="button-chat-bubble"
        aria-label={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.07)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>

      <style>{`
        @keyframes ai-dot-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes qq-ai-bubble-rise {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes qq-ai-bubble-rise {
            from { transform: none; opacity: 1; }
            to { transform: none; opacity: 1; }
          }
        }
      `}</style>
    </>
  );
}
