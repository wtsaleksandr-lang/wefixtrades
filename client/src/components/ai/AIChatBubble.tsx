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
}

function generateSessionId() {
  return 'sess_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now();
}

export default function AIChatBubble({ calculatorId, accentColor = '#6366f1', businessName = 'AI Assistant', theme }: AIChatBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trialExpired, setTrialExpired] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
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
    setError(null);

    try {
      const res = await fetch('/api/ai/client-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          calculator_id: calculatorId,
          session_id: sessionIdRef.current,
        }),
      });
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
    }
  }, [input, isLoading, trialExpired, messages, calculatorId]);

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
              <div style={{ display: 'flex', justifyContent: 'flex-start' }} data-testid="chat-typing-indicator">
                <div style={{ background: '#fff', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#bbb', animation: 'ai-dot-bounce 1.2s infinite 0s' }} />
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#bbb', animation: 'ai-dot-bounce 1.2s infinite 0.2s' }} />
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#bbb', animation: 'ai-dot-bounce 1.2s infinite 0.4s' }} />
                </div>
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
      `}</style>
    </>
  );
}
