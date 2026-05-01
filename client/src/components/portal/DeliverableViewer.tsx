import { FileText, Image, Download, File } from "lucide-react";

export interface Deliverable {
  kind: string;
  url: string;
  label: string;
  uploaded_by?: string;
  uploaded_at?: string;
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];

function isImageUrl(url: string): boolean {
  const ext = url.split(".").pop()?.toLowerCase().split("?")[0] || "";
  return IMAGE_EXTENSIONS.includes(ext);
}

function KindBadge({ kind }: { kind: string }) {
  const styles: Record<string, string> = {
    mockup: "bg-purple-50 text-purple-700",
    report: "bg-blue-50 text-blue-700",
    screenshot: "bg-teal-50 text-teal-700",
    document: "bg-gray-100 text-gray-600",
    image: "bg-indigo-50 text-indigo-700",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${styles[kind] || "bg-gray-100 text-gray-600"}`}>
      {kind}
    </span>
  );
}

function FileIcon({ url, kind }: { url: string; kind: string }) {
  if (isImageUrl(url) || kind === "mockup" || kind === "screenshot" || kind === "image") {
    return <Image className="w-4 h-4 text-indigo-500" />;
  }
  if (kind === "report" || kind === "document") {
    return <FileText className="w-4 h-4 text-blue-500" />;
  }
  return <File className="w-4 h-4 text-gray-400" />;
}

interface DeliverableViewerProps {
  deliverables: Deliverable[];
  /** Show image thumbnails inline */
  showThumbnails?: boolean;
}

export default function DeliverableViewer({ deliverables, showThumbnails = true }: DeliverableViewerProps) {
  if (!deliverables || deliverables.length === 0) return null;

  return (
    <div className="space-y-2">
      {deliverables.map((d, i) => {
        const showThumb = showThumbnails && isImageUrl(d.url);
        return (
          <div key={i} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            {showThumb && (
              <div className="bg-gray-50 border-b border-gray-100 p-3 flex items-center justify-center">
                <img
                  src={d.url}
                  alt={d.label}
                  className="max-h-48 rounded object-contain"
                  loading="lazy"
                />
              </div>
            )}
            <div className="px-3 py-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileIcon url={d.url} kind={d.kind} />
                <span className="text-sm text-gray-700 truncate">{d.label}</span>
                <KindBadge kind={d.kind} />
              </div>
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
              >
                <Download className="w-3 h-3" />
                <span className="hidden sm:inline">Download</span>
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
