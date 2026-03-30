import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MapPin, Globe, Search, Trophy, Megaphone, Clock, MessageCircle, Wrench, FileX, BarChart3, Users, ClipboardList, Info, ChevronRight, ZoomIn, ZoomOut, X, Minus, Plus } from "lucide-react";
import { SERVICES, getServicesForIssues } from '@shared/services';

// ─── Design tokens ───────────────────
const DARK = '#0d1514';
const CYAN = '#00D4C8';
const GREEN = '#22C55E';
const GREEN_BG = '#DCFCE7';
const AMBER = '#F59E0B';
const AMBER_BG = '#FEF3C7';
const RED = '#EF4444';
const RED_BG = '#FEE2E2';
const GREY = '#6B7280';
const GREY_BG = '#F9FAFB';
const BORDER = '#E5E7EB';
const WHITE = '#FFFFFF';

function scoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.7) return GREEN;
  if (pct >= 0.45) return AMBER;
  return RED;
}
function gradeColor(grade: string): string {
  if (grade === 'A') return GREEN;
  if (grade === 'B') return CYAN;
  if (grade === 'C') return AMBER;
  return RED;
}
function statusColor(status: string): string {
  if (status === 'strong' || status === 'good') return GREEN;
  if (status === 'below-fold') return AMBER;
  return RED;
}

function getScoreColor(score: number): string {
  if (score >= 75) return '#22C55E';
  if (score >= 50) return '#F59E0B';
  return '#EF4444';
}

