/**
 * /admin/content-pipeline — Wave 20.
 *
 * Single observability surface for every content-generation request across
 * RankFlow / SocialSync / standalone ContentFlow / manual triggers. Shows
 * stage, source, client, topic, quality score, and any errors.
 *
 * Customer-facing portals get the same data filtered by client_id via the
 * existing portal endpoints — the admin page is the cross-customer view.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  FileText,
  Share2,
  Image as ImageIcon,
  Video,
  Sparkles,
} from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";

type Stage = "requested" | "generating" | "quality_check" | "approved" | "failed";
type Source = "rankflow" | "socialsync" | "contentflow" | "manual";
type ContentType = "article" | "social_post" | "image" | "video";

interface ContentError {
  stage: string;
  message: string;
  retryable: boolean;
}

interface PipelineItem {
  requestId: string;
  source: Source;
  type: ContentType;
  clientId: number | null;
  topic: string;
  status: Stage;
  qualityScore: number | null;
  errors?: ContentError[];
  generatedAt: string | null;
}

interface PipelineResponse {
  data: PipelineItem[];
  counts: { stage: string; count: number }[];
  recent_hour: { total: number; failed: number; failure_rate: number };
}

const STAGE_STYLE: Record<Stage, { label: string; icon: React.ReactNode; tone: string }> = {
  requested:     { label: "Requested",     icon: <Clock className="w-3 h-3" />,         tone: "bg-gray-100 text-gray-700" },
  generating:    { label: "Generating",    icon: <Loader2 className="w-3 h-3 animate-spin" />, tone: "bg-blue-100 text-blue-700" },
  quality_check: { label: "Quality check", icon: <Sparkles className="w-3 h-3" />,      tone: "bg-amber-100 text-amber-800" },
  approved:      { label: "Approved",      icon: <CheckCircle2 className="w-3 h-3" />,  tone: "bg-emerald-100 text-emerald-800" },
  failed:        { label: "Failed",        icon: <AlertTriangle className="w-3 h-3" />, tone: "bg-rose-100 text-rose-800" },
};

const TYPE_ICON: Record<ContentType, React.ReactNode> = {
  article:     <FileText className="w-3.5 h-3.5" />,
  social_post: <Share2 className="w-3.5 h-3.5" />,
  image:       <ImageIcon className="w-3.5 h-3.5" />,
  video:       <Video className="w-3.5 h-3.5" />,
};

const SOURCE_LABEL: Record<Source, string> = {
  rankflow:    "RankFlow",
  socialsync:  "SocialSync",
  contentflow: "ContentFlow",
  manual:      "Manual",
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ContentPipelinePage() {
  usePageTitle("Content pipeline");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<PipelineResponse>({
    queryKey: ["/api/admin/content-pipeline", sourceFilter, stageFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (stageFilter !== "all") params.set("stage", stageFilter);
      params.set("limit", "200");
      const res = await fetch(`/api/admin/content-pipeline?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load content pipeline");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const retry = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest("POST", `/api/admin/content-pipeline/${requestId}/retry`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/content-pipeline"] });
      toast({ title: "Retry dispatched", description: "Pipeline will refresh shortly." });
    },
    onError: (err: Error) => {
      toast({ title: "Retry failed", description: err.message, variant: "destructive" });
    },
  });

  const items = data?.data ?? [];
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of data?.counts ?? []) m.set(c.stage, c.count);
    return m;
  }, [data?.counts]);

  const recent = data?.recent_hour;
  const highFailureRate = recent && recent.total >= 5 && recent.failure_rate >= 0.2;

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Content pipeline
            </h2>
            <p className="text-sm text-gray-500">
              Every content request across RankFlow, SocialSync, and ContentFlow.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="rankflow">RankFlow</SelectItem>
                <SelectItem value="socialsync">SocialSync</SelectItem>
                <SelectItem value="contentflow">ContentFlow</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                <SelectItem value="requested">Requested</SelectItem>
                <SelectItem value="generating">Generating</SelectItem>
                <SelectItem value="quality_check">Quality check</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/content-pipeline"] })}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Stage count chips */}
        <div className="flex flex-wrap gap-2">
          {(["requested", "generating", "quality_check", "approved", "failed"] as Stage[]).map((s) => {
            const c = counts.get(s) ?? 0;
            const style = STAGE_STYLE[s];
            return (
              <Badge key={s} className={`gap-1 ${style.tone}`} variant="secondary">
                {style.icon}
                {style.label} · {c}
              </Badge>
            );
          })}
        </div>

        {/* High failure rate alert */}
        {highFailureRate && (
          <Card className="p-3 border-rose-200 bg-rose-50 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-700 mt-0.5" />
            <div className="text-sm text-rose-900">
              <div className="font-medium">
                Elevated failure rate in the last hour: {Math.round((recent?.failure_rate ?? 0) * 100)}%
                ({recent?.failed} of {recent?.total} requests failed)
              </div>
              <div className="text-rose-700 text-xs mt-0.5">
                Check provider keys, quality-gate thresholds, and recent provider rotator logs.
              </div>
            </div>
          </Card>
        )}

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Topic</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Stage</th>
                  <th className="px-3 py-2 text-left">Quality</th>
                  <th className="px-3 py-2 text-left">Updated</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={8} className="p-4">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                )}
                {!isLoading && items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-gray-500">
                      No content requests yet.
                    </td>
                  </tr>
                )}
                {items.map((item) => {
                  const style = STAGE_STYLE[item.status] ?? STAGE_STYLE.requested;
                  const firstErr = item.errors?.[0];
                  return (
                    <tr key={item.requestId} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <Badge variant="outline">{SOURCE_LABEL[item.source]}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 text-gray-700">
                          {TYPE_ICON[item.type]}
                          {item.type.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 max-w-xs truncate" title={item.topic}>
                        {item.topic}
                        {firstErr && (
                          <div className="text-xs text-rose-700 mt-0.5">
                            {firstErr.stage}: {firstErr.message}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{item.clientId ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Badge className={`gap-1 ${style.tone}`} variant="secondary">
                          {style.icon}
                          {style.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {item.qualityScore != null ? item.qualityScore : "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs">
                        {timeAgo(item.generatedAt)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {item.status === "failed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={retry.isPending}
                            onClick={() => retry.mutate(item.requestId)}
                          >
                            Retry
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
