import { Link } from "wouter";
import {
  WashingMachine, Package, Hammer, Flame, Square, RectangleHorizontal, Grid3x3,
  DoorOpen, LayoutGrid, Zap, Fence, LayoutDashboard, Building, Warehouse, HardHat,
  CloudRain, Wrench, Sparkles, Snowflake, Layers, Trash2, Trees, Key, Biohazard,
  Truck, PaintRoller, Bug, Droplets, Waves, Home, Container, Building2, Sun,
  Grid2x2, TreeDeciduous, Droplet, ShieldCheck, Pipette, AppWindow,
  Phone, MessageCircle, Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AiReceptionist } from "@/data/aiReceptionists";

/**
 * The single, reusable AI-Receptionist template card — one high-converting
 * layout reused for every trade, swapped only by data. Pixel-faithful to the
 * /case-studies StudyCard, plus: a branded-blue thumbnail whose worker pops
 * just proud of the top edge on hover (panel recedes + dims, worker zooms),
 * a per-trade icon badge that merges to just its white icon on card hover,
 * and Call / Chat CTAs that cross-swap colours on hover. Styles live in
 * index.css under `.airx-*` so every interaction uses native `:hover`.
 */

const ICON_MAP: Record<string, LucideIcon> = {
  WashingMachine, Package, Hammer, Flame, Square, RectangleHorizontal, Grid3x3,
  DoorOpen, LayoutGrid, Zap, Fence, LayoutDashboard, Building, Warehouse, HardHat,
  CloudRain, Wrench, Sparkles, Snowflake, Layers, Trash2, Trees, Key, Biohazard,
  Truck, PaintRoller, Bug, Droplets, Waves, Home, Container, Building2, Sun,
  Grid2x2, TreeDeciduous, Droplet, ShieldCheck, Pipette, AppWindow,
  Brick: Building2, // lucide has no "Brick" export
};

export interface AiReceptionistCardProps {
  data: AiReceptionist;
  /** Where "Read more" navigates (the shared public page). */
  readMoreHref: string;
  /** Open the read-more link in a new tab (used inside the portal). */
  readMoreNewTab?: boolean;
  /** Open the Call/Chat preview modal on the given tab. */
  onPreview?: (mode: "voice" | "chat", data: AiReceptionist) => void;
  /** Portal "use this template" action. When set, the primary CTA becomes
   *  "Use this" (configure the customer's TradeLine) instead of "Call". */
  onUse?: (data: AiReceptionist) => void;
  /** Label for the onUse primary CTA. Defaults to "Use this". */
  useLabel?: string;
}

export default function AiReceptionistCard({ data, readMoreHref, readMoreNewTab, onPreview, onUse, useLabel }: AiReceptionistCardProps) {
  const Icon = ICON_MAP[data.icon] ?? Phone;

  return (
    <article className="airx-card">
      <div className="airx-thumb">
        <div className="airx-bg" />
        <div className="airx-badge">
          <Icon size={20} strokeWidth={2} />
        </div>
        <img
          className="airx-ph"
          src={data.illustration}
          alt={`${data.label} AI receptionist`}
          loading="lazy"
        />
      </div>

      <div className="airx-content">
        <div className="airx-tags">
          <span className="airx-tag"><Icon size={12} strokeWidth={2.2} />{data.label}</span>
          <span className="airx-gender">♀ ♂ voices</span>
        </div>

        <h3 className="airx-heading">{data.label} AI Receptionist</h3>

        <div className="airx-feats">
          {data.cardBenefits.map((b, i) => (
            <div key={i} className="airx-feat">
              <Check size={14} strokeWidth={3} />
              <span>{b}</span>
            </div>
          ))}
        </div>

        <div className="airx-foot">{data.trainedLine}</div>

        <div className="airx-cta">
          {onUse ? (
            <button type="button" className="airx-btn airx-call" onClick={() => onUse(data)} aria-label={`Use the ${data.label} AI receptionist`}>
              <Check size={14} strokeWidth={2.6} /> {useLabel ?? "Use this"}
            </button>
          ) : (
            <button type="button" className="airx-btn airx-call" onClick={() => onPreview?.("voice", data)} aria-label={`Call the ${data.label} AI receptionist`}>
              <Phone size={14} strokeWidth={2.2} /> Call
            </button>
          )}
          <button type="button" className="airx-btn airx-chat" onClick={() => onPreview?.("chat", data)} aria-label={`${onUse ? "Preview" : "Chat with"} the ${data.label} AI receptionist`}>
            <MessageCircle size={14} strokeWidth={2.2} /> {onUse ? "Preview" : "Chat"}
          </button>
          <Link
            href={readMoreHref}
            className="airx-readmore"
            {...(readMoreNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            Read more
          </Link>
        </div>
      </div>
    </article>
  );
}
