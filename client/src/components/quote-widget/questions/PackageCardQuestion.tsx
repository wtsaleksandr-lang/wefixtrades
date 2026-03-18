import { CheckCircle2 } from 'lucide-react';
import type { QuestionComponentProps } from './QuestionProps';

/**
 * Basic package card selector. Renders tiered package cards from
 * the question's `packages` array. Full visual polish will come
 * when we build the PackageSelectionStep — this provides the
 * minimum functional rendering the StepRenderer needs.
 */
export default function PackageCardQuestion({ question, value, onChange, accentColor }: QuestionComponentProps) {
  const selectedIndex = typeof value === 'number' ? value : Number(value) || 0;
  const packages = question.packages || [];

  if (!packages.length) {
    return <p className="text-sm text-muted-foreground">No packages configured.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{question.label}</p>
      {question.description && (
        <p className="text-sm text-muted-foreground">{question.description}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg, i) => {
          const isSelected = selectedIndex === i;
          return (
            <button
              key={pkg.id}
              type="button"
              onClick={() => onChange(i)}
              className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                isSelected
                  ? 'border-current shadow-md'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
              style={isSelected && accentColor ? { borderColor: accentColor, color: accentColor } : undefined}
            >
              {pkg.badge && (
                <span
                  className="absolute -top-2.5 right-3 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: accentColor || '#6366f1' }}
                >
                  {pkg.badge}
                </span>
              )}
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-foreground">{pkg.label}</p>
                  {pkg.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{pkg.description}</p>
                  )}
                </div>
                {isSelected && <CheckCircle2 className="h-5 w-5 shrink-0" />}
              </div>
              <p className="mt-2 text-lg font-bold text-foreground">${pkg.price}</p>
              {pkg.features.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {pkg.features.map((f, fi) => (
                    <li key={fi} className="text-xs text-muted-foreground">
                      &bull; {f}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
