import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface StatCardProps {
  label: string;
  value: string | number | ReactNode;
  suffix?: string;
  /** Optional hint/help cue node placed top-left next to label */
  hint?: ReactNode;
  /** Subtle tone for warning/alert tiles */
  tone?: 'default' | 'warn' | 'success' | 'danger';
  /** Optional override classes for the outer card */
  className?: string;
}

export function StatCard({ label, value, suffix, hint, tone = 'default', className }: StatCardProps) {
  const toneClass =
    tone === 'warn' ? 'border-amber-200 bg-amber-50/40' :
    tone === 'danger' ? 'border-red-200 bg-red-50/40' :
    tone === 'success' ? 'border-emerald-200 bg-emerald-50/40' :
    '';
  return (
    <Card className={cn('h-full', toneClass, className)}>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
          {hint}
          <span>{label}</span>
        </div>
        <div className="text-2xl font-semibold">
          {value}
          {suffix && <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

/** Canonical KPI strip grid. Wraps 2-6 StatCards in a responsive grid. */
export function StatCardGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      'grid gap-3 mb-6',
      'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
      'auto-rows-fr',
      className
    )}>
      {children}
    </div>
  );
}
