/**
 * ContentFlow product-level admin settings.
 *
 * Surfaced as the "Settings" view on the admin ContentFlow page. Edits the
 * contentflow_settings singleton via GET/PUT /api/admin/contentflow/config:
 *   - emergency kill switch (pauses all generation + publishing)
 *   - content model tier (Standard = Haiku, Premium = Sonnet)
 *   - monthly AI spend cap (with month-to-date spend shown)
 *   - per-channel publish toggles
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Loader2, Save } from "lucide-react";

const CHANNELS: { id: string; label: string }[] = [
  { id: "wordpress", label: "WordPress — articles" },
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "gbp", label: "Google Business — review replies" },
  { id: "gbp_post", label: "Google Business — local posts" },
  { id: "email", label: "Email" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "pinterest", label: "Pinterest" },
  { id: "youtube", label: "YouTube" },
];

interface ContentflowSettings {
  kill_switch: boolean;
  text_tier: string;
  disabled_channels: string[];
  monthly_spend_cap_usd: number | null;
  updated_at: string | null;
}
interface ConfigResponse {
  settings: ContentflowSettings;
  monthly_spend_usd: number;
}

export default function ContentFlowSettingsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError, error } = useQuery<ConfigResponse>({
    queryKey: ["/api/admin/contentflow/config"],
    queryFn: async () => {
      const res = await fetch("/api/admin/contentflow/config", { credentials: "include" });
      if (!res.ok) throw new Error(`Config load failed: ${res.status}`);
      return res.json();
    },
  });

  const [killSwitch, setKillSwitch] = useState(false);
  const [textTier, setTextTier] = useState("standard");
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [spendCap, setSpendCap] = useState("");

  // Populate the form once settings load.
  useEffect(() => {
    if (!data) return;
    setKillSwitch(data.settings.kill_switch);
    setTextTier(data.settings.text_tier || "standard");
    setDisabled(new Set(data.settings.disabled_channels || []));
    setSpendCap(
      data.settings.monthly_spend_cap_usd == null ? "" : String(data.settings.monthly_spend_cap_usd),
    );
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const capTrim = spendCap.trim();
      const cap = capTrim === "" ? null : Math.max(0, Math.round(Number(capTrim) || 0));
      const res = await apiRequest("PUT", "/api/admin/contentflow/config", {
        kill_switch: killSwitch,
        text_tier: textTier,
        disabled_channels: Array.from(disabled),
        monthly_spend_cap_usd: cap,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "ContentFlow settings saved" });
      qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/config"] });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Save failed", description: e?.message || "Unknown error" });
    },
  });

  function toggleChannel(id: string) {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading) {
    return <Card className="p-6"><Skeleton className="h-64 w-full" /></Card>;
  }
  if (isError) {
    return (
      <Card className="p-6 text-sm text-red-700">
        Failed to load settings: {(error as any)?.message || "unknown error"}
      </Card>
    );
  }

  const spend = data?.monthly_spend_usd ?? 0;
  const cap = data?.settings.monthly_spend_cap_usd ?? null;
  const overCap = cap != null && spend >= cap;

  return (
    <div className="space-y-4">
      {/* Emergency kill switch */}
      <Card className={`p-4 ${killSwitch ? "border-red-300 bg-red-50/40" : ""}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${killSwitch ? "text-red-600" : "text-amber-500"}`} />
              <h3 className="text-sm font-semibold">Emergency kill switch</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              When ON, ContentFlow stops <strong>all</strong> AI generation and <strong>all</strong>{" "}
              publishing across every customer. Use this if content is going out wrong.
            </p>
          </div>
          <Switch
            checked={killSwitch}
            onCheckedChange={setKillSwitch}
            data-testid="contentflow-kill-switch"
          />
        </div>
      </Card>

      {/* Generation */}
      <Card className="p-4 space-y-4">
        <h3 className="text-sm font-semibold">Generation</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Content model</Label>
            <Select value={textTier} onValueChange={setTextTier}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard — Claude Haiku (fast, low cost)</SelectItem>
                <SelectItem value="premium">Premium — Claude Sonnet (higher quality)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Monthly AI spend cap (USD)</Label>
            <Input
              type="number"
              min={0}
              placeholder="No cap"
              value={spendCap}
              onChange={(e) => setSpendCap(e.target.value)}
              className="h-9 text-sm"
            />
            <p className={`text-xs ${overCap ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
              This month so far: ${spend.toFixed(2)}
              {cap != null && ` / $${cap}`}
              {overCap && " — cap reached, generation paused"}
            </p>
          </div>
        </div>
      </Card>

      {/* Publish channels */}
      <Card className="p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Publish channels</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Unchecked channels are skipped by the publish queue. Generation still runs.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {CHANNELS.map((ch) => {
            const enabled = !disabled.has(ch.id);
            return (
              <label
                key={ch.id}
                className="flex items-center gap-2 text-sm rounded-md border p-2 cursor-pointer hover:bg-muted/40"
              >
                <Checkbox checked={enabled} onCheckedChange={() => toggleChannel(ch.id)} />
                <span>{ch.label}</span>
              </label>
            );
          })}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="contentflow-settings-save">
          {save.isPending ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          Save settings
        </Button>
      </div>
    </div>
  );
}
