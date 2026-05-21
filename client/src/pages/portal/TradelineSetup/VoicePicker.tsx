/**
 * Wave W-AW-1 — TradeLine voice picker step.
 *
 * Used both as a wizard step (when invoked from TradelineSetup) and as a
 * standalone page at /portal/tradeline/voice. Lists active voices from the
 * admin-managed catalog, plays the sample audio inline, and writes the
 * chosen voice id (+ optional greeting + response_style) to the per-client
 * `tradeline_assistant_settings` table.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Play, Check, Mic2 } from "lucide-react";

interface Voice {
  id: string;
  elevenlabs_voice_id: string;
  display_name: string;
  description: string | null;
  gender: string | null;
  accent: string | null;
  tags: string[];
  sample_audio_url: string | null;
}

interface Settings {
  voice_id: string | null;
  greeting: string | null;
  response_style: string | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

interface Props {
  onSaved?: () => void;
}

export function VoicePicker({ onSaved }: Props) {
  const qc = useQueryClient();
  const voicesQ = useQuery<{ voices: Voice[] }>({
    queryKey: ["/api/portal/tradeline/voices"],
    queryFn: () => api("/api/portal/tradeline/voices"),
  });
  const settingsQ = useQuery<{ settings: Settings | null }>({
    queryKey: ["/api/portal/tradeline/settings"],
    queryFn: () => api("/api/portal/tradeline/settings"),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [greeting, setGreeting] = useState("");
  const [style, setStyle] = useState<"concise" | "detailed" | "friendly" | "">("");

  useEffect(() => {
    if (settingsQ.data?.settings) {
      setSelectedId(settingsQ.data.settings.voice_id ?? null);
      setGreeting(settingsQ.data.settings.greeting ?? "");
      setStyle((settingsQ.data.settings.response_style as any) ?? "");
    }
  }, [settingsQ.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      api("/api/portal/tradeline/settings", {
        method: "PATCH",
        body: JSON.stringify({
          voice_id: selectedId,
          greeting: greeting.trim() === "" ? null : greeting,
          response_style: style === "" ? null : style,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/portal/tradeline/settings"] });
      onSaved?.();
    },
  });

  const voiceList = useMemo(() => voicesQ.data?.voices ?? [], [voicesQ.data]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Mic2 className="w-5 h-5 text-indigo-600" /> Pick your AI voice
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Choose the voice your customers hear when the AI receptionist answers your calls.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {voiceList.map((v) => {
          const selected = selectedId === v.id;
          return (
            <Card
              key={v.id}
              className={`p-3 cursor-pointer transition ${selected ? "ring-2 ring-indigo-500 bg-indigo-50/50" : "hover:bg-gray-50"}`}
              onClick={() => setSelectedId(v.id)}
              data-testid={`voice-card-${v.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-gray-900 flex items-center gap-2">
                    {v.display_name}
                    {selected && <Check className="w-4 h-4 text-indigo-600" />}
                  </div>
                  {v.description && <div className="text-xs text-gray-600 mt-1">{v.description}</div>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {v.gender && <Badge variant="outline">{v.gender}</Badge>}
                    {v.accent && <Badge variant="outline">{v.accent}</Badge>}
                    {v.tags?.slice(0, 3).map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                  </div>
                </div>
                {v.sample_audio_url && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); new Audio(v.sample_audio_url!).play(); }}
                  >
                    <Play className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="space-y-2">
        <label className="block text-sm">
          <span className="text-gray-700 font-medium">Custom greeting (optional)</span>
          <Textarea
            className="mt-1"
            rows={2}
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="Hi, thanks for calling Bob's Plumbing — how can I help?"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-700 font-medium">Response style</span>
          <select
            className="mt-1 w-full border rounded px-2 py-1"
            value={style}
            onChange={(e) => setStyle(e.target.value as any)}
          >
            <option value="">Default</option>
            <option value="concise">Concise — tight, no preamble</option>
            <option value="detailed">Detailed — fuller answers when asked</option>
            <option value="friendly">Friendly — warm, uses caller's name</option>
          </select>
        </label>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => saveMut.mutate()} disabled={!selectedId || saveMut.isPending}>
          {saveMut.isPending ? "Saving…" : "Save voice"}
        </Button>
      </div>
    </div>
  );
}

export default VoicePicker;
