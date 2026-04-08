import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

const MODES = [
  { value: "available", label: "Available", desc: "AI only when you miss", color: "bg-emerald-500" },
  { value: "on_the_job", label: "On the Job", desc: "AI handles all calls", color: "bg-amber-500" },
  { value: "after_hours", label: "After Hours", desc: "AI + voicemail mode", color: "bg-indigo-500" },
] as const;

type Mode = (typeof MODES)[number]["value"];

interface ModeToggleProps {
  currentMode: Mode;
  clientServiceId: number;
  /** Base URL prefix — "/api/portal/tradeline" or "/api/admin/crm/tradeline" */
  apiBase: string;
  onModeChanged?: (newMode: Mode) => void;
  disabled?: boolean;
}

export default function ModeToggle({ currentMode, clientServiceId, apiBase, onModeChanged, disabled }: ModeToggleProps) {
  const [optimistic, setOptimistic] = useState<Mode | null>(null);
  const active = optimistic ?? currentMode;

  const mutation = useMutation({
    mutationFn: async (newMode: Mode) => {
      const res = await fetch(`${apiBase}/${clientServiceId}/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newMode }),
      });
      if (!res.ok) throw new Error("Failed to update mode");
      return res.json();
    },
    onMutate: (newMode) => setOptimistic(newMode),
    onSuccess: (_data, newMode) => {
      setOptimistic(null);
      onModeChanged?.(newMode);
    },
    onError: () => setOptimistic(null),
  });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 gap-0.5">
        {MODES.map((m) => {
          const isActive = active === m.value;
          return (
            <button
              key={m.value}
              disabled={disabled || mutation.isPending}
              onClick={() => {
                if (m.value !== active) mutation.mutate(m.value);
              }}
              className={`
                relative flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all min-w-0
                ${isActive
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
                }
                ${disabled || mutation.isPending ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              <span className="flex items-center justify-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? m.color : "bg-gray-300"}`} />
                <span className="truncate">{m.label}</span>
              </span>
            </button>
          );
        })}
      </div>
      {mutation.isPending && (
        <span className="flex items-center gap-1 text-[10px] text-gray-400">
          <Loader2 className="w-3 h-3 animate-spin" /> Switching...
        </span>
      )}
      {!mutation.isPending && (
        <span className="text-[10px] text-gray-400">
          {MODES.find((m) => m.value === active)?.desc}
        </span>
      )}
      {active === "on_the_job" && !mutation.isPending && (
        <span className="text-[10px] text-gray-400 leading-tight">
          Your system handles all calls and messages automatically.
        </span>
      )}
    </div>
  );
}
