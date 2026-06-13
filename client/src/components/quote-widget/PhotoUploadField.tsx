/**
 * PRICING-MODELS (U2) — `photo_upload` runtime field.
 *
 * Dashed "Add photos" tile + a 64 px thumb grid. Each picked photo uploads
 * IMMEDIATELY (per-thumb progress via XHR `upload.onprogress`) to the public
 * `POST /api/quote-widget/upload` endpoint (U4 — base64-JSON pattern cloned
 * from chatAttachmentRoutes: `{calculator_id, field_id, filename, data}` →
 * `{ok, url}`). Failures get a retry badge; an endpoint 404 (U4 not deployed
 * yet) degrades to a one-line "uploads unavailable" note.
 *
 * HARD RULE: submit NEVER blocks on photos. The answer carries whatever
 * uploaded successfully (`{photos: [{url, name}], failed}`) and rides the
 * lead's `answers` jsonb; the field contributes 0 to the formula context.
 *
 * Editor preview (no `calculatorId` — contact_form disabled-submit pattern):
 * picking files shows local thumbs tagged "preview"; nothing uploads.
 *
 * Local state holds the upload lifecycle (object-URL previews, progress);
 * the parent owns the durable answer, so the grid survives step navigation
 * (rebuilt from `value.photos` on remount — in-flight uploads do not).
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { WidgetTheme } from './widgetThemes';
import { guardTextColor } from '@/lib/contrastGuard';

/** One successfully uploaded photo (rides in the lead `answers` jsonb). */
export interface UploadedPhoto { url: string; name: string }

/** The persisted answer for a `photo_upload` field. */
export interface PhotoAnswer {
  photos: UploadedPhoto[];
  /** Count of picks that failed to upload (omitted when 0). */
  failed?: number;
}

/** Runtime type guard — answers round-trip through JSON / template swaps. */
export function isPhotoAnswer(v: unknown): v is PhotoAnswer {
  return !!v && typeof v === 'object' && !Array.isArray(v)
    && Array.isArray((v as PhotoAnswer).photos);
}

/** Render-time clamps (server enforces its own hard caps — U4). */
export function clampMaxPhotos(n: number | undefined): number {
  if (typeof n !== 'number' || !isFinite(n)) return 3;
  return Math.max(1, Math.min(5, Math.round(n)));
}

type ItemStatus = 'uploading' | 'done' | 'error' | 'preview';

interface UploadItem {
  key: string;
  name: string;
  /** Object URL (fresh picks) or the server URL (rebuilt from the answer). */
  previewUrl: string;
  status: ItemStatus;
  /** 0..1 while uploading. */
  progress: number;
  url?: string;
  /** Human reason on error; non-retryable client rejections set retryable=false. */
  errorText?: string;
  retryable?: boolean;
  file?: File;
}

interface Props {
  /** Owner's field title — caption row above the grid. */
  label: string;
  /** Caption style from the parent (groupHeaderStyle / stackedLabelStyle). */
  labelStyle: CSSProperties;
  theme: WidgetTheme;
  accent: string;
  fontFamily?: string;
  radiusPx: string;
  value: PhotoAnswer;
  onChange: (next: PhotoAnswer) => void;
  /** Absent → wizard editor preview (local thumbs only, no upload). */
  calculatorId?: number;
  fieldId: string;
  /** Default 3, clamped 1–5. */
  maxPhotos?: number;
  /** Default 8 MB (server enforces the hard cap too). */
  maxPhotoMb?: number;
}

let keySeq = 0;
const nextKey = () => `qq-photo-${Date.now().toString(36)}-${keySeq++}`;

