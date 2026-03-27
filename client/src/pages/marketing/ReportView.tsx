import { useState, useEffect, useRef, useMemo } from "react";
import { MapPin, Globe, Search, Trophy, Megaphone, Clock, MessageCircle, Wrench, FileX, BarChart3, Users, ClipboardList } from "lucide-react";
import { SERVICES, getServicesForIssues } from '../../../../server/data/services';

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

function ScoreCircle({ score, grade, onClick }: { score: number; grade: string; onClick?: () => void }) {
  const r = 45;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = gradeColor(grade);
  return (
    <div style={{ textAlign: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={onClick} title="Click to learn more">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8"/>
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeLinecap="round" transform="rotate(-90 60 60)"/>
        <text x="60" y="55" textAnchor="middle" fill={WHITE} fontSize="22" fontWeight="700">{score}</text>
        <text x="60" y="70" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="11">/100</text>
      </svg>
      <div style={{
        display: 'inline-block', padding: '3px 14px', borderRadius: 20,
        background: color + '22', border: `1px solid ${color}`,
        color, fontSize: 13, fontWeight: 700, marginTop: 6
      }}>
        Grade {grade}
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>tap to explain</div>
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

export default function ReportView({ report, business, reportId, liveSpeedData, speedLoading }: {
  report: any;
  business: any;
  reportId?: string | null;
  liveSpeedData?: any;
  speedLoading?: boolean;
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

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role:'user'|'ai', text:string}[]>([]);
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
  const FAQS = [
    { q: "Do I need to learn any software?", a: "None. Everything is set up and managed by our team. You get a simple dashboard to check your results, and a weekly summary sent to your phone. That's it." },
    { q: "How long until I see results?", a: "Most clients see measurable improvements within the first 2–4 weeks — more profile views, more calls, more leads. SEO results compound over 60–90 days." },
    { q: "Is there a contract or cancellation fee?", a: "No contracts. No cancellation fees. Cancel any time with 30 days notice. We keep clients by delivering results, not by locking them in." },
    { q: "What makes you different from a regular marketing agency?", a: "We built this exclusively for trades businesses. The tools, the AI, the automations — all designed around how plumbers, locksmiths, and HVAC techs actually work." },
    { q: "What happens after I select my services?", a: "Complete a quick 5-minute onboarding form. Our team sets everything up within 48 hours. You get a confirmation with your login details and next steps." },
    { q: "Can I start with one service and add more later?", a: "Absolutely. Most clients start with one or two services, see the results, and expand from there. No pressure to buy everything at once." },
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

  useEffect(() => {
    const timer = setTimeout(() => {
      if (chatMessages.length === 0) {
        setChatMessages([{
          role: 'ai',
          text: `Hi! I've reviewed the audit for ${business?.name || 'your business'}. You have ${report?.detectedIssues?.length || 0} issues detected. Any questions about what we found?`
        }]);
      }
    }, 6000);
    return () => clearTimeout(timer);
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
    let reply = '';
    try {
      const res = await fetch('/api/audit/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
            topIssue: report?.narrative?.actionPlan?.[0]?.title,
            estimatedLoss: report?.estimatedRevenueLoss,
          },
        }),
      });
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
            reply += JSON.parse(data).text;
            setChatMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'ai', text: reply };
              return updated;
            });
          } catch {}
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

  const METRIC_EXPLANATIONS: Record<string, { title: string; what: string; why: string; thresholds: { label: string; value: string; color: string }[] }> = {
    fcp: {
      title: 'First Contentful Paint (FCP)',
      what: 'The time from when the page starts loading to when any text or image is first visible on screen.',
      why: 'A fast FCP reassures visitors that the page is actually loading. Slow FCP causes users to bounce before your content appears.',
      thresholds: [
        { label: 'Good', value: '< 1.8s', color: GREEN },
        { label: 'Needs work', value: '1.8s – 3s', color: AMBER },
        { label: 'Critical', value: '> 3s', color: RED },
      ],
    },
    lcp: {
      title: 'Largest Contentful Paint (LCP)',
      what: 'The time until the largest visible element (hero image, heading, etc.) fully loads on screen.',
      why: 'LCP is a Core Web Vital and a direct Google ranking factor. A slow LCP pushes your site lower in search results and loses customers before they even read your offer.',
      thresholds: [
        { label: 'Good', value: '< 2.5s', color: GREEN },
        { label: 'Needs work', value: '2.5s – 4s', color: AMBER },
        { label: 'Critical', value: '> 4s', color: RED },
      ],
    },
    tbt: {
      title: 'Total Blocking Time (TBT)',
      what: 'The total time the page is unresponsive to clicks and taps while JavaScript is running in the background.',
      why: "High TBT makes your site feel frozen. Visitors who can't tap a button or scroll smoothly will leave — hurting both conversions and your Google ranking.",
      thresholds: [
        { label: 'Good', value: '< 200ms', color: GREEN },
        { label: 'Needs work', value: '200ms – 600ms', color: AMBER },
        { label: 'Critical', value: '> 600ms', color: RED },
      ],
    },
    cls: {
      title: 'Cumulative Layout Shift (CLS)',
      what: "Measures how much page elements unexpectedly jump around while the page loads (e.g. a button moves just as you're about to tap it).",
      why: 'CLS is a Core Web Vital. Unexpected layout shifts frustrate users and cause accidental clicks. Google penalises sites with poor CLS in search rankings.',
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

    // QA checks contribution (max 12)
    const qaScore = report?.websiteQualityCheckScore ?? 0;
    const qaMax = 18;
    const qaPoints = Math.round((qaScore / qaMax) * 12);

    return Math.min(20, speedPoints + qaPoints);
  }, [liveSpeedData, report?.speedData, report?.websiteQualityCheckScore]);

  const liveTotal = useMemo(() => {
    if (liveWebsiteScore === null) return scores.total || 0;
    const oldWebsite = scores.websiteQuality?.score || 0;
    return (scores.total || 0) - oldWebsite + liveWebsiteScore;
  }, [liveWebsiteScore, scores]);

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

  const scoreRows = [
    { icon: <MapPin size={18} color="#00D4C8" />, label: 'Google Maps Profile', score: scores.googleMaps?.score || 0, max: 25, note: 'How complete and trusted your Google profile is' },
    { icon: <Globe size={18} color="#00D4C8" />, label: 'Website Quality', score: liveWebsiteScore ?? scores.websiteQuality?.score ?? 0, max: 20, note: websiteScoreNote },
    { icon: <Search size={18} color="#00D4C8" />, label: 'Search Visibility', score: scores.searchVisibility?.score || 0, max: 20, note: 'How easily customers find you on Google' },
    { icon: <Trophy size={18} color="#00D4C8" />, label: 'Competitor Position', score: scores.competitorPositioning?.score || 0, max: 15, note: 'How you compare to local competitors' },
    { icon: <Megaphone size={18} color="#00D4C8" />, label: 'Ad Opportunity', score: scores.adOpportunity?.score || 0, max: 10, note: 'The paid search market in your area' },
    { icon: <Clock size={18} color="#00D4C8" />, label: 'Demand Coverage', score: scores.demandCoverage?.score || 0, max: 10, note: "Whether you're visible when customers search most" },
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
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', width: '100%', maxWidth: window.innerWidth >= 1024 ? 960 : 780, margin: '0 auto', padding: isTiny ? '0 10px 80px' : isMobile ? '0 16px 80px' : '0 16px 48px', boxSizing: 'border-box', position: 'relative' }}>

      {/* TAB BAR */}
      <div style={{ display:'flex', background:WHITE, borderBottom:'2px solid #F3F4F6', padding:'0 16px', position:'sticky', top:0, zIndex:20, gap:0, width:'100%' }}>
        {(['maps','website','plan'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} {...hoverProps(`tab-${tab}`)} style={{
            padding:'14px 20px', fontSize:13, fontWeight: activeTab===tab ? 600 : 500,
            color: activeTab===tab ? DARK : hovered===`tab-${tab}` ? '#4B5563' : '#9CA3AF',
            border:'none', background: hovered===`tab-${tab}` && activeTab!==tab ? '#F9FAFB' : 'transparent',
            borderBottom: activeTab===tab ? '2px solid #00D4C8' : '2px solid transparent',
            marginBottom:-2, cursor:'pointer', whiteSpace:'nowrap',
            display:'flex', alignItems:'center', gap:6, transition:'all 0.15s ease', letterSpacing:'0.01em',
          }}>
            {tab==='maps' ? 'Google Maps' : tab==='website' ? 'Website' : 'Action Plan'}
          </button>
        ))}
      </div>

      {/* SECTION 1 — COVER */}
      {activeTab === 'maps' && <div style={{ background: DARK, borderRadius: r16, padding: 20, marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
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
          <ScoreCircle score={liveTotal} grade={scores.grade || 'D'} onClick={() => setScoreModalOpen(true)} />
        </div>
        {ai.executiveSummary && (
          <>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '20px 0' }}/>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 1.65, margin: 0 }}>{ai.executiveSummary}</p>
          </>
        )}
      </div>}

      {/* SECTION 2 — SCORE BREAKDOWN */}
      {activeTab === 'maps' && <div style={card()}>
        <div style={{ fontSize: 17, fontWeight: 700, color: DARK, marginBottom: 20 }}>Your Score Breakdown</div>
        {scoreRows.map((row, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'rgba(0,212,200,0.08)', flexShrink: 0 }}>
                {row.icon}
              </span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: DARK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{row.label}</span>
              <div style={{ width: 80, flexShrink: 0, height: 8, borderRadius: 4, background: '#E5E7EB', overflow: 'hidden' }}>
                <div style={{ width: `${(row.score / row.max) * 100}%`, height: '100%', background: scoreColor(row.score, row.max), borderRadius: 4 }}/>
              </div>
              <span style={{ width: 48, flexShrink: 0, textAlign: 'right', fontSize: 13, fontWeight: 700, color: scoreColor(row.score, row.max) }}>
                {row.score}/{row.max}
              </span>
            </div>
            <div style={{ fontSize: 11, color: GREY, marginTop: 2, marginLeft: 38 }}>{row.note}</div>
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
        <div style={{ marginBottom: 10 }}>
          <div style={{ background: DARK, borderRadius: '16px 16px 0 0', padding: '18px 24px', fontSize: 17, fontWeight: 700, color: WHITE }}>
            What's Holding You Back
          </div>
          {plan.map((item: any, i: number) => (
            <div key={i} style={{
              background: WHITE, border: `1px solid ${BORDER}`, borderTop: 'none',
              borderRadius: i === plan.length - 1 ? '0 0 16px 16px' : 0, padding: 24
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                <span style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                  background: item.priority === 'HIGH' ? RED_BG : item.priority === 'MEDIUM' ? AMBER_BG : GREEN_BG,
                  color: item.priority === 'HIGH' ? RED : item.priority === 'MEDIUM' ? AMBER : GREEN
                }}>
                  {item.priority} PRIORITY
                </span>
                <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#E0FAF9', color: '#00897B' }}>
                  {item.estimatedImpact}
                </span>
              </div>
              <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>❌ The Problem</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: DARK, marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: GREY, lineHeight: 1.55 }}>{item.detail}</div>
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>💸 What It's Costing You</div>
                <div style={{ fontSize: 13, color: DARK }}>
                  Every month this isn't fixed, you're missing an estimated <strong>{item.estimatedImpact}</strong> in potential jobs.
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>✅ How To Fix It</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[item.estimatedCost, item.timeToResult].filter(Boolean).map((v: string, j: number) => (
                    <span key={j} style={{ padding: '3px 10px', borderRadius: 12, background: GREY_BG, color: GREY, fontSize: 12 }}>{v}</span>
                  ))}
                </div>
              </div>
              {item.wefixtrades_can_help && (
                <div style={{ marginTop: 16, background: '#E0FAF9', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#00897B', fontWeight: 600 }}>🔧 WeFixTrades can handle this for you</span>
                  <a href="/plans" style={{ fontSize: 13, color: CYAN, fontWeight: 600, textDecoration: 'none' }}>See how →</a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* SECTION 4 — KEYWORDS */}
      {activeTab === 'website' && keywords.some((k: any) => k.monthlySearches > 0) && (
        <div style={card()}>
          <div style={{ fontSize: 17, fontWeight: 700, color: DARK, marginBottom: 4 }}>What Customers Search For</div>
          <div style={{ fontSize: 12, color: GREY, marginBottom: 16 }}>Keywords relevant to your business in {report?.city}</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: GREY_BG }}>
                  {['Keyword', 'Searches/mo', 'CPC', 'Your Rank', 'Status'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keywords.map((kw: any, i: number) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? WHITE : '#FAFAFA', borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: '8px 10px', fontWeight: 500, color: DARK }}>{kw.keyword}</td>
                    <td style={{ padding: '8px 10px', color: DARK }}>{kw.monthlySearches?.toLocaleString() || '—'}</td>
                    <td style={{ padding: '8px 10px', color: GREY }}>{kw.cpc > 0 ? `$${kw.cpc.toFixed(2)}` : '—'}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: !kw.organicRank ? RED : kw.organicRank <= 3 ? GREEN : kw.organicRank <= 10 ? AMBER : RED }}>
                      {kw.organicRank ? `#${kw.organicRank}` : 'Not ranking'}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: statusColor(kw.status) + '20', color: statusColor(kw.status) }}>
                        {kw.status?.replace('-', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ai.keyStrength && (
            <div style={{ marginTop: 16, background: GREEN_BG, borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#166534' }}>
              ✓ {ai.keyStrength}
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
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: DARK, marginBottom: 4 }}>What's Holding You Back</div>
          <div style={{ fontSize: 12, color: GREY, marginBottom: 14 }}>Your personalized improvement roadmap</div>
          {plan.map((item: any, i: number) => (
            <div key={i} style={{ background: WHITE, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 20, marginBottom: 10 }}>
              {/* Priority badge */}
              <div style={{
                display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                letterSpacing: '0.05em', marginBottom: 10,
                background: item.priority === 'HIGH' ? '#FEF2F2' : '#FFF7ED',
                color: item.priority === 'HIGH' ? RED : AMBER,
                border: `1px solid ${item.priority === 'HIGH' ? '#FECACA' : '#FED7AA'}`,
              }}>
                {item.priority} PRIORITY
              </div>
              {/* Problem title */}
              <div style={{ fontSize: 15, fontWeight: 700, color: DARK, marginBottom: 8 }}>{item.title}</div>
              {/* Explanation */}
              <div style={{ fontSize: 13, color: GREY, lineHeight: 1.6, marginBottom: 12 }}>{item.detail}</div>
              {/* Impact callout */}
              {item.estimatedImpact && (
                <div style={{ background: '#F0FFF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#166534', marginBottom: 10, lineHeight: 1.5 }}>
                  💡 {item.estimatedImpact}
                </div>
              )}
              {/* Cost + time row */}
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: GREY, flexWrap: 'wrap' }}>
                {item.estimatedCost && <span>💰 {item.estimatedCost}</span>}
                {item.timeToResult && <span>⏱ {item.timeToResult}</span>}
              </div>
            </div>
          ))}
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
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            {[{ label: '📱 Mobile', data: speed.mobile }, { label: '🖥 Desktop', data: speed.desktop }].map(({ label, data }) => (
              <div key={label} style={{ ...card({ flex: 1, minWidth: 200, marginBottom: 0 }) }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: DARK, marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: data?.score != null ? scoreColor(data.score, 100) : GREY, lineHeight: 1 }}>
                  {data?.score != null ? data.score : speedLoading ? '...' : '—'}<span style={{ fontSize: 16, color: GREY, fontWeight: 400 }}>/100</span>
                </div>
                <div style={{ fontSize: 11, color: GREY, marginTop: 10, marginBottom: 2 }}>
                  Tap a metric below to understand what it means
                </div>
                {[
                  { key: 'fcp', label: 'FCP', tip: 'First Contentful Paint', val: data?.fcp, unit: 's', good: 2.5, ok: 4 },
                  { key: 'lcp', label: 'LCP', tip: 'Largest Contentful Paint — key Google ranking factor', val: data?.lcp, unit: 's', good: 2.5, ok: 4 },
                  { key: 'tbt', label: 'TBT', tip: 'Total Blocking Time — page responsiveness', val: data?.tbt, unit: 'ms', good: 200, ok: 600 },
                  { key: 'cls', label: 'CLS', tip: 'Cumulative Layout Shift — page stability', val: data?.cls, unit: '', good: 0.1, ok: 0.25 },
                ].map(m => {
                  const isGood = (m.val || 0) <= m.good;
                  const isOk = (m.val || 0) <= m.ok;
                  const statusC = isGood ? GREEN : isOk ? AMBER : RED;
                  const statusT = isGood ? 'Good' : isOk ? 'Needs work' : 'Critical';
                  return (
                    <div key={m.key} onClick={() => setMetricModal(m.key)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}`, cursor: 'pointer' }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: DARK }}>{m.label}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: GREY_BG, color: GREY, fontSize: 9, marginLeft: 4 }}>?</span>
                        <div style={{ fontSize: 12, color: GREY }}>{m.val != null ? `${m.val}${m.unit}` : '—'}</div>
                      </div>
                      {m.val != null && (
                        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: statusC + '20', color: statusC }}>{statusT}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
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
      <div style={{ background: DARK, borderRadius: r16, padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: WHITE }}>Share This Report</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'nowrap', marginTop: 20 }}>
          {SHARE_BUTTONS.map(btn => (
            <button
              key={btn.id}
              onClick={btn.onClick}
              {...hoverProps('share-' + btn.id)}
              title={btn.label}
              style={{
                width: 48, height: 48, padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 12, border: 'none', background: btn.bg,
                cursor: 'pointer', flexShrink: 0,
                transform: hovered === 'share-' + btn.id ? 'translateY(-2px) scale(1.05)' : 'translateY(0) scale(1)',
                boxShadow: hovered === 'share-' + btn.id ? '0 4px 12px rgba(0,0,0,0.25)' : '0 2px 4px rgba(0,0,0,0.15)',
                transition: 'all 0.15s ease',
              }}
            >
              {btn.icon}
            </button>
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
            <div style={{ height:200, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:10 }}>
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
      <div style={{ background: WHITE, borderRadius: r16, border: `1px solid ${BORDER}`, padding: 24, marginBottom: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: DARK, marginBottom: 16 }}>Common Questions</div>
        {FAQS.map((faq, i) => (
          <div key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
            <div
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 4px', cursor: 'pointer', userSelect: 'none' }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: DARK, lineHeight: 1.4, paddingRight: 16, flex: 1 }}>{faq.q}</span>
              <span style={{ fontSize: 20, color: GREY, fontWeight: 300, flexShrink: 0, display: 'inline-block', transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>+</span>
            </div>
            {openFaq === i && (
              <div style={{ padding: '0 4px 16px', fontSize: 13, color: GREY, lineHeight: 1.65, maxWidth: 540 }}>{faq.a}</div>
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
                  const fill = (liveTotal / 100) * circ;
                  const gc = gradeColor(scores.grade || 'D');
                  return (
                    <svg width="80" height="80" viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
                      <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7"/>
                      <circle cx="40" cy="40" r={r} fill="none" stroke={gc} strokeWidth="7"
                        strokeDasharray={`${fill} ${circ - fill}`}
                        strokeLinecap="round" transform="rotate(-90 40 40)"/>
                      <text x="40" y="36" textAnchor="middle" fill={gc} fontSize="19" fontWeight="800">{liveTotal}</text>
                      <text x="40" y="50" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="10">/100</text>
                    </svg>
                  );
                })()}
                {/* Right: grade pill + status line */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overall Score</div>
                  <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 20, background: gradeColor(scores.grade || 'D') + '22', border: `1px solid ${gradeColor(scores.grade || 'D')}`, color: gradeColor(scores.grade || 'D'), fontSize: 15, fontWeight: 700 }}>
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
              <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>What it measures</div>
                <p style={{ fontSize: 13, color: DARK, lineHeight: 1.6, margin: '0 0 20px' }}>{exp.what}</p>
                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Why it matters</div>
                <p style={{ fontSize: 13, color: DARK, lineHeight: 1.6, margin: '0 0 20px' }}>{exp.why}</p>
                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Benchmarks</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {exp.thresholds.map(t => (
                    <div key={t.label} style={{ flex: 1, minWidth: 80, background: t.color + '15', border: `1px solid ${t.color}40`, borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: t.color }}>{t.label}</div>
                      <div style={{ fontSize: 12, color: DARK, marginTop: 2 }}>{t.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
