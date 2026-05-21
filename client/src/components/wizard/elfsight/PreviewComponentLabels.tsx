// PreviewComponentLabels — Wave AO-4.
//
// Overlays small "design-mode" labels on top of each meaningful component
// in the rendered AdvancedCalculator preview. Labels show the component's
// name the way it appears in the wizard's configuration (e.g. "Title",
// "Field: Roof Size", "Results panel", "CTA button") so users immediately
// know which preview region maps to which setting.
//
// CRITICAL: This component is mounted ONLY from the wizard editor's
// PreviewPane. The live customer-facing widget (rendered from
// `client/src/components/quote-widget/*` without the wizard wrapper)
// never imports this file, so no labels leak into the public widget.
//
// Implementation:
//  - Reads `[data-component-name]` attributes from the rendered calculator.
//  - Positions a small floating label at the top-left of each matched node.
//  - Re-measures on resize / scroll / DOM mutations (same pattern as
//    PreviewOverlay).
//  - The label markup is `pointer-events: none` so it never blocks the
//    real controls underneath (sliders, dropdowns, etc.).

import { useLayoutEffect, useRef, useState } from 'react';
import {
  Type, Heading, Image as ImageIcon, Sliders, MousePointerClick,
  LayoutPanelTop, LayoutList, Receipt, Box, Tag,
  type LucideIcon,
} from 'lucide-react';

interface Props {
  /**
   * Container the AdvancedCalculator is rendered inside. The overlay
   * attaches inside this container and measurements are relative to it.
   */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface LabelBox {
  key: string;
  name: string;
  type: string;
  left: number;
  top: number;
}

/** Pick a Lucide icon for each `data-component-type`. */
function iconFor(type: string): LucideIcon {
  if (type === 'title') return Type;
  if (type === 'subtitle') return Heading;
  if (type === 'header') return LayoutPanelTop;
  if (type === 'logo') return ImageIcon;
  if (type === 'body') return Box;
  if (type === 'fields-section') return LayoutList;
  if (type === 'results') return Receipt;
  if (type === 'cta') return MousePointerClick;
  if (type.startsWith('field-slider')) return Sliders;
  if (type.startsWith('field-')) return Tag;
  return Tag;
}

/** Read every `[data-component-name]` node and produce label positions. */
function measureLabels(container: HTMLElement): LabelBox[] {
  const nodes = container.querySelectorAll<HTMLElement>('[data-component-name]');
  if (nodes.length === 0) return [];
  const containerRect = container.getBoundingClientRect();
  const out: LabelBox[] = [];
  nodes.forEach((node, idx) => {
    const name = node.getAttribute('data-component-name') || '';
    const type = node.getAttribute('data-component-type') || '';
    if (!name) return;
    const r = node.getBoundingClientRect();
    // Skip zero-size nodes (display:none, not laid out yet).
    if (r.width === 0 && r.height === 0) return;
    out.push({
      key: `${type}-${idx}-${name}`,
      name,
      type,
      left: r.left - containerRect.left,
      top: r.top - containerRect.top,
    });
  });
  return out;
}

export default function PreviewComponentLabels({ containerRef }: Props) {
  const [boxes, setBoxes] = useState<LabelBox[]>([]);
  const rafRef = useRef<number | null>(null);
  const selfRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current ?? selfRef.current?.parentElement ?? null;
    if (!container) return;
    const update = () => {
      setBoxes(measureLabels(container));
    };
    update();
    const r1 = requestAnimationFrame(update);
    const r2 = requestAnimationFrame(() => requestAnimationFrame(update));

    const ro = new ResizeObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    });
    ro.observe(container);

    const mo = new MutationObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    });
    mo.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-component-name'] });

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };
    container.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      mo.disconnect();
      container.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [containerRef]);

  return (
    <div
      ref={selfRef}
      className="qq-preview-component-labels"
      aria-hidden="true"
      data-testid="preview-component-labels"
    >
      {boxes.map((b) => {
        const Icon = iconFor(b.type);
        return (
          <span
            key={b.key}
            className="qq-preview-component-label"
            style={{ left: b.left, top: b.top }}
            data-component-label-for={b.name}
          >
            <Icon size={9} strokeWidth={2.4} color="#ffffff" />
            <span>{b.name}</span>
          </span>
        );
      })}
      <style>{`
        .qq-preview-component-labels {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 4;
        }
        .qq-preview-component-label {
          position: absolute;
          transform: translateY(-100%);
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 2px 5px;
          font-size: 10px;
          font-weight: 600;
          line-height: 1.1;
          color: #ffffff;
          background: rgba(15, 23, 42, 0.5);
          border-radius: 4px;
          white-space: nowrap;
          letter-spacing: 0.01em;
          pointer-events: none;
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </div>
  );
}
