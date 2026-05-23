/**
 * LAYOUT-3 — Stack primitive.
 *
 * Vertical layout primitive that encodes the project's spacing scale by
 * construction: the only legal vertical gaps inside property panels and
 * input clusters are 2px (between fields), 0 (sections butt up against
 * a 1px divider), and 16px (between cards). Anything else is a crumple
 * waiting to happen.
 *
 * See DESIGN-SYSTEM.md → "Spacing primitives". LAYOUT-2 lint will
 * progressively require this primitive in place of raw `space-y-*`
 * inside wizard editor surfaces.
 */
import React from 'react';
import { cn } from '@/lib/utils';

type StackGap = 'input' | 'section' | 'card';

const GAP_TO_PX: Record<StackGap, string> = {
  input: '2px',
  section: '0',
  card: '16px',
};

interface StackProps {
  gap?: StackGap;
  as?: 'div' | 'section' | 'form' | 'ul' | 'ol' | 'fieldset';
  className?: string;
  children: React.ReactNode;
  inputCluster?: boolean;
  style?: React.CSSProperties;
}

export const Stack = React.forwardRef<HTMLElement, StackProps>(
  ({ gap = 'input', as = 'div', className, children, inputCluster, style, ...rest }, ref) => {
    const Component = as as any;
    return (
      <Component
        ref={ref}
        data-stack={gap}
        data-input-cluster={inputCluster || gap === 'input' ? '' : undefined}
        className={cn('flex flex-col', className)}
        style={{ gap: GAP_TO_PX[gap], ...style }}
        {...rest}
      >
        {children}
      </Component>
    );
  },
);
Stack.displayName = 'Stack';
