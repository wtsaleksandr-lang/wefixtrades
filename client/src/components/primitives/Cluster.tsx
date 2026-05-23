/**
 * LAYOUT-3 — Cluster primitive.
 *
 * Horizontal grouping primitive for inline controls (button rows, header
 * action slots, chip groups). Encodes the 4 / 8 / 16 px gap scale and
 * forces wrap-by-default so narrow panels don't crumple their action
 * row into an overlap.
 *
 * See DESIGN-SYSTEM.md → "Spacing primitives".
 */
import React from 'react';
import { cn } from '@/lib/utils';

type ClusterGap = 'tight' | 'normal' | 'loose';

const GAP_TO_PX: Record<ClusterGap, string> = {
  tight: '4px',
  normal: '8px',
  loose: '16px',
};

interface ClusterProps {
  gap?: ClusterGap;
  align?: 'start' | 'center' | 'end' | 'baseline';
  wrap?: boolean;
  as?: 'div' | 'section' | 'header' | 'footer' | 'nav';
  className?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const Cluster = React.forwardRef<HTMLElement, ClusterProps>(
  ({ gap = 'normal', align = 'center', wrap = true, as = 'div', className, children, style, ...rest }, ref) => {
    const Component = as as any;
    return (
      <Component
        ref={ref}
        data-cluster={gap}
        className={cn('flex', wrap && 'flex-wrap', className)}
        style={{ gap: GAP_TO_PX[gap], alignItems: align, ...style }}
        {...rest}
      >
        {children}
      </Component>
    );
  },
);
Cluster.displayName = 'Cluster';
