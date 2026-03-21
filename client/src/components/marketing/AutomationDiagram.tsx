import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
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
  MessageSquare,
  UserCheck,
  CalendarCheck,
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
  canvasBg: "#111618",
  nodeSurface: "rgba(14,18,20,0.96)",
  text: mkt.text,
  textMuted: mkt.textMuted,
  accent: mkt.accent,
  accentGlow: mkt.accentGlow,
  handleSize: 6,
  // Per-group accent palettes — muted, premium
  cyan: {
    border: "rgba(102,232,250,0.40)",
    borderMuted: "rgba(102,232,250,0.18)",
    bg: "rgba(102,232,250,0.04)",
    glow: "rgba(102,232,250,0.10)",
    text: "#66E8FA",
    edge: "rgba(102,232,250,0.35)",
    inner: "rgba(102,232,250,0.08)",
    innerBorder: "rgba(102,232,250,0.22)",
  },
  amber: {
    border: "rgba(247,180,48,0.40)",
    borderMuted: "rgba(247,180,48,0.18)",
    bg: "rgba(247,180,48,0.04)",
    glow: "rgba(247,180,48,0.10)",
    text: "#F7B430",
    edge: "rgba(247,180,48,0.35)",
    inner: "rgba(247,180,48,0.08)",
    innerBorder: "rgba(247,180,48,0.22)",
  },
  green: {
    border: "rgba(74,222,128,0.40)",
    borderMuted: "rgba(74,222,128,0.18)",
    bg: "rgba(74,222,128,0.04)",
    glow: "rgba(74,222,128,0.10)",
    text: "#4ADE80",
    edge: "rgba(74,222,128,0.35)",
    inner: "rgba(74,222,128,0.08)",
    innerBorder: "rgba(74,222,128,0.22)",
  },
  magenta: {
    border: "rgba(192,132,252,0.40)",
    borderMuted: "rgba(192,132,252,0.18)",
    bg: "rgba(192,132,252,0.04)",
    glow: "rgba(192,132,252,0.10)",
    text: "#C084FC",
    edge: "rgba(192,132,252,0.35)",
    inner: "rgba(192,132,252,0.08)",
    innerBorder: "rgba(192,132,252,0.22)",
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
const NI = { size: 28, strokeWidth: 1.4 } as const;

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
};

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
  label: string;
  iconKey: string;
  colorIdx: number;
  groupLabel?: string;
  [key: string]: unknown;
}

