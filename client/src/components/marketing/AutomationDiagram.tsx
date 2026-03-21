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
function useIsMobileCanvas(bp = 700) {
  const [mobile, setMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < bp : false
  );
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < bp);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [bp]);
  return mobile;
}

/* ------------------------------------------------------------------ */
/*  Cloudflare-style colour palette                                    */
/* ------------------------------------------------------------------ */
const C = {
  bg: "#111618",
  nodeBg: "rgba(17,22,24,0.94)",
  text: mkt.text,
  textMuted: mkt.textMuted,
  accent: mkt.accent,
  accentGlow: mkt.accentGlow,
  // Per-tab accent colours (muted, Cloudflare-like)
  cyan:       { border: "rgba(102,232,250,0.35)", bg: "rgba(102,232,250,0.06)", glow: "rgba(102,232,250,0.12)", text: "#66E8FA", edge: "rgba(102,232,250,0.45)" },
  amber:      { border: "rgba(247,180,48,0.35)",  bg: "rgba(247,180,48,0.06)",  glow: "rgba(247,180,48,0.12)",  text: "#F7B430", edge: "rgba(247,180,48,0.45)" },
  green:      { border: "rgba(74,222,128,0.35)",   bg: "rgba(74,222,128,0.06)",  glow: "rgba(74,222,128,0.12)",  text: "#4ADE80", edge: "rgba(74,222,128,0.45)" },
  magenta:    { border: "rgba(192,132,252,0.35)",  bg: "rgba(192,132,252,0.06)", glow: "rgba(192,132,252,0.12)", text: "#C084FC", edge: "rgba(192,132,252,0.45)" },
};

/* Distinct node accent per position in pipeline */
type ColorSet = typeof C.cyan;

const PIPELINE_COLOURS: ColorSet[] = [C.cyan, C.amber, C.green, C.magenta];

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

const ICON_PROPS = { size: 18, strokeWidth: 1.6 } as const;

const TABS: TabDef[] = [
  {
    key: "calls",
    label: "Calls",
    tabIcon: <PhoneCall {...ICON_PROPS} />,
    description: "Never lose a lead again — missed calls trigger instant automated replies that keep the conversation going.",
    quote: '"We used to lose 40% of leads from missed calls. Now every single one gets a reply within seconds."',
  },
  {
    key: "quotes",
    label: "Quotes",
    tabIcon: <Calculator {...ICON_PROPS} />,
    description: "Visitors describe their job, get an instant price range, and receive a professional quote — all automated.",
    quote: '"Our quoting time dropped from 2 hours to 2 minutes. Customers love the instant response."',
  },
  {
    key: "reviews",
    label: "Reviews",
    tabIcon: <Star {...ICON_PROPS} />,
    description: "After every completed job, automated review requests go out — building your reputation on autopilot.",
    quote: '"We went from 12 reviews to over 200 in six months without lifting a finger."',
  },
  {
    key: "visibility",
    label: "Visibility",
    tabIcon: <MapPin {...ICON_PROPS} />,
    description: "Keep your profile fresh, collect reviews, and climb Google Maps rankings automatically.",
    quote: '"We now show up in the top 3 on Google Maps for every service we offer."',
  },
];

/* ------------------------------------------------------------------ */
/*  Node icon mapping — Lucide only, no emojis                         */
/* ------------------------------------------------------------------ */
const NODE_ICON_SIZE = 22;
const NODE_ICON_SW = 1.5;

