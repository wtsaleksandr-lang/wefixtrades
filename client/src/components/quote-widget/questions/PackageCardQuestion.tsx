import { CheckCircle2 } from 'lucide-react';
import { eff, labelStyle, descStyle } from '../designTokens';
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
    return <p style={{ fontSize: '14px', color: eff.textBody }}>No packages configured.</p>;
  }

  return (
    <div>
      <label style={labelStyle}>{question.label}</label>
      {question.description && <p style={descStyle}>{question.description}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {packages.map((pkg, i) => {
          const isSelected = selectedIndex === i;
          return (
            <button
              key={pkg.id}
              type="button"
              onClick={() => onChange(i)}
              style={{
                position: 'relative',
                borderRadius: eff.radiusLg,
                border: isSelected ? `2px solid ${eff.buttonBg}` : `1px solid ${eff.buttonBorder}`,
                padding: isSelected ? '23px' : '24px',
                textAlign: 'left',
                transition: 'all 0.15s',
                cursor: 'pointer',
                background: isSelected ? eff.bgSecondary : '#fff',
                fontFamily: eff.font,
              }}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = eff.textBody; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = isSelected ? eff.buttonBg : eff.buttonBorder; }}
            >
              {pkg.badge && (
                <span style={{
                  position: 'absolute',
                  top: '-10px',
                  right: '16px',
                  borderRadius: '999px',
                  padding: '3px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: eff.buttonText,
                  background: eff.buttonBg,
                  letterSpacing: '0.02em',
                }}>
                  {pkg.badge}
                </span>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 700, color: eff.text, margin: 0 }}>{pkg.label}</p>
                  {pkg.description && (
                    <p style={{ fontSize: '13px', color: eff.textBody, margin: '4px 0 0' }}>{pkg.description}</p>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                  <span style={{
                    fontSize: '20px',
                    fontWeight: 800,
                    color: eff.text,
                    fontFamily: eff.fontMono,
                    letterSpacing: '-0.02em',
                  }}>
                    ${pkg.price}
                  </span>
                  {isSelected && <CheckCircle2 style={{ width: 20, height: 20, color: eff.buttonBg }} />}
                </div>
              </div>
              {pkg.features.length > 0 && (
                <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {pkg.features.map((f, fi) => (
                    <li key={fi} style={{ fontSize: '13px', color: eff.textBody }}>
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