function ScoreCircle({ score, grade, onClick, displayScore, pulsing }: { score: number; grade: string; onClick?: () => void; displayScore?: number; pulsing?: boolean }) {
  const shown = displayScore ?? score;
  const r = 45;
  const circ = 2 * Math.PI * r;
  const fill = (shown / 100) * circ;
  const color = getScoreColor(shown);
  const isRefining = !!pulsing;
  // Animated sweep segment: a short arc that travels around the ring
  const sweepLen = circ * 0.18;
  return (
    <div style={{ textAlign: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={onClick} title="Click to learn more">
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes scoreSweep {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: ${-circ}; }
        }
        @keyframes scoreGlowPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.55; }
        }
        @media (prefers-reduced-motion: reduce) {
          .score-sweep, .score-glow-ring { animation: none !important; }
        }
      `}</style>
      <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto' }}>
        {/* Soft glow behind ring — only while refining */}
        {isRefining && (
          <div className="score-glow-ring" style={{
            position: 'absolute', inset: 10, borderRadius: '50%',
            background: color, filter: 'blur(14px)', opacity: 0.3,
            animation: 'scoreGlowPulse 2s ease-in-out infinite',
          }}/>
        )}
        <svg width="120" height="120" viewBox="0 0 120 120" style={{ position: 'relative', zIndex: 1 }}>
          {/* Background track */}
          <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8"/>
          {/* Score fill arc */}
          <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${fill} ${circ - fill}`}
            strokeLinecap="round" transform="rotate(-90 60 60)"/>
          {/* Animated sweep overlay — only while refining */}
          {isRefining && (
            <circle className="score-sweep" cx="60" cy="60" r={r} fill="none"
              stroke={color} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${sweepLen} ${circ - sweepLen}`}
              transform="rotate(-90 60 60)"
              opacity={0.35}
              style={{ animation: 'scoreSweep 2s linear infinite' }}/>
          )}
          <text x="60" y="55" textAnchor="middle" fill={color} fontSize="22" fontWeight="700">{shown}</text>
          <text x="60" y="70" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="11">/100</text>
        </svg>
      </div>
      <div style={{
        display: 'inline-block', padding: '3px 14px', borderRadius: 20,
        background: color + '22', border: `1px solid ${color}`,
        color, fontSize: 13, fontWeight: 700, marginTop: 6
      }}>
        Grade {grade}
      </div>
      {/* Hidden test anchor for score extraction */}
      <span data-testid="score-value" data-score={shown} data-grade={grade} style={{ display: 'none' }} />
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
        {isRefining ? 'Progressing' : 'Tap for more'}
      </div>
    </div>
  );
}

function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!show) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [show]);
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-block', verticalAlign: 'middle' }}>
      <span
        onClick={() => setShow(s => !s)}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, borderRadius: '50%', background: '#E5E7EB',
          color: '#6B7280', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          marginLeft: 6, userSelect: 'none', flexShrink: 0, transition: 'background 0.15s ease'
        }}
      >
        ?
      </span>
      {show && (
        <>
          {/* Background blur overlay */}
          <div style={{
            position: 'fixed', inset: 0, zIndex: 98,
            backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
            background: 'rgba(0,0,0,0.15)', pointerEvents: 'none'
          }}/>
          {/* Tooltip card */}
          <div style={{
            position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%',
            transform: 'translateX(-50%)', zIndex: 99, width: 240,
            background: 'rgba(13,21,20,0.92)', backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)', borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.12)', padding: '14px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)', pointerEvents: 'none'
          }}>
            {/* Arrow */}
            <div style={{
              position: 'absolute', bottom: -6, left: '50%',
              transform: 'translateX(-50%) rotate(45deg)', width: 10, height: 10,
              background: 'rgba(13,21,20,0.92)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderTop: 'none', borderLeft: 'none'
            }}/>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 1.55, fontWeight: 400 }}>
              {text}
            </p>
          </div>
        </>
      )}
    </span>
  );
}

/* ─── Screenshot Lightbox with pinch-zoom & scroll-zoom ─── */
function ScreenshotLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLDivElement>(null);
  const lastDist = useRef(0);
  const lastCenter = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragTranslate = useRef({ x: 0, y: 0 });

  const clampScale = (s: number) => Math.min(Math.max(s, 0.5), 5);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(s => clampScale(s * delta));
  }, []);

  // Touch pinch zoom
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastDist.current > 0) {
        const ratio = dist / lastDist.current;
        setScale(s => clampScale(s * ratio));
      }
      lastDist.current = dist;
      // Pan with two-finger center
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      if (lastCenter.current.x !== 0) {
        setTranslate(t => ({ x: t.x + cx - lastCenter.current.x, y: t.y + cy - lastCenter.current.y }));
      }
      lastCenter.current = { x: cx, y: cy };
    } else if (e.touches.length === 1 && dragging.current) {
      const dx = e.touches[0].clientX - dragStart.current.x;
      const dy = e.touches[0].clientY - dragStart.current.y;
      setTranslate({ x: dragTranslate.current.x + dx, y: dragTranslate.current.y + dy });
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      dragging.current = true;
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      dragTranslate.current = { ...translate };
    }
    if (e.touches.length === 2) { dragging.current = false; lastDist.current = 0; lastCenter.current = { x: 0, y: 0 }; }
  }, [translate]);

  const handleTouchEnd = useCallback(() => {
    lastDist.current = 0;
    lastCenter.current = { x: 0, y: 0 };
    dragging.current = false;
  }, []);

  // Mouse drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragTranslate.current = { ...translate };
  }, [translate]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setTranslate({ x: dragTranslate.current.x + dx, y: dragTranslate.current.y + dy });
  }, []);

  const handleMouseUp = useCallback(() => { dragging.current = false; }, []);

  // Double-tap/click to toggle zoom
  const handleDoubleClick = useCallback(() => {
    if (scale > 1.2) { setScale(1); setTranslate({ x: 0, y: 0 }); }
    else { setScale(2.5); }
  }, [scale]);

  // Keyboard: Escape to close, +/- to zoom
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '=' || e.key === '+') setScale(s => clampScale(s * 1.2));
      if (e.key === '-') setScale(s => clampScale(s / 1.2));
      if (e.key === '0') { setScale(1); setTranslate({ x: 0, y: 0 }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', flexShrink: 0, background: 'rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>{Math.round(scale * 100)}%</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setScale(s => clampScale(s / 1.3))} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ZoomOut size={18} /></button>
          <button onClick={() => { setScale(1); setTranslate({ x: 0, y: 0 }); }} style={{ padding: '0 12px', height: 36, borderRadius: 18, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Reset</button>
          <button onClick={() => setScale(s => clampScale(s * 1.3))} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ZoomIn size={18} /></button>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}><X size={18} /></button>
        </div>
      </div>
      {/* Image area */}
      <div
        ref={imgRef}
        style={{ flex: 1, overflow: 'hidden', cursor: scale > 1 ? 'grab' : 'zoom-in', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        <img
          src={src} alt={alt} draggable={false}
          style={{
            maxWidth: '95%', maxHeight: '95%', objectFit: 'contain',
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transition: dragging.current ? 'none' : 'transform 0.15s ease-out',
            borderRadius: 4, boxShadow: '0 4px 32px rgba(0,0,0,0.4)',
            userSelect: 'none', WebkitUserSelect: 'none',
          }}
        />
      </div>
      {/* Hint */}
      <div style={{ textAlign: 'center', padding: '8px 16px 14px', fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
        Pinch or scroll to zoom · Drag to pan · Double-tap to toggle · Press 0 to reset
      </div>
    </div>
  );
}

const ShareIcons = {
  email: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="6" fill="#6B7280"/>
      <path d="M4 8l8 5 8-5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="4" y="7" width="16" height="11" rx="2" stroke="white" strokeWidth="1.5" fill="none"/>
    </svg>
  ),
  whatsapp: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="6" fill="#25D366"/>
      <path d="M12 4C7.58 4 4 7.58 4 12c0 1.42.37 2.75 1.02 3.91L4 20l4.24-1.1A7.94 7.94 0 0012 20c4.42 0 8-3.58 8-8s-3.58-8-8-8z" fill="white"/>
      <path d="M16 14.5c-.3-.15-1.76-.87-2.03-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.48-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.68-1.63-.93-2.23-.24-.59-.49-.5-.68-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.87 1.22 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z" fill="#25D366"/>
    </svg>
  ),
  facebook: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="6" fill="#1877F2"/>
      <path d="M16 4h-2a4 4 0 00-4 4v2H8v3h2v7h3v-7h2l1-3h-3V8a1 1 0 011-1h2V4z" fill="white"/>
    </svg>
  ),
  twitter: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="6" fill="#000000"/>
      <path d="M18 5h-2.5l-3.5 4L8.5 5H4l5.5 7L4 19h2.5l3.8-4.5L14.5 19H19l-5.8-7.5L18 5z" fill="white"/>
    </svg>
  ),
  copy: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="6" fill="#6B7280"/>
      <rect x="9" y="9" width="10" height="10" rx="2" stroke="white" strokeWidth="1.5" fill="none"/>
      <path d="M15 9V7a2 2 0 00-2-2H7a2 2 0 00-2 2v6a2 2 0 002 2h2" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  copied: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="6" fill="#22C55E"/>
      <path d="M7 12l4 4 6-7" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
};

export default function ReportView({ report, business, reportId, liveSpeedData, speedLoading, liveWebsiteAIAnalysis, liveWebsiteScreenshot, liveWebsiteQualityCheckScore }: {
  report: any;
  business: any;
  reportId?: string | null;
  liveSpeedData?: any;
  speedLoading?: boolean;
  liveWebsiteAIAnalysis?: any;
  liveWebsiteScreenshot?: string | null;
  liveWebsiteQualityCheckScore?: number;
}) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<'maps' | 'website' | 'plan'>('maps');
  const [selected, setSelected] = useState<string[]>([]);
  const toggleService = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  const detectedIssues: string[] = report?.detectedIssues || [];
  const recommendedServices: any[] = report?.recommendedServices || getServicesForIssues(detectedIssues);
  const totalPrice = selected.reduce((sum, id) => {
    const s = SERVICES.find(sv => sv.id === id);
    return sum + (s?.price || 0);
  }, 0);

  // ─── Shared chat state (synced via localStorage with SiteChatWidget) ───
  const MESSAGES_KEY = 'wft_chat_messages';
  const OPEN_KEY = 'wft_chat_open';

  function loadSharedMessages(): {role:'user'|'ai', text:string}[] {
    try {
      const raw = localStorage.getItem(MESSAGES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((m: any) => ({
            role: m.role === 'assistant' ? 'ai' as const : 'user' as const,
            text: m.content || m.text || '',
          }));
        }
      }
    } catch {}
    return [];
  }

  function saveSharedMessages(msgs: {role:'user'|'ai', text:string}[]) {
    try {
      // Convert to shared format and save
      const shared = msgs.slice(-40).map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.text,
      }));
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(shared));
    } catch {}
  }

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role:'user'|'ai', text:string}[]>(() => {
    const saved = loadSharedMessages();
    return saved.length > 0 ? saved : [];
  });
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatUnread, setChatUnread] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const reviewsRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const onReviewMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.pageX - (reviewsRef.current?.offsetLeft || 0);
    scrollLeft.current = reviewsRef.current?.scrollLeft || 0;
    if (reviewsRef.current) { reviewsRef.current.style.cursor = 'grabbing'; reviewsRef.current.style.userSelect = 'none'; }
  };
  const onReviewMouseLeave = () => {
    isDragging.current = false;
    if (reviewsRef.current) { reviewsRef.current.style.cursor = 'grab'; reviewsRef.current.style.userSelect = ''; }
  };
  const onReviewMouseUp = () => {
    isDragging.current = false;
    if (reviewsRef.current) { reviewsRef.current.style.cursor = 'grab'; reviewsRef.current.style.userSelect = ''; }
  };
  const onReviewMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const x = e.pageX - (reviewsRef.current?.offsetLeft || 0);
    if (reviewsRef.current) reviewsRef.current.scrollLeft = scrollLeft.current - (x - startX.current) * 1.5;
  };
  useEffect(() => {
    const el = reviewsRef.current;
    if (!el) return;
    const cardWidth = 292; // 280px card + 12px gap
    el.scrollLeft = cardWidth * REVIEWS.length;
    let animFrame: number;
    let lastTime = 0;
    const speed = 0.4; // px per ms
    const animate = (time: number) => {
      if (!isDragging.current) {
        const delta = time - lastTime;
        el.scrollLeft += speed * delta;
        const maxScroll = cardWidth * REVIEWS.length * 2;
        const minScroll = cardWidth * REVIEWS.length;
        if (el.scrollLeft >= maxScroll) el.scrollLeft = minScroll;
        if (el.scrollLeft <= cardWidth * (REVIEWS.length - 1)) el.scrollLeft = maxScroll - cardWidth;
      }
      lastTime = time;
      animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrame);
  }, []);
  const [chatExpanded, setChatExpanded] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Trap scroll inside chat messages area (native listener with passive:false)
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      const { scrollTop, scrollHeight, clientHeight } = el!;
      const atTop = scrollTop <= 0 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
      if (atTop || atBottom) e.preventDefault();
      e.stopPropagation();
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [chatExpanded]);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const isTiny = typeof window !== 'undefined' && window.innerWidth <= 480;
  const r16 = 16;
  const [hovered, setHovered] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [activeReview, setActiveReview] = useState(0);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [metricModal, setMetricModal] = useState<string | null>(null);
  const [breakdownModal, setBreakdownModal] = useState<string | null>(null);
  const [issueModal, setIssueModal] = useState<number | null>(null);
  const [speedDevice, setSpeedDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [visualAnalysisModal, setVisualAnalysisModal] = useState(false);
  const [screenshotLightbox, setScreenshotLightbox] = useState(false);
  const [reportZoom, setReportZoom] = useState(100);

  // Score circle animation state
  const [displayScore, setDisplayScore] = useState(0);
  const [prevScore, setPrevScore] = useState(0);
  const animFrameRef = useRef<number>(0);
  const FAQS = [
    { q: "Do I need to learn any software?", a: "No. Our team handles everything. You get a simple dashboard and a weekly summary sent to your phone — no training, no software to install." },
    { q: "How long until I see results?", a: "Most trades businesses see more calls and profile views within 2–4 weeks. SEO gains compound over 60–90 days and keep growing." },
    { q: "Is there a contract or cancellation fee?", a: "No contracts, no cancellation fees. Cancel anytime with 30 days notice. We earn your business every month through results." },
    { q: "What makes you different from a regular marketing agency?", a: "We only work with trades businesses. Every tool, automation, and strategy is built specifically for how plumbers, electricians, and HVAC techs get jobs." },
    { q: "Who does the work for me?", a: "Our team does. From setup to optimization, we handle everything. You focus on running jobs — we handle getting them to ring your phone." },
    { q: "What happens after I get this report?", a: "Pick the services that match your biggest gaps. Complete a 5-minute onboarding form. Our team sets everything up within 48 hours and you start seeing results." },
  ];
  const hoverProps = (id: string) => ({
    onMouseEnter: () => setHovered(id),
    onMouseLeave: () => setHovered(null),
  });

  const handleEmailSubmit = async () => {
    if (!email.trim() || !email.includes('@')) return;
    setEmailLoading(true);
    try {
      await fetch('/api/audit/save-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          reportId,
          businessName: business?.name,
          trade: report?.trade,
          city: report?.city,
          score: report?.scores?.total,
        }),
      });
      setEmailSubmitted(true);
    } catch {
      setEmailSubmitted(true);
    } finally {
      setEmailLoading(false);
    }
  };

  // Add greeting if no messages yet
  useEffect(() => {
    if (chatMessages.length > 0) return;
    const timer = setTimeout(() => {
      const greeting = {
        role: 'ai' as const,
        text: `Hi! I've reviewed the audit for ${business?.name || 'your business'}. You have ${report?.detectedIssues?.length || 0} issues detected. Any questions about what we found?`
      };
      setChatMessages([greeting]);
    }, 6000);
    return () => clearTimeout(timer);
  }, []);

  // Persist messages to shared localStorage on every change
  useEffect(() => {
    if (chatMessages.length > 0) saveSharedMessages(chatMessages);
  }, [chatMessages]);

  // Listen for changes from SiteChatWidget (other tab/same page)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === MESSAGES_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setChatMessages(parsed.map((m: any) => ({
              role: m.role === 'assistant' ? 'ai' as const : 'user' as const,
              text: m.content || '',
            })));
          }
        } catch {}
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatLoading(true);
    // Auto-expand the chat panel when user sends a message
    setChatExpanded(true);
    if (isMobile) setChatOpen(true);
    let reply = '';
    try {
      const sessionId = (() => {
        const KEY = 'wft_chat_session';
        let id = localStorage.getItem(KEY);
        if (!id) { id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem(KEY, id); }
        return id;
      })();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surface: 'audit',
          sessionId,
          messages: [
            ...chatMessages.map(m => ({
              role: m.role === 'ai' ? 'assistant' : 'user',
              content: m.text,
            })),
            { role: 'user', content: userMsg },
          ],
          auditContext: {
            businessName: business?.name,
            trade: report?.trade,
            city: report?.city,
            score: report?.scores?.total,
            grade: report?.scores?.grade,
            topIssues: report?.narrative?.actionPlan?.slice(0, 5)?.map((a: any) => ({ title: a.title, estimatedImpact: a.estimatedImpact })),
            estimatedRevenueLoss: report?.estimatedRevenueLoss || report?.narrative?.estimatedMonthlyRevenueLoss,
            detectedIssueIds: report?.detectedIssues,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setChatMessages(prev => [...prev, { role: 'ai', text: err.error || 'Sorry, something went wrong. Try again.' }]);
        setChatLoading(false);
        return;
      }
      setChatMessages(prev => [...prev, { role: 'ai', text: '' }]);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              reply += parsed.text;
              setChatMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'ai', text: reply };
                return updated;
              });
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
              setChatMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'ai', text: e.message || 'Something went wrong.' };
                return updated;
              });
            }
          }
        }
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'ai', text: 'Sorry, something went wrong. Try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const ai = report?.narrative || report?.aiNarrative || {};
  const scores = report?.scores || {};
  const keywords = report?.keywords || [];
  const loss = report?.estimatedRevenueLoss || {};
  const speed = liveSpeedData || report?.speedData || {};
  const gaps = report?.contentGaps || ai?.contentGaps || [];

  // Handle both narrative structures (old: actionPlan/quickWin, new: recommendations/analysis)
  const plan = ai?.actionPlan || ai?.recommendations || [];
  const quickWin = ai?.quickWin || (ai?.analysis ? {
    action: ai.analysis,
    timeRequired: null,
    expectedResult: null,
  } : null);

  const shareUrl = reportId
    ? `${window.location.origin}/audit/report/${reportId}`
    : window.location.href;

  const competitors = report?.competitors || [];
  const rankedCompetitors = [...competitors].sort((a: any, b: any) => (b.reviewsCount || 0) - (a.reviewsCount || 0)).slice(0, 5);
  const businessReviews = business?.reviewsCount || 0;
  const businessRating = business?.rating || 0;
  const marketLeader = report?.marketLeader;
  const areaAvgReviews = report?.areaAverageReviews || 0;
  const areaAvgRating = report?.areaAverageRating || 0;
  const businessRank = (() => {
    const all = [...competitors, { reviewsCount: businessReviews, rating: businessRating, isYou: true }]
      .sort((a: any, b: any) => (b.reviewsCount || 0) - (a.reviewsCount || 0));
    return all.findIndex((c: any) => c.isYou) + 1;
  })();
  const totalInMarket = competitors.length + 1;
  const reviewGap = marketLeader ? businessReviews - (marketLeader.reviewsCount || 0) : 0;
  const noWebsiteCount = competitors.filter((c: any) => !c.hasWebsite).length;
  const lowRatingCount = competitors.filter((c: any) => (c.rating || 0) < 4.3).length;
  const maxReviews = Math.max(businessReviews, ...competitors.map((c: any) => c.reviewsCount || 0), 1);

  const METRIC_EXPLANATIONS: Record<string, { title: string; what: string; why: string; diy: string; timeline: string; thresholds: { label: string; value: string; color: string }[] }> = {
    fcp: {
      title: 'First Contentful Paint (FCP)',
      what: 'How long until the first text or image appears on screen after a visitor opens your page.',
      why: 'Slow FCP makes visitors more likely to leave before seeing anything. Faster load times improve engagement and reduce bounces.',
      diy: 'Compress and resize images. Enable browser caching. Preload critical fonts. Minimize render-blocking CSS.',
      timeline: '1–3 days for image optimization; 1–2 weeks for full render-path cleanup.',
      thresholds: [
        { label: 'Good', value: '< 1.8s', color: GREEN },
        { label: 'Needs work', value: '1.8s – 3s', color: AMBER },
        { label: 'Critical', value: '> 3s', color: RED },
      ],
    },
    lcp: {
      title: 'Largest Contentful Paint (LCP)',
      what: 'How long until the main visual element — usually a hero image or heading — fully loads on screen.',
      why: 'LCP is a Core Web Vital used by Google for ranking. A slow LCP hurts rankings and causes visitors to leave before the page feels ready.',
      diy: 'Compress and convert your hero image to WebP. Remove unused JavaScript. Improve server response time. Consider a CDN for static assets.',
      timeline: '2–5 days for image and server fixes; 2–4 weeks if hosting or CMS changes are needed.',
      thresholds: [
        { label: 'Good', value: '< 2.5s', color: GREEN },
        { label: 'Needs work', value: '2.5s – 4s', color: AMBER },
        { label: 'Critical', value: '> 4s', color: RED },
      ],
    },
    tbt: {
      title: 'Total Blocking Time (TBT)',
      what: 'Total time your page is frozen and unresponsive to clicks or taps while JavaScript runs in the background.',
      why: 'High TBT makes your site feel unresponsive. Visitors who cannot tap buttons or scroll smoothly are more likely to leave.',
      diy: 'Defer non-critical JavaScript. Remove unused plugins and tracking scripts. Break up long tasks. Lazy-load third-party widgets.',
      timeline: '1–3 days for quick script removal; 2–4 weeks for full JavaScript audit and cleanup.',
      thresholds: [
        { label: 'Good', value: '< 200ms', color: GREEN },
        { label: 'Needs work', value: '200ms – 600ms', color: AMBER },
        { label: 'Critical', value: '> 600ms', color: RED },
      ],
    },
    cls: {
      title: 'Cumulative Layout Shift (CLS)',
      what: 'Measures how much visible elements jump around unexpectedly while the page loads — buttons shifting, text moving, images popping in.',
      why: 'Layout shifts frustrate visitors and cause accidental clicks. Google factors CLS into search rankings, so poor scores hurt visibility.',
      diy: 'Set width and height on all images and videos. Avoid inserting content above existing elements. Use CSS font-display to prevent text reflow.',
      timeline: '1–2 days for dimension fixes; 1–2 weeks if ad slots or dynamic content are involved.',
      thresholds: [
        { label: 'Good', value: '< 0.1', color: GREEN },
        { label: 'Needs work', value: '0.1 – 0.25', color: AMBER },
        { label: 'Critical', value: '> 0.25', color: RED },
      ],
    },
  };

  const liveWebsiteScore = useMemo(() => {
    const s = liveSpeedData || report?.speedData;
    const mobileScore = s?.mobile?.score ?? null;
    const desktopScore = s?.desktop?.score ?? null;

    if (mobileScore === null && desktopScore === null) return null;

    // Speed contribution (max 8)
    const speedVal = mobileScore ?? desktopScore ?? 0;
    let speedPoints = 0;
    if (speedVal >= 90) speedPoints = 8;
    else if (speedVal >= 70) speedPoints = 6;
    else if (speedVal >= 50) speedPoints = 4;
    else if (speedVal >= 30) speedPoints = 2;
    else speedPoints = 1;

    // QA checks contribution (max 8) — prefer live polled value
    const qaScore = liveWebsiteQualityCheckScore ?? report?.websiteQualityCheckScore ?? 0;
    const qaMax = 18;
    const qaPoints = Math.round((qaScore / qaMax) * 8);

    // AI visual contribution (max 4) — prefer live polled value
    const aiAnalysis = liveWebsiteAIAnalysis || report?.websiteAIAnalysis;
    let aiVisualPts = 0;
    if (aiAnalysis?.findings && Array.isArray(aiAnalysis.findings)) {
      const passCount = aiAnalysis.findings.filter((f: any) => f.status === "pass").length;
      const total = aiAnalysis.findings.length || 1;
      aiVisualPts = Math.round((passCount / total) * 4);
    }

    return Math.min(20, speedPoints + qaPoints + aiVisualPts);
  }, [liveSpeedData, report?.speedData, liveWebsiteQualityCheckScore, report?.websiteQualityCheckScore, liveWebsiteAIAnalysis, report?.websiteAIAnalysis]);

  const liveTotal = useMemo(() => {
    if (liveWebsiteScore === null) return scores.total || 0;
    const oldWebsite = scores.websiteQuality?.score || 0;
    return (scores.total || 0) - oldWebsite + liveWebsiteScore;
  }, [liveWebsiteScore, scores]);

  const animateScore = (from: number, to: number) => {
    const duration = 1200;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplayScore(current);
      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      }
    };
    cancelAnimationFrame(animFrameRef.current);
    requestAnimationFrame(step);
  };

  // Animate on mount
  useEffect(() => {
    animateScore(0, liveTotal || report?.scores?.total || 0);
  }, []);

  // Animate on speed arrival
  useEffect(() => {
    if (liveTotal && liveTotal !== prevScore) {
      animateScore(prevScore, liveTotal);
      setPrevScore(liveTotal);
    }
  }, [liveTotal]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const websiteScoreNote = (() => {
    if (liveWebsiteScore !== null) {
      const s = liveSpeedData || report?.speedData;
      const mobile = s?.mobile?.score;
      const desktop = s?.desktop?.score;
      const parts = [];
      if (mobile != null) parts.push(`Mobile ${mobile}/100`);
      if (desktop != null) parts.push(`Desktop ${desktop}/100`);
      return parts.join(' · ');
    }
    if (speedLoading) return 'Measuring speed...';
    return 'Speed test unavailable';
  })();

  const BREAKDOWN_EXPLANATIONS: Record<string, { title: string; what: string; why: string; diy: string; timeline: string }> = {
    googleMaps: {
      title: 'Google Maps Profile',
      what: 'How complete, active, and trustworthy your Google Business Profile looks to both Google and potential customers.',
      why: 'A stronger profile improves local rankings, drives more calls, and helps more people choose your business over competitors.',
      diy: 'Add all relevant business categories. Upload quality photos of your work, team, and location. Write a keyword-rich description. Respond to reviews and post updates regularly.',
      timeline: '1–2 weeks for a full profile overhaul; ongoing weekly maintenance to stay competitive.',
    },
    websiteQuality: {
      title: 'Website Quality',
      what: 'How well your website performs across speed, mobile experience, trust signals, and conversion elements like click-to-call.',
      why: 'A weak website loses leads silently. A fast, mobile-friendly site turns more visitors into booked jobs.',
      diy: 'Run PageSpeed Insights to find issues. Compress images. Ensure mobile responsiveness. Add click-to-call buttons. Fix broken links.',
      timeline: '1–2 weeks for quick fixes; 4–8 weeks for a full performance and conversion overhaul.',
    },
    searchVisibility: {
      title: 'Search Visibility',
      what: 'How easily your business appears in Google search results when people search for your services locally.',
      why: 'Low visibility means missed traffic, missed calls, and missed revenue from people already looking for what you offer.',
      diy: 'Create service-specific pages for your core keywords. Add location content. Build local backlinks. Keep your Google profile active.',
      timeline: '2–4 weeks for content creation; 60–90 days for meaningful organic ranking improvements.',
    },
    competitorPosition: {
      title: 'Competitor Position',
      what: 'How your visibility and positioning compares against nearby competitors in your local market.',
      why: 'Where competitors outrank you, they capture the calls and jobs you are missing.',
      diy: 'Audit competitor profiles. Work toward matching their review count and photo count. Create more location-specific content. Monitor ranking changes regularly.',
      timeline: '2–4 weeks for initial competitive audit; ongoing monthly effort to close gaps.',
    },
    adOpportunity: {
      title: 'Ad Opportunity',
      what: 'Whether paid search ads would help capture demand in areas where your organic visibility is weak.',
      why: 'When organic reach is limited, ads place your business in front of ready-to-book customers immediately.',
      diy: 'Set up a Google Ads account. Research local service keywords. Create ad groups by service type. Set a daily budget and monitor cost-per-lead.',
      timeline: '1–2 weeks to launch a basic campaign; 30–60 days to optimize for cost-effective results.',
    },
    demandCoverage: {
      title: 'Demand Coverage',
      what: 'Whether your business appears when customers search during the times and situations that matter most — evenings, weekends, emergencies.',
      why: 'Coverage gaps cause missed leads during high-value demand windows, even if your business performs well during normal hours.',
      diy: 'Extend your listed business hours. Create pages targeting emergency and after-hours searches. Schedule Google posts during peak demand periods.',
      timeline: '1–2 weeks for hours and content updates; ongoing adjustment based on when leads come in.',
    },
  };

  const scoreRows = [
    { key: 'googleMaps', icon: <MapPin size={18} color="#00D4C8" />, label: 'Google Maps Profile', score: scores.googleMaps?.score || 0, max: 25, note: 'How complete and trusted your Google profile is' },
    { key: 'websiteQuality', icon: <Globe size={18} color="#00D4C8" />, label: 'Website Quality', score: liveWebsiteScore ?? scores.websiteQuality?.score ?? 0, max: 20, note: websiteScoreNote },
    { key: 'searchVisibility', icon: <Search size={18} color="#00D4C8" />, label: 'Search Visibility', score: scores.searchVisibility?.score || 0, max: 20, note: 'How easily customers find you on Google' },
    { key: 'competitorPosition', icon: <Trophy size={18} color="#00D4C8" />, label: 'Competitor Position', score: scores.competitorPositioning?.score || 0, max: 15, note: 'How you compare to local competitors' },
    { key: 'adOpportunity', icon: <Megaphone size={18} color="#00D4C8" />, label: 'Ad Opportunity', score: scores.adOpportunity?.score || 0, max: 10, note: 'The paid search market in your area' },
    { key: 'demandCoverage', icon: <Clock size={18} color="#00D4C8" />, label: 'Demand Coverage', score: scores.demandCoverage?.score || 0, max: 10, note: "Whether you're visible when customers search most" },
  ];

  const card = (extra?: any) => ({
    background: WHITE, borderRadius: r16, border: `1px solid ${BORDER}`,
    padding: 24, marginBottom: 10, ...extra
  });

  const SHARE_BUTTONS = [
    {
      id: 'email', label: 'Email', bg: '#6B7280',
      icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#6B7280"/><path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" stroke="white" strokeWidth="1.5" fill="none"/><path d="M4 8l8 6 8-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>),
      onClick: () => window.open(`mailto:?subject=My WeFixTrades Local Business Audit&body=View my free audit report: ${shareUrl}`)
    },
    {
      id: 'whatsapp', label: 'WhatsApp', bg: '#25D366',
      icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.556 4.112 1.523 5.836L.057 24l6.305-1.654A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.374l-.36-.214-3.732.978 1.001-3.65-.234-.374A9.818 9.818 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182c5.42 0 9.818 4.398 9.818 9.818 0 5.42-4.398 9.818-9.818 9.818z"/></svg>),
      onClick: () => window.open(`https://wa.me/?text=${encodeURIComponent(`Check out my business audit: ${shareUrl}`)}`)
    },
    {
      id: 'facebook', label: 'Facebook', bg: '#1877F2',
      icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>),
      onClick: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`)
    },
    {
      id: 'twitter', label: 'X', bg: '#2D2D2D',
      icon: (<svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>),
      onClick: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Just got my free local business audit — scored ${scores.total}/100. Get yours:`)}&url=${encodeURIComponent(shareUrl)}`)
    },
    {
      id: 'copy', label: copiedLink ? 'Copied!' : 'Copy', bg: copiedLink ? '#22C55E' : '#4B5563',
      icon: copiedLink
        ? (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12l5 5L20 7"/></svg>)
        : (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#4B5563"/><rect x="9" y="9" width="9" height="9" rx="2" stroke="white" strokeWidth="1.5" fill="none"/><path d="M15 9V7a2 2 0 00-2-2H7a2 2 0 00-2 2v6a2 2 0 002 2h2" stroke="white" strokeWidth="1.5" strokeLinecap="round"/><path d="M12 12h3M12 15h3" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>),
      onClick: () => { navigator.clipboard.writeText(shareUrl).then(() => { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }); }
    },
  ];

  const REVIEWS = [
    { platform: 'google', name: 'Mike T.', business: 'MT Plumbing & Drains', location: 'Toronto, ON', rating: 5, text: 'Within 3 weeks of fixing our Google profile we started getting 8-10 more calls per week. The MapGuard service paid for itself in the first month easily.', date: '2 months ago', avatar: 'MT' },
    { platform: 'facebook', name: 'Sarah K.', business: 'Kline HVAC Services', location: 'Mississauga, ON', rating: 5, text: 'Our mobile website was scoring 42/100. After WebBoost we jumped to 91. Calls from mobile went up noticeably within weeks. Worth every penny.', date: '6 weeks ago', avatar: 'SK' },
    { platform: 'trustpilot', name: 'James R.', business: 'Rapids Electrical', location: 'Brampton, ON', rating: 5, text: 'The AI chat handles after-hours leads automatically now. I wake up to job summaries every morning. Already booked 4 jobs this week that I would have missed.', date: '1 month ago', avatar: 'JR' },
    { platform: 'google', name: 'Dave M.', business: 'Metro Locksmith Pro', location: 'North York, ON', rating: 5, text: 'Was skeptical at first but the results speak for themselves. Went from invisible on Google Maps to showing up in the top 3 for locksmith searches in my area.', date: '3 months ago', avatar: 'DM' },
    { platform: 'facebook', name: 'Linda C.', business: 'Crystal Clean Services', location: 'Scarborough, ON', rating: 5, text: 'As a cleaning business owner I had no time to manage my online presence. WeFixTrades handles everything. My reviews went from 12 to 67 in 2 months.', date: '5 weeks ago', avatar: 'LC' },
  ];
  const INFINITE_REVIEWS = [...REVIEWS, ...REVIEWS, ...REVIEWS];

  const PlatformIcon = ({ platform }: { platform: string }) => {
    if (platform === 'google') return (
      <svg width="16" height="16" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    );
    if (platform === 'facebook') return (
      <svg width="16" height="16" viewBox="0 0 24 24">
        <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" fill="#1877F2"/>
      </svg>
    );
    if (platform === 'trustpilot') return (
      <svg width="16" height="16" viewBox="0 0 24 24">
        <path d="M12 0L14.59 8.41H24l-7.64 5.54 2.91 8.96L12 17.38l-7.27 5.53 2.91-8.96L0 8.41h9.41z" fill="#00B67A"/>
      </svg>
    );
    return null;
  };

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', width: '100%', maxWidth: window.innerWidth >= 1024 ? 960 : 780, margin: '0 auto', padding: isTiny ? '0 10px 80px' : isMobile ? '0 16px 80px' : '0 16px 48px', boxSizing: 'border-box', position: 'relative', transform: reportZoom !== 100 ? `scale(${reportZoom / 100})` : undefined, transformOrigin: 'top center' }}>

      {/* TAB BAR */}
      <div style={{ display:'flex', justifyContent:'center', background:WHITE, padding:'10px 16px', position:'sticky', top:0, zIndex:20, width:'100%' }}>
        <div style={{ display:'inline-flex', background:'#F3F4F6', borderRadius:24, padding:3, gap:2 }}>
          {(['maps','website','plan'] as const).map(tab => (
            <button key={tab} data-testid={`tab-${tab}`} onClick={() => setActiveTab(tab)} {...hoverProps(`tab-${tab}`)} style={{
              padding:'8px 18px', fontSize:13, fontWeight: activeTab===tab ? 600 : 500,
              color: activeTab===tab ? DARK : hovered===`tab-${tab}` ? '#4B5563' : '#9CA3AF',
              border:'none', borderRadius:20, cursor:'pointer', whiteSpace:'nowrap',
              background: activeTab===tab ? WHITE : hovered===`tab-${tab}` ? 'rgba(255,255,255,0.5)' : 'transparent',
              boxShadow: activeTab===tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display:'flex', alignItems:'center', gap:6, transition:'all 0.15s ease', letterSpacing:'0.01em',
            }}>
              {tab==='maps' ? 'Google Maps' : tab==='website' ? 'Website' : 'Action Plan'}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 1 — COVER */}
      {activeTab === 'maps' && <div style={{ background: DARK, borderRadius: r16, padding: 20, marginBottom: 10, position: 'relative', overflow: 'hidden' }}>
        {/* Dotted grid background */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)',
          backgroundSize: '18px 18px', opacity: 0.45, pointerEvents: 'none',
        }}/>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            {business?.businessPhotoUrl ? (
              <img src={business.businessPhotoUrl} alt={business.name} style={{
                width: 72, height: 72, borderRadius: '50%', objectFit: 'cover',
                border: `3px solid ${CYAN}`, marginBottom: 8, display: 'block'
              }} />
            ) : (
              <div style={{
                width: 72, height: 72, borderRadius: '50%', background: CYAN,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, fontWeight: 700, color: DARK, marginBottom: 8
              }}>
                {(business?.name || 'B').charAt(0)}
              </div>
            )}
            <div style={{ fontSize: 22, fontWeight: 700, color: WHITE, marginBottom: 8, lineHeight: 1.3 }}>
              {business?.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ color: AMBER, fontSize: 14 }}>{'★'.repeat(Math.round(business?.rating || 0))}</span>
              <span style={{ color: WHITE, fontWeight: 600, fontSize: 14 }}>{business?.rating}</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>({business?.reviewsCount?.toLocaleString()} reviews)</span>
            </div>
            {[business?.address, business?.phone].filter(Boolean).map((v, i) => (
              <div key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{v}</div>
            ))}
            {business?.website && (
              <a href={business.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: CYAN, display: 'block', marginTop: 3, textDecoration: 'none' }}>
                {business.website.replace(/^https?:\/\//, '').split('/')[0]}
              </a>
            )}
          </div>
          <ScoreCircle score={liveTotal} grade={scores.grade || 'D'} onClick={() => setScoreModalOpen(true)} displayScore={displayScore} pulsing={liveWebsiteScore === null && !!speedLoading} />
        </div>
        {ai.executiveSummary && (
          <>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '12px 0 14px', position: 'relative', zIndex: 1 }}/>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 1.65, margin: 0, position: 'relative', zIndex: 1 }}>{ai.executiveSummary}</p>
          </>
        )}
      </div>}

      {/* SECTION 2 — SCORE BREAKDOWN */}
      {activeTab === 'maps' && <div style={card()}>
        <style>{`
          @keyframes infoNudge {
            0%, 100% { opacity: 0.35; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(1.12); }
          }
          @media (prefers-reduced-motion: reduce) {
            .breakdown-info-icon { animation: none !important; }
          }
        `}</style>
        <div data-testid="score-breakdown" style={{ fontSize: 17, fontWeight: 700, color: DARK, marginBottom: 20 }}>Your Score Breakdown</div>
        {scoreRows.map((row, i) => (
          <div key={row.key} data-testid={`breakdown-row-${row.key}`} data-score={row.score} data-max={row.max}>
            {i > 0 && <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '12px 0 14px' }}/>}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setBreakdownModal(row.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBreakdownModal(row.key); } }}
              style={{ marginBottom: 4, cursor: 'pointer', borderRadius: 8, padding: '4px 4px', margin: '-4px -4px', transition: 'background 0.15s ease' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.025)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'rgba(0,212,200,0.08)', flexShrink: 0 }}>
                  {row.icon}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: DARK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {row.label}
                  <Info className="breakdown-info-icon" size={13} color={GREY} style={{ flexShrink: 0, opacity: 0.35, animation: 'infoNudge 3s ease-in-out infinite' }} />
                </span>
                <div style={{ width: 80, flexShrink: 0, height: 8, borderRadius: 4, background: '#E5E7EB', overflow: 'hidden' }}>
                  <div style={{ width: `${(row.score / row.max) * 100}%`, height: '100%', background: scoreColor(row.score, row.max), borderRadius: 4 }}/>
                </div>
                <span style={{ width: 48, flexShrink: 0, textAlign: 'right', fontSize: 13, fontWeight: 700, color: scoreColor(row.score, row.max) }}>
                  {row.score}/{row.max}
                </span>
              </div>
              <div style={{ fontSize: 11, color: GREY, marginTop: 2, marginLeft: 38 }}>{row.note}</div>
            </div>
          </div>
        ))}
        {ai.gradeExplanation && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}`, fontSize: 13, color: GREY, lineHeight: 1.6 }}>
            {ai.gradeExplanation}
          </div>
        )}
      </div>}

      {/* SECTION 2b — COMPETITOR ANALYSIS */}
      {activeTab === 'maps' && competitors.length > 0 && (
        <div style={{ background: WHITE, borderRadius: 16, border: `1px solid ${BORDER}`, padding: 24, marginBottom: 10 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: DARK, marginBottom: 3 }}>Your Market Position</div>
              <div style={{ fontSize: 12, color: GREY }}>vs {totalInMarket - 1} local competitors</div>
            </div>
            {/* Rank badge */}
            <div style={{ textAlign: 'center', background: businessRank <= 3 ? '#DCFCE7' : '#FEF3C7', borderRadius: 12, padding: '8px 14px', border: `1px solid ${businessRank <= 3 ? '#22C55E' : '#F59E0B'}` }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: businessRank <= 3 ? GREEN : AMBER, lineHeight: 1 }}>#{businessRank}</div>
              <div style={{ fontSize: 10, color: GREY, marginTop: 2 }}>of {totalInMarket}</div>
            </div>
          </div>

          {/* Review gap callout */}
          {marketLeader && (
            <div style={{ background: reviewGap >= 0 ? '#F0FFF4' : '#FFF7ED', border: `1px solid ${reviewGap >= 0 ? '#BBF7D0' : '#FED7AA'}`, borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: reviewGap >= 0 ? '#166534' : '#92400E', lineHeight: 1.5 }}>
              {reviewGap >= 0
                ? `✓ You lead ${marketLeader.name} by ${reviewGap} reviews — your biggest competitive advantage.`
                : `You're ${Math.abs(reviewGap)} reviews behind ${marketLeader.name}. Closing this gap would strengthen your market position.`}
            </div>
          )}

          {/* Competitor cards */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, fontWeight: 600 }}>Local competitors</div>
            {rankedCompetitors.slice(0, 5).map((comp: any, i: number) => {
              const isThreats = (comp.reviewsCount || 0) > businessReviews || (comp.rating || 0) > businessRating;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < rankedCompetitors.slice(0, 5).length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                  {/* Rank number */}
                  <div style={{ width: 20, fontSize: 11, color: GREY, fontWeight: 600, flexShrink: 0, textAlign: 'center' }}>
                    #{i + (businessRank <= i + 1 ? 2 : 1)}
                  </div>
                  {/* Photo or avatar */}
                  <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#F3F4F6' }}>
                    {comp.photoUrl ? (
                      <img src={comp.photoUrl} alt={comp.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}/>
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: GREY }}>🏢</div>
                    )}
                  </div>
                  {/* Name + rating */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{comp.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: AMBER }}>{'★'.repeat(Math.round(comp.rating || 0))}</span>
                      <span style={{ fontSize: 11, color: GREY }}>{comp.rating} · {(comp.reviewsCount || 0).toLocaleString()} reviews</span>
                    </div>
                  </div>
                  {/* Threat or opportunity badge */}
                  <div style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, flexShrink: 0, background: isThreats ? '#FEF2F2' : '#F0FFF4', color: isThreats ? RED : GREEN, border: `1px solid ${isThreats ? '#FECACA' : '#BBF7D0'}` }}>
                    {isThreats ? '⚠ Threat' : '✓ Beatable'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* "You" row to show position */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: CYAN + '11', borderRadius: 10, border: `1px solid ${CYAN}44`, marginBottom: 16 }}>
            <div style={{ width: 20, fontSize: 11, color: CYAN, fontWeight: 700, textAlign: 'center' }}>#{businessRank}</div>
            <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: CYAN + '22' }}>
              {business?.businessPhotoUrl ? (
                <img src={business.businessPhotoUrl} alt={business?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⭐</div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{business?.name?.split(' ').slice(0, 4).join(' ')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: AMBER }}>{'★'.repeat(Math.round(businessRating || 0))}</span>
                <span style={{ fontSize: 11, color: GREY }}>{businessRating} · {businessReviews.toLocaleString()} reviews</span>
              </div>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: CYAN + '22', color: CYAN, border: `1px solid ${CYAN}`, flexShrink: 0 }}>You</div>
          </div>

          {/* Threats vs opportunities summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: RED }}>
                {rankedCompetitors.filter((c: any) => (c.reviewsCount || 0) > businessReviews || (c.rating || 0) > businessRating).length}
              </div>
              <div style={{ fontSize: 11, color: RED, fontWeight: 600 }}>Stronger competitors</div>
              <div style={{ fontSize: 10, color: GREY, marginTop: 2 }}>Higher reviews or rating</div>
            </div>
            <div style={{ background: '#F0FFF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: GREEN }}>
                {rankedCompetitors.filter((c: any) => (c.reviewsCount || 0) <= businessReviews && (c.rating || 0) <= businessRating).length}
              </div>
              <div style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>Beatable competitors</div>
              <div style={{ fontSize: 10, color: GREY, marginTop: 2 }}>Fewer reviews or lower rating</div>
            </div>
          </div>

          {/* Area average comparison */}
          {areaAvgReviews > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: GREY, marginBottom: 4 }}>Area avg reviews</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: businessReviews > areaAvgReviews ? GREEN : AMBER }}>
                  {areaAvgReviews}
                  <span style={{ fontSize: 11, color: GREY, fontWeight: 400, marginLeft: 4 }}>avg · you have {businessReviews}</span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: GREY, marginBottom: 4 }}>Area avg rating</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: businessRating >= areaAvgRating ? GREEN : AMBER }}>
                  {areaAvgRating.toFixed(1)}
                  <span style={{ fontSize: 11, color: GREY, fontWeight: 400, marginLeft: 4 }}>avg · you have {businessRating}</span>
                </div>
              </div>
            </div>
          )}
          {(ai.competitorWeakness || ai.reviewGap?.insight) && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ai.competitorWeakness && (
                <div style={{ fontSize: 13, color: GREY, lineHeight: 1.6 }}>
                  💡 {ai.competitorWeakness}
                </div>
              )}
              {ai.reviewGap?.insight && (
                <div style={{ fontSize: 13, color: GREY, lineHeight: 1.6 }}>
                  ⭐ {ai.reviewGap.insight}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SECTION 3 — ACTION PLAN (Tab 3 only — sales content lives here) */}
      {activeTab === 'plan' && plan.length > 0 && (
        <div style={card()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: DARK }}>What's Holding You Back</span>
            <Info className="breakdown-info-icon" size={14} color={GREY} style={{ flexShrink: 0, opacity: 0.35, animation: 'infoNudge 3s ease-in-out infinite' }} />
          </div>
          <div style={{ fontSize: 12, color: GREY, marginBottom: 14 }}>Tap each item to see how to fix it</div>
          {plan.map((item: any, i: number) => {
            const dotColor = item.priority === 'HIGH' ? RED : item.priority === 'MEDIUM' ? AMBER : '#9CA3AF';
            return (
              <div key={i}>
                {i > 0 && <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '12px 0' }}/>}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setIssueModal(i)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIssueModal(i); } }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', cursor: 'pointer', borderRadius: 8, transition: 'background 0.15s ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.035)'; const chev = e.currentTarget.querySelector('.issue-chevron') as HTMLElement; if (chev) chev.style.transform = 'translateX(2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; const chev = e.currentTarget.querySelector('.issue-chevron') as HTMLElement; if (chev) chev.style.transform = 'translateX(0)'; }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: item.priority === 'HIGH' ? 700 : 600, color: DARK, lineHeight: 1.4 }}>{item.title}</span>
                      {item.priority && (
                        <span style={{
                          padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0,
                          background: item.priority === 'HIGH' ? RED_BG : item.priority === 'MEDIUM' ? AMBER_BG : GREEN_BG,
                          color: item.priority === 'HIGH' ? RED : item.priority === 'MEDIUM' ? AMBER : GREEN,
                        }}>
                          {item.priority}
                        </span>
                      )}
                    </div>
                    {item.estimatedImpact && (
                      <div style={{ fontSize: 12, color: GREY, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.estimatedImpact}</div>
                    )}
                  </div>
                  <ChevronRight className="issue-chevron" size={16} color={GREY} style={{ flexShrink: 0, opacity: 0.4, transition: 'transform 0.15s ease' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SECTION 4 — KEYWORDS */}
      {activeTab === 'website' && keywords.some((k: any) => k.monthlySearches > 0) && (
        <div style={card()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: DARK }}>What Customers Search For</span>
            <Info className="breakdown-info-icon" size={14} color={GREY} style={{ flexShrink: 0, opacity: 0.35, animation: 'infoNudge 3s ease-in-out infinite' }} />
          </div>
          <div style={{ fontSize: 12, color: GREY, marginBottom: 4 }}>Keywords relevant to your business in {report?.city}</div>
          <div style={{ fontSize: 10, color: GREY, marginBottom: 12, opacity: 0.8 }}>Rank = Google position · <span style={{ color: CYAN }}>LP</span> = Maps position</div>
          {/* Column headers */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${BORDER}`, gap: 4 }}>
            <span style={{ flex: 1, fontSize: 10, color: GREY, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, minWidth: 0 }}>Keyword</span>
            <span style={{ width: 40, fontSize: 10, color: GREY, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>Vol.</span>
            <span style={{ width: 42, fontSize: 10, color: GREY, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>CPC</span>
            <span style={{ width: 48, fontSize: 10, color: GREY, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>Rank</span>
            <span style={{ width: 58, fontSize: 10, color: GREY, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>Visibility</span>
          </div>
          {/* Rows */}
          {keywords.map((kw: any, i: number) => {
            // Determine rank display: show local pack position if present and no organic rank
            const hasOrganic = !!kw.organicRank;
            const hasLocalPack = !!kw.isInLocalPack;
            let rankLabel: string;
            let rankColor: string;
            if (hasOrganic) {
              rankLabel = `#${kw.organicRank}`;
              rankColor = kw.organicRank <= 3 ? GREEN : kw.organicRank <= 10 ? AMBER : RED;
            } else if (hasLocalPack) {
              rankLabel = `LP #${kw.localPackPosition}`;
              rankColor = CYAN;
            } else {
              rankLabel = '—';
              rankColor = GREY;
            }
            // Visibility status — reflects overall presence
            const visLabel = kw.status?.replace('-', ' ') || '—';
            const visColor = statusColor(kw.status);
            // CPC formatting: null/undefined → "—", whole → "$5", decimal → "$5.2"
            const cpcDisplay = !kw.cpc ? '—' : kw.cpc % 1 === 0 ? `$${kw.cpc}` : `$${kw.cpc.toFixed(1)}`;
            return (
              <div key={i} data-testid="keyword-row" data-keyword={kw.keyword} data-rank={rankLabel} data-visibility={visLabel} data-cpc={cpcDisplay} style={{ display: 'flex', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${BORDER}`, gap: 4, background: i % 2 === 0 ? 'transparent' : '#FAFAFA' }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: DARK, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kw.keyword}</span>
                <span style={{ width: 40, fontSize: 11, color: DARK, textAlign: 'right', flexShrink: 0 }}>{kw.monthlySearches > 0 ? kw.monthlySearches.toLocaleString() : '—'}</span>
                <span style={{ width: 42, fontSize: 11, color: GREY, textAlign: 'right', flexShrink: 0 }}>{cpcDisplay}</span>
                <span style={{ width: 48, fontSize: 11, fontWeight: 600, color: rankColor, textAlign: 'right', flexShrink: 0 }}>{rankLabel}</span>
                <span style={{ width: 58, textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: visColor + '18', color: visColor, whiteSpace: 'nowrap' }}>
                    {visLabel}
                  </span>
                </span>
              </div>
            );
          })}
          {ai.keyStrength && (
            <div style={{ marginTop: 12, background: GREEN_BG, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#166534' }}>
              ✓ {ai.keyStrength}
            </div>
          )}
          {report?.nicheAlignment?.misaligned && (
            <div style={{ marginTop: 12, background: AMBER_BG, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400E', lineHeight: 1.55 }}>
              ⚠ {report.nicheAlignment.insight}
            </div>
          )}
        </div>
      )}

      {/* SECTION 5 — REVENUE */}
      {activeTab === 'maps' && (() => {
        const missedJobs = report?.demandGaps?.[0]?.estimatedMissedLeadsPerMonth || 0;
        const revLow = loss.low || 0;
        const revHigh = loss.high || 0;
        return (
          <div style={{ background: DARK, borderRadius: r16, padding: '28px 20px', marginBottom: 10, textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
              {/* LEFT — missed jobs */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Potential Missed Jobs / Month
                </div>
                <div style={{ fontSize: 36, fontWeight: 800, color: WHITE, marginTop: 8, lineHeight: 1 }}>
                  {missedJobs > 0 ? missedJobs : '5–15'}
                </div>
              </div>
              {/* Divider */}
              <div style={{ width: 1, height: 60, background: 'rgba(255,255,255,0.1)', alignSelf: 'center', flexShrink: 0 }}/>
              {/* RIGHT — revenue range */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Est. Monthly Revenue Opportunity
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: CYAN, marginTop: 8, lineHeight: 1 }}>
                  {revHigh > 0 ? `$${revLow.toLocaleString()} – $${revHigh.toLocaleString()}` : '$800 – $2,400'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 12 }}>
              Estimates based on average trade job values and local search demand. Actual results vary by market and business.
            </div>
            {ai.demandGapInsight && (
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', marginTop: 20, maxWidth: 560, margin: '20px auto 0', lineHeight: 1.6 }}>
                {ai.demandGapInsight}
              </div>
            )}
          </div>
        );
      })()}

      {/* SECTION 6 — QUICK WIN (Tab 1, advisory only) */}
      {activeTab === 'maps' && quickWin && (
        <div style={{ background: WHITE, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 20, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: DARK }}>⚡ Your Quick Win</div>
            <div style={{ fontSize: 11, background: '#F0FFF4', color: GREEN, padding: '3px 10px', borderRadius: 20, border: '1px solid #BBF7D0', fontWeight: 600 }}>Free & Fast</div>
          </div>
          <div style={{ fontSize: 13, color: GREY, lineHeight: 1.6, marginBottom: 8 }}>{quickWin.action}</div>
          {quickWin.timeRequired && (
            <div style={{ fontSize: 12, color: GREY, marginBottom: 4 }}>⏱ {quickWin.timeRequired}</div>
          )}
          {quickWin.expectedResult && (
            <div style={{ fontSize: 12, color: GREY, opacity: 0.8 }}>Expected: {quickWin.expectedResult}</div>
          )}
        </div>
      )}

      {/* SECTION 6b — DIAGNOSTIC ACTION PLAN (Tab 1, advisory only — no CTAs) */}
      {activeTab === 'maps' && plan.length > 0 && (
        <div style={card()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: DARK }}>What's Holding You Back</span>
            <Info className="breakdown-info-icon" size={14} color={GREY} style={{ flexShrink: 0, opacity: 0.35, animation: 'infoNudge 3s ease-in-out infinite' }} />
          </div>
          <div style={{ fontSize: 12, color: GREY, marginBottom: 14 }}>Tap each item to see how to fix it</div>
          {plan.map((item: any, i: number) => {
            const dotColor = item.priority === 'HIGH' ? RED : item.priority === 'MEDIUM' ? AMBER : '#9CA3AF';
            return (
              <div key={i}>
                {i > 0 && <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '12px 0' }}/>}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setIssueModal(i)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIssueModal(i); } }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', cursor: 'pointer', borderRadius: 8, transition: 'background 0.15s ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.035)'; const chev = e.currentTarget.querySelector('.issue-chevron') as HTMLElement; if (chev) chev.style.transform = 'translateX(2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; const chev = e.currentTarget.querySelector('.issue-chevron') as HTMLElement; if (chev) chev.style.transform = 'translateX(0)'; }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: item.priority === 'HIGH' ? 700 : 600, color: DARK, lineHeight: 1.4 }}>{item.title}</span>
                      {item.priority && (
                        <span style={{
                          padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0,
                          background: item.priority === 'HIGH' ? RED_BG : item.priority === 'MEDIUM' ? AMBER_BG : GREEN_BG,
                          color: item.priority === 'HIGH' ? RED : item.priority === 'MEDIUM' ? AMBER : GREEN,
                        }}>
                          {item.priority}
                        </span>
                      )}
                    </div>
                    {item.estimatedImpact && (
                      <div style={{ fontSize: 12, color: GREY, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.estimatedImpact}</div>
                    )}
                  </div>
                  <ChevronRight className="issue-chevron" size={16} color={GREY} style={{ flexShrink: 0, opacity: 0.4, transition: 'transform 0.15s ease' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SECTION 7 — SPEED */}
      {activeTab === 'website' && (<>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        {speedLoading && speed.mobile?.score == null ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', background: WHITE, borderRadius: r16, border: `1px solid ${BORDER}`, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, border: `3px solid ${BORDER}`, borderTop: `3px solid ${CYAN}`, borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 1s linear infinite' }}/>
            <div style={{ fontSize: 13, fontWeight: 600, color: DARK, marginBottom: 4 }}>Measuring website speed...</div>
            <div style={{ fontSize: 12, color: GREY }}>This takes 30–45 seconds. Continue reading your report.</div>
          </div>
        ) : speed.mobile?.score != null || speed.desktop?.score != null ? (
          <div style={card({ marginBottom: 10 })}>
            {/* Device tab switcher */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: DARK }}>Website Speed</span>
                <Info className="breakdown-info-icon" size={14} color={GREY} style={{ flexShrink: 0, opacity: 0.35, animation: 'infoNudge 3s ease-in-out infinite' }} />
              </div>
              <div style={{ display: 'inline-flex', background: '#F3F4F6', borderRadius: 20, padding: 2, gap: 2 }}>
                {(['mobile', 'desktop'] as const).map(d => (
                  <button key={d} onClick={() => setSpeedDevice(d)} style={{
                    padding: '5px 14px', fontSize: 12, fontWeight: speedDevice === d ? 700 : 500, border: 'none', borderRadius: 18, cursor: 'pointer',
                    background: speedDevice === d ? WHITE : 'transparent', color: speedDevice === d ? DARK : '#9CA3AF',
                    boxShadow: speedDevice === d ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s ease',
                  }}>
                    {d === 'mobile' ? '📱 Mobile' : '🖥 Desktop'}
                  </button>
                ))}
              </div>
            </div>
            {/* Active device content */}
            {(() => {
              const data = speedDevice === 'mobile' ? speed.mobile : speed.desktop;
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                    <span style={{ fontSize: 40, fontWeight: 800, color: data?.score != null ? scoreColor(data.score, 100) : GREY, lineHeight: 1 }}>
                      {data?.score != null ? data.score : speedLoading ? '...' : '—'}
                    </span>
                    <span style={{ fontSize: 16, color: GREY, fontWeight: 400 }}>/100</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#4B5563', marginBottom: 6 }}>
                    Tap a metric to see how to fix it
                  </div>
                  {[
                    { key: 'fcp', label: 'FCP', tip: 'First Contentful Paint', val: data?.fcp, unit: 's', good: 2.5, ok: 4 },
                    { key: 'lcp', label: 'LCP', tip: 'Largest Contentful Paint — key ranking factor', val: data?.lcp, unit: 's', good: 2.5, ok: 4 },
                    { key: 'tbt', label: 'TBT', tip: 'Total Blocking Time — responsiveness', val: data?.tbt, unit: 'ms', good: 200, ok: 600 },
                    { key: 'cls', label: 'CLS', tip: 'Cumulative Layout Shift — stability', val: data?.cls, unit: '', good: 0.1, ok: 0.25 },
                  ].map(m => {
                    const isGood = (m.val || 0) <= m.good;
                    const isOk = (m.val || 0) <= m.ok;
                    const statusC = isGood ? GREEN : isOk ? AMBER : RED;
                    const statusT = isGood ? 'Good' : isOk ? 'Needs work' : 'Critical';
                    return (
                      <div key={m.key} onClick={() => setMetricModal(m.key)}
                        role="button" tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMetricModal(m.key); } }}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', marginTop: 0, borderTop: `1px solid ${BORDER}`, cursor: 'pointer', borderRadius: 4, transition: 'background 0.12s ease' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.035)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: DARK }}>{m.label}</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: GREY_BG, color: GREY, fontSize: 9 }}>?</span>
                          </div>
                          <div style={{ fontSize: 12, color: GREY, marginTop: 1 }}>{m.val != null ? `${m.val}${m.unit}` : '—'}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {m.val != null && (
                            <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: statusC + '20', color: statusC }}>{statusT}</span>
                          )}
                          <ChevronRight size={14} color={GREY} style={{ opacity: 0.3 }} />
                        </div>
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 16, fontSize: 13, color: GREY, background: GREY_BG, borderRadius: 12, marginBottom: 16 }}>
            Website speed test unavailable for this report.
          </div>
        )}
        {activeTab === 'website' && ai.websiteInsight && (
          <div style={{ background: WHITE, borderRadius: r16, border: `1px solid ${BORDER}`, padding: '14px 18px', marginBottom: 10, fontSize: 13, color: GREY, lineHeight: 1.65 }}>
            💡 {ai.websiteInsight}
          </div>
        )}
      </>)}

      {/* SECTION — WEBSITE VISUAL ANALYSIS (screenshot + AI findings) */}
      {activeTab === 'website' && (() => {
        const aiAnalysis = liveWebsiteAIAnalysis || report?.websiteAIAnalysis;
        const screenshot = liveWebsiteScreenshot || report?.websiteScreenshot;
        if (!aiAnalysis?.findings?.length && !screenshot) return null;
        const findings: Array<{ label: string; status: string; note: string }> = aiAnalysis?.findings || [];
        const passCount = findings.filter(f => f.status === 'pass').length;
        const total = findings.length || 1;
        const pct = Math.round((passCount / total) * 100);
        const summaryColor = pct >= 70 ? GREEN : pct >= 40 ? AMBER : RED;
        const statusIcon = (s: string) => s === 'pass' ? '✓' : s === 'warn' ? '!' : '✕';
        const statusBg = (s: string) => s === 'pass' ? GREEN : s === 'warn' ? AMBER : RED;
        // Show top 3 findings inline, rest in modal
        const inlineFindings = findings.slice(0, 3);
        const hasMore = findings.length > 3 || !!aiAnalysis?.summary;
        // Ensure screenshot is a proper data URL
        const screenshotSrc = screenshot
          ? screenshot.startsWith('data:') ? screenshot : `data:image/jpeg;base64,${screenshot}`
          : null;

        return (
          <div style={card({ marginBottom: 10, overflow: 'hidden', padding: 0 })}>
            {/* Header */}
            <div style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: DARK }}>Visual Analysis</span>
                  <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: summaryColor + '18', color: summaryColor }}>{passCount}/{total} passed</span>
                </div>
                {hasMore && (
                  <button
                    onClick={() => setVisualAnalysisModal(true)}
                    style={{ fontSize: 12, fontWeight: 600, color: CYAN, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    View details <ChevronRight size={14} />
                  </button>
                )}
              </div>
              <div style={{ fontSize: 12, color: GREY, marginTop: 4 }}>AI-powered analysis of your website's first impression</div>
            </div>

            {/* Body — screenshot + findings side by side on desktop, stacked on mobile */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 0 }}>
              {/* Screenshot */}
              {screenshotSrc && (
                <div
                  onClick={() => setScreenshotLightbox(true)}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setScreenshotLightbox(true); } }}
                  style={{
                    flex: isMobile ? 'none' : '0 0 45%',
                    padding: 16,
                    background: '#F3F4F6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRight: isMobile ? 'none' : `1px solid ${BORDER}`,
                    borderBottom: isMobile ? `1px solid ${BORDER}` : 'none',
                    minHeight: isMobile ? 180 : 220,
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: 'zoom-in',
                  }}>
                  <img
                    src={screenshotSrc}
                    alt={`${business?.name || 'Business'} website screenshot`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: `1px solid ${BORDER}`,
                      boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                    }}
                  />
                  <div style={{
                    position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                    padding: '4px 12px', borderRadius: 8,
                    background: 'rgba(13,21,20,0.75)', backdropFilter: 'blur(8px)',
                    fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.8)',
                    letterSpacing: '0.04em', whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <ZoomIn size={10} /> Tap to zoom
                  </div>
                </div>
              )}

              {/* Findings list */}
              <div style={{ flex: 1, padding: '16px 20px' }}>
                {inlineFindings.map((f, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0',
                    borderBottom: i < inlineFindings.length - 1 ? `1px solid ${BORDER}` : 'none',
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                      background: statusBg(f.status) + '18',
                      color: statusBg(f.status),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800,
                    }}>
                      {statusIcon(f.status)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: DARK, lineHeight: 1.3 }}>{f.label}</div>
                      <div style={{ fontSize: 12, color: GREY, marginTop: 2, lineHeight: 1.45 }}>{f.note}</div>
                    </div>
                  </div>
                ))}
                {hasMore && (
                  <button
                    onClick={() => setVisualAnalysisModal(true)}
                    style={{
                      marginTop: 12, width: '100%', padding: '10px 16px',
                      background: GREY_BG, border: `1px solid ${BORDER}`, borderRadius: 10,
                      fontSize: 12, fontWeight: 600, color: DARK, cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F0F0F0')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = GREY_BG)}
                  >
                    See full analysis ({findings.length} checks) →
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* SECTION 8 — CONTENT GAPS */}
      {activeTab === 'website' && gaps.length > 0 && (
        <div style={card()}>
          <div style={{ fontSize: 17, fontWeight: 700, color: DARK, marginBottom: 4 }}>Pages You Should Create</div>
          <div style={{ fontSize: 12, color: GREY, marginBottom: 16 }}>These missing pages are leaving search traffic on the table</div>
          {gaps.map((g: any, i: number) => (
            <div key={i} style={{ background: GREY_BG, borderRadius: 10, padding: 12, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: DARK, marginBottom: 8 }}>{g.pageTitle}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ padding: '2px 10px', borderRadius: 12, background: WHITE, border: `1px solid ${BORDER}`, fontSize: 12, color: GREY }}>{g.targetKeyword}</span>
                {g.monthlySearches && (
                  <span style={{ fontSize: 12, color: CYAN, fontWeight: 600 }}>{g.monthlySearches?.toLocaleString()} searches/mo</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: GREY, lineHeight: 1.5 }}>{g.reason}</div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'website' && (
        <div style={{ background: DARK, borderRadius: r16, padding: '28px 24px', marginBottom: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <div style={{
              backgroundColor: '#00D4C8',
              color: '#0d1514',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '4px 12px',
              borderRadius: '999px'
            }}>
              One-Time Report
            </div>
            <h3 style={{
              color: '#FFFFFF',
              fontSize: '20px',
              fontWeight: 700,
              margin: 0
            }}>
              Get Your Full Website Audit
            </h3>
            <p style={{
              color: 'rgba(255,255,255,0.75)',
              fontSize: '14px',
              margin: 0,
              maxWidth: '420px',
              lineHeight: '1.6'
            }}>
              See exactly what's breaking your website's performance — page-by-page analysis, SEO gaps, speed fixes, and a prioritized action list.
            </p>
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '6px',
              marginTop: '4px'
            }}>
              <span style={{
                color: 'rgba(255,255,255,0.45)',
                fontSize: '13px',
                textDecoration: 'line-through'
              }}>
                $49
              </span>
              <span style={{
                color: '#00D4C8',
                fontSize: '32px',
                fontWeight: 800
              }}>
                $9.80
              </span>
            </div>
            <button
              onClick={() => window.location.href = '/checkout?product=website-audit'}
              {...hoverProps('website-audit-cta')}
              style={{
                backgroundColor: '#00D4C8',
                color: '#000000',
                border: 'none',
                borderRadius: '10px',
                padding: '14px 32px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
                width: '100%',
                maxWidth: '320px',
                marginTop: '4px',
                transition: 'all 0.2s ease',
                transform: hovered === 'website-audit-cta' ? 'translateY(-1px)' : 'translateY(0)',
                boxShadow: hovered === 'website-audit-cta' ? '0 6px 16px rgba(0,212,200,0.25)' : 'none',
              }}
            >
              Get Full Website Audit — $9.80
            </button>
            <p style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: '12px',
              margin: 0
            }}>
              Delivered within 24 hours. No subscription.
            </p>
        </div>
      )}

      {activeTab === 'plan' && (
        <div>
          {/* A — DETECTED ISSUES HEADER */}
          <div style={{ background: AMBER_BG, borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: AMBER, fontWeight: 600 }}>
            ⚠ {detectedIssues.length} issues detected in your audit — here's what we'd fix
          </div>

          {/* B — SERVICE CARDS */}
          {recommendedServices.map((service: any) => (
            <div key={service.id} style={{ background: WHITE, borderRadius: r16, border: `1px solid ${selected.includes(service.id) ? CYAN : BORDER}`, padding: 18, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: DARK }}>{service.name}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: CYAN }}>{service.priceLabel}</span>
              </div>
              {service.isPopular && (
                <span style={{ display: 'inline-block', marginTop: 4, padding: '2px 10px', borderRadius: 12, background: CYAN + '22', color: CYAN, fontSize: 11, fontWeight: 700 }}>★ Popular</span>
              )}
              <div style={{ marginTop: 8 }}>
                <span style={{ background: AMBER_BG, color: AMBER, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                  Fixes: {service.fixesIssues.slice(0, 2).join(', ').replace(/-/g, ' ')}
                </span>
              </div>
              <div style={{ fontSize: 13, color: GREY, lineHeight: 1.55, marginTop: 12 }}>{service.description}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 12 }}>
                {service.features.map((f: string, fi: number) => (
                  <span key={fi} style={{ fontSize: 11, color: DARK }}>✓ {f}</span>
                ))}
              </div>
              <button
                onClick={() => toggleService(service.id)}
                {...hoverProps(`service-${service.id}`)}
                style={{
                  marginTop: 16, width: '100%', padding: '10px 20px', borderRadius: 8, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s ease',
                  border: selected.includes(service.id) ? 'none' : hovered===`service-${service.id}` ? `1px solid ${CYAN}` : `1px solid ${BORDER}`,
                  background: selected.includes(service.id)
                    ? (hovered===`service-${service.id}` ? '#00BFB8' : CYAN)
                    : (hovered===`service-${service.id}` ? '#F0FFFE' : WHITE),
                  color: selected.includes(service.id) ? DARK : (hovered===`service-${service.id}` ? '#00897B' : DARK),
                  fontWeight: selected.includes(service.id) ? 700 : 400,
                }}
              >
                {selected.includes(service.id) ? '✓ Selected' : 'Add to Selected Services'}
              </button>
            </div>
          ))}

          {/* Fallback when no services */}
          {recommendedServices.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px', fontSize: 13, color: GREY }}>
              No specific issues detected — your profile looks strong!
            </div>
          )}

          {/* TESTIMONIALS CAROUSEL */}
          <style>{`div::-webkit-scrollbar { display: none; }`}</style>
          <div style={{ marginTop: 32, marginBottom: 8 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: DARK, marginBottom: 4 }}>What Trades Businesses Say</div>
            <div style={{ fontSize: 12, color: GREY, marginBottom: 16 }}>Real results from real businesses</div>
            <div
              ref={reviewsRef}
              onMouseDown={onReviewMouseDown}
              onMouseEnter={() => { isDragging.current = true; }}
              onMouseLeave={() => { isDragging.current = false; if (reviewsRef.current) { reviewsRef.current.style.cursor = 'grab'; } }}
              onMouseUp={onReviewMouseUp}
              onMouseMove={onReviewMouseMove}
              style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', cursor: 'grab' } as any}
            >
              {INFINITE_REVIEWS.map((review, i) => (
                <div key={i} style={{ minWidth: 280, maxWidth: 280, background: WHITE, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 18, flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <PlatformIcon platform={review.platform} />
                      <span style={{ fontSize: 11, color: GREY, fontWeight: 500 }}>
                        {review.platform === 'trustpilot' ? 'Trustpilot' : review.platform === 'google' ? 'Google' : 'Facebook'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 1 }}>
                      {[0,1,2,3,4].map(j => (
                        <span key={j} style={{ color: review.platform === 'trustpilot' ? '#00B67A' : '#F59E0B', fontSize: 12 }}>★</span>
                      ))}
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.55, margin: '0 0 14px', fontStyle: 'italic' }}>"{review.text}"</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: review.platform === 'google' ? '#E8F0FE' : review.platform === 'facebook' ? '#E7F3FF' : '#E6FAF4',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                      color: review.platform === 'google' ? '#4285F4' : review.platform === 'facebook' ? '#1877F2' : '#00B67A',
                    }}>
                      {review.avatar}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{review.name}</div>
                      <div style={{ fontSize: 11, color: GREY }}>{review.business}</div>
                      <div style={{ fontSize: 10, color: GREY, opacity: 0.7 }}>{review.date}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* D — TRUST BADGES */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 20, marginBottom: 16 }}>
            {[
              { Icon: Wrench, title: 'All Done For You', text: 'No software to learn. No team to hire.' },
              { Icon: FileX, title: 'No Contracts', text: 'Cancel anytime. No cancellation fees.' },
              { Icon: BarChart3, title: 'Weekly Reports', text: 'See exactly what improved every week.' },
              { Icon: Users, title: 'Built for Trades', text: 'Designed for plumbers, HVAC, electricians and more.' },
            ].map(({ Icon, title, text }) => (
              <div key={title} style={{ background: GREY_BG, borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,212,200,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={16} color={CYAN} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: DARK, marginBottom: 2 }}>{title}</div>
                  <div style={{ fontSize: 11, color: GREY, lineHeight: 1.4 }}>{text}</div>
                </div>
              </div>
            ))}
          </div>

          {/* E — POWERED BY STRIP */}
          {(() => {
            const BRAND_ICONS = [
              { name: 'Google', element: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )},
              { name: 'Claude AI', element: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="6" fill="#D97757"/>
                  <path d="M15.5 7.5c-1.2-1.2-2.8-1.2-3.5 0L7.5 12c-.7.7-.7 2 0 3 .7.7 1.5 1 2.5 1s2-.3 2.5-1l1-1" stroke="white" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
                  <path d="M8.5 16.5c1.2 1.2 2.8 1.2 3.5 0L16.5 12c.7-.7.7-2 0-3-.7-.7-1.5-1-2.5-1s-2 .3-2.5 1l-1 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
                </svg>
              )},
              { name: 'OpenAI', element: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="6" fill="#1a1a1a"/>
                  <path d="M20.2 9.6a5.1 5.1 0 00-.35-4.18 5.2 5.2 0 00-5.6-2.49A5.2 5.2 0 009.43 1a5.2 5.2 0 00-4.96 3.6 5.2 5.2 0 00-3.46 2.51 5.23 5.23 0 00.64 6.13 5.1 5.1 0 00.35 4.18 5.2 5.2 0 005.6 2.49A5.17 5.17 0 0012 21a5.2 5.2 0 004.97-3.6 5.2 5.2 0 003.46-2.51 5.23 5.23 0 00-.64-6.13l.41.84zM12 19.5a3.85 3.85 0 01-2.47-.9l.12-.07 4.12-2.38a.68.68 0 00.34-.59v-5.82l1.74 1a.07.07 0 01.04.05v4.81A3.87 3.87 0 0112 19.5zM4.48 16.1a3.85 3.85 0 01-.46-2.59l.12.07 4.12 2.38c.21.12.47.12.68 0l5.03-2.9v2a.07.07 0 01-.03.06l-4.16 2.4a3.87 3.87 0 01-5.3-1.42zM3.38 8.5a3.85 3.85 0 012.02-1.69v4.9c0 .24.13.46.34.59l5.03 2.9-1.74 1a.07.07 0 01-.07 0L4.8 13.8A3.87 3.87 0 013.38 8.5zm13.2 3.33l-5.03-2.9 1.74-1a.07.07 0 01.07 0l4.16 2.4a3.87 3.87 0 01-.6 6.99v-4.9a.68.68 0 00-.34-.59zm1.73-2.61l-.12-.07-4.12-2.38a.68.68 0 00-.68 0L8.36 9.67v-2a.07.07 0 01.03-.06l4.16-2.4a3.87 3.87 0 015.76 4.01zM7.47 12.86l-1.74-1a.07.07 0 01-.04-.05V7a3.87 3.87 0 016.36-2.97l-.12.07-4.12 2.38a.68.68 0 00-.34.59v5.79zm.95-2.05l2.24-1.29 2.24 1.29v2.58l-2.24 1.3-2.24-1.3V10.81z" fill="white"/>
                </svg>
              )},
              { name: 'Stripe', element: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="6" fill="#635BFF"/>
                  <path d="M10.5 8.5c0-.8.7-1.1 1.8-1.1 1.6 0 3.6.5 5 1.3V5.2C15.9 4.4 14 4 12 4 8.7 4 6.5 5.7 6.5 8.7c0 4.6 6.3 3.9 6.3 5.9 0 .9-.8 1.2-1.9 1.2-1.7 0-3.8-.7-5.5-1.6V18c1.9.8 3.7 1.2 5.5 1.2 3.4 0 5.7-1.7 5.7-4.7 0-5-6.4-4.1-6.1-5.9v-.1z" fill="white"/>
                </svg>
              )},
              { name: 'Zapier', element: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="6" fill="#FF4A00"/>
                  <path d="M12 2L14.4 9.6H22L16 14.4L18.4 22L12 17.2L5.6 22L8 14.4L2 9.6H9.6L12 2Z" fill="white"/>
                </svg>
              )},
              { name: 'Make.com', element: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect width="24" height="24" rx="6" fill="#6D00CC"/>
                  <circle cx="7" cy="12" r="2.5" fill="white"/>
                  <circle cx="17" cy="12" r="2.5" fill="white"/>
                  <path d="M9.5 12h5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M4.5 8c0 0 2.5-1 2.5 4s-2.5 4-2.5 4" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
                  <path d="M19.5 8c0 0-2.5-1-2.5 4s2.5 4 2.5 4" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
                </svg>
              )},
            ];
            return (
              <div style={{ textAlign: 'center', marginTop: 16, marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: GREY, marginBottom: 12, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Powered by</div>
                <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: 20, justifyContent: 'center', alignItems: 'center' }}>
                  {BRAND_ICONS.map(brand => (
                    <div key={brand.name} title={brand.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: 0.6 }}>
                      {brand.element}
                      <span style={{ fontSize: 9, color: GREY, whiteSpace: 'nowrap' }}>{brand.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* C — SELECTED SERVICES SUMMARY */}
          {selected.length > 0 && (
            <div style={{ position: 'sticky', bottom: 16, background: DARK, borderRadius: 12, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: WHITE }}>
                {selected.length} service{selected.length > 1 ? 's' : ''} selected · ${totalPrice}/mo
              </span>
              <button {...hoverProps('getstarted')} style={{ background: hovered==='getstarted' ? '#00BFB8' : CYAN, color: DARK, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s ease', transform: hovered==='getstarted' ? 'translateY(-1px)' : 'none' }}>
                Get Started →
              </button>
            </div>
          )}
        </div>
      )}

      {/* SECTION 9 — SHARE */}
      <div style={{ background: DARK, borderRadius: r16, padding: '24px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: WHITE, marginBottom: 4 }}>Share This Report</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 16 }}>Send your audit to a partner or colleague</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'nowrap' }}>
          {SHARE_BUTTONS.map(btn => (
            <div key={btn.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <button
                onClick={btn.onClick}
                {...hoverProps('share-' + btn.id)}
                title={btn.label}
                style={{
                  width: 44, height: 44, padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: btn.bg,
                  cursor: 'pointer', flexShrink: 0,
                  transform: hovered === 'share-' + btn.id ? 'translateY(-2px)' : 'translateY(0)',
                  boxShadow: hovered === 'share-' + btn.id ? '0 4px 12px rgba(0,0,0,0.3)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {btn.icon}
              </button>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', lineHeight: 1 }}>{btn.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* EMAIL CAPTURE */}
      {!emailSubmitted ? (
        <div style={{ background: WHITE, borderRadius: 16, border: `1px solid ${BORDER}`, padding: '24px 20px', marginBottom: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: DARK, marginBottom: 4 }}>Save & receive your report</div>
          <div style={{ fontSize: 13, color: GREY, marginBottom: 16, lineHeight: 1.5 }}>
            Get a PDF copy of this report sent to your inbox. No spam, no commitment.
          </div>
          <div style={{ display: 'flex', gap: 8, maxWidth: 420, margin: '0 auto' }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleEmailSubmit()}
              placeholder="your@email.com"
              style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13, outline: 'none', fontFamily: 'inherit', color: DARK }}
            />
            <button
              onClick={handleEmailSubmit}
              disabled={emailLoading}
              style={{ padding: '10px 18px', background: DARK, color: WHITE, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: emailLoading ? 'not-allowed' : 'pointer', opacity: emailLoading ? 0.7 : 1, whiteSpace: 'nowrap', transition: 'all 0.15s ease' }}
            >
              {emailLoading ? 'Sending...' : 'Send my PDF →'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: GREY, marginTop: 10, opacity: 0.7 }}>We respect your privacy. Unsubscribe anytime.</div>
        </div>
      ) : (
        <div style={{ background: '#F0FFF4', borderRadius: 16, border: '1px solid #BBF7D0', padding: '20px', marginBottom: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#166534', marginBottom: 4 }}>Report sent!</div>
          <div style={{ fontSize: 13, color: '#4B5563' }}>Check your inbox for your PDF report shortly.</div>
        </div>
      )}

      {/* INLINE CHAT PANEL — desktop only */}
      {!isMobile && (
        <div style={{ background:WHITE, borderRadius:r16, border:`1px solid ${BORDER}`, marginBottom:16, overflow:'hidden' }}>
          <div
            onClick={() => setChatExpanded(e => !e)}
            style={{ background:DARK, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}
          >
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:WHITE }}>We're here to help</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', marginTop:2 }}>Available 24/7 · Usually replies instantly</div>
            </div>
            <div style={{ color:'rgba(255,255,255,0.5)', fontSize:18, transform: chatExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition:'transform 0.2s' }}>▼</div>
          </div>
          {chatExpanded && (
            <div ref={chatScrollRef} style={{ height:200, overflowY:'auto', overscrollBehavior:'contain', padding:16, display:'flex', flexDirection:'column', gap:10 }}>
              {chatMessages.map((msg, i) => (
                <div key={i} style={{ alignSelf:msg.role==='ai'?'flex-start':'flex-end', background:msg.role==='ai'?GREY_BG:CYAN, borderRadius:msg.role==='ai'?'12px 12px 12px 4px':'12px 12px 4px 12px', padding:'10px 14px', fontSize:13, color:DARK, maxWidth:'85%', lineHeight:1.5 }}>
                  {msg.text}
                </div>
              ))}
              {chatLoading && (
                <div style={{ alignSelf:'flex-start', background:GREY_BG, borderRadius:12, padding:'10px 14px', display:'flex', gap:4 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:GREY }}/>)}
                </div>
              )}
              <div ref={chatEndRef}/>
            </div>
          )}
          <div style={{ background:WHITE, borderTop:`1px solid ${BORDER}`, padding:10, display:'flex', gap:8 }}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key==='Enter' && sendChat()}
              placeholder="Ask anything..."
              style={{ flex:1, padding:'8px 12px', borderRadius:8, border:`1px solid ${BORDER}`, fontSize:13, outline:'none', fontFamily:'inherit' }}
            />
            <button onClick={sendChat} {...hoverProps('chatsend')} style={{ background: hovered==='chatsend' ? '#00BFB8' : CYAN, color:DARK, border:'none', borderRadius:8, padding:'8px 14px', fontWeight:700, fontSize:13, cursor:'pointer', transition:'background 0.15s ease' }}>→</button>
          </div>
        </div>
      )}

      {/* CHAT WIDGET — mobile only */}
      {isMobile && <>
        {/* Bubble */}
        <div
          onClick={() => { setChatOpen(o => !o); setChatUnread(false); }}
          style={{ position:'fixed', bottom:16, right:12, width:52, height:52, borderRadius:'50%', background:DARK, border:`2px solid ${CYAN}`, cursor:'pointer', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 20px rgba(0,0,0,0.25)' }}
        >
          <MessageCircle size={22} color={CYAN} />
          {chatUnread && chatMessages.length > 0 && (
            <div style={{ position:'absolute', top:0, right:0, width:10, height:10, borderRadius:'50%', background:RED, border:'2px solid white' }}/>
          )}
        </div>
        {/* Chat Window */}
        {chatOpen && (
          <div style={{ position:'fixed', bottom:72, right:12, width:320, borderRadius:16, overflow:'hidden', boxShadow:'0 8px 40px rgba(0,0,0,0.18)', zIndex:1000, fontFamily:'Inter, system-ui, sans-serif' }}>
            {/* Header */}
            <div style={{ background:DARK, padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:WHITE }}>We're here to help</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginTop:2 }}>Available 24/7 · Usually replies instantly</div>
              </div>
              <div onClick={() => setChatOpen(false)} style={{ color:'rgba(255,255,255,0.4)', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</div>
            </div>
            {/* Messages */}
            <div style={{ background:WHITE, height:280, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:10 }}>
              {chatMessages.map((msg, i) => (
                <div key={i} style={{ alignSelf:msg.role==='ai'?'flex-start':'flex-end', background:msg.role==='ai'?GREY_BG:CYAN, borderRadius:msg.role==='ai'?'12px 12px 12px 4px':'12px 12px 4px 12px', padding:'10px 14px', fontSize:13, color:DARK, maxWidth:'85%', lineHeight:1.5 }}>
                  {msg.text}
                </div>
              ))}
              {chatLoading && (
                <div style={{ alignSelf:'flex-start', background:GREY_BG, borderRadius:12, padding:'10px 14px', display:'flex', gap:4 }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:GREY }}/>
                  ))}
                </div>
              )}
              <div ref={chatEndRef}/>
            </div>
            {/* Input */}
            <div style={{ background:WHITE, borderTop:`1px solid ${BORDER}`, padding:10, display:'flex', gap:8 }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key==='Enter' && sendChat()}
                placeholder="Ask anything..."
                style={{ flex:1, padding:'8px 12px', borderRadius:8, border:`1px solid ${BORDER}`, fontSize:13, outline:'none', fontFamily:'inherit' }}
              />
              <button onClick={sendChat} {...hoverProps('chatsend')} style={{ background: hovered==='chatsend' ? '#00BFB8' : CYAN, color:DARK, border:'none', borderRadius:8, padding:'8px 14px', fontWeight:700, fontSize:13, cursor:'pointer', transition:'background 0.15s ease' }}>→</button>
            </div>
          </div>
        )}
      </>}

      {/* FAQ — bottom of all tabs */}
      <div style={{ background: WHITE, borderRadius: r16, border: `1px solid ${BORDER}`, padding: '20px 20px', marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: DARK, marginBottom: 12 }}>Common Questions</div>
        {FAQS.map((faq, i) => (
          <div key={i} style={{ borderBottom: i < FAQS.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenFaq(openFaq === i ? null : i); } }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 2px', cursor: 'pointer', userSelect: 'none', borderRadius: 6, transition: 'background 0.12s ease' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: DARK, lineHeight: 1.4, paddingRight: 12, flex: 1 }}>{faq.q}</span>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: openFaq === i ? DARK : '#F3F4F6',
                color: openFaq === i ? WHITE : GREY,
                fontSize: 14, fontWeight: 400, lineHeight: 1,
                transition: 'all 0.2s ease',
              }}>
                <span style={{ display: 'block', transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>+</span>
              </span>
            </div>
            {openFaq === i && (
              <div style={{ padding: '0 2px 14px', fontSize: 13, color: GREY, lineHeight: 1.6, maxWidth: 540 }}>{faq.a}</div>
            )}
          </div>
        ))}
      </div>

      {/* SCORE MODAL */}
      {scoreModalOpen && (
        <>
          <div onClick={() => setScoreModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} />
          <div style={{ position: 'fixed', top: 'clamp(72px, 8dvh, 100px)', left: '50%', transform: 'translateX(-50%)', zIndex: 201, width: 'min(420px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - clamp(72px, 8dvh, 100px) - 20px)', background: WHITE, borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }}>
            {/* Header — compact horizontal: ring left, grade right */}
            <div style={{ background: DARK, padding: '20px 20px', position: 'relative', flexShrink: 0 }}>
              <button onClick={() => setScoreModalOpen(false)} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.1)', border: 'none', color: WHITE, width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, paddingRight: 36 }}>
                {/* SVG score ring */}
                {(() => {
                  const r = 32, circ = 2 * Math.PI * r;
                  const fill = (displayScore / 100) * circ;
                  const sc = getScoreColor(displayScore);
                  const modalPulse = (liveWebsiteScore === null && speedLoading) ? { animation: 'pulse 2s ease-in-out infinite' } : {};
                  return (
                    <>
                      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
                      <svg width="80" height="80" viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
                        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7"/>
                        <circle cx="40" cy="40" r={r} fill="none" stroke={sc} strokeWidth="7"
                          strokeDasharray={`${fill} ${circ - fill}`}
                          strokeLinecap="round" transform="rotate(-90 40 40)" style={modalPulse}/>
                        <text x="40" y="36" textAnchor="middle" fill={sc} fontSize="19" fontWeight="800">{displayScore}</text>
                        <text x="40" y="50" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="10">/100</text>
                      </svg>
                    </>
                  );
                })()}
                {/* Right: grade pill + status line */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overall Score</div>
                  <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 20, background: getScoreColor(displayScore) + '22', border: `1px solid ${getScoreColor(displayScore)}`, color: getScoreColor(displayScore), fontSize: 15, fontWeight: 700 }}>
                    Grade {scores.grade || 'D'}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>
                    {liveTotal >= 70 ? 'Above industry average' : liveTotal >= 50 ? 'Below industry average' : 'Critical — needs attention'}
                  </div>
                </div>
              </div>
            </div>
            {/* Body — scrolls if content taller than viewport */}
            <div style={{ padding: '14px 18px 18px', overflowY: 'auto', flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: DARK, marginBottom: 4 }}>What this score means</div>
              <p style={{ fontSize: 13, color: GREY, lineHeight: 1.6, margin: '0 0 12px' }}>
                {liveTotal >= 80
                  ? `Your business has strong online visibility. You're ahead of most competitors in your area. Small improvements could push you to the top.`
                  : liveTotal >= 60
                  ? `Your business has a decent foundation but significant gaps are costing you leads every day. Competitors with better scores are capturing customers searching for your services.`
                  : liveTotal >= 40
                  ? `Your score of ${liveTotal}/100 means you're losing a significant number of potential customers before they ever find you. Businesses scoring above 70 typically get 2-3× more calls.`
                  : `A score of ${liveTotal}/100 means most customers searching for your services online can't find you. You're likely losing 60-70% of potential leads to competitors with better online presence.`
                }
              </p>
              {/* Mini breakdown */}
              <div style={{ background: GREY_BG, borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: DARK, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score breakdown</div>
                {[
                  { label: 'Google Maps', score: scores.googleMaps?.score, max: 25 },
                  { label: 'Website', score: liveWebsiteScore ?? scores.websiteQuality?.score, max: 20 },
                  { label: 'Search Visibility', score: scores.searchVisibility?.score, max: 20 },
                  { label: 'Competitors', score: scores.competitorPositioning?.score, max: 15 },
                  { label: 'Ads', score: scores.adOpportunity?.score, max: 10 },
                  { label: 'Demand', score: scores.demandCoverage?.score, max: 10 },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: GREY, width: 110, flexShrink: 0 }}>{item.label}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#E5E7EB', overflow: 'hidden' }}>
                      <div style={{ width: `${((item.score || 0) / item.max) * 100}%`, height: '100%', background: scoreColor(item.score || 0, item.max), borderRadius: 3 }}/>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: scoreColor(item.score || 0, item.max), width: 36, textAlign: 'right', flexShrink: 0 }}>{item.score}/{item.max}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: '#FFF7ED', borderRadius: 10, padding: '12px 14px', marginBottom: 10, borderLeft: '3px solid #F59E0B' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 4 }}>Every point below 70 costs you jobs</div>
                <div style={{ fontSize: 12, color: '#B45309', lineHeight: 1.5 }}>Businesses that improve their score to 70+ typically see 30-50% more calls within 60 days. See the Action Plan tab to see exactly what to fix.</div>
              </div>
              <button onClick={() => setScoreModalOpen(false)} style={{ width: '100%', padding: '12px', background: DARK, color: WHITE, border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                See My Action Plan →
              </button>
            </div>
          </div>
        </>
      )}

      {/* ISSUE DETAIL MODAL */}
      {issueModal !== null && plan[issueModal] && (() => {
        const item = plan[issueModal];
        // Generate specific DIY advice based on issue title keywords
        const getDiyAdvice = (title: string): string => {
          const t = title.toLowerCase();
          if (t.includes('review')) return 'Ask recent happy customers for a Google review. Send a direct review link via text or email. Respond to every review — positive and negative.';
          if (t.includes('photo')) return 'Upload high-quality photos to your Google profile: completed work, before/after shots, your team, and your storefront. More photos usually earns more trust and clicks.';
          if (t.includes('speed') || t.includes('slow') || t.includes('mobile')) return 'Compress hero images and convert to WebP. Defer non-critical scripts. Remove unused plugins. Test with PageSpeed Insights.';
          if (t.includes('website') && (t.includes('no') || t.includes('missing') || t.includes('link'))) return 'Create a simple site with your services, service area, phone number, and a click-to-call button. Link it to your Google profile.';
          if (t.includes('rating')) return 'Reply professionally to every negative review. Address recurring complaints in your operations. Ask satisfied customers to share their experience.';
          if (t.includes('keyword') || t.includes('seo') || t.includes('content') || t.includes('page')) return 'Create a dedicated service page for each core keyword. Include your city name, a clear service description, and a call-to-action.';
          if (t.includes('description') || t.includes('profile') || t.includes('categor')) return 'Write a clear description with your core services and service area. Add all relevant primary and secondary business categories.';
          if (t.includes('hours') || t.includes('evening') || t.includes('weekend') || t.includes('demand')) return 'Update your Google Business hours to reflect evening and weekend availability. Create a landing page targeting emergency and after-hours searches.';
          if (t.includes('ad') || t.includes('paid') || t.includes('ppc')) return 'Set up a Google Ads campaign targeting your top local service keywords. Start with a small daily budget and track which keywords generate calls.';
          if (t.includes('competitor') || t.includes('ranking') || t.includes('visibility')) return 'Audit your top competitors\u2019 Google profiles. Work toward matching their photo count, review count, and posting frequency.';
          if (t.includes('post') || t.includes('update') || t.includes('active') || t.includes('inactive')) return 'Post Google Business updates regularly: recent jobs, seasonal tips, or promotions. Consistent activity signals relevance to Google.';
          return 'Identify the specific fix from the problem above. Gather the right tools or access. Apply the change and verify the result is live.';
        };
        const prioColor = item.priority === 'HIGH' ? RED : item.priority === 'MEDIUM' ? AMBER : GREEN;
        const prioBg = item.priority === 'HIGH' ? RED_BG : item.priority === 'MEDIUM' ? AMBER_BG : GREEN_BG;
        return (
          <>
            <div onClick={() => setIssueModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 200 }} />
            <div style={{ position: 'fixed', top: 'clamp(72px, 8dvh, 100px)', left: '50%', transform: 'translateX(-50%)', zIndex: 201, width: 'min(400px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - clamp(72px, 8dvh, 100px) - 20px)', background: WHITE, borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: DARK, padding: '20px 20px', position: 'relative', flexShrink: 0 }}>
                <button onClick={() => setIssueModal(null)} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.1)', border: 'none', color: WHITE, width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                <div style={{ fontSize: 17, fontWeight: 700, color: WHITE, paddingRight: 36, lineHeight: 1.3 }}>{item.title}</div>
                {item.priority && (
                  <span style={{ display: 'inline-block', marginTop: 10, padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', background: prioBg, color: prioColor }}>
                    {item.priority} PRIORITY
                  </span>
                )}
              </div>
              <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>What it means</div>
                <p style={{ fontSize: 13, color: DARK, lineHeight: 1.6, margin: '0 0 18px' }}>{item.detail}</p>

                {item.estimatedImpact && (
                  <>
                    <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Why it matters</div>
                    <p style={{ fontSize: 13, color: DARK, lineHeight: 1.6, margin: '0 0 18px' }}>{item.estimatedImpact}</p>
                  </>
                )}

                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>DIY solution</div>
                <p style={{ fontSize: 13, color: DARK, lineHeight: 1.6, margin: '0 0 6px' }}>
                  {getDiyAdvice(item.title)}{item.estimatedCost ? ` Budget around ${item.estimatedCost}.` : ''}
                </p>
                {(item.estimatedCost || item.timeToResult) && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                    {item.estimatedCost && (
                      <span style={{ padding: '4px 12px', borderRadius: 8, background: GREY_BG, color: GREY, fontSize: 12 }}>💰 {item.estimatedCost}</span>
                    )}
                    {item.timeToResult && (
                      <span style={{ padding: '4px 12px', borderRadius: 8, background: GREY_BG, color: GREY, fontSize: 12 }}>⏱ {item.timeToResult}</span>
                    )}
                  </div>
                )}

                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Timeline</div>
                <p style={{ fontSize: 13, color: DARK, lineHeight: 1.6, margin: '0 0 18px' }}>{item.timeToResult || '2–4 weeks'} depending on scope and execution.</p>

                <div style={{ fontSize: 12, color: GREY, marginBottom: 8 }}>WeFixTrades can handle this for you</div>
                <button
                  onClick={() => { setIssueModal(null); setActiveTab('plan'); }}
                  style={{
                    width: '100%', padding: '12px 20px',
                    background: CYAN, color: DARK, border: 'none', borderRadius: 10,
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#00BFB8')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = CYAN)}
                >
                  Let WeFixTrades fix this →
                </button>
              </div>
            </div>
          </>
        );
      })()}

      {/* BREAKDOWN METRIC MODAL */}
      {breakdownModal && BREAKDOWN_EXPLANATIONS[breakdownModal] && (() => {
        const bd = BREAKDOWN_EXPLANATIONS[breakdownModal];
        const bdRow = scoreRows.find(r => r.key === breakdownModal);
        const bdColor = bdRow ? scoreColor(bdRow.score, bdRow.max) : CYAN;
        return (
          <>
            <div onClick={() => setBreakdownModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 200 }} />
            <div style={{ position: 'fixed', top: 'clamp(72px, 8dvh, 100px)', left: '50%', transform: 'translateX(-50%)', zIndex: 201, width: 'min(400px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - clamp(72px, 8dvh, 100px) - 20px)', background: WHITE, borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: DARK, padding: '20px 20px', position: 'relative', flexShrink: 0 }}>
                <button onClick={() => setBreakdownModal(null)} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.1)', border: 'none', color: WHITE, width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                <div style={{ fontSize: 17, fontWeight: 700, color: WHITE }}>{bd.title}</div>
                {bdRow && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <div style={{ width: 60, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                      <div style={{ width: `${(bdRow.score / bdRow.max) * 100}%`, height: '100%', background: bdColor, borderRadius: 3 }}/>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: bdColor }}>{bdRow.score}/{bdRow.max}</span>
                  </div>
                )}
              </div>
              <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>What it means</div>
                <p style={{ fontSize: 13, color: DARK, lineHeight: 1.6, margin: '0 0 18px' }}>{bd.what}</p>
                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Why it matters</div>
                <p style={{ fontSize: 13, color: DARK, lineHeight: 1.6, margin: '0 0 18px' }}>{bd.why}</p>
                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>DIY solution</div>
                <p style={{ fontSize: 13, color: DARK, lineHeight: 1.6, margin: '0 0 18px' }}>{bd.diy}</p>
                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Timeline</div>
                <p style={{ fontSize: 13, color: DARK, lineHeight: 1.6, margin: '0 0 18px' }}>{bd.timeline}</p>
                <div style={{ fontSize: 12, color: GREY, marginBottom: 8 }}>WeFixTrades can handle this for you</div>
                <button
                  onClick={() => { setBreakdownModal(null); setActiveTab('plan'); }}
                  style={{
                    width: '100%', padding: '12px 20px',
                    background: CYAN, color: DARK, border: 'none', borderRadius: 10,
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#00BFB8')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = CYAN)}
                >
                  Let WeFixTrades fix this →
                </button>
              </div>
            </div>
          </>
        );
      })()}

      {metricModal && METRIC_EXPLANATIONS[metricModal] && (() => {
        const exp = METRIC_EXPLANATIONS[metricModal];
        return (
          <>
            <div onClick={() => setMetricModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 200 }} />
            <div style={{ position: 'fixed', top: 'clamp(72px, 8dvh, 100px)', left: '50%', transform: 'translateX(-50%)', zIndex: 201, width: 'min(400px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - clamp(72px, 8dvh, 100px) - 20px)', background: WHITE, borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: DARK, padding: '20px 20px', position: 'relative', flexShrink: 0 }}>
                <button onClick={() => setMetricModal(null)} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.1)', border: 'none', color: WHITE, width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                <div style={{ fontSize: 17, fontWeight: 700, color: WHITE }}>{exp.title}</div>
              </div>
              <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>What it means</div>
                <p style={{ fontSize: 13, color: DARK, lineHeight: 1.6, margin: '0 0 16px' }}>{exp.what}</p>
                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Why it matters</div>
                <p style={{ fontSize: 13, color: DARK, lineHeight: 1.6, margin: '0 0 16px' }}>{exp.why}</p>
                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>DIY solution</div>
                <p style={{ fontSize: 13, color: DARK, lineHeight: 1.6, margin: '0 0 16px' }}>{exp.diy}</p>
                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Timeline</div>
                <p style={{ fontSize: 13, color: DARK, lineHeight: 1.6, margin: '0 0 16px' }}>{exp.timeline}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, padding: '10px 0', borderTop: `1px solid ${BORDER}` }}>
                  {exp.thresholds.map(t => (
                    <div key={t.label} style={{ flex: 1, minWidth: 72, background: t.color + '10', borderRadius: 6, padding: '6px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: t.color }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: DARK, marginTop: 1 }}>{t.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: GREY, marginBottom: 8 }}>WeFixTrades can handle this for you</div>
                <button
                  onClick={() => { setMetricModal(null); setActiveTab('plan'); }}
                  style={{
                    width: '100%', padding: '12px 20px',
                    background: CYAN, color: DARK, border: 'none', borderRadius: 10,
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#00BFB8')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = CYAN)}
                >
                  Let WeFixTrades fix this →
                </button>
              </div>
            </div>
          </>
        );
      })()}

      {/* MODAL — VISUAL ANALYSIS DETAIL */}
      {visualAnalysisModal && (() => {
        const aiAnalysis = liveWebsiteAIAnalysis || report?.websiteAIAnalysis;
        const screenshot = liveWebsiteScreenshot || report?.websiteScreenshot;
        if (!aiAnalysis?.findings?.length) return null;
        const findings: Array<{ label: string; status: string; note: string }> = aiAnalysis.findings;
        const passCount = findings.filter(f => f.status === 'pass').length;
        const total = findings.length;
        const pct = Math.round((passCount / total) * 100);
        const summaryColor = pct >= 70 ? GREEN : pct >= 40 ? AMBER : RED;
        const statusIcon = (s: string) => s === 'pass' ? '✓' : s === 'warn' ? '!' : '✕';
        const statusBg = (s: string) => s === 'pass' ? GREEN : s === 'warn' ? AMBER : RED;
        const screenshotSrc = screenshot
          ? screenshot.startsWith('data:') ? screenshot : `data:image/jpeg;base64,${screenshot}`
          : null;

        return (
          <>
            <div onClick={() => setVisualAnalysisModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 200 }} />
            <div style={{ position: 'fixed', top: 'clamp(48px, 5dvh, 80px)', left: '50%', transform: 'translateX(-50%)', zIndex: 201, width: 'min(520px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - clamp(48px, 5dvh, 80px) - 20px)', background: WHITE, borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }}>
              {/* Modal header */}
              <div style={{ background: DARK, padding: '20px 24px', position: 'relative', flexShrink: 0 }}>
                <button onClick={() => setVisualAnalysisModal(false)} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.1)', border: 'none', color: WHITE, width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                <div style={{ fontSize: 17, fontWeight: 700, color: WHITE }}>Website Visual Analysis</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <div style={{ width: 80, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: summaryColor, borderRadius: 3 }}/>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: summaryColor }}>{passCount}/{total} checks passed</span>
                </div>
              </div>

              {/* Scrollable body */}
              <div style={{ padding: '0', overflowY: 'auto', flex: 1 }}>
                {/* Screenshot in modal */}
                {screenshotSrc && (
                  <div style={{ padding: '16px 24px 0', background: '#F9FAFB' }}>
                    <img
                      src={screenshotSrc}
                      alt="Website screenshot"
                      style={{ width: '100%', borderRadius: 10, border: `1px solid ${BORDER}`, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
                    />
                  </div>
                )}

                {/* All findings */}
                <div style={{ padding: '16px 24px' }}>
                  {findings.map((f, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 0',
                      borderBottom: i < findings.length - 1 ? `1px solid ${BORDER}` : 'none',
                    }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                        background: statusBg(f.status) + '18',
                        color: statusBg(f.status),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 800,
                      }}>
                        {statusIcon(f.status)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: DARK }}>{f.label}</span>
                          <span style={{ padding: '1px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: statusBg(f.status) + '15', color: statusBg(f.status), textTransform: 'uppercase' }}>
                            {f.status}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: GREY, marginTop: 4, lineHeight: 1.55 }}>{f.note}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* AI summary */}
                {aiAnalysis.summary && (
                  <div style={{ margin: '0 24px 20px', padding: '14px 18px', background: GREY_BG, borderRadius: 12, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>AI Summary</div>
                    <div style={{ fontSize: 13, color: DARK, lineHeight: 1.6 }}>{aiAnalysis.summary}</div>
                  </div>
                )}

                {/* CTA */}
                <div style={{ padding: '0 24px 20px' }}>
                  <div style={{ fontSize: 12, color: GREY, marginBottom: 8 }}>Need help improving your website?</div>
                  <button
                    onClick={() => { setVisualAnalysisModal(false); setActiveTab('plan'); }}
                    style={{
                      width: '100%', padding: '12px 20px',
                      background: CYAN, color: DARK, border: 'none', borderRadius: 10,
                      fontSize: 14, fontWeight: 700, cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#00BFB8')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = CYAN)}
                  >
                    Let WeFixTrades fix this →
                  </button>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* Screenshot Lightbox */}
      {screenshotLightbox && (() => {
        const screenshot = liveWebsiteScreenshot || report?.websiteScreenshot;
        const src = screenshot
          ? screenshot.startsWith('data:') ? screenshot : `data:image/jpeg;base64,${screenshot}`
          : null;
        return src ? <ScreenshotLightbox src={src} alt={`${business?.name || 'Business'} website screenshot`} onClose={() => setScreenshotLightbox(false)} /> : null;
      })()}

      {/* Global Zoom Controls */}
      <div style={{
        position: 'fixed',
        bottom: isMobile ? 16 : 24,
        right: isMobile ? 16 : 24,
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        background: WHITE,
        borderRadius: 24,
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        border: `1px solid ${BORDER}`,
        zIndex: 50,
        overflow: 'hidden',
      }}>
        <button
          onClick={() => setReportZoom(z => Math.max(80, z - 10))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px', display: 'flex', alignItems: 'center', color: reportZoom <= 80 ? '#D1D5DB' : DARK }}
          disabled={reportZoom <= 80}
          title="Zoom out"
        >
          <Minus size={16} />
        </button>
        <span style={{ fontSize: 11, fontWeight: 600, color: GREY, minWidth: 36, textAlign: 'center', userSelect: 'none' }}>{reportZoom}%</span>
        <button
          onClick={() => setReportZoom(z => Math.min(150, z + 10))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px', display: 'flex', alignItems: 'center', color: reportZoom >= 150 ? '#D1D5DB' : DARK }}
          disabled={reportZoom >= 150}
          title="Zoom in"
        >
          <Plus size={16} />
        </button>
        {reportZoom !== 100 && (
          <button
            onClick={() => setReportZoom(100)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px', fontSize: 10, fontWeight: 600, color: CYAN, borderLeft: `1px solid ${BORDER}` }}
            title="Reset zoom"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