const NODE_ICONS: Record<string, ReactNode> = {
  "missed-call":    <PhoneCall size={NODE_ICON_SIZE} strokeWidth={NODE_ICON_SW} />,
  "instant-reply":  <MessageSquare size={NODE_ICON_SIZE} strokeWidth={NODE_ICON_SW} />,
  "lead-captured":  <UserCheck size={NODE_ICON_SIZE} strokeWidth={NODE_ICON_SW} />,
  "callback":       <CalendarCheck size={NODE_ICON_SIZE} strokeWidth={NODE_ICON_SW} />,
  "service":        <Wrench size={NODE_ICON_SIZE} strokeWidth={NODE_ICON_SW} />,
  "job-details":    <ClipboardList size={NODE_ICON_SIZE} strokeWidth={NODE_ICON_SW} />,
  "price":          <Calculator size={NODE_ICON_SIZE} strokeWidth={NODE_ICON_SW} />,
  "quote-sent":     <Send size={NODE_ICON_SIZE} strokeWidth={NODE_ICON_SW} />,
  "job-complete":   <CheckCircle2 size={NODE_ICON_SIZE} strokeWidth={NODE_ICON_SW} />,
  "request-sent":   <Mail size={NODE_ICON_SIZE} strokeWidth={NODE_ICON_SW} />,
  "five-star":      <Star size={NODE_ICON_SIZE} strokeWidth={NODE_ICON_SW} />,
  "ranking-up":     <TrendingUp size={NODE_ICON_SIZE} strokeWidth={NODE_ICON_SW} />,
  "profile":        <UserCog size={NODE_ICON_SIZE} strokeWidth={NODE_ICON_SW} />,
  "reviews-grow":   <BarChart3 size={NODE_ICON_SIZE} strokeWidth={NODE_ICON_SW} />,
  "maps":           <MapPin size={NODE_ICON_SIZE} strokeWidth={NODE_ICON_SW} />,
  "more-calls":     <Phone size={NODE_ICON_SIZE} strokeWidth={NODE_ICON_SW} />,
};

/* ------------------------------------------------------------------ */
/*  Custom node component (Cloudflare-style)                           */
/* ------------------------------------------------------------------ */
interface FlowNodeData {
  label: string;
  iconKey: string;
  colorIdx: number;
  groupLabel?: string;
  [key: string]: unknown;
}

