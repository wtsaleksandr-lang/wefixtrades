import { useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  type NodeTypes,
  Position,
  Handle,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { mkt } from "@/theme/tokens";

/* ------------------------------------------------------------------ */
/*  Theme colours                                                      */
/* ------------------------------------------------------------------ */
const C = {
  bg: "#111618",
  nodeBg: "rgba(24,29,31,0.92)",
  nodeBorder: "rgba(102,232,250,0.25)",
  nodeBorderMuted: "rgba(255,255,255,0.10)",
  groupBorder: "rgba(102,232,250,0.18)",
  groupBg: "rgba(102,232,250,0.04)",
  accent: mkt.accent,      // #66E8FA
  accentGlow: mkt.accentGlow,
  text: mkt.text,
  textMuted: mkt.textMuted,
  orange: "#F7B430",
  orangeBorder: "rgba(247,180,48,0.30)",
  orangeBg: "rgba(247,180,48,0.06)",
  pink: "#E879F9",
  pinkBorder: "rgba(232,121,249,0.30)",
  pinkBg: "rgba(232,121,249,0.06)",
  green: "#4ADE80",
  greenBorder: "rgba(74,222,128,0.30)",
  greenBg: "rgba(74,222,128,0.06)",
};

/* ------------------------------------------------------------------ */
/*  Tab definitions                                                    */
/* ------------------------------------------------------------------ */
type TabKey = "calls" | "quotes" | "reviews" | "visibility";

interface TabDef {
  key: TabKey;
  label: string;
  icon: string;
  description: string;
  quote: string;
}

const TABS: TabDef[] = [
  {
    key: "calls",
    label: "Calls",
    icon: "📞",
    description:
      "Never lose a lead again — missed calls trigger instant automated replies that keep the conversation going.",
    quote:
      '"We used to lose 40% of leads from missed calls. Now every single one gets a reply within seconds."',
  },
  {
    key: "quotes",
    label: "Quotes",
    icon: "📋",
    description:
      "Visitors describe their job, get an instant price range, and receive a professional quote — all automated.",
    quote:
      '"Our quoting time dropped from 2 hours to 2 minutes. Customers love the instant response."',
  },
  {
    key: "reviews",
    label: "Reviews",
    icon: "⭐",
    description:
      "After every completed job, automated review requests go out — building your reputation on autopilot.",
    quote:
      '"We went from 12 reviews to over 200 in six months without lifting a finger."',
  },
  {
    key: "visibility",
    label: "Visibility",
    icon: "📍",
    description:
      "Keep your profile fresh, collect reviews, and climb Google Maps rankings automatically.",
    quote:
      '"We now show up in the top 3 on Google Maps for every service we offer."',
  },
];

/* ------------------------------------------------------------------ */
/*  Custom node component                                              */
/* ------------------------------------------------------------------ */
interface FlowNodeData {
  label: string;
  icon: string;
  color?: string;
  borderColor?: string;
  group?: boolean;
  groupLabel?: string;
  [key: string]: unknown;
}

function DiagramNode({ data }: { data: FlowNodeData }) {
  if (data.group) {
    return (
      <div
        style={{
          border: `1.5px dashed ${data.borderColor || C.groupBorder}`,
          borderRadius: 14,
          background: data.color || C.groupBg,
          padding: "12px 16px",
          minWidth: 120,
          minHeight: 70,
          position: "relative",
        }}
      >
        {data.groupLabel && (
          <span
            style={{
              position: "absolute",
              top: -10,
              left: 14,
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "'DM Mono', monospace",
              letterSpacing: "0.06em",
              color: data.borderColor || C.accent,
              background: C.bg,
              padding: "0 6px",
              textTransform: "uppercase",
            }}
          >
            {data.groupLabel}
          </span>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingTop: 4,
          }}
        >
          <span style={{ fontSize: 22 }}>{data.icon}</span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: C.text,
              fontFamily: "'DM Mono', monospace",
              whiteSpace: "nowrap",
            }}
          >
            {data.label}
          </span>
        </div>
        <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      </div>
    );
  }

  return (
    <div
      style={{
        background: C.nodeBg,
        border: `1.5px solid ${data.borderColor || C.nodeBorder}`,
        borderRadius: 12,
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
        boxShadow: `0 0 20px ${C.accentGlow}`,
        minWidth: 140,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 0 32px ${C.accentGlow}, 0 0 60px rgba(102,232,250,0.10)`;
        e.currentTarget.style.borderColor = C.accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `0 0 20px ${C.accentGlow}`;
        e.currentTarget.style.borderColor = data.borderColor || C.nodeBorder;
      }}
    >
      <span style={{ fontSize: 24 }}>{data.icon}</span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: C.text,
          fontFamily: "'DM Mono', monospace",
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
        }}
      >
        {data.label}
      </span>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  diagram: DiagramNode,
} as unknown as NodeTypes;

/* ------------------------------------------------------------------ */
/*  Edge style helper                                                  */
/* ------------------------------------------------------------------ */
function makeEdge(
  id: string,
  source: string,
  target: string,
  animated = true
): Edge {
  return {
    id,
    source,
    target,
    type: "smoothstep",
    animated,
    style: {
      stroke: C.accent,
      strokeWidth: 1.5,
      strokeDasharray: "6 4",
      opacity: 0.5,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Tab data — nodes & edges per tab                                   */
/* ------------------------------------------------------------------ */
const X_START = 0;
const X_GAP = 300;
const Y_CENTER = 120;

function tabNodes(
  items: { id: string; label: string; icon: string; color?: string; borderColor?: string; group?: boolean; groupLabel?: string }[]
): Node[] {
  return items.map((item, i) => ({
    id: item.id,
    type: "diagram",
    position: { x: X_START + i * X_GAP, y: Y_CENTER },
    data: {
      label: item.label,
      icon: item.icon,
      color: item.color,
      borderColor: item.borderColor,
      group: item.group,
      groupLabel: item.groupLabel,
    },
    draggable: true,
  }));
}

const TAB_DATA: Record<TabKey, { nodes: Node[]; edges: Edge[] }> = {
  calls: {
    nodes: tabNodes([
      { id: "c1", label: "Missed Call", icon: "📵", borderColor: C.orangeBorder, group: true, groupLabel: "Trigger", color: C.orangeBg },
      { id: "c2", label: "Instant Reply", icon: "💬" },
      { id: "c3", label: "Lead Captured", icon: "🎯", borderColor: C.greenBorder, group: true, groupLabel: "CRM", color: C.greenBg },
      { id: "c4", label: "Callback Scheduled", icon: "📅", borderColor: C.pinkBorder, group: true, groupLabel: "Calendar", color: C.pinkBg },
    ]),
    edges: [
      makeEdge("ce1", "c1", "c2"),
      makeEdge("ce2", "c2", "c3"),
      makeEdge("ce3", "c3", "c4"),
    ],
  },
  quotes: {
    nodes: tabNodes([
      { id: "q1", label: "Service Selected", icon: "🔧", borderColor: C.orangeBorder, group: true, groupLabel: "Visitor", color: C.orangeBg },
      { id: "q2", label: "Job Details Entered", icon: "📝" },
      { id: "q3", label: "Price Generated", icon: "💰", borderColor: C.greenBorder, group: true, groupLabel: "Engine", color: C.greenBg },
      { id: "q4", label: "Quote Delivered", icon: "📨", borderColor: C.pinkBorder, group: true, groupLabel: "Output", color: C.pinkBg },
    ]),
    edges: [
      makeEdge("qe1", "q1", "q2"),
      makeEdge("qe2", "q2", "q3"),
      makeEdge("qe3", "q3", "q4"),
    ],
  },
  reviews: {
    nodes: tabNodes([
      { id: "r1", label: "Job Completed", icon: "✅", borderColor: C.orangeBorder, group: true, groupLabel: "Trigger", color: C.orangeBg },
      { id: "r2", label: "Request Sent", icon: "📩" },
      { id: "r3", label: "5-Star Review", icon: "⭐", borderColor: C.greenBorder, group: true, groupLabel: "Google", color: C.greenBg },
      { id: "r4", label: "Ranking Improves", icon: "📈", borderColor: C.pinkBorder, group: true, groupLabel: "Result", color: C.pinkBg },
    ]),
    edges: [
      makeEdge("re1", "r1", "r2"),
      makeEdge("re2", "r2", "r3"),
      makeEdge("re3", "r3", "r4"),
    ],
  },
  visibility: {
    nodes: tabNodes([
      { id: "v1", label: "Profile Updated", icon: "👤", borderColor: C.orangeBorder, group: true, groupLabel: "Profile", color: C.orangeBg },
      { id: "v2", label: "Reviews Grow", icon: "📊" },
      { id: "v3", label: "Maps Visibility", icon: "🗺️", borderColor: C.greenBorder, group: true, groupLabel: "Google Maps", color: C.greenBg },
      { id: "v4", label: "More Calls", icon: "📞", borderColor: C.pinkBorder, group: true, groupLabel: "Result", color: C.pinkBg },
    ]),
    edges: [
      makeEdge("ve1", "v1", "v2"),
      makeEdge("ve2", "v2", "v3"),
      makeEdge("ve3", "v3", "v4"),
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  CSS for animated edge dashes                                       */
/* ------------------------------------------------------------------ */
const DIAGRAM_CSS = `
.automation-diagram .react-flow__edge path.react-flow__edge-path {
  stroke-dasharray: 6 4 !important;
  animation: dashFlow 1.2s linear infinite;
}
@keyframes dashFlow {
  to { stroke-dashoffset: -20; }
}
.automation-diagram .react-flow__attribution {
  display: none !important;
}
.automation-diagram .react-flow__pane {
  cursor: grab;
}
.automation-diagram .react-flow__pane:active {
  cursor: grabbing;
}
.automation-diagram .react-flow__background pattern line {
  stroke: rgba(102,232,250,0.06) !important;
}
`;

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function AutomationDiagram() {
  const [activeTab, setActiveTab] = useState<TabKey>("calls");
  const { nodes, edges } = TAB_DATA[activeTab];

  const defaultViewport = useMemo(() => ({ x: 60, y: 40, zoom: 0.92 }), []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    console.log("Node clicked:", node.id, node.data);
  }, []);

  return (
    <section
      className="automation-diagram"
      style={{
        background: C.bg,
        padding: "80px 0",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{DIAGRAM_CSS}</style>

      {/* Section heading */}
      <div style={{ textAlign: "center", marginBottom: 40, padding: "0 24px" }}>
        <h2
          data-reveal="fade-up"
          style={{
            fontSize: "clamp(28px, 3.5vw, 42px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            marginBottom: 16,
          }}
        >
          See how it <span style={{ color: mkt.accent }}>works</span>
        </h2>
        <p
          data-reveal="fade-up"
          style={{
            fontSize: 17,
            color: mkt.textMuted,
            lineHeight: 1.65,
            maxWidth: 520,
            margin: "0 auto",
          }}
        >
          Every automation flows through a simple pipeline. Drag the canvas to
          explore.
        </p>
      </div>

      {/* Pill tabs */}
      <div
        data-reveal="fade-up"
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: 32,
          padding: "0 16px",
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
          }}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 20px",
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
                  boxShadow: active
                    ? `0 2px 12px ${C.accentGlow}`
                    : "none",
                }}
              >
                <span style={{ fontSize: 15 }}>{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Description + quote */}
      <div style={{ textAlign: "center", marginBottom: 24, padding: "0 24px" }}>
        <p
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: C.text,
            maxWidth: 600,
            margin: "0 auto 12px",
            lineHeight: 1.6,
          }}
        >
          {TABS.find((t) => t.key === activeTab)!.description}
        </p>
        <p
          style={{
            fontSize: 14,
            color: C.textMuted,
            fontStyle: "italic",
            maxWidth: 560,
            margin: "0 auto",
            lineHeight: 1.55,
          }}
        >
          {TABS.find((t) => t.key === activeTab)!.quote}
        </p>
      </div>

      {/* React Flow canvas */}
      <div
        style={{
          width: "100%",
          maxWidth: 1200,
          height: 340,
          margin: "0 auto",
          borderRadius: 20,
          border: `1px solid ${mkt.border}`,
          background: C.bg,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <ReactFlow
          key={activeTab}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          defaultViewport={defaultViewport}
          panOnDrag
          zoomOnScroll={false}
          zoomOnPinch
          zoomOnDoubleClick={false}
          preventScrolling={false}
          minZoom={0.5}
          maxZoom={1.5}
          fitView={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={28} size={1} color="rgba(102,232,250,0.05)" />
        </ReactFlow>
      </div>
    </section>
  );
}
