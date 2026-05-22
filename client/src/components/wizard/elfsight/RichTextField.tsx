// RichTextField — BD-3d Feature 1.
//
// Expand-on-click rich-text editor for the wizard's heading / footer / title /
// subtitle fields. Default state is a compact 40px-tall one-line preview of
// the current value. Clicking it expands a 240px-tall editor panel with a
// toolbar (B / I / U, font size, color, emoji, inline image) and a
// contentEditable body. Blur or "Done" collapses back and saves sanitized
// HTML to the parent's onChange callback.
//
// HARD RULES (BD-3d brief):
//   - No heavy deps (no DOMPurify, no react-rich-text-editor). Tiny inline
//     sanitizer stripping <script>, <style>, <iframe>, on* attrs, and any
//     javascript: urls. Defense-in-depth: sanitizes on read as well as write.
//   - NO custom-code button (security + non-technical user base).
//   - Emoji picker is a hardcoded grid of ~32 common emojis (no external dep).
//   - Image insert: <2MB, data URL, max-width:100% inline style.
//   - prefers-reduced-motion respected (no animation when set).
//   - InfoCue stays top-right of the field (Alex's title-in-field rule).
//   - Max 2px gaps between toolbar buttons.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bold, Italic, Underline, Smile, Image as ImageIcon, Type, Palette, Check } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import InfoCue from './InfoCue';
import type { WidgetRegion } from './WidgetSchema';
import { sanitizeRichHtml } from './richTextSanitize';

const p = platformTheme;

interface Props {
  label: string;
  htmlFor: string;
  value: string;
  onChange: (next: string) => void;
  /** Placeholder shown when value is empty. */
  placeholder?: string;
  /** Top-right InfoCue popover copy. */
  infoText?: string;
  infoTestid?: string;
  /** BD-3h — optional widget-region key forwarded into the InfoCue popover.
   *  When set, the popover renders a wireframe with that region highlighted. */
  infoRegion?: WidgetRegion;
  /** testid for the field's root (the collapsed preview). */
  testid?: string;
}

// 32 common, owner-friendly emojis. Hardcoded to avoid bundling an emoji set.
const EMOJI_GRID = [
  '😀', '😊', '😎', '👍', '👌', '🙌', '👏', '🙏',
  '🔥', '✨', '⭐', '💯', '✅', '❤️', '🎉', '🎯',
  '🔧', '🔨', '🛠️', '🧰', '📐', '🪜', '🚿', '🚰',
  '📅', '⏰', '💰', '💵', '📞', '📧', '📍', '🚀',
];

// 8 brand-aligned color swatches + a custom hex input.
const COLOR_SWATCHES = [
  '#1a1a1a', '#6b7280', '#0d3cfc', '#16a34a',
  '#dc2626', '#f59e0b', '#7c3aed', '#0891b2',
];