function DiagramNode({ data }: { data: FlowNodeData }) {
  const palette = PIPELINE_COLOURS[data.colorIdx % PIPELINE_COLOURS.length];
  const icon = NODE_ICONS[data.iconKey];

  return (
    <div
      style={{
        border: `1.5px dashed ${palette.border}`,
        borderRadius: 12,
        background: palette.bg,
        padding: "14px 18px",
        minWidth: 130,
        position: "relative",
        cursor: "pointer",
        transition: "box-shadow 0.25s ease, border-color 0.25s ease",
        boxShadow: `0 0 16px ${palette.glow}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 0 28px ${palette.glow}, 0 0 56px ${palette.glow}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `0 0 16px ${palette.glow}`;
      }}
    >
      {/* Group label badge */}
      {data.groupLabel && (
        <span
          style={{
            position: "absolute",
            top: -9,
            left: 14,
            fontSize: 10,
            fontWeight: 600,
            fontFamily: "'DM Mono', monospace",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: palette.text,
            background: C.bg,
            padding: "1px 7px",
            borderRadius: 4,
          }}
        >
          {data.groupLabel}
        </span>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: data.groupLabel ? 2 : 0 }}>
        <span style={{ color: palette.text, display: "flex", flexShrink: 0 }}>{icon}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: C.text,
            fontFamily: "'DM Mono', monospace",
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
          }}
        >
          {data.label}
        </span>
      </div>

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
  sourceHandle?: string,
  targetHandle?: string,
): Edge {
  const palette = PIPELINE_COLOURS[colorIdx % PIPELINE_COLOURS.length];
  return {
    id,
    source,
    target,
    sourceHandle: sourceHandle || null,
    targetHandle: targetHandle || null,
    type: "smoothstep",
    animated: true,
    style: {
      stroke: palette.edge,
      strokeWidth: 1.5,
      strokeDasharray: "6 4",
    },
  } as Edge;
}

/* ------------------------------------------------------------------ */
/*  Layout helpers — desktop (horizontal) vs mobile (2×2 grid)         */
/* ------------------------------------------------------------------ */
interface NodeDef {
  id: string;
  label: string;
  iconKey: string;
  colorIdx: number;
  groupLabel: string;
}

function buildTabData(items: NodeDef[], isMobile: boolean): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = items.map((item, i) => {
    let x: number, y: number;
    if (isMobile) {
      // 2×2 grid: top-left, top-right, bottom-left, bottom-right
      const col = i % 2;
      const row = Math.floor(i / 2);
      x = col * 240;
      y = row * 140;
    } else {
      // Horizontal row
      x = i * 290;
      y = 80;
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
    };
  });

  let edges: Edge[];
  if (isMobile) {
    // Flow: top-left → top-right → bottom-right → bottom-left (Z-pattern)
    // Sequence: 0→1 (right), 1→3 (down), 2→3 is wrong
    // Actually: 0→1 across top, 1→3 down-right to bottom-right, but we want sequential
    // Let's do: 0→1 (horizontal), 1→2 (1 is top-right, 2 is bottom-left — diagonal via down then left)
    // Better: 0→1 horizontal, 1→(down to row2)→2, 2→3 horizontal
    // 0(top-left)→1(top-right): source right, target left
    // 1(top-right)→2(bottom-left): source bottom, target top
    // 2(bottom-left)→3(bottom-right): source right, target left
    edges = [
      makeEdge(`e0`, items[0].id, items[1].id, items[0].colorIdx),
      makeEdge(`e1`, items[1].id, items[2].id, items[1].colorIdx, "bottom", "top"),
      makeEdge(`e2`, items[2].id, items[3].id, items[2].colorIdx),
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
    { id: "c1", label: "Missed Call",         iconKey: "missed-call",   colorIdx: 0, groupLabel: "Trigger" },
    { id: "c2", label: "Instant Reply",       iconKey: "instant-reply", colorIdx: 1, groupLabel: "Automation" },
    { id: "c3", label: "Lead Captured",       iconKey: "lead-captured", colorIdx: 2, groupLabel: "CRM" },
    { id: "c4", label: "Callback Scheduled",  iconKey: "callback",      colorIdx: 3, groupLabel: "Calendar" },
  ],
  quotes: [
    { id: "q1", label: "Service Selected",    iconKey: "service",       colorIdx: 0, groupLabel: "Visitor" },
    { id: "q2", label: "Job Details",         iconKey: "job-details",   colorIdx: 1, groupLabel: "Form" },
    { id: "q3", label: "Price Generated",     iconKey: "price",         colorIdx: 2, groupLabel: "Engine" },
    { id: "q4", label: "Quote Delivered",     iconKey: "quote-sent",    colorIdx: 3, groupLabel: "Output" },
  ],
  reviews: [
    { id: "r1", label: "Job Completed",       iconKey: "job-complete",  colorIdx: 0, groupLabel: "Trigger" },
    { id: "r2", label: "Request Sent",        iconKey: "request-sent",  colorIdx: 1, groupLabel: "Email" },
    { id: "r3", label: "5-Star Review",       iconKey: "five-star",     colorIdx: 2, groupLabel: "Google" },
    { id: "r4", label: "Ranking Improves",    iconKey: "ranking-up",    colorIdx: 3, groupLabel: "Result" },
  ],
  visibility: [
    { id: "v1", label: "Profile Updated",     iconKey: "profile",       colorIdx: 0, groupLabel: "Profile" },
    { id: "v2", label: "Reviews Grow",        iconKey: "reviews-grow",  colorIdx: 1, groupLabel: "Analytics" },
    { id: "v3", label: "Maps Visibility",     iconKey: "maps",          colorIdx: 2, groupLabel: "Google Maps" },
    { id: "v4", label: "More Calls",          iconKey: "more-calls",    colorIdx: 3, groupLabel: "Result" },
  ],
};

/* ------------------------------------------------------------------ */
/*  CSS — animated flowing dashes, hidden scrollbar for tabs           */
/* ------------------------------------------------------------------ */
const DIAGRAM_CSS = `
.automation-diagram .react-flow__edge path.react-flow__edge-path {
  stroke-dasharray: 8 5 !important;
  animation: dashFlow 1.4s linear infinite;
}
@keyframes dashFlow {
  to { stroke-dashoffset: -26; }
}
.automation-diagram .react-flow__attribution {
  display: none !important;
}
.automation-diagram .react-flow__pane { cursor: grab; }
.automation-diagram .react-flow__pane:active { cursor: grabbing; }

/* Tab row — horizontally scrollable on mobile, hidden scrollbar */
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
  const isMobile = useIsMobileCanvas();
  const tabScrollRef = useRef<HTMLDivElement>(null);

  const { nodes, edges } = buildTabData(TAB_NODES[activeTab], isMobile);
  const activeTabDef = TABS.find((t) => t.key === activeTab)!;

  // Scroll active tab into view on mobile
  useEffect(() => {
    if (!tabScrollRef.current) return;
    const active = tabScrollRef.current.querySelector("[data-active='true']") as HTMLElement | null;
    if (active) {
      active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }, [activeTab]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    console.log("Node clicked:", node.id, node.data);
  }, []);

  const defaultViewport = isMobile
    ? { x: 40, y: 30, zoom: 0.85 }
    : { x: 50, y: 30, zoom: 0.88 };

  return (
    <section
      className="automation-diagram"
      style={{
        background: C.bg,
        padding: isMobile ? "56px 0" : "80px 0",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{DIAGRAM_CSS}</style>

      {/* Section heading */}
      <div style={{ textAlign: "center", marginBottom: 28, padding: "0 20px" }}>
        <h2
          data-reveal="fade-up"
          style={{
            fontSize: "clamp(26px, 3.5vw, 42px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            marginBottom: 12,
          }}
        >
          See how it <span style={{ color: mkt.accent }}>works</span>
        </h2>
        <p
          data-reveal="fade-up"
          style={{
            fontSize: isMobile ? 15 : 17,
            color: mkt.textMuted,
            lineHeight: 1.6,
            maxWidth: 480,
            margin: "0 auto",
          }}
        >
          Every automation flows through a simple pipeline. Drag the canvas to explore.
        </p>
      </div>

      {/* ── Pill tab row (scrollable on mobile) ── */}
      <div
        data-reveal="fade-up"
        ref={tabScrollRef}
        className="ad-tab-scroll"
        style={{
          display: "flex",
          justifyContent: isMobile ? "flex-start" : "center",
          marginBottom: 20,
          padding: isMobile ? "0 16px" : "0 16px",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            gap: 4,
            padding: 4,
            borderRadius: 999,
            border: `1px solid ${mkt.border}`,
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
                  gap: 6,
                  padding: isMobile ? "10px 16px" : "10px 22px",
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "'Space Grotesk', 'DM Sans', system-ui, sans-serif",
                  letterSpacing: "0.01em",
                  transition: "all 0.2s ease",
                  background: active ? mkt.accent : "transparent",
                  color: active ? "#111618" : mkt.textMuted,
                  boxShadow: active ? `0 2px 12px ${C.accentGlow}` : "none",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <span style={{ display: "flex" }}>{tab.tabIcon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── React Flow canvas ── */}
      <div
        style={{
          width: "calc(100% - 32px)",
          maxWidth: 1200,
          height: isMobile ? 360 : 300,
          margin: "0 auto",
          borderRadius: 16,
          border: `1px solid ${mkt.border}`,
          background: C.bg,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <ReactFlow
          key={`${activeTab}-${isMobile}`}
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
          minZoom={0.4}
          maxZoom={2}
          fitView={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="rgba(102,232,250,0.08)"
          />
        </ReactFlow>
      </div>

      {/* ── Description + quote BELOW canvas ── */}
      <div style={{ textAlign: "center", marginTop: 28, padding: "0 24px" }}>
        <p
          style={{
            fontSize: isMobile ? 15 : 16,
            fontWeight: 500,
            color: C.text,
            maxWidth: 580,
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
            maxWidth: 540,
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
