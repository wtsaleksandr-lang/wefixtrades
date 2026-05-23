import { useState } from "react";
import { Send } from "lucide-react";
import type { CopilotPromptRequest } from "@shared/copilotProtocol";

/**
 * CopilotPromptCard — renders an AI-generated confirmation prompt: a
 * question, a set of context-generated option buttons, and (optionally) a
 * free-text input for a custom reply. Shared by the portal + admin copilots.
 *
 * The options are produced by the AI per context (see COPILOT_PROMPT in
 * shared/copilotProtocol.ts) — this component never hard-codes them. The
 * chosen value is handed to `onRespond`, which the host widget sends back
 * as the user's next message.
 */
export default function CopilotPromptCard({
  request,
  onRespond,
  disabled,
}: {
  request: CopilotPromptRequest;
  onRespond: (value: string) => void;
  disabled?: boolean;
}) {
  const [custom, setCustom] = useState("");

  function submitCustom() {
    const v = custom.trim();
    if (!v || disabled) return;
    setCustom("");
    onRespond(v);
  }

  return (
    <div
      className="border border-[#0d3cfc]/30 bg-[#EEF3FF] rounded-lg p-3 space-y-2.5"
      data-testid="copilot-prompt-card"
      data-theme="light"
    >
      <p className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">{request.prompt}</p>

      <div className="flex flex-wrap gap-1.5">
        {request.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            disabled={disabled}
            onClick={() => onRespond(opt.value)}
            className="px-3 py-1.5 text-xs font-medium text-white bg-[#0d3cfc] rounded-lg hover:bg-[#0a31d6] disabled:opacity-50 transition-colors"
            data-testid={`copilot-prompt-option-${i}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {request.allow_custom && (
        <div className="flex items-center gap-1.5 pt-0.5">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitCustom();
              }
            }}
            disabled={disabled}
            placeholder="Or type your own reply…"
            className="flex-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0d3cfc]/20 focus:border-[#0d3cfc] disabled:opacity-50"
            data-testid="copilot-prompt-custom-input"
          />
          <button
            type="button"
            onClick={submitCustom}
            disabled={disabled || !custom.trim()}
            className="p-1.5 rounded-lg bg-[#0d3cfc] text-white hover:bg-[#0a31d6] disabled:opacity-40 transition-colors"
            aria-label="Send custom reply"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