export default function PhotoUploadField({
  label, labelStyle, theme, accent, fontFamily, radiusPx,
  value, onChange, calculatorId, fieldId,
  maxPhotos, maxPhotoMb,
}: Props) {
  const c = theme;
  const isPreview = typeof calculatorId !== 'number';
  const cap = clampMaxPhotos(maxPhotos);
  const maxBytes = (typeof maxPhotoMb === 'number' && isFinite(maxPhotoMb) && maxPhotoMb > 0
    ? maxPhotoMb : 8) * 1024 * 1024;

  // Rebuild the grid from the durable answer on remount (step navigation).
  const [items, setItems] = useState<UploadItem[]>(() =>
    (isPhotoAnswer(value) ? value.photos : []).map((p) => ({
      key: nextKey(), name: p.name, previewUrl: p.url,
      status: 'done' as ItemStatus, progress: 1, url: p.url,
    })));
  const [endpointMissing, setEndpointMissing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Revoke object URLs on unmount only (revoking on every items change would
  // kill the preview of a thumb that's still rendered).
  const objectUrlsRef = useRef<string[]>([]);
  useEffect(() => () => {
    for (const u of objectUrlsRef.current) URL.revokeObjectURL(u);
  }, []);

  /** Apply an item mutation + push the durable answer to the parent. */
  const updateItems = (mutate: (prev: UploadItem[]) => UploadItem[]) => {
    const next = mutate(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
    const failed = next.filter((i) => i.status === 'error').length;
    onChangeRef.current({
      photos: next
        .filter((i) => i.status === 'done' && i.url)
        .map((i) => ({ url: i.url as string, name: i.name })),
      ...(failed > 0 ? { failed } : {}),
    });
  };

  const startUpload = (key: string, file: File) => {
    const reader = new FileReader();
    reader.onerror = () => {
      updateItems((prev) => prev.map((i) => i.key === key
        ? { ...i, status: 'error', errorText: 'Could not read file', retryable: true } : i));
    };
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/quote-widget/upload');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const p = Math.min(0.99, e.loaded / e.total);
        updateItems((prev) => prev.map((i) => i.key === key ? { ...i, progress: p } : i));
      };
      xhr.onerror = () => {
        updateItems((prev) => prev.map((i) => i.key === key
          ? { ...i, status: 'error', errorText: 'Upload failed — tap to retry', retryable: true } : i));
      };
      xhr.onload = () => {
        if (xhr.status === 404) {
          // U4 endpoint not deployed — degrade gracefully, never block.
          setEndpointMissing(true);
          updateItems((prev) => prev.filter((i) => i.key !== key));
          return;
        }
        let body: { ok?: boolean; url?: string; reason?: string } | null = null;
        try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
        if (xhr.status >= 200 && xhr.status < 300 && body && body.ok !== false
          && typeof body.url === 'string' && body.url) {
          updateItems((prev) => prev.map((i) => i.key === key
            ? { ...i, status: 'done', progress: 1, url: body!.url } : i));
        } else {
          // Map the server's enumerated `reason` (quoteWidgetUploadRoutes.ts:
          // too_large/bad_type/quota/not_found/bad_request/error) to friendly
          // copy, falling back to status-code inference for non-JSON errors.
          // A 429/quota is NON-retryable — retrying instantly re-burns the
          // per-IP limiter and just fails again; tell them to wait a minute.
          const reason = body?.reason;
          const isQuota = xhr.status === 429 || reason === 'quota';
          const isTooLarge = xhr.status === 413 || reason === 'too_large';
          const isBadType = xhr.status === 415 || reason === 'bad_type';
          updateItems((prev) => prev.map((i) => i.key === key
            ? {
              ...i, status: 'error', retryable: !isQuota && !isTooLarge && !isBadType,
              errorText: isTooLarge ? `That image is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`
                : isBadType ? 'Please use a JPG, PNG, or WebP image'
                  : isQuota ? 'You’ve added a lot of photos — try again in a minute'
                    : reason === 'not_found' ? 'Photo uploads aren’t available for this quote'
                      : 'Upload failed — tap to retry',
            } : i));
        }
      };
      xhr.send(JSON.stringify({
        calculator_id: calculatorId,
        field_id: fieldId,
        filename: file.name || 'photo.jpg',
        data: base64,
      }));
    };
    reader.readAsDataURL(file);
  };

  const onPick = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = cap - itemsRef.current.filter((i) => i.status !== 'error').length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    const additions: UploadItem[] = [];
    for (const file of picked) {
      const key = nextKey();
      const isImage = (file.type || '').toLowerCase().startsWith('image/');
      const tooBig = file.size > maxBytes;
      const previewUrl = isImage ? URL.createObjectURL(file) : '';
      if (previewUrl) objectUrlsRef.current.push(previewUrl);
      if (!isImage) {
        additions.push({
          key, name: file.name, previewUrl: '', status: 'error', progress: 0,
          errorText: 'Photos only (JPG, PNG…)', retryable: false,
        });
      } else if (tooBig) {
        additions.push({
          key, name: file.name, previewUrl, status: 'error', progress: 0,
          errorText: `Too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`, retryable: false,
        });
      } else if (isPreview) {
        additions.push({ key, name: file.name, previewUrl, status: 'preview', progress: 1, file });
      } else {
        additions.push({ key, name: file.name, previewUrl, status: 'uploading', progress: 0, file });
      }
    }
    if (additions.length === 0) return;
    updateItems((prev) => [...prev, ...additions]);
    if (!isPreview && !endpointMissing) {
      for (const a of additions) {
        if (a.status === 'uploading' && a.file) startUpload(a.key, a.file);
      }
    }
    // Allow re-picking the same file after a remove.
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeItem = (key: string) => updateItems((prev) => prev.filter((i) => i.key !== key));

  const retryItem = (key: string) => {
    const item = itemsRef.current.find((i) => i.key === key);
    if (!item || !item.file || endpointMissing || isPreview) return;
    updateItems((prev) => prev.map((i) => i.key === key
      ? { ...i, status: 'uploading', progress: 0, errorText: undefined } : i));
    startUpload(key, item.file);
  };

  const uploadedCount = items.filter((i) => i.status === 'done' || i.status === 'preview').length;
  const activeCount = items.filter((i) => i.status !== 'error').length;
  const atCap = activeCount >= cap;
  const countFg = guardTextColor(c.textMuted, c.bg, 'photoUploadCount');
  // Thumb overlays paint on an ALWAYS-dark scrim (rgba black), theme-
  // independent — guard the white against the opaque scrim base anyway so
  // the pair stays self-healing if the scrim ever lightens.
  const scrimFg = guardTextColor('#ffffff', 'rgb(20,20,20)', 'photoUploadScrim');
  const noteFg = guardTextColor(c.textMuted, c.bg, 'photoUploadNote');
  const errFg = guardTextColor('#dc2626', c.bg, 'photoUploadError');
  const tileFg = guardTextColor(c.textMuted, c.bg, 'photoUploadTile');

  const thumbBase: CSSProperties = {
    position: 'relative', width: 64, height: 64, flexShrink: 0,
    borderRadius: 10, overflow: 'hidden',
    border: `1px solid ${c.border}`, background: c.surface,
    boxSizing: 'border-box',
  };
  const overlayBadge: CSSProperties = {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: 'rgba(0,0,0,0.45)',
    color: scrimFg, fontSize: 11, fontWeight: 700, fontFamily,
    border: 'none', cursor: 'pointer', padding: 0,
  };
  const removeBtn: CSSProperties = {
    position: 'absolute', top: 2, right: 2, width: 18, height: 18,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
    background: 'rgba(0,0,0,0.62)', color: scrimFg, fontSize: 11,
    lineHeight: 1, zIndex: 2,
  };

  const addTile = (big: boolean) => (
    <button
      type="button"
      data-testid={`adv-photo-add-${fieldId}`}
      onClick={() => fileInputRef.current?.click()}
      disabled={atCap || endpointMissing}
      aria-label="Add photos"
      style={{
        display: 'flex', flexDirection: big ? 'row' : 'column',
        alignItems: 'center', justifyContent: 'center', gap: big ? 8 : 2,
        width: big ? '100%' : 64, height: 64, boxSizing: 'border-box',
        border: `1.5px dashed ${c.border}`, borderRadius: big ? radiusPx : 10,
        background: 'transparent', color: tileFg,
        fontSize: big ? 13 : 10, fontWeight: 600, fontFamily,
        cursor: atCap || endpointMissing ? 'not-allowed' : 'pointer',
        opacity: atCap || endpointMissing ? 0.5 : 1,
      }}
    >
      <svg width={big ? 18 : 16} height={big ? 18 : 16} viewBox="0 0 24 24" aria-hidden>
        <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor"
          strokeWidth={2.25} strokeLinecap="round" />
      </svg>
      <span>Add photos</span>
    </button>
  );

  return (
    <div data-testid={`adv-photo-${fieldId}`}>
      {/* Caption row — owner's title left, "2/3" count right. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        {label ? (
          <label className="qq-w-grouplabel" style={{ ...labelStyle, minWidth: 0 }}>{label}</label>
        ) : <span />}
        <span
          data-testid={`adv-photo-count-${fieldId}`}
          style={{ fontSize: 12, fontWeight: 600, color: countFg, fontFamily, flexShrink: 0 }}
        >{uploadedCount}/{cap}</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={cap > 1}
        onChange={(e) => onPick(e.target.files)}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />

      {items.length === 0 ? (
        addTile(true)
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {items.map((item) => (
            <div key={item.key} style={thumbBase} data-photo-status={item.status}>
              {item.previewUrl ? (
                <img
                  src={item.previewUrl}
                  alt={item.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <span aria-hidden="true" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '100%', height: '100%', fontSize: 20, color: c.textMuted,
                }}>🖼</span>
              )}
              <button
                type="button"
                aria-label={`Remove ${item.name}`}
                data-testid={`adv-photo-remove-${fieldId}-${item.key}`}
                onClick={() => removeItem(item.key)}
                style={removeBtn}
              >×</button>
              {item.status === 'uploading' && (
                <>
                  {/* Per-thumb progress — dark scrim + bottom accent bar. */}
                  <span aria-hidden="true" style={{ ...overlayBadge, cursor: 'default' } as CSSProperties}>
                    {Math.round(item.progress * 100)}%
                  </span>
                  <span aria-hidden="true" style={{
                    position: 'absolute', left: 0, bottom: 0, height: 4,
                    width: `${Math.round(item.progress * 100)}%`,
                    background: accent, transition: 'width 200ms ease', zIndex: 1,
                  }} />
                </>
              )}
              {item.status === 'error' && (
                item.retryable ? (
                  <button
                    type="button"
                    data-testid={`adv-photo-retry-${fieldId}-${item.key}`}
                    onClick={() => retryItem(item.key)}
                    title={item.errorText}
                    style={overlayBadge}
                  >↻ Retry</button>
                ) : (
                  <span title={item.errorText} style={{ ...overlayBadge, cursor: 'default' } as CSSProperties}>!</span>
                )
              )}
              {item.status === 'preview' && (
                <span aria-hidden="true" style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.55)', color: scrimFg,
                  fontSize: 9, fontWeight: 700, textAlign: 'center',
                  padding: '1px 0', letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>preview</span>
              )}
            </div>
          ))}
          {!atCap && !endpointMissing && addTile(false)}
        </div>
      )}

      {/* Honest one-liners — never block the quote on photos. */}
      {endpointMissing && (
        <p data-testid={`adv-photo-unavailable-${fieldId}`} style={{
          margin: '6px 0 0', fontSize: '12.5px', color: noteFg, fontFamily, lineHeight: 1.45,
        }}>
          Photo uploads aren&apos;t available right now — you can still get your quote.
        </p>
      )}
      {!endpointMissing && items.some((i) => i.status === 'error' && !i.retryable) && (
        <p role="alert" style={{
          margin: '6px 0 0', fontSize: '12.5px', color: errFg, fontFamily, lineHeight: 1.45,
        }}>
          {items.find((i) => i.status === 'error' && !i.retryable)?.errorText}
        </p>
      )}
      {isPreview && items.length > 0 && (
        <p style={{
          margin: '6px 0 0', fontSize: '12.5px', color: noteFg, fontFamily, lineHeight: 1.45,
        }}>
          Sample only — customer photos upload once the calculator is saved.
        </p>
      )}
    </div>
  );
}