const FONT_SIZE_OPTIONS = [
  { label: 'S', px: 12 },
  { label: 'M', px: 14 },
  { label: 'L', px: 16 },
  { label: 'XL', px: 20 },
];

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export default function RichTextField({
  label, htmlFor, value, onChange,
  placeholder = '', infoText, infoTestid, infoRegion, testid,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sanitize incoming value defensively on every read (rule: sanitize on read
  // too — see brief).
  const safeValue = useMemo(() => sanitizeRichHtml(value ?? ''), [value]);

  // Honour prefers-reduced-motion for the expand transition.
  const reduceMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch { return false; }
  }, []);

  // When entering expanded mode, seed the contentEditable with current
  // sanitized HTML, then focus + place caret at end.
  useEffect(() => {
    if (!expanded) return;
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== safeValue) el.innerHTML = safeValue;
    // Focus + caret to end.
    setTimeout(() => {
      el.focus();
      try {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch { /* ignore */ }
    }, 0);
  }, [expanded, safeValue]);

  // Collapse + save when the user clicks outside the expanded editor.
  useEffect(() => {
    if (!expanded) return;
    const onDocDown = (e: MouseEvent | PointerEvent) => {
      const t = e.target as Node;
      if (!rootRef.current) return;
      if (rootRef.current.contains(t)) return;
      // Close any open sub-menus before saving.
      setEmojiOpen(false);
      setColorOpen(false);
      setSizeOpen(false);
      commit();
      setExpanded(false);
    };
    document.addEventListener('pointerdown', onDocDown, true);
    return () => document.removeEventListener('pointerdown', onDocDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const commit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const next = sanitizeRichHtml(el.innerHTML);
    if (next !== safeValue) onChange(next);
  }, [onChange, safeValue]);

  // Toolbar action helper. document.execCommand is deprecated in spec but
  // remains the simplest cross-browser way to format selected text inside a
  // contentEditable div without adding a library.
  const exec = useCallback((cmd: string, arg?: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    try { document.execCommand(cmd, false, arg); } catch { /* ignore */ }
  }, []);

  const insertHtmlAtCaret = useCallback((html: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    try {
      // Prefer execCommand insertHTML — keeps selection caret consistent.
      const ok = document.execCommand('insertHTML', false, html);
      if (!ok) {
        // Fallback: append at end.
        el.innerHTML += html;
      }
    } catch {
      el.innerHTML += html;
    }
  }, []);

  const handleImagePick = useCallback(async (file: File) => {
    setImageError(null);
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('image too large, try under 2MB');
      return;
    }
    if (!/^image\/(png|jpeg|jpg|svg\+xml|gif|webp)$/i.test(file.type)) {
      setImageError('unsupported image type');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl.startsWith('data:image/')) {
        setImageError('failed to read image');
        return;
      }
      // Inline image, capped at 100% width to keep the heading/subtitle sane.
      insertHtmlAtCaret(`<img src="${dataUrl}" style="max-width:100%;height:auto;vertical-align:middle;" alt="" />`);
    };
    reader.onerror = () => setImageError('failed to read image');
    reader.readAsDataURL(file);
  }, [insertHtmlAtCaret]);

  // Compact preview — strips HTML for a clean one-liner that doesn't
  // visually compete with surrounding inputs (rendered text only).
  const compactPreviewText = useMemo(() => {
    const tmp = document.createElement('div');
    tmp.innerHTML = safeValue;
    const text = (tmp.textContent || '').trim();
    return text;
  }, [safeValue]);

  const tid = testid ?? `rich-text-${htmlFor}`;
  const transition = reduceMotion ? 'none' : 'height 160ms ease-out, box-shadow 160ms ease-out';

  return (
    <div
      ref={rootRef}
      className={`qq-rtf-root${expanded ? ' qq-rtf-expanded' : ''}`}
      data-testid={tid}
    >
      {!expanded && (
        <button
          type="button"
          className="qq-rtf-preview premium-input"
          onClick={() => setExpanded(true)}
          id={htmlFor}
          data-testid={`${tid}-preview`}
          aria-label={`${label} — click to edit`}
          aria-expanded={false}
        >
          <span className="qq-rtf-preview-text">
            {compactPreviewText
              ? compactPreviewText
              : <span className="qq-rtf-placeholder">{placeholder || `Click to add ${label.toLowerCase()}`}</span>
            }
          </span>
          <label htmlFor={htmlFor} className="qq-rtf-floating-label">{label}</label>
          {infoText && (
            <span className="qq-rtf-info">
              <InfoCue testid={infoTestid ?? `${htmlFor}-info`} text={infoText} region={infoRegion} />
            </span>
          )}
        </button>
      )}

      {expanded && (
        <div
          className="qq-rtf-panel"
          data-testid={`${tid}-panel`}
          style={{ transition }}
        >
          <div className="qq-rtf-toolbar" role="toolbar" aria-label={`${label} formatting`}>
            <button type="button" className="qq-rtf-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')} aria-label="Bold" data-testid={`${tid}-bold`}>
              <Bold size={14} />
            </button>
            <button type="button" className="qq-rtf-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')} aria-label="Italic" data-testid={`${tid}-italic`}>
              <Italic size={14} />
            </button>
            <button type="button" className="qq-rtf-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')} aria-label="Underline" data-testid={`${tid}-underline`}>
              <Underline size={14} />
            </button>

            <div className="qq-rtf-sep" />

            <div className="qq-rtf-dropdown-wrap">
              <button type="button" className="qq-rtf-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => { setSizeOpen(v => !v); setEmojiOpen(false); setColorOpen(false); }} aria-label="Font size" data-testid={`${tid}-size`}>
                <Type size={14} />
              </button>
              {sizeOpen && (
                <div className="qq-rtf-menu" data-testid={`${tid}-size-menu`}>
                  {FONT_SIZE_OPTIONS.map(opt => (
                    <button
                      key={opt.px}
                      type="button"
                      className="qq-rtf-menu-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        // Wrap the selection in a span with the font-size.
                        insertHtmlAtCaret(`<span style="font-size:${opt.px}px;">${window.getSelection()?.toString() ?? ''}</span>`);
                        setSizeOpen(false);
                      }}
                      data-testid={`${tid}-size-${opt.label}`}
                    >
                      <span style={{ fontSize: `${opt.px}px` }}>{opt.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="qq-rtf-dropdown-wrap">
              <button type="button" className="qq-rtf-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => { setColorOpen(v => !v); setEmojiOpen(false); setSizeOpen(false); }} aria-label="Text color" data-testid={`${tid}-color`}>
                <Palette size={14} />
              </button>
              {colorOpen && (
                <div className="qq-rtf-menu qq-rtf-menu--color" data-testid={`${tid}-color-menu`}>
                  <div className="qq-rtf-swatches">
                    {COLOR_SWATCHES.map(c => (
                      <button
                        key={c}
                        type="button"
                        className="qq-rtf-swatch"
                        style={{ background: c }}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { exec('foreColor', c); setColorOpen(false); }}
                        aria-label={`Color ${c}`}
                        data-testid={`${tid}-color-${c}`}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    className="qq-rtf-color-custom"
                    onMouseDown={(e) => e.preventDefault()}
                    onChange={(e) => { exec('foreColor', e.target.value); }}
                    aria-label="Custom color"
                    data-testid={`${tid}-color-custom`}
                  />
                </div>
              )}
            </div>

            <div className="qq-rtf-dropdown-wrap">
              <button type="button" className="qq-rtf-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => { setEmojiOpen(v => !v); setColorOpen(false); setSizeOpen(false); }} aria-label="Insert emoji" data-testid={`${tid}-emoji`}>
                <Smile size={14} />
              </button>
              {emojiOpen && (
                <div className="qq-rtf-menu qq-rtf-menu--emoji" data-testid={`${tid}-emoji-menu`}>
                  {EMOJI_GRID.map(em => (
                    <button
                      key={em}
                      type="button"
                      className="qq-rtf-emoji"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { insertHtmlAtCaret(em); setEmojiOpen(false); }}
                      aria-label={`Emoji ${em}`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button type="button" className="qq-rtf-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => fileInputRef.current?.click()} aria-label="Insert image" data-testid={`${tid}-image`}>
              <ImageIcon size={14} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/gif,image/webp"
              style={{ display: 'none' }}
              data-testid={`${tid}-image-file`}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImagePick(f);
                // Reset value so picking the same file twice still fires.
                e.target.value = '';
              }}
            />

            <div className="qq-rtf-spacer" />

            <button
              type="button"
              className="qq-rtf-done"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                commit();
                setExpanded(false);
                setEmojiOpen(false);
                setColorOpen(false);
                setSizeOpen(false);
              }}
              aria-label="Done editing"
              data-testid={`${tid}-done`}
            >
              <Check size={13} /> Done
            </button>
          </div>

          <div
            ref={editorRef}
            className="qq-rtf-editor"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={label}
            data-testid={`${tid}-editor`}
            spellCheck
            onInput={() => { /* live edits committed on blur/done; no need to setState on every keystroke */ }}
            onBlur={() => commit()}
          />

          {imageError && (
            <div className="qq-rtf-error" role="alert" data-testid={`${tid}-image-error`}>
              {imageError}
            </div>
          )}

          {/* In-field label + InfoCue stay visible in the expanded panel
              header so users keep the context of which field they're editing. */}
          <div className="qq-rtf-panel-label">
            <span>{label}</span>
            {infoText && (
              <span className="qq-rtf-info qq-rtf-info--panel">
                <InfoCue testid={infoTestid ?? `${htmlFor}-info`} text={infoText} region={infoRegion} />
              </span>
            )}
          </div>
        </div>
      )}

      <style>{`
        .qq-rtf-root { position: relative; }

        .qq-rtf-preview {
          position: relative;
          width: 100%;
          min-height: 40px;
          padding: 9px 36px 9px 12px;
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 8px;
          text-align: left;
          cursor: pointer;
          font: inherit;
          color: ${p.colors.body};
          display: flex; align-items: center;
          transition: ${reduceMotion ? 'none' : 'border-color 0.1s ease, box-shadow 0.1s ease'};
          outline: none;
        }
        .qq-rtf-preview:hover { border-color: ${p.colors.accent}; }
        .qq-rtf-preview:focus { border-color: ${p.colors.accent}; box-shadow: ${p.shadows.focus}; }

        .qq-rtf-preview-text {
          flex: 1;
          font-size: 13px;
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .qq-rtf-placeholder { color: ${p.colors.subtle}; }

        .qq-rtf-floating-label {
          position: absolute;
          top: -7px; left: 10px;
          font-size: 10.5px; font-weight: 600;
          color: ${p.colors.muted};
          background: #fff;
          padding: 0 4px;
          pointer-events: none;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .qq-rtf-info {
          position: absolute;
          top: 4px; right: 4px;
        }

        .qq-rtf-panel {
          position: relative;
          width: 100%;
          height: 240px;
          background: #fff;
          border: 1.5px solid ${p.colors.accent};
          border-radius: 10px;
          box-shadow: 0 6px 20px rgba(0,0,0,0.10);
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .qq-rtf-toolbar {
          display: flex; align-items: center; gap: 2px;
          padding: 4px 6px;
          background: #fafbfc;
          border-bottom: 1px solid ${p.colors.borderLight};
          flex-shrink: 0;
        }
        .qq-rtf-btn {
          width: 26px; height: 26px;
          display: flex; align-items: center; justify-content: center;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 5px;
          color: ${p.colors.body};
          cursor: pointer;
          transition: ${reduceMotion ? 'none' : 'background 0.1s, border-color 0.1s'};
        }
        .qq-rtf-btn:hover { background: ${p.colors.accentLighter}; border-color: ${p.colors.accent}; }
        .qq-rtf-sep {
          width: 1px; height: 18px;
          background: ${p.colors.borderLight};
          margin: 0 2px;
        }
        .qq-rtf-spacer { flex: 1; }
        .qq-rtf-done {
          display: flex; align-items: center; gap: 4px;
          padding: 4px 9px;
          background: ${p.colors.accent};
          color: #fff;
          border: none;
          border-radius: 5px;
          font-size: 12px; font-weight: 600;
          cursor: pointer;
        }
        .qq-rtf-done:hover { filter: brightness(1.05); }

        .qq-rtf-dropdown-wrap { position: relative; }
        .qq-rtf-menu {
          position: absolute;
          top: 30px; left: 0;
          z-index: 50;
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 8px;
          box-shadow: 0 6px 16px rgba(0,0,0,0.12);
          padding: 6px;
        }
        .qq-rtf-menu-item {
          display: block;
          width: 100%;
          padding: 5px 10px;
          background: transparent;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          text-align: left;
          font: inherit;
        }
        .qq-rtf-menu-item:hover { background: ${p.colors.accentLighter}; }

        .qq-rtf-menu--color { padding: 8px; }
        .qq-rtf-swatches {
          display: grid;
          grid-template-columns: repeat(4, 20px);
          gap: 4px;
          margin-bottom: 6px;
        }
        .qq-rtf-swatch {
          width: 20px; height: 20px;
          border-radius: 4px;
          border: 1px solid ${p.colors.borderLight};
          cursor: pointer;
        }
        .qq-rtf-color-custom {
          width: 100%; height: 26px;
          border: 1px solid ${p.colors.borderLight};
          border-radius: 4px;
          cursor: pointer;
          background: #fff;
        }

        .qq-rtf-menu--emoji {
          display: grid;
          grid-template-columns: repeat(8, 22px);
          gap: 2px;
          padding: 6px;
        }
        .qq-rtf-emoji {
          width: 22px; height: 22px;
          display: flex; align-items: center; justify-content: center;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px; line-height: 1;
        }
        .qq-rtf-emoji:hover { background: ${p.colors.accentLighter}; border-color: ${p.colors.accent}; }

        .qq-rtf-editor {
          flex: 1;
          padding: 10px 12px;
          font-size: 14px;
          line-height: 1.5;
          outline: none;
          overflow-y: auto;
          color: ${p.colors.body};
        }
        .qq-rtf-editor img { max-width: 100%; height: auto; }

        .qq-rtf-error {
          padding: 4px 10px;
          background: #fff3f3;
          color: #b91c1c;
          font-size: 12px;
          border-top: 1px solid #fca5a5;
        }

        .qq-rtf-panel-label {
          position: absolute;
          top: -7px; left: 10px;
          padding: 0 4px;
          background: #fff;
          font-size: 10.5px; font-weight: 600;
          color: ${p.colors.accent};
          text-transform: uppercase;
          letter-spacing: 0.04em;
          display: flex; align-items: center; gap: 4px;
        }
        .qq-rtf-info--panel {
          position: static;
        }
      `}</style>
    </div>
  );
}
