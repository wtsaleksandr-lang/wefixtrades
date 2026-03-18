import { Info } from 'lucide-react';
import { eff } from '../designTokens';
import type { QuestionComponentProps } from './QuestionProps';

/**
 * Read-only informational block. Renders label + description
 * as static content. Does not collect any answer.
 */
export default function InfoDisplay({ question }: QuestionComponentProps) {
  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      borderRadius: eff.radiusMd,
      border: `1px solid ${eff.buttonBorder}`,
      background: eff.bgSecondary,
      padding: '16px',
    }}>
      <Info style={{ width: 18, height: 18, flexShrink: 0, marginTop: '1px', color: eff.accent }} />
      <div>
        <p style={{ fontSize: '14px', fontWeight: 600, color: eff.text, margin: 0 }}>{question.label}</p>
        {question.description && (
          <p style={{ fontSize: '13px', color: eff.textBody, margin: '4px 0 0', lineHeight: 1.5 }}>{question.description}</p>
        )}
      </div>
    </div>
  );
}
