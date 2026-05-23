/**
 * Chat-attachment uploader.
 *
 * Used by the portal chat widget and the admin copilot. Renders:
 *
 *   - a paperclip button that opens the file picker
 *   - a chip strip above the text input, one chip per uploaded file
 *   - a `handlePaste(event)` exposed via ref so the parent can wire
 *     it onto its text input — this is what lets users press
 *     ctrl+V on a screenshot and have it land here
 *
 * Accepted types match the server (POST /api/chat/attachments):
 *   PNG, JPEG, PDF, TXT, Word (DOC/DOCX), Excel (XLS/XLSX), EML.
 *
 * Uploads are non-blocking — each file flips through pending →
 * uploaded states and only "uploaded" entries get included when the
 * parent reads `value` to send. Failed uploads stay visible so the
 * user can see why.
 */

import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
} from "react";
import {
  Paperclip, Loader2, X, FileText, FileSpreadsheet, FileType,
  Mail, Image as ImageIcon, AlertCircle,
} from "lucide-react";

/* ─── Public types ──────────────────────────────────────────────── */

export interface ChatAttachment {
  /** Stable client-only id used for list keys + removal. */
  id: string;
  /** Original filename (or "screenshot.png" for clipboard images). */
  filename: string;
  /** MIME type as reported by the browser. */
  mime: string;
  /** Decoded byte size. */
  size: number;
  /** Once uploaded, the public URL the chat backend can resolve. */
  url?: string;
  /** Optional preview data-URL for image attachments. Local-only — we
   *  don't ship it to the chat backend. */
  preview?: string;
  status: "pending" | "uploaded" | "failed";
  /** Error string when status === "failed". */
  error?: string;
}

export interface ChatAttachmentInputHandle {
  /** Paste-event handler for the parent's text input. Reads any image
   *  on the clipboard (and any non-image File for files explicitly
   *  pasted from a file manager) and starts upload. */
  handlePaste: (event: React.ClipboardEvent) => void;
  /** Clear all attachments — call after a successful send. */
  clear: () => void;
  /** Programmatically open the file picker. */
  open: () => void;
}

interface ChatAttachmentInputProps {
  value: ChatAttachment[];
  onChange: (next: ChatAttachment[]) => void;
  /** Disable the paperclip + paste handler (e.g. while sending). */
  disabled?: boolean;
  /** Visual variant — controls the colour of the paperclip icon. */
  variant?: "portal" | "admin";
  /** Cap on simultaneous attachments per message. Default 5. */
  maxAttachments?: number;
}

/* ─── Constants ─────────────────────────────────────────────────── */

const ACCEPT_ATTR = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/pdf",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "message/rfc822",
  ".eml",
].join(",");

const ALLOWED_MIME_PREFIXES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/pdf",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "message/rfc822",
  "application/eml",
];

const MAX_BYTES = 15 * 1024 * 1024;

function isAllowedMime(mime: string): boolean {
  const m = mime.toLowerCase().split(";")[0].trim();
  if (!m) return false;
  return ALLOWED_MIME_PREFIXES.includes(m);
}

/* Convert ArrayBuffer → base64 without blowing the call stack on big
 * files. (`String.fromCharCode(...new Uint8Array(buf))` works for
 * small files but throws "too many args" past ~64KB on Safari.) */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...Array.from(chunk));
  }
  return btoa(binary);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function iconFor(mime: string) {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return ImageIcon;
  if (m.includes("pdf")) return FileType;
  if (m.includes("spreadsheet") || m.includes("excel")) return FileSpreadsheet;
  if (m.includes("rfc822") || m.includes("eml")) return Mail;
  return FileText;
}

/* ─── Component ─────────────────────────────────────────────────── */