function DiagramNode({ data }: { data: FlowNodeData }) {
  const p = PALETTE[data.colorIdx % PALETTE.length];
  const icon = ICONS[data.iconKey];

  return (
    <div style={{ position: "relative" }}>
      {/* ── Group label above frame ── */}
      {data.groupLabel && (
        <div
          style={{
            position: "absolute",
            top: -20,
            left: 0,
            width: "100%",
            textAlign: "center",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "'DM Mono', monospace",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: p.text,
            pointerEvents: "none",
          }}
        >
          {data.groupLabel}
        </div>
      )}

      {/* ── Outer selection frame ── */}
      <div
        style={{
          position: "relative",
          border: `1.5px solid ${p.border}`,
          borderRadius: 4,
          padding: 10,
          background: "transparent",
          cursor: "pointer",
          transition: "box-shadow 0.3s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = `0 0 24px ${p.glow}, 0 0 48px ${p.glow}`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        {/* Corner handles */}
        <CornerHandle top left color={p.border} />
        <CornerHandle top right color={p.border} />
        <CornerHandle bottom left color={p.border} />
        <CornerHandle bottom right color={p.border} />

        {/* ── Inner dashed card with icon ── */}
        <div
          style={{
            width: 64,
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1.5px dashed ${p.innerBorder}`,
            borderRadius: 8,
            background: p.inner,
            color: p.text,
          }}
        >
          {icon}
        </div>
      </div>

      {/* ── Label below ── */}
      <div
        style={{
          marginTop: 8,
          textAlign: "center",
          fontSize: 11,
          fontWeight: 500,
          color: C.textMuted,
          fontFamily: "'DM Mono', monospace",
          letterSpacing: "0.02em",
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
  colorIdx: number,
  srcHandle?: string,
  tgtHandle?: string,
): Edge {
  const p = PALETTE[colorIdx % PALETTE.length];
  return {
    id,
    source,
    target,
    sourceHandle: srcHandle || null,
    targetHandle: tgtHandle || null,
    type: "smoothstep",
    animated: true,
    style: {
      stroke: p.edge,
      strokeWidth: 2,
      strokeDasharray: "8 6",
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
  const nodeWidth = 100;

  const nodes: Node[] = items.map((item, i) => {
    let x: number, y: number;
    if (layout === "mobile") {
      // 2×2 grid with generous spacing
      const col = i % 2;
      const row = Math.floor(i / 2);
      x = col * 180;
      y = row * 170;
    } else if (layout === "tablet") {
      x = i * 220;
      y = 50;
    } else {
      x = i * 300;
      y = 50;
    }
    return {
      id: item.id,
      type: "diagram",
      position: { x, y },
      data: {
        label: item.label,
        iconKey: item.iconKey,
        colorIdx: item.colorIdx,
        groupLabel: item.groupLabel,
      },
      draggable: true,
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
  stroke-dasharray: 8 6 !important;
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
  const { isMobile, isTablet } = useBreakpoint();
  const tabScrollRef = useRef<HTMLDivElement>(null);

  const layout = isMobile ? "mobile" : isTablet ? "tablet" : "desktop";
  const { nodes, edges } = buildTabData(TAB_NODES[activeTab], layout);
  const activeTabDef = TABS.find((t) => t.key === activeTab)!;

  // Scroll active tab into view on mobile
  useEffect(() => {
    if (!tabScrollRef.current) return;
    const el = tabScrollRef.current.querySelector("[data-active='true']") as HTMLElement | null;
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeTab]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    console.log("Node clicked:", node.id, node.data);
  }, []);

  const defaultViewport = isMobile
    ? { x: 30, y: 40, zoom: 0.82 }
    : isTablet
      ? { x: 40, y: 30, zoom: 0.82 }
      : { x: 80, y: 20, zoom: 0.9 };

  const canvasHeight = isMobile ? 420 : isTablet ? 320 : 320;

  return (
    <section
      className="ad-diagram"
      style={{
        background: C.bg,
        padding: isMobile ? "48px 0" : "80px 0",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{DIAGRAM_CSS}</style>

      {/* ── Heading ── */}
      <div style={{ textAlign: "center", marginBottom: 24, padding: "0 20px" }}>
        <h2
          style={{
            fontSize: "clamp(26px, 3.5vw, 42px)",
            fontWeight: 700,
            color: C.text,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            marginBottom: 10,
          }}
        >
          See how it <span style={{ color: C.accent }}>works</span>
        </h2>
        <p
          style={{
            fontSize: isMobile ? 15 : 17,
            color: C.textMuted,
            lineHeight: 1.6,
            maxWidth: 460,
            margin: "0 auto",
          }}
        >
          Every automation flows through a simple pipeline. Drag the canvas to explore.
        </p>
      </div>

      {/* ── Pill tab bar ── */}
      <div
        ref={tabScrollRef}
        className="ad-tab-scroll"
        style={{
          display: "flex",
          justifyContent: isMobile ? "flex-start" : "center",
          marginBottom: 16,
          padding: "0 16px",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            gap: 2,
            padding: 4,
            borderRadius: 999,
            border: `1px solid rgba(255,255,255,0.10)`,
            background: "rgba(255,255,255,0.03)",
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
                  gap: 7,
                  padding: isMobile ? "10px 16px" : "10px 24px",
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "'Space Grotesk', 'DM Sans', system-ui, sans-serif",
                  letterSpacing: "0.01em",
                  transition: "all 0.2s ease",
                  background: active ? C.accent : "transparent",
                  color: active ? "#0e1214" : C.textMuted,
                  boxShadow: active ? `0 2px 16px ${C.accentGlow}` : "none",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <span style={{ display: "flex", alignItems: "center" }}>{tab.tabIcon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Canvas board ── */}
      <div
        style={{
          width: "calc(100% - 32px)",
          maxWidth: 1200,
          height: canvasHeight,
          margin: "0 auto",
          borderRadius: 16,
          border: `1px solid rgba(255,255,255,0.08)`,
          background: C.canvasBg,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <ReactFlow
          key={`${activeTab}-${layout}`}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          defaultViewport={defaultViewport}
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          preventScrolling={false}
          minZoom={0.35}
          maxZoom={2.5}
          fitView={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.2}
            color="rgba(102,232,250,0.06)"
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
  );
}
