import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence, useInView, useReducedMotion } from "framer-motion";
import { ICON_ANIMATIONS } from "./AutomationDiagramIcons";
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  type NodeTypes,
  Position,
  Handle,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { mkt } from "@/theme/tokens";
import {
  PhoneCall,
  PhoneOff,
  PhoneIncoming,
  MessageSquare,
  MessageCircle,
  UserCheck,
  UserPlus,
  CalendarCheck,
  CalendarClock,
  BellRing,
  Wrench,
  ClipboardList,
  Calculator,
  Send,
  CheckCircle2,
  Mail,
  Star,
  TrendingUp,
  UserCog,
  BarChart3,
  MapPin,
  Phone,
  Search,
  Sparkles,
  ImageIcon,
  Receipt,
  CreditCard,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Responsive hook                                                    */
/* ------------------------------------------------------------------ */
function useBreakpoint() {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );
  useEffect(() => {
    const h = () => setWidth(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return { isMobile: width < 640, isTablet: width < 900, width };
}

/* ------------------------------------------------------------------ */
/*  Cloudflare-inspired colour palette                                 */
/* ------------------------------------------------------------------ */
const C = {
  bg: "#0e1214",
  canvasBg: "#0d1514",
  nodeSurface: "rgba(14,18,20,0.96)",
  text: mkt.text,
  textMuted: mkt.textMuted,
  accent: mkt.accent,
  accentGlow: mkt.accentGlow,
  handleSize: 6,
  // V7-aligned palette — cyan accent leads, plus 3 supporting colorways pulled
  // from the effortel-blocks pastel palette but vibrant enough to read on dark.
  cyan: {
    border: "#0d3cfc",
    borderMuted: "rgba(13,60,252,0.20)",
    bg: "rgba(13,60,252,0.04)",
    glow: "rgba(13,60,252,0.40)",
    text: "#0d3cfc",
    edge: "rgba(13,60,252,0.35)",
    inner: "rgba(13,60,252,0.08)",
    innerBorder: "rgba(13,60,252,0.24)",
  },
  amber: {
    border: "#F7B430",
    borderMuted: "rgba(247,180,48,0.20)",
    bg: "rgba(247,180,48,0.04)",
    glow: "rgba(247,180,48,0.40)",
    text: "#F7B430",
    edge: "rgba(247,180,48,0.35)",
    inner: "rgba(247,180,48,0.08)",
    innerBorder: "rgba(247,180,48,0.24)",
  },
  green: {
    border: "#10B981",
    borderMuted: "rgba(16,185,129,0.20)",
    bg: "rgba(16,185,129,0.04)",
    glow: "rgba(16,185,129,0.40)",
    text: "#10B981",
    edge: "rgba(16,185,129,0.35)",
    inner: "rgba(16,185,129,0.08)",
    innerBorder: "rgba(16,185,129,0.24)",
  },
  magenta: {
    border: "#0b34d6",
    borderMuted: "rgba(13,60,252,0.20)",
    bg: "rgba(13,60,252,0.04)",
    glow: "rgba(13,60,252,0.40)",
    text: "#0b34d6",
    edge: "rgba(13,60,252,0.35)",
    inner: "rgba(13,60,252,0.08)",
    innerBorder: "rgba(13,60,252,0.24)",
  },
};

type ColorSet = typeof C.cyan;
const PALETTE: ColorSet[] = [C.cyan, C.amber, C.green, C.magenta];

/* ------------------------------------------------------------------ */
/*  Tab definitions                                                    */
/* ------------------------------------------------------------------ */
type TabKey = "calls" | "quotes" | "reviews" | "visibility";

interface TabDef {
  key: TabKey;
  label: string;
  tabIcon: ReactNode;
  description: string;
  quote: string;
}

const TI = { size: 18, strokeWidth: 1.6 } as const;

const TABS: TabDef[] = [
  {
    key: "calls",
    label: "Calls",
    tabIcon: <PhoneCall {...TI} />,
    description: "Never lose a lead again — missed calls trigger instant automated replies that keep the conversation going.",
    quote: '"We used to lose 40% of leads from missed calls. Now every single one gets a reply within seconds."',
  },
  {
    key: "quotes",
    label: "Quotes",
    tabIcon: <Calculator {...TI} />,
    description: "Visitors describe their job, get an instant price range, and receive a professional quote — all automated.",
    quote: '"Our quoting time dropped from 2 hours to 2 minutes. Customers love the instant response."',
  },
  {
    key: "reviews",
    label: "Reviews",
    tabIcon: <Star {...TI} />,
    description: "After every completed job, automated review requests go out — building your reputation on autopilot.",
    quote: '"We went from 12 reviews to over 200 in six months without lifting a finger."',
  },
  {
    key: "visibility",
    label: "Visibility",
    tabIcon: <MapPin {...TI} />,
    description: "Keep your profile fresh, collect reviews, and climb Google Maps rankings automatically.",
    quote: '"We now show up in the top 3 on Google Maps for every service we offer."',
  },
];

/* ------------------------------------------------------------------ */
/*  Icon map — Lucide only                                             */
/* ------------------------------------------------------------------ */
const NI = { size: 31, strokeWidth: 1.4 } as const; // 10% larger icons

const ICONS: Record<string, ReactNode> = {
  "missed-call":   <PhoneCall {...NI} />,
  "instant-reply": <MessageSquare {...NI} />,
  "lead-captured": <UserCheck {...NI} />,
  "callback":      <CalendarCheck {...NI} />,
  "service":       <Wrench {...NI} />,
  "job-details":   <ClipboardList {...NI} />,
  "price":         <Calculator {...NI} />,
  "quote-sent":    <Send {...NI} />,
  "job-complete":  <CheckCircle2 {...NI} />,
  "request-sent":  <Mail {...NI} />,
  "five-star":     <Star {...NI} />,
  "ranking-up":    <TrendingUp {...NI} />,
  "profile":       <UserCog {...NI} />,
  "reviews-grow":  <BarChart3 {...NI} />,
  "maps":          <MapPin {...NI} />,
  "more-calls":    <Phone {...NI} />,
  // Extras for animation sequences (rendered when a node is active)
  "phone-off":         <PhoneOff {...NI} />,
  "phone-incoming":    <PhoneIncoming {...NI} />,
  "message-typing":    <MessageCircle {...NI} />,
  "message-sent":      <Send {...NI} />,
  "user-plus":         <UserPlus {...NI} />,
  "calendar-clock":    <CalendarClock {...NI} />,
  "bell-ring":         <BellRing {...NI} />,
  "search":            <Search {...NI} />,
  "sparkles":          <Sparkles {...NI} />,
  "image":             <ImageIcon {...NI} />,
  "receipt":           <Receipt {...NI} />,
  "credit-card":       <CreditCard {...NI} />,
};

/**
 * ICON_SEQUENCES — when a node becomes active, its icon swaps through this
 * list on a 1.2s loop. The first entry is always the resting icon.
 *
 * Each sequence tells the micro-story of that step. Keep sequences ≤ 3 icons
 * so they read clearly.
 */
const ICON_SEQUENCES: Record<string, string[]> = {
  // Calls flow
  "missed-call":   ["missed-call", "phone-off", "phone-incoming"],
  "instant-reply": ["instant-reply", "message-typing", "message-sent"],
  "lead-captured": ["lead-captured", "user-plus", "five-star"],
  "callback":      ["callback", "calendar-clock", "bell-ring"],
  // Quotes flow
  "service":       ["service", "search", "sparkles"],
  "job-details":   ["job-details", "ranking-up"],
  "price":         ["price", "receipt", "credit-card"],
  "quote-sent":    ["quote-sent", "message-sent", "five-star"],
  // Reviews flow
  "job-complete":  ["job-complete", "sparkles"],
  "request-sent":  ["request-sent", "message-sent", "bell-ring"],
  "five-star":     ["five-star", "sparkles", "ranking-up"],
  "ranking-up":    ["ranking-up", "five-star"],
  // Visibility flow
  "profile":       ["profile", "image", "sparkles"],
  "reviews-grow":  ["reviews-grow", "five-star"],
  "maps":          ["maps", "search", "sparkles"],
  "more-calls":    ["more-calls", "phone-incoming", "lead-captured"],
};

/* ------------------------------------------------------------------ */
/*  Active-node context                                                */
/*  Tracks which node is "playing" + whether the section is in view.   */
/* ------------------------------------------------------------------ */

interface ActiveNodeCtx {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  inView: boolean;
}

const ActiveNodeContext = createContext<ActiveNodeCtx>({
  activeId: null,
  setActiveId: () => {},
  inView: false,
});

/**
 * AnimatedIcon — when `active` is true AND the parent section is in view,
 * cycles through `keys` on a 1.2s loop with a smooth crossfade.
 * Otherwise renders the first icon, static.
 */
function AnimatedIcon({ keys, active, color }: { keys: string[]; active: boolean; color: string }) {
  const [idx, setIdx] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!active || reduced || keys.length <= 1) {
      setIdx(0);
      return;
    }
    const iv = setInterval(() => setIdx((i) => (i + 1) % keys.length), 1200);
    return () => clearInterval(iv);
  }, [active, reduced, keys.length]);

  return (
    <div style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={idx}
          initial={{ opacity: 0, scale: 0.7, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.7, rotate: 8 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "flex" }}
        >
          {ICONS[keys[idx]] ?? ICONS[keys[0]]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Corner handle — small square like design-tool selection             */
/* ------------------------------------------------------------------ */
function CornerHandle({ top, left, right, bottom, color }: { top?: boolean; left?: boolean; right?: boolean; bottom?: boolean; color: string }) {
  const sz = C.handleSize;
  return (
    <div
      style={{
        position: "absolute",
        width: sz,
        height: sz,
        border: `1.5px solid ${color}`,
        background: C.bg,
        ...(top !== undefined && { top: -sz / 2 }),
        ...(bottom !== undefined && { bottom: -sz / 2 }),
        ...(left !== undefined && { left: -sz / 2 }),
        ...(right !== undefined && { right: -sz / 2 }),
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Custom node — Cloudflare outer frame + inner icon card              */
/* ------------------------------------------------------------------ */
interface FlowNodeData {
  id: string;
  label: string;
  iconKey: string;
  colorIdx: number;
  groupLabel?: string;
  [key: string]: unknown;
}

function DiagramNode({ data }: { data: FlowNodeData }) {
  const p = PALETTE[data.colorIdx % PALETTE.length];
  const { activeId, setActiveId, inView } = useContext(ActiveNodeContext);
  const isActive = activeId === data.id;
  const [hovering, setHovering] = useState(false);
  // V7 styling: subtle border, soft tint, no neon glow.
  // Custom per-icon animation (see AutomationDiagramIcons.tsx) replaces icon-swap.
  const AnimComp = ICON_ANIMATIONS[data.iconKey];

  return (
    <div
      style={{ position: "relative", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center" }}
      onClick={(e) => {
        e.stopPropagation();
        setActiveId(isActive ? null : data.id);
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* ── Group label above frame ── */}
      {data.groupLabel && (
        <div
          style={{
            position: "absolute",
            top: -20,
            left: 0,
            width: "100%",
            textAlign: "center",
            fontSize: 9,
            fontWeight: 600,
            fontFamily: "'DM Mono', monospace",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: p.text,
            opacity: 0.85,
            pointerEvents: "none",
          }}
        >
          {data.groupLabel}
        </div>
      )}

      {/* ── Square card — V7 vibe: subtle border, soft tint, no neon glow ── */}
      <div
        style={{
          position: "relative",
          width: 90, height: 90,                       // ~10% smaller than before (was 92 effective)
          borderRadius: 14,
          padding: 0,
          background: isActive ? p.inner : (hovering ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.025)"),
          border: `1px solid ${isActive ? p.border : (hovering ? p.borderMuted : "rgba(255,255,255,0.08)")}`,
          transition: "background 0.25s ease, border-color 0.25s ease, transform 0.2s ease, box-shadow 0.25s ease",
          // Subtle elevated shadow on hover/active — no neon glow
          boxShadow: isActive
            ? `0 8px 24px rgba(0,0,0,0.25), 0 0 0 1px ${p.borderMuted} inset`
            : hovering
              ? "0 6px 18px rgba(0,0,0,0.20)"
              : "0 2px 8px rgba(0,0,0,0.10)",
          transform: hovering && !isActive ? "translateY(-2px)" : "translateY(0)",
          opacity: activeId && !isActive ? 0.5 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: p.text,
          margin: "0 auto",
        }}
      >
        {/* Inner soft tinted square holding the animated icon */}
        <div
          style={{
            width: 56, height: 56,
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 10,
            background: isActive ? p.inner : "transparent",
            border: `1px solid ${isActive ? p.borderMuted : "rgba(255,255,255,0.05)"}`,
            transition: "background 0.25s ease, border-color 0.25s ease",
          }}
        >
          {AnimComp ? <AnimComp color={p.text} active={isActive && inView} /> : null}
        </div>
      </div>

      {/* ── Label below ── */}
      <div
        style={{
          marginTop: 8,
          textAlign: "center",
          fontSize: 11,
          fontWeight: 500,
          color: "rgba(255,255,255,0.5)",
          fontFamily: "'DM Mono', monospace",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {data.label}
      </div>

      {/* Hidden handles for React Flow edges */}
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top} id="top" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes: NodeTypes = { diagram: DiagramNode } as unknown as NodeTypes;

/* ------------------------------------------------------------------ */
/*  Edge helper                                                        */
/* ------------------------------------------------------------------ */
function makeEdge(
  id: string,
  source: string,
  target: string,
  _colorIdx: number,
  srcHandle?: string,
  tgtHandle?: string,
): Edge {
  return {
    id,
    source,
    target,
    sourceHandle: srcHandle || null,
    targetHandle: tgtHandle || null,
    type: "smoothstep",
    animated: true,
    style: {
      stroke: "rgba(255,255,255,0.3)",
      strokeWidth: 1.5,
      strokeDasharray: "6 4",
    },
  } as Edge;
}

/* ------------------------------------------------------------------ */
/*  Layout builder — responsive node positions                         */
/* ------------------------------------------------------------------ */
interface NodeDef {
  id: string;
  label: string;
  iconKey: string;
  colorIdx: number;
  groupLabel: string;
}

function buildTabData(
  items: NodeDef[],
  layout: "mobile" | "tablet" | "desktop",
): { nodes: Node[]; edges: Edge[] } {
  // Match the actual rendered square size (90px) so centering math stays honest.
  const nodeWidth = 100;

  const nodes: Node[] = items.map((item, i) => {
    let x: number, y: number;
    if (layout === "mobile") {
      // 2×2 grid centered
      const col = i % 2;
      const row = Math.floor(i / 2);
      x = col * 190 + 20;
      y = row * 180 + 30;
    } else if (layout === "tablet") {
      // 4 nodes centered in ~800px container
      const gap = 60;
      const totalWidth = 4 * nodeWidth + 3 * gap;
      const startX = (800 - totalWidth) / 2;
      x = startX + i * (nodeWidth + gap);
      y = 50;
    } else {
      // Desktop: 4 nodes centered in ~1200px container
      const gap = 100;
      const totalWidth = 4 * nodeWidth + 3 * gap;
      const startX = (1200 - totalWidth) / 2;
      x = startX + i * (nodeWidth + gap);
      y = 50;
    }
    return {
      id: item.id,
      type: "diagram",
      position: { x, y },
      data: {
        id: item.id,
        label: item.label,
        iconKey: item.iconKey,
        colorIdx: item.colorIdx,
        groupLabel: item.groupLabel,
      },
      draggable: false,
      width: nodeWidth,
    };
  });

  let edges: Edge[];
  if (layout === "mobile") {
    // Z-pattern: 0→1 (right), 1→2 (diagonal down-left), 2→3 (right)
    edges = [
      makeEdge("e0", items[0].id, items[1].id, items[0].colorIdx),
      makeEdge("e1", items[1].id, items[2].id, items[1].colorIdx, "bottom", "top"),
      makeEdge("e2", items[2].id, items[3].id, items[2].colorIdx),
    ];
  } else {
    edges = items.slice(0, -1).map((item, i) =>
      makeEdge(`e${i}`, item.id, items[i + 1].id, item.colorIdx)
    );
  }

  return { nodes, edges };
}

/* ------------------------------------------------------------------ */
/*  Per-tab node definitions                                           */
/* ------------------------------------------------------------------ */
const TAB_NODES: Record<TabKey, NodeDef[]> = {
  calls: [
    { id: "c1", label: "Missed Call",        iconKey: "missed-call",   colorIdx: 0, groupLabel: "Trigger" },
    { id: "c2", label: "Instant Reply",      iconKey: "instant-reply", colorIdx: 1, groupLabel: "Reply" },
    { id: "c3", label: "Lead Captured",      iconKey: "lead-captured", colorIdx: 2, groupLabel: "Lead" },
    { id: "c4", label: "Callback Scheduled", iconKey: "callback",      colorIdx: 3, groupLabel: "Callback" },
  ],
  quotes: [
    { id: "q1", label: "Service Selected",   iconKey: "service",       colorIdx: 0, groupLabel: "Input" },
    { id: "q2", label: "Job Details",        iconKey: "job-details",   colorIdx: 1, groupLabel: "Estimate" },
    { id: "q3", label: "Price Generated",    iconKey: "price",         colorIdx: 2, groupLabel: "Engine" },
    { id: "q4", label: "Quote Delivered",    iconKey: "quote-sent",    colorIdx: 3, groupLabel: "Delivery" },
  ],
  reviews: [
    { id: "r1", label: "Job Completed",      iconKey: "job-complete",  colorIdx: 0, groupLabel: "Job Done" },
    { id: "r2", label: "Request Sent",       iconKey: "request-sent",  colorIdx: 1, groupLabel: "Request" },
    { id: "r3", label: "5-Star Review",      iconKey: "five-star",     colorIdx: 2, groupLabel: "Review" },
    { id: "r4", label: "Ranking Improves",   iconKey: "ranking-up",    colorIdx: 3, groupLabel: "Rating" },
  ],
  visibility: [
    { id: "v1", label: "Profile Updated",    iconKey: "profile",       colorIdx: 0, groupLabel: "Profile" },
    { id: "v2", label: "Reviews Grow",       iconKey: "reviews-grow",  colorIdx: 1, groupLabel: "Reviews" },
    { id: "v3", label: "Maps Visibility",    iconKey: "maps",          colorIdx: 2, groupLabel: "Ranking" },
    { id: "v4", label: "More Calls",         iconKey: "more-calls",    colorIdx: 3, groupLabel: "Calls" },
  ],
};

/* ------------------------------------------------------------------ */
/*  CSS — animated flowing dashes, scrollbar hiding, pane cursors      */
/* ------------------------------------------------------------------ */
const DIAGRAM_CSS = `
.ad-diagram .react-flow__edge path.react-flow__edge-path {
  stroke-dasharray: 6 4 !important;
  animation: adDashFlow 1.6s linear infinite;
}
@keyframes adDashFlow {
  to { stroke-dashoffset: -28; }
}
.ad-diagram .react-flow__attribution { display: none !important; }
.ad-diagram .react-flow__pane { cursor: grab; }
.ad-diagram .react-flow__pane:active { cursor: grabbing; }
.ad-diagram .react-flow__node { transition: none; }

/* Tab scroll — mobile horizontal, hidden scrollbar */
.ad-tab-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.ad-tab-scroll::-webkit-scrollbar { display: none; }
`;

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function AutomationDiagram() {
  const [activeTab, setActiveTab] = useState<TabKey>("calls");
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const { isMobile, isTablet } = useBreakpoint();
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { margin: "-10% 0px" });

  // Reset the active node when the tab changes (don't carry over).
  useEffect(() => {
    setActiveNodeId(null);
  }, [activeTab]);

  // Auto-pause when the section scrolls out of view (per user request:
  // "Icons stop moving when not in sight").
  // No need to clear activeNodeId — AnimatedIcon already gates on `inView`.

  const layout = isMobile ? "mobile" : isTablet ? "tablet" : "desktop";
  const { nodes, edges } = buildTabData(TAB_NODES[activeTab], layout);
  const activeTabDef = TABS.find((t) => t.key === activeTab)!;

  // Center the active tab horizontally inside the tab-scroller (mobile).
  // Use container.scrollTo, NOT element.scrollIntoView — the latter scrolls
  // the page vertically when the diagram is below the fold (e.g., on home),
  // causing an auto-scroll-to-mid-page bug on initial load. We also skip the
  // very first render: the initial tab is already correct, no movement needed.
  const firstTabAutoScroll = useRef(true);
  useEffect(() => {
    if (firstTabAutoScroll.current) { firstTabAutoScroll.current = false; return; }
    const container = tabScrollRef.current;
    if (!container) return;
    const el = container.querySelector("[data-active='true']") as HTMLElement | null;
    if (!el) return;
    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const targetLeft =
      container.scrollLeft + (elRect.left - containerRect.left) - (containerRect.width / 2) + (elRect.width / 2);
    container.scrollTo({ left: targetLeft, behavior: "smooth" });
  }, [activeTab]);

  const onNodeClick = useCallback((_: React.MouseEvent, _node: Node) => {
    // No-op: registered so React Flow keeps nodes interactive; click telemetry not wired yet.
  }, []);

  const defaultViewport = { x: 0, y: 0, zoom: 1.1 };

  const canvasHeight = isMobile ? 460 : isTablet ? 420 : 420;

  return (
    <ActiveNodeContext.Provider value={{ activeId: activeNodeId, setActiveId: setActiveNodeId, inView }}>
    <section
      ref={sectionRef}
      className="ad-diagram"
      style={{
        background: C.bg,
        padding: isMobile ? "64px 0" : "96px 0",
        position: "relative",
        overflow: "hidden",
        zIndex: 8,
        borderRadius: "28px 28px 0 0",
        marginTop: -28,
      }}
    >
      <style>{DIAGRAM_CSS}</style>

      {/* ── Heading ──
       *
       * Wave L H4 — rewritten. The old copy ("Every automation flows through
       * a simple pipeline. Drag the canvas to explore.") was abstract and
       * design-speak; it didn't tell anyone what the product DOES or how fast.
       * New copy leads with the outcome (calls answered, quotes sent, reviews
       * collected, rankings climbed) and anchors the speed claim explicitly.
       *
       * TODO(post-launch): the canvas itself still leads with abstract icons;
       * a tougher rewrite would replace it with a live mini-widget builder
       * OR a finished calculator with the lead-capture flow inline. That's
       * a bigger lift — booked for a later wave so we don't risk the launch.
       */}
      <div style={{ textAlign: "center", marginBottom: 24, padding: "0 20px" }}>
        <h2
          style={{
            fontSize: "clamp(26px, 3.5vw, 42px)",
            fontWeight: 700,
            color: C.text,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            marginBottom: 10,
            opacity: 1,
          }}
        >
          Four flows. <span style={{ color: C.accent }}>Done in under 5 min.</span>
        </h2>
        <p
          style={{
            fontSize: isMobile ? 15 : 17,
            color: C.textMuted,
            lineHeight: 1.6,
            maxWidth: 540,
            margin: "0 auto",
            opacity: 1,
          }}
        >
          Calls answered. Quotes sent. Reviews collected. Rankings climbed. Pick a flow and watch it run.
        </p>
      </div>

      {/* ── Canvas board (with floating tab bar) ── */}
      <div
        style={{
          width: "calc(100% - 32px)",
          maxWidth: 1200,
          minHeight: 420,
          height: canvasHeight,
          margin: "0 auto",
          borderRadius: 16,
          border: `1px solid rgba(255,255,255,0.08)`,
          background: "#0d1514",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* ── Floating pill tab bar ── */}
        <div
          ref={tabScrollRef}
          className="ad-tab-scroll"
          style={{
            position: "absolute",
            top: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            maxWidth: "calc(100% - 48px)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              gap: 2,
              padding: 4,
              borderRadius: 999,
              border: `1px solid rgba(255,255,255,0.10)`,
              background: "rgba(13, 21, 20, 0.85)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              flexShrink: 0,
            }}
          >
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  data-active={active}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 18px",
                    borderRadius: 999,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    fontFamily: "'Space Grotesk', 'DM Sans', system-ui, sans-serif",
                    letterSpacing: "0.01em",
                    transition: "all 0.2s ease",
                    background: active ? "#0d3cfc" : "transparent",
                    color: active ? "#0d1514" : "rgba(255,255,255,0.5)",
                    boxShadow: "none",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", fontSize: 14, verticalAlign: "middle" }}>{tab.tabIcon}</span>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <ReactFlow
          key={`${activeTab}-${layout}`}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          defaultViewport={defaultViewport}
          nodesDraggable={false}
          panOnDrag={true}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          minZoom={0.35}
          maxZoom={2.5}
          fitView={true}
          fitViewOptions={{ padding: 0.15, includeHiddenNodes: false }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.2}
            color="rgba(255,255,255,0.15)"
          />
        </ReactFlow>
      </div>

      {/* ── Explanation copy below canvas ── */}
      <div style={{ textAlign: "center", marginTop: 28, padding: "0 24px" }}>
        <p
          style={{
            fontSize: isMobile ? 15 : 16,
            fontWeight: 500,
            color: C.text,
            maxWidth: 560,
            margin: "0 auto 10px",
            lineHeight: 1.6,
          }}
        >
          {activeTabDef.description}
        </p>
        <p
          style={{
            fontSize: 14,
            color: C.textMuted,
            fontStyle: "italic",
            maxWidth: 520,
            margin: "0 auto",
            lineHeight: 1.55,
          }}
        >
          {activeTabDef.quote}
        </p>
      </div>
    </section>
    </ActiveNodeContext.Provider>
  );
}
