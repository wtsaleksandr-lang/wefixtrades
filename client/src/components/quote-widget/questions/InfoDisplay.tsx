import { Info } from 'lucide-react';
import type { QuestionComponentProps } from './QuestionProps';

/**
 * Read-only informational block. Renders label + description
 * as static content. Does not collect any answer.
 */
export default function InfoDisplay({ question }: QuestionComponentProps) {
  return (
    <div className="flex gap-3 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
      <Info className="h-5 w-5 shrink-0 text-blue-500 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-foreground">{question.label}</p>
        {question.description && (
          <p className="mt-1 text-sm text-muted-foreground">{question.description}</p>
        )}
      </div>
    </div>
  );
}
