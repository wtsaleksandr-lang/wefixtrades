/**
 * LAYOUT-3 — HelpCueRow primitive.
 *
 * Standardises the "icon-cue + title + action-slot" pattern used at the
 * top of every property panel / section header. The help-cue anchor is
 * locked top-left (per MEMORY.md `feedback_recurring_ui_violations.md`)
 * so we can't mix patterns on the same surface.
 *
 * See DESIGN-SYSTEM.md → "Spacing primitives".
 */
import React from 'react';
import { cn } from '@/lib/utils';

interface HelpCueRowProps {
  cue: React.ReactNode;
  title?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  variant?: 'header' | 'label';
}

export const HelpCueRow: React.FC<HelpCueRowProps> = ({
  cue, title, actions, className, variant = 'header',
}) => (
  <div
    data-help-cue-row={variant}
    className={cn(
      'flex items-center justify-between',
      variant === 'header' ? 'mb-2' : 'mb-1',
      className,
    )}
  >
    <div className="flex items-center gap-2 min-w-0">
      <span data-help-cue-anchor="top-left" className="shrink-0">{cue}</span>
      {title != null && (
        <span className={cn(
          'truncate',
          variant === 'header'
            ? 'text-sm font-semibold text-foreground'
            : 'text-xs font-medium text-muted-foreground',
        )}>{title}</span>
      )}
    </div>
    {actions != null && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
  </div>
);
