import type { QuestionDefinition, QuestionType } from '@shared/wizardSchema';
import type { QuestionComponentProps } from './questions/QuestionProps';
import {
  SliderQuestion,
  SelectQuestion,
  ToggleQuestion,
  TextInputQuestion,
  NumberInputQuestion,
  CheckboxGroupQuestion,
  RadioGroupQuestion,
  PackageCardQuestion,
  InfoDisplay,
} from './questions';

/**
 * Maps a QuestionDefinition.type to the correct atomic component.
 * This is the only place in the widget that knows about question types.
 */

const QUESTION_COMPONENTS: Record<QuestionType, React.ComponentType<QuestionComponentProps>> = {
  slider: SliderQuestion,
  select: SelectQuestion,
  toggle: ToggleQuestion,
  text_input: TextInputQuestion,
  number_input: NumberInputQuestion,
  checkbox_group: CheckboxGroupQuestion,
  radio_group: RadioGroupQuestion,
  package_card: PackageCardQuestion,
  info_display: InfoDisplay,
};

interface QuestionRendererProps {
  question: QuestionDefinition;
  value: string | number | boolean | string[] | undefined;
  onChange: (value: string | number | boolean | string[]) => void;
  accentColor?: string;
}

export default function QuestionRenderer({ question, value, onChange, accentColor }: QuestionRendererProps) {
  const Component = QUESTION_COMPONENTS[question.type];

  if (!Component) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
        Unknown question type: <code>{question.type}</code>
      </div>
    );
  }

  return <Component question={question} value={value} onChange={onChange} accentColor={accentColor} />;
}