const ChatAttachmentInput = forwardRef<ChatAttachmentInputHandle, ChatAttachmentInputProps>(
  function ChatAttachmentInput(
    { value, onChange, disabled, variant = "portal", maxAttachments = 5 }: ChatAttachmentInputProps,
    ref,
  ) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    /* Stable refs for the latest value/onChange so the imperative
     * handle methods never read stale closures. */
    const valueRef = useRef(value);
    const onChangeRef = useRef(onChange);
    useEffect(() => { valueRef.current = value; });
    useEffect(() => { onChangeRef.current = onChange; });

    const upload = useCallback(async (att: ChatAttachment, file: File) => {
      try {
        const buf = await file.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);
        const res = await fetch("/api/chat/attachments", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: b64, filename: file.name, mime: file.type || "application/octet-stream" }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const next = valueRef.current.map((a) =>
            a.id === att.id
              ? { ...a, status: "failed" as const, error: body.error || `HTTP ${res.status}` }
              : a,
          );
          onChangeRef.current(next);
          return;
        }
        const body = await res.json();
        const next = valueRef.current.map((a) =>
          a.id === att.id ? { ...a, status: "uploaded" as const, url: body.url } : a,
        );
        onChangeRef.current(next);
      } catch (err) {
        const next = valueRef.current.map((a) =>
          a.id === att.id
            ? { ...a, status: "failed" as const, error: err instanceof Error ? err.message : "Upload failed" }
            : a,
        );
        onChangeRef.current(next);
      }
    }, []);

    /** Single ingestion path — used by both file-picker and paste. */
    const handleFiles = useCallback(async (files: File[]) => {
      if (disabled || files.length === 0) return;

      const slotsLeft = Math.max(0, maxAttachments - valueRef.current.length);
      if (slotsLeft === 0) return;

      const incoming: ChatAttachment[] = [];
      const filesToUpload: { att: ChatAttachment; file: File }[] = [];

      for (const file of files.slice(0, slotsLeft)) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        if (file.size > MAX_BYTES) {
          incoming.push({
            id,
            filename: file.name || "file",
            mime: file.type || "application/octet-stream",
            size: file.size,
            status: "failed",
            error: `Too large (${fmtSize(file.size)} > ${fmtSize(MAX_BYTES)})`,
          });
          continue;
        }

        if (!isAllowedMime(file.type)) {
          incoming.push({
            id,
            filename: file.name || "file",
            mime: file.type || "application/octet-stream",
            size: file.size,
            status: "failed",
            error: "Unsupported file type",
          });
          continue;
        }

        let preview: string | undefined;
        if (file.type.startsWith("image/")) {
          try {
            preview = await readFileAsDataUrl(file);
          } catch {
            // Best-effort — if preview fails we still upload.
          }
        }

        const att: ChatAttachment = {
          id,
          filename: file.name || (file.type.startsWith("image/") ? "screenshot.png" : "attachment"),
          mime: file.type,
          size: file.size,
          status: "pending",
          preview,
        };
        incoming.push(att);
        filesToUpload.push({ att, file });
      }

      const next = [...valueRef.current, ...incoming];
      onChangeRef.current(next);

      // Kick off uploads in parallel — server-side validation will
      // reject malformed payloads, so no need to serialize.
      filesToUpload.forEach(({ att, file }) => {
        void upload(att, file);
      });
    }, [disabled, maxAttachments, upload]);

    /* ─── Imperative handle for paste / clear / open ─── */
    useImperativeHandle(ref, () => ({
      handlePaste: (event) => {
        if (disabled) return;
        const items = Array.from(event.clipboardData?.items ?? []);
        const files: File[] = [];
        for (const item of items) {
          if (item.kind === "file") {
            const f = item.getAsFile();
            if (f) files.push(f);
          }
        }
        if (files.length > 0) {
          // Prevent the default paste only when files are present —
          // otherwise we'd swallow plain-text pastes too.
          event.preventDefault();
          void handleFiles(files);
        }
      },
      clear: () => onChangeRef.current([]),
      open: () => fileInputRef.current?.click(),
    }), [disabled, handleFiles]);

    const removeOne = (id: string) => {
      onChangeRef.current(valueRef.current.filter((a) => a.id !== id));
    };

    const slotsLeft = maxAttachments - value.length;
    const accentClass = variant === "admin" ? "text-gray-500 hover:text-gray-700" : "text-gray-500 hover:text-brand-blue";

    return (
      <>
        {/* Hidden file input + paperclip trigger. The chip strip is
            rendered separately by <ChatAttachmentChips>, so the parent
            can place it wherever fits the layout (typically above the
            text input row). */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            void handleFiles(files);
            // Reset so picking the same file twice still triggers onChange.
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || slotsLeft === 0}
          aria-label={slotsLeft === 0 ? "Attachment limit reached" : "Attach a file"}
          title={slotsLeft === 0 ? `Up to ${maxAttachments} files` : "Attach a file (PDF, image, Word, Excel, EML)"}
          className={`p-2 rounded-lg ${accentClass} disabled:opacity-40 transition-colors`}
        >
          <Paperclip className="w-4 h-4" />
        </button>
      </>
    );
  },
);

export default ChatAttachmentInput;

/**
 * Standalone chip strip that renders one chip per pending /
 * uploaded / failed attachment. Image attachments show a tiny
 * thumbnail; other types fall back to a kind-specific icon.
 *
 * Kept in the same module as the trigger so consumers only have to
 * import from one path. Place it above the text input row in your
 * chat UI.
 */
export function ChatAttachmentChips({
  value, onRemove,
}: {
  value: ChatAttachment[];
  onRemove: (id: string) => void;
}) {
  if (value.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-2 pt-2">
      {value.map((att) => {
        const Icon = iconFor(att.mime);
        return (
          <div
            key={att.id}
            className={`group inline-flex items-center gap-1.5 max-w-[200px] rounded-md border px-2 py-1 text-[11px] font-medium ${
              att.status === "failed"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-gray-200 bg-gray-50 text-gray-700"
            }`}
            title={att.status === "failed" ? att.error : `${att.filename} · ${fmtSize(att.size)}`}
          >
            {att.preview ? (
              <img
                src={att.preview}
                alt=""
                className="w-4 h-4 rounded object-cover flex-shrink-0"
              />
            ) : att.status === "failed" ? (
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
            ) : (
              <Icon className="w-3 h-3 flex-shrink-0" />
            )}
            <span className="truncate">{att.filename}</span>
            {att.status === "pending" && (
              <Loader2 className="w-3 h-3 flex-shrink-0 animate-spin text-gray-400" aria-label="uploading" />
            )}
            <button
              type="button"
              onClick={() => onRemove(att.id)}
              aria-label={`Remove ${att.filename}`}
              className="text-gray-400 hover:text-gray-700 flex-shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
