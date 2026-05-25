/**
 * FacebookPageSettings — portal "Page Settings" surface backed by the
 * pages_manage_metadata scope.
 *
 * Reads the connected Facebook Page's editable fields from
 *   GET  /api/portal/socialsync/facebook-page/:pageId/metadata
 * Writes via
 *   PATCH /api/portal/socialsync/facebook-page/:pageId/metadata
 *
 * Renders nothing unless we have a connected Facebook page id (looked up
 * via the existing /api/portal/socialsync-connections/facebook endpoint).
 * Follows the project's input-field rules: title-in-field via the existing
 * FloatingLabelInput from PortalOnboarding, top-left help cue, 2px gaps.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle, AlertCircle, HelpCircle, Facebook } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FloatingLabelInput } from "@/pages/portal/PortalOnboarding";

interface FacebookConnectionStatus {
  connected: boolean;
  status: string;
  external_page_id: string | null;
  external_account_id: string | null;
}

interface PageMetadata {
  id: string;
  name: string | null;
  about: string | null;
  category: string | null;
  category_list: { id: string; name: string }[];
}

export default function FacebookPageSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: connection } = useQuery<FacebookConnectionStatus>({
    queryKey: ["/api/portal/socialsync-connections/facebook"],
  });

  const pageId = connection?.external_page_id || null;

  const { data: metadata, isLoading, error } = useQuery<PageMetadata>({
    queryKey: ["/api/portal/socialsync/facebook-page", pageId, "metadata"],
    enabled: !!pageId,
  });

  // Local form state. Initialised from server data and kept editable.
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [category, setCategory] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (metadata) {
      setName(metadata.name ?? "");
      setAbout(metadata.about ?? "");
      setCategory(metadata.category ?? "");
      setDirty(false);
    }
  }, [metadata]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!pageId) throw new Error("No connected Facebook Page");
      const body: Record<string, string> = {};
      if (name.trim() !== (metadata?.name ?? "")) body.name = name.trim();
      if (about.trim() !== (metadata?.about ?? "")) body.about = about.trim();
      if (category.trim() !== (metadata?.category ?? "")) body.category = category.trim();
      if (Object.keys(body).length === 0) return metadata;
      const res = await apiRequest(
        "PATCH",
        `/api/portal/socialsync/facebook-page/${encodeURIComponent(pageId)}/metadata`,
        body,
      );
      return (await res.json()) as PageMetadata;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/portal/socialsync/facebook-page", pageId, "metadata"],
      });
      setDirty(false);
      toast({
        title: "Page settings saved",
        description: "Facebook accepted your changes. They may take a few minutes to appear on the Page.",
      });
      // Optimistic: write the latest snapshot in so the form doesn't
      // briefly flash old values before the refetch lands.
      if (updated) {
        setName(updated.name ?? "");
        setAbout(updated.about ?? "");
        setCategory(updated.category ?? "");
      }
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't save Page settings",
        description: err?.message || "Facebook rejected the update. Some fields (like Page name) need to be enabled by the Page owner in Facebook first.",
        variant: "destructive",
      });
    },
  });

  // No connected Facebook Page → render nothing. The Connect Facebook flow
  // is presented elsewhere in the portal.
  if (!connection?.connected || !pageId) return null;

  return (
    <Card className="p-5" data-testid="facebook-page-settings">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <Facebook className="w-4 h-4 text-[#1877F2]" />
          <h3 className="text-sm font-semibold text-gray-900">Facebook Page Settings</h3>
        </div>
        <span className="text-[10px] text-gray-400">Page ID: {pageId}</span>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Edit how your Facebook Page appears to customers. Changes are sent
        directly to Facebook and may take a few minutes to show up.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading Page settings from Facebook…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-700">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{(error as any)?.message || "Could not load Page settings from Facebook."}</span>
        </div>
      )}

      {!isLoading && !error && metadata && (
        <form
          onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
          className="space-y-0.5"
        >
          <div className="relative pl-6">
            <span
              aria-hidden
              className="absolute top-1 left-1 z-10 p-1 text-gray-300"
              title="Some Pages restrict name changes. If Facebook rejects the change, ask the Page owner to enable name-change in Facebook first."
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </span>
            <FloatingLabelInput
              id="fb-page-name"
              label="Page name"
              value={name}
              onChange={(v) => { setName(v); setDirty(true); }}
            />
          </div>

          <div className="relative pl-6">
            <span
              aria-hidden
              className="absolute top-1 left-1 z-10 p-1 text-gray-300"
              title="Short description shown on your Page. Max 255 characters."
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </span>
            <FloatingLabelInput
              id="fb-page-about"
              label="About / short description"
              value={about}
              onChange={(v) => { setAbout(v); setDirty(true); }}
              placeholder="up to 255 chars"
            />
          </div>

          <div className="relative pl-6">
            <span
              aria-hidden
              className="absolute top-1 left-1 z-10 p-1 text-gray-300"
              title="The Facebook category that best matches your trade business."
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </span>
            <FloatingLabelInput
              id="fb-page-category"
              label="Category"
              value={category}
              onChange={(v) => { setCategory(v); setDirty(true); }}
              placeholder="e.g. Plumber"
            />
          </div>

          <div className="flex items-center gap-2 pt-3">
            <Button
              type="submit"
              size="sm"
              disabled={!dirty || saveMutation.isPending}
              className="bg-[#0d3cfc] hover:bg-[#0b34d6] text-white text-xs"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <CheckCircle className="w-3 h-3 mr-1" />
              )}
              Save changes
            </Button>
            {dirty && (
              <span className="text-[11px] text-gray-400">Unsaved changes</span>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}
