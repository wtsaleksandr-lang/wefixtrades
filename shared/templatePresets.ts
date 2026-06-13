/**
 * QuoteQuick template catalogue — the SINGLE SOURCE OF TRUTH.
 *
 * Each entry is a complete, Elfsight-shaped `TemplateConfig`: a pure JSON
 * config object (fields, calculations, header, result settings, layout, theme)
 * consumed by ONE generic renderer (`AdvancedCalculator.tsx`). Picking a
 * template in the wizard drops the whole config into the builder, where every
 * part stays editable.
 *
 * Unified schema (builder-foundation refactor):
 *  - One canonical `TemplateConfig` type — fields/calculations/header/results
 *    are TOP-LEVEL (not nested under `advanced`).
 *  - `category` + `trades` added so Phase 2's categorized gallery and Phase 3's
 *    premium templates can filter/recommend without a second taxonomy module.
 *  - `layout` uses the real layout enum (`single-column | two-column |
 *    multi-column`) — see `TemplateLayout` below.
 *
 * The runtime config persisted on a calculator (`calculator_settings.advanced`)
 * is produced from a `TemplateConfig` via `toAdvancedConfig()` — that shape is
 * intentionally unchanged so no stored calculator needs migration.
 */

/* ─── Layout ─── */

/**
 * The three real layouts. Replaces the old fake `single_page | two_column |
 * multi_step` enum. The renderer maps each to a CSS Grid:
 *  - single-column — one stacked column, result below the inputs.
 *  - two-column    — inputs column + result column, side by side.
 *  - multi-column  — a 3-up responsive grid of inputs with the result panel.
 * All three collapse to a clean single column on narrow screens.
 */
export type TemplateLayout = 'single-column' | 'two-column' | 'multi-column';

export const TEMPLATE_LAYOUTS: ReadonlyArray<{
  id: TemplateLayout; name: string; description: string;
}> = [
  { id: 'single-column', name: 'Single column', description: 'Everything stacked top to bottom, with the price below.' },
  { id: 'two-column', name: 'Two column', description: 'Inputs on the left, a live price panel on the right.' },
  { id: 'multi-column', name: 'Multi column', description: 'A 3-up grid of inputs with the result panel — for richer calculators.' },
];

/**
 * Back-compat: map any legacy advanced-layout value to the new enum. Stored
 * calculators created before this refactor carry `single_page | two_column |
 * multi_step`; coerce on read so nothing breaks.
 */
export function normalizeLayout(value: unknown): TemplateLayout {
  switch (value) {
    case 'single-column':
    case 'two-column':
    case 'multi-column':
      return value;
    case 'two_column':
      return 'two-column';
    case 'multi_step':
      return 'multi-column';
    case 'single_page':
      return 'single-column';
    default:
      return 'two-column';
  }
}

/* ─── Video embed parsing (FIELD-PALETTE) ─── */

/**
 * FIELD-PALETTE — parse an owner-pasted video URL into a sandboxed embed src.
 *
 * Accepts:
 *  - YouTube watch URLs (`https://www.youtube.com/watch?v=<id>`)
 *  - YouTube short links (`https://youtu.be/<id>`)
 *  - YouTube `/embed/<id>` / `/shorts/<id>` / `/live/<id>` URLs
 *  - Vimeo URLs (`https://vimeo.com/<id>`, `https://player.vimeo.com/video/<id>`)
 *  - A bare YouTube id (11 chars) or bare numeric Vimeo id.
 *
 * SECURITY: only YouTube + Vimeo hosts are ever produced — an arbitrary or
 * unparseable URL returns `null` so the renderer can show a placeholder
 * instead of injecting an attacker-controlled iframe (no XSS via host).
 *
 * @returns the embed src (`https://www.youtube.com/embed/<id>` or
 *   `https://player.vimeo.com/video/<id>`), or `null` when nothing matched.
 */
export function parseVideoEmbedSrc(raw: string | undefined | null): string | null {
  const input = (raw ?? '').trim();
  if (input === '') return null;

  // Bare YouTube id (exactly 11 url-safe chars, no scheme/slash/dot).
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) {
    return `https://www.youtube.com/embed/${input}`;
  }
  // Bare numeric Vimeo id.
  if (/^\d{6,12}$/.test(input)) {
    return `https://player.vimeo.com/video/${input}`;
  }

  let url: URL;
  try {
    url = new URL(input.includes('://') ? input : `https://${input}`);
  } catch {
    return null;
  }
  // Only http(s) — block javascript:, data:, etc.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  // ── YouTube ──────────────────────────────────────────────────────────
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
      return `https://www.youtube.com/embed/${id}`;
    }
    return null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    // /watch?v=<id>
    const v = url.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) {
      return `https://www.youtube.com/embed/${v}`;
    }
    // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
      const id = parts[1];
      if (/^[A-Za-z0-9_-]{11}$/.test(id)) {
        return `https://www.youtube.com/embed/${id}`;
      }
    }
    return null;
  }

  // ── Vimeo ────────────────────────────────────────────────────────────
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    // player.vimeo.com/video/<id>  OR  vimeo.com/<id>
    const parts = url.pathname.split('/').filter(Boolean);
    const id = parts[parts.length - 1];
    if (id && /^\d{6,12}$/.test(id)) {
      return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  }

  // Any other host is rejected (no arbitrary iframe injection).
  return null;
}

/* ─── Field / calculation / header / result types ─── */

export type FieldType =
  | 'number' | 'slider' | 'select' | 'radio'
  | 'multi_select' | 'toggle' | 'text' | 'image_choice' | 'heading'
  // COMPONENTS-1 — Wave U-F1. Display-only types (paragraph / divider /
  // image) persist no answer but render JSX inline alongside inputs. `text`
  // is also surfaced in the picker now (single-line input, was always in
  // the enum but unsurfaced in the new editor).
  | 'paragraph' | 'divider' | 'image'
  // BUILDER-COMPONENTS — content/CTA components. `button` is a tappable
  // action button (opens a URL / tel: / mailto:); `link` is an inline text
  // anchor. Both are display-only — they carry NO answer and contribute
  // nothing to the quote formula (handled alongside the display-only types
  // everywhere `heading`/`paragraph`/`divider`/`image` are excluded).
  | 'button' | 'link'
  // FIELD-PALETTE — `video` is a display-only embed (YouTube / Vimeo). Like
  // the other content types it carries NO answer and is excluded from the
  // quote formula everywhere the display-only types are.
  | 'video'
  // WIZARD-GAPS — `contact_form` is a content component: an inline
  // name + email + message block the owner can place in the widget. It
  // submits via the EXISTING /api/leads lead-capture path (same endpoint the
  // CTA LeadModal / ContactStep use). It carries NO quote answer and is
  // excluded from the formula everywhere the display-only types are.
  | 'contact_form'
  // PRICING-MODELS — three new pricing-model input types (U0 foundation):
  //  - `address_distance` — customer address → server-resolved driving
  //    distance from the business `origin`. Contributes `distanceMiles`
  //    (×2 when `roundTrip`) to the formula context.
  //  - `rate_matrix`      — two dropdowns (row × col) resolved CLIENT-side
  //    against `matrix.rates`; contributes the looked-up lane rate.
  //  - `photo_upload`     — customer photos of the job. Answer-only (rides
  //    in lead `answers` like contact_form); contributes 0 to formulas.
  | 'address_distance' | 'rate_matrix' | 'photo_upload';

export interface TemplateOption {
  id: string;
  /**
   * Short user-facing label. BG-7 Item 3 / 5 — when edited via the wizard's
   * compact `RichTextField`, the value is sanitized HTML (the renderer
   * sanitizes again on read; see `richTextSanitize.ts`). Plain text from
   * older templates / non-rich callers keeps working — the sanitizer treats
   * anything without HTML markup as text.
   */
  label: string;
  value: number;
  /**
   * BG-7 Item 5 — optional rich-text description shown beneath the label.
   * Sanitized HTML. Currently surfaced by the wizard's multi_select / radio
   * / select option editors (i.e. add-on items + option pickers) so owners
   * can attach a short blurb under each option. Absent → no second line
   * renders.
   */
  description?: string;
  /** Wave W-R4 — optional image (data URL) for `image_choice` field cards. */
  image?: string;
  /**
   * BD-2c — optional remote image URL for image-card radio rendering. When
   * any option in a `radio` field carries `imageUrl`, the renderer switches
   * from the legacy text-radio layout to image cards (research: mobile-
   * friendly card pickers vs text radios; faster scanning, no keyboard pop).
   * Distinct from `image` (data URL, image_choice field type) — `imageUrl`
   * is a CDN / stock URL that doesn't bloat the template payload.
   */
  imageUrl?: string;
}

export interface TemplateField {
  id: string; name: string; label: string; type: FieldType;
  required?: boolean; default_value?: number; min?: number; max?: number;
  step?: number; unit?: string; on_value?: number; options?: TemplateOption[];
  /**
   * Optional short explanation rendered BELOW the field in the Elfsight-style
   * stacked layout (`AdvStyle.labelLayout === 'stacked'`). Ignored by the
   * legacy float layout. Keep it to one concise line.
   */
  help?: string;
  /**
   * Optional layout hint — column span inside the inputs grid. `1` (default)
   * means the field occupies one grid column; `2` makes it span the full
   * width. Combined with the natural auto-fit grid this lets two short
   * fields sit side-by-side on a single row without disturbing other
   * templates (which simply leave it unset). Mobile (<=480px) always
   * collapses to a single column regardless.
   */
  colSpan?: 1 | 2;
  /**
   * COMPONENTS-1 — `text` field constraints. `placeholder` is the in-field
   * placeholder string; `maxLength` clamps customer input; `validation`
   * applies a soft hint regex on blur (`email` / `phone` / `url` / `none`).
   * All optional; absent → unconstrained free text.
   */
  placeholder?: string;
  maxLength?: number;
  validation?: 'none' | 'email' | 'phone' | 'url';
  /**
   * COMPONENTS-1 — `multi_select` selection-count guardrails. `minSelect`
   * is the minimum number of options a customer must pick (defaults to 0);
   * `maxSelect` caps the upper bound (undefined → unlimited). The renderer
   * disables further toggles once `maxSelect` is reached.
   */
  minSelect?: number;
  maxSelect?: number;
  /**
   * COMPONENTS-1 — `paragraph` body copy. The display-only paragraph field
   * uses `label` for the wizard-side "name this paragraph" hint, and this
   * `content` slot for the customer-facing rendered text. Keeping them
   * separate lets the Build > Fields list show a meaningful row label even
   * when the body is multi-line.
   */
  content?: string;
  /**
   * COMPONENTS-1 — `divider` styling. Thickness in px (1 default, 2 thicker
   * accent stroke); tone picks between subtle border (`subtle`), the widget
   * accent color (`accent`), or the brand colour (`brand`). All optional.
   */
  dividerThickness?: 1 | 2;
  dividerTone?: 'subtle' | 'accent' | 'brand';
  /**
   * COMPONENTS-1 — `image` field source + caption. `imageUrl` is the
   * absolute URL of the inline image; `imageCaption` renders beneath as
   * muted small text. `imageAlt` is the a11y alt; if absent the renderer
   * falls back to the field `label`. URL-only for v1 — file upload
   * pipeline is a follow-up.
   */
  imageUrl?: string;
  imageCaption?: string;
  imageAlt?: string;
  /**
   * BUILDER-COMPONENTS — `button` + `link` content components. Both use
   * `label` for the visible text the customer taps/clicks. `href` is the
   * destination; for a `button` the `buttonAction` discriminator picks how
   * `href` is interpreted:
   *   - 'url'    → open the URL (new tab, rel=noopener).
   *   - 'tel'    → dial — the renderer prefixes `tel:`.
   *   - 'mailto' → compose — the renderer prefixes `mailto:`.
   * A `link` is always treated as a URL (new tab). All optional so an
   * in-flight edit can partial-update; the renderer no-ops a button/link
   * with an empty href (renders a disabled-looking control in the editor
   * preview, harmless live).
   */
  href?: string;
  buttonAction?: 'url' | 'tel' | 'mailto';
  /**
   * FIELD-PALETTE — `video` content component. `videoUrl` is the raw URL the
   * owner pastes (a YouTube watch / youtu.be / Vimeo URL, or a bare id); the
   * renderer parses it into a sandboxed youtube.com/embed or
   * player.vimeo.com/video src. `videoCaption` renders muted beneath the
   * 16:9 frame. Both optional; an empty / unparseable URL renders a small
   * placeholder rather than a broken iframe.
   */
  videoUrl?: string;
  videoCaption?: string;
  /**
   * WIZARD-GAPS — `contact_form` content component. Renders an inline
   * name + email + message block that submits to the EXISTING /api/leads
   * endpoint (reusing the same lead-capture path as the CTA LeadModal).
   *  - `label`           — the visible heading above the form ("Get in touch").
   *  - `contactRequire`  — which of the three inputs are required. Name + email
   *                        always validate as required when listed; message is
   *                        optional unless the owner adds it here. Defaults
   *                        (when undefined) to name + email required.
   * Carries no quote answer — excluded from the formula context like the other
   * content components.
   */
  contactRequire?: Array<'name' | 'email' | 'message'>;
  /**
   * PRICING-MODELS — `address_distance` field config. The customer types
   * their address (Places autocomplete with plain-text fallback); the
   * SERVER resolves driving distance from the business `origin` (see
   * `AdvancedConfigShape.origin`) — the client never supplies the origin.
   *  - `distanceUnit`        — display unit ('miles' default | 'km').
   *  - `roundTrip`           — when true the contributed distance doubles.
   *  - `maxDistanceMiles`    — beyond this, "outside our service area"
   *                            (lead still captured, quote_amount null).
   *  - `allowManualDistance` — fall back to a manual "Distance in miles"
   *                            input when resolution fails / is rate-capped
   *                            (default true).
   * All optional; absent → sensible defaults at render time.
   */
  distanceUnit?: 'miles' | 'km';
  roundTrip?: boolean;
  maxDistanceMiles?: number;
  allowManualDistance?: boolean;
  /**
   * PRICING-MODELS — `rate_matrix` field config. Rates ship in the config
   * (no secret — CLIENT-resolved, no network). Two dropdowns labeled
   * `rowLabel` / `colLabel`; the customer's pick contributes
   * `rates[rowId][colId]`. `missingCell` controls an absent cell:
   * 'custom_quote' (default) → "quoted individually" note, lead capture
   * proceeds with a null amount; 'zero' → contributes 0.
   * Drayage mapping: rows = ports/ramps, cols = zip zones, rates = lane
   * rates; surcharges compose in the formula (`[Lane Rate]*1.32+150`).
   */
  matrix?: TemplateRateMatrix;
  /**
   * PRICING-MODELS — `photo_upload` field config. Immediate server upload;
   * submit NEVER blocks on photos. Answer-only (contributes 0, like
   * contact_form). `maxPhotos` default 3 (clamped 1-5 at render time);
   * `maxPhotoMb` default 8 (server enforces the hard cap).
   */
  maxPhotos?: number;
  maxPhotoMb?: number;
  /**
   * Wave 61 — per-element inline cosmetic style overrides driven by the
   * floating <InlineStyleToolbar />. Optional; absent → no override (the
   * widget renders with the resolved theme/AdvStyle tokens as before).
   *
   * The renderer (AdvancedCalculator) maps these into inline CSS on the
   * field's outer wrapper (`[data-shell-field-id]`), where it inherits
   * down to the field's label + input chrome. The toolbar is the only
   * UI that mutates this slot today; Style tab continues to control
   * widget-level typography defaults.
   *
   * Every sub-field optional so an in-flight edit can partial-update.
   * Server-side persistence treats this slot as opaque JSON — it's
   * stripped from non-Pro tiers by the same Brand Studio gate that
   * handles other cosmetic overrides, then re-attached on load.
   */
  inlineStyle?: InlineElementStyle;
  /**
   * CONDITIONAL-FIELDS-1 — conditional visibility. When present, this field
   * is rendered ONLY while the rule evaluates true against the current
   * answers; otherwise it is removed from the layout AND treated as
   * unanswered in the formula engine (contributes 0 / [] — never a stale
   * value). Absent → the field is always shown (no behaviour change for
   * every existing template).
   *
   *  - `field` — the `id` of the CONTROLLING field whose answer is tested.
   *  - `op`    — the comparison: `eq` / `ne` (equality, string or number),
   *              `gt` / `lt` / `gte` / `lte` (numeric), or `contains`
   *              (substring for text, membership for a multi_select array).
   *  - `value` — the value to compare against. For a select / radio /
   *              image_choice controller this is the OPTION ID (e.g.
   *              `'premium'`); for a number / slider it's the number; for a
   *              toggle use `1` / `0` (on / off).
   *
   * Single condition only (v1) — one clean "show when" rule per field.
   * Serializable plain JSON so it round-trips through `toAdvancedConfig`
   * and the persisted `calculator_settings.advanced` untouched.
   */
  show_if?: {
    field: string;
    op: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
    value: string | number;
  };
}

/**
 * PRICING-MODELS — the `rate_matrix` field's rate table. Plain serializable
 * JSON so it round-trips through `toAdvancedConfig` and the persisted
 * `calculator_settings.advanced` untouched. Single-axis pricing = one col
 * (the renderer collapses to a single dropdown).
 */
export interface TemplateRateMatrix {
  /** Label over the row dropdown (e.g. "Pickup zone" / "Port"). */
  rowLabel: string;
  /** Label over the column dropdown (e.g. "Drop-off zone" / "Zip zone"). */
  colLabel: string;
  rows: Array<{ id: string; label: string }>;
  cols: Array<{ id: string; label: string }>;
  /** rates[rowId][colId] → lane rate in dollars. Missing cell → `missingCell`. */
  rates: Record<string, Record<string, number>>;
  /** Behaviour for an absent cell. Default 'custom_quote'. */
  missingCell?: 'zero' | 'custom_quote';
}

/**
 * Wave 61 — convert a {@link InlineElementStyle} into a CSS-properties
 * object suitable for spreading into a React inline `style={…}` prop.
 * Returns an empty object when the input is undefined. Pure / no
 * side-effects so it's safe to call from both editor & renderer.
 *
 * Sub-fields:
 *   - `bold` / `italic` / `underline` → font-weight / font-style /
 *     text-decoration (with `inherit` when the toggle is off so the
 *     field still picks up the resolved widget weight when bold=false).
 *   - `color` is applied directly; the toolbar enforces a 7-char hex.
 *   - `fontSize` is clamped at 8..72 at write time; we still re-clamp here
 *     so a stale payload from disk can't push past the bounds.
 *   - `textAlign` maps 1:1 to CSS text-align.
 *   - `letterSpacing` / `lineHeight` map 1:1.
 *
 * `fontFamily` is intentionally NOT resolved here — the renderer already
 * knows the FONT_FAMILY_STACKS map and applies it at a higher level; we
 * surface the chosen id via a CSS custom property so the renderer can
 * resolve it without coupling shared/ to the client font registry.
 */
export function inlineElementStyleToCss(
  s: InlineElementStyle | undefined,
): Record<string, string | number> {
  if (!s) return {};
  const out: Record<string, string | number> = {};
  if (s.bold === true) out.fontWeight = 700;
  if (s.italic === true) out.fontStyle = 'italic';
  if (s.underline === true) out.textDecoration = 'underline';
  if (typeof s.color === 'string' && /^#[0-9a-f]{6}$/i.test(s.color)) {
    out.color = s.color;
  }
  if (typeof s.fontSize === 'number' && Number.isFinite(s.fontSize)) {
    const clamped = Math.max(8, Math.min(72, Math.round(s.fontSize)));
    out.fontSize = `${clamped}px`;
  }
  if (s.textAlign === 'left' || s.textAlign === 'center' || s.textAlign === 'right') {
    out.textAlign = s.textAlign;
  }
  if (typeof s.letterSpacing === 'number' && Number.isFinite(s.letterSpacing)) {
    out.letterSpacing = `${s.letterSpacing}px`;
  }
  if (typeof s.lineHeight === 'number' && Number.isFinite(s.lineHeight) && s.lineHeight > 0) {
    out.lineHeight = s.lineHeight;
  }
  return out;
}

/**
 * Wave 61 — per-element cosmetic style overrides. Surfaced from the
 * floating InlineStyleToolbar in the wizard preview. Every key optional;
 * `undefined` means "inherit from the resolved widget style".
 */
export interface InlineElementStyle {
  /** Bold toggle. `true` → font-weight 700, `false` → inherit. */
  bold?: boolean;
  /** Italic toggle. */
  italic?: boolean;
  /** Underline toggle. */
  underline?: boolean;
  /** Text colour as a 7-char hex (`#rrggbb`). */
  color?: string;
  /** Font size in pixels. Clamped to 8..72 at write time. */
  fontSize?: number;
  /** Text alignment. */
  textAlign?: 'left' | 'center' | 'right';
  /** Optional font family stack id (matches AdvFontFamily values). */
  fontFamily?: AdvFontFamily;
  /** Letter spacing in pixels. 0 = default. */
  letterSpacing?: number;
  /** Line height as a unitless multiplier (e.g. 1.4). */
  lineHeight?: number;
}

export interface TemplateCalculation {
  id: string; name: string; formula: string;
  format: 'number' | 'currency' | 'percent';
  /**
   * Wave H4 — Elfsight-style display fields. ALL optional and backward-
   * compatible: every existing template (66 entries at time of writing) is
   * valid without setting any of these.
   *
   * - `resultMode`    — controls where this calc renders in the result panel.
   *   `'primary'`     → renders as the large headline value (the calc that
   *                     "is" the price).
   *   `'secondary'`   → renders as a breakdown row beneath the headline.
   *   `undefined`     → treated as `'secondary'` for rendering, but the
   *                     legacy `result_calc` field still wins when no calc
   *                     is explicitly marked primary.
   * - `caption`       — optional supplementary line rendered below this
   *                     calc's value (e.g. "incl. tax", "per visit").
   * - `showInResults` — `false` hides this calc from the result panel
   *                     (formula still evaluates so later calcs can chain
   *                     off it). `undefined` or `true` shows it — preserving
   *                     current behaviour.
   * - `divider`       — when `true`, render a thin divider above this row
   *                     in the result panel for visual grouping.
   */
  resultMode?: 'primary' | 'secondary';
  caption?: string;
  showInResults?: boolean;
  divider?: boolean;
}

export interface TemplateHeader {
  title: string; subtitle?: string; align: 'left' | 'center' | 'right';
}

export interface TemplateResults {
  heading?: string; footnote?: string; show_breakdown?: boolean;
  /** Result-panel call-to-action button label (empty string hides it). */
  cta_label?: string;
  /**
   * Elfsight-style marketing block rendered in the summary panel just above the
   * CTA button. `cta_heading` is a bold line ("Take the First Step…"),
   * `cta_sub` a short paragraph beneath it. Both optional; absent → no block.
   */
  cta_heading?: string;
  cta_sub?: string;
  /**
   * Action tab — success line shown in the lead-capture modal after a
   * successful submit. Absent → the modal's built-in default copy.
   */
  submit_success?: string;
}

/* ─── Stepper (BD-2a — multi-step renderer) ─── */

/**
 * BD-2a — optional explicit step grouping for the multi-step renderer.
 *
 * When a template ships `steps: TemplateStep[]`, the renderer uses that
 * grouping verbatim. When absent, the renderer auto-derives steps from the
 * field list (base/required first, modifiers second, photos/notes third,
 * final = contact capture).
 *
 * Research (BD-0): multi-step quote forms convert ~3x higher than single
 * forms (13.85% vs 4.53%); up to 16.9x in interactive samples. Owners can
 * still opt back to single-form via `Style tab → Step layout`.
 *
 * Every field references the existing `TemplateField.id` (or `name`). A
 * field NOT mentioned by any step falls into the first step by default —
 * the renderer never drops a field.
 */
export interface TemplateStep {
  /** Stable id. */
  id: string;
  /** Short, scannable label rendered above the bar / next to the dot. */
  label: string;
  /** Optional helper line shown beneath the label on each step. */
  help?: string;
  /**
   * BG-7 Item 4 — optional rich-text description (sanitized HTML) shown
   * beneath the step title in the rendered widget. Distinct from `help` —
   * which is a short single-line subtitle — this is owner-editable
   * long-form explanatory copy. Absent on existing templates; new edits
   * write via the wizard's content editor.
   */
  description?: string;
  /** Field ids included in this step. */
  fields: string[];
}

/* ─── The canonical template config ─── */

/**
 * The one unified, Elfsight-shaped template config. This single shape replaces
 * the old `TemplatePreset` (themed content) + `TemplateDefinition` (structural
 * taxonomy) split.
 */
export interface TemplateConfig {
  /** Stable unique id. */
  id: string;
  /** Display name shown in the gallery. */
  name: string;
  /** One-line description shown on the template card. */
  description: string;
  /** Domain bucket — drives Phase 2's categorized gallery. */
  category: string;
  /** Trade ids this template suits — drives `getRecommendedTemplate`. */
  trades: string[];
  /** Structural layout (real, renderer-backed). */
  layout: TemplateLayout;
  /** Widget theme id (see client widgetThemes.ts). */
  theme: string;
  /**
   * Wave W-AH-2 — default trade-relevant Lucide icon name rendered in the
   * widget header's logo slot when no user logo has been uploaded. Keeps
   * templates looking polished out of the box. Optional & back-compat.
   */
  defaultIcon?: string;
  /**
   * BD-2a / BD-1 — optional per-template override for the small category icon
   * rendered LEFT of the step title in the widget header (16–20px). Defaults
   * to the icon resolved from `category` via `resolveCategoryIcon()` in
   * `client/src/components/quote-widget/CategoryIcon.tsx`.
   * Case-insensitive lucide icon name (e.g. `'Wrench'`, `'HardHat'`).
   */
  categoryIcon?: string;
  /**
   * BD-2a — optional explicit step grouping for the multi-step renderer.
   * Absent → the renderer auto-derives steps (base/required → modifiers →
   * photos/notes → contact). Present → the renderer uses these verbatim.
   * Either way, the user can opt back to single-form via Style tab.
   */
  steps?: TemplateStep[];
  /**
   * Step layout. `stepper` (default) walks the customer through one step at a
   * time; `single` renders every field + the result + CTA on ONE screen
   * (Elfsight-style). Absent → `stepper`.
   */
  stepLayout?: 'stepper' | 'single';
  /** Input fields. */
  fields: TemplateField[];
  /** Calculations / formulas. */
  calculations: TemplateCalculation[];
  /** Name of the calculation used as the headline result. */
  result_calc: string;
  /** Header (title / subtitle / alignment). */
  header: TemplateHeader;
  /** Optional result-panel customisation. */
  results?: TemplateResults;
  /**
   * W-AS-1 — optional template-level Style overrides.
   *
   * When a template ships with a `style` block, `toAdvancedConfig()` carries
   * it through to the runtime `AdvancedConfigShape` so the rendered widget
   * picks up the template's visual identity (accent, surface, typography,
   * logo placement, etc.) instead of defaulting to the bare theme. Users can
   * still override per-field via the Style tab after the template is loaded.
   */
  style?: AdvStyle;
  /**
   * BD-2b — optional Good/Better/Best 3-tier pricing config. When absent,
   * `toAdvancedConfig()` does NOT default it — the renderer derives the
   * effective tiered shape at runtime via `resolveTieredConfig()` so the
   * scope-spectrum-category default kicks in for templates that don't ship
   * an explicit value. Templates can opt in/out by declaring this slot.
   */
  tiered?: TemplateTiered;
  /**
   * BD-2c — opt-in flag: when true, the ContactStep renders a Google Places
   * autocomplete address field above the name/email/phone block. Defaults
   * to false (back-compat — existing 66+ templates unchanged). Templates
   * for on-site service (roofing, HVAC, junk removal, etc.) should opt in.
   * Falls back to a plain text input when `VITE_GOOGLE_PLACES_API_KEY` is
   * missing — no error, no broken UX.
   */
  requireAddress?: boolean;
  /**
   * BF-9 — pre-curated trust badges rendered as a pill row in the widget
   * header (accent-tinted bg + accent-coloured icon + short label). Pre-set
   * per category/trade so every template ships with industry-standard trust
   * signals (Licensed & Insured, BBB Accredited, OSHA / IICRC / ASE certs,
   * 24/7 Emergency, etc.). Owners override via the Style tab later.
   */
  trustBadges?: readonly TrustBadge[];
  /**
   * Template design v2 (Phase 1) — short list of trade slugs the template
   * is a good fit for, surfaced as pill chips in the TemplateGallery hover
   * modal under "Best for:". Distinct from `trades` (which drives
   * `getRecommendedTemplate`) — `matchingTrades` is the human-facing
   * marketing list. Optional & back-compat (absent on Phase 2 templates).
   */
  matchingTrades?: string[];
}

/**
 * BF-9 — small lucide-react-backed trust badge. Used in `templatePresets`'s
 * `trustBadges` array and surfaced verbatim through `AdvancedConfigShape`.
 * `icon` accepts the lucide names enumerated below; the renderer maps to the
 * concrete component (unknown values fall back to `BadgeCheck`).
 */
export interface TrustBadge {
  /** Short pill label, e.g. "Licensed & Insured", "BBB Accredited". */
  label: string;
  /** Lucide icon family name (case-insensitive). */
  icon:
    | 'shield' | 'shield-check'
    | 'check-circle' | 'check-circle-2'
    | 'award' | 'lock' | 'star' | 'thumbs-up'
    | 'badge-check' | 'verified'
    | 'clipboard-check' | 'clock' | 'leaf' | 'file-badge'
    // FIX 5b — tradesperson/trust additions. Keep in sync with
    // TRUST_ICON_OPTIONS (StyleTab.tsx) and ICON_MAP (TrustBadgeRow.tsx).
    | 'wrench' | 'hammer' | 'hard-hat' | 'truck' | 'phone'
    | 'map-pin' | 'calendar' | 'credit-card' | 'heart' | 'users'
    | 'zap' | 'handshake';
  /** Optional icon colour (any CSS colour). Defaults to the chip's text
   *  colour (currentColor) when unset, so existing badges are unaffected. */
  color?: string;
  /** Optional visual variant — reserved for future emphasis (default vs pro). */
  variant?: 'default' | 'pro';
}

/* Small helpers to keep the catalogue compact. */
const opt = (label: string, value: number): TemplateOption =>
  ({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label, value });
/** BD-2c — `opt` + image-card URL. Switches the renderer (image-card grid
 *  vs text radio) when the field is a `radio` type. */
const optImg = (label: string, value: number, imageUrl: string): TemplateOption =>
  ({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label, value, imageUrl });
const calc = (
  name: string, formula: string, format: TemplateCalculation['format'] = 'currency',
): TemplateCalculation =>
  ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name, formula, format });

/* BF-9 — per-trade trust-badge presets.
 *
 * Each entry is a 3-4 pill row that mirrors what a real business in that
 * category would put on their site. Industry-specific certifications (BBB,
 * IICRC, OSHA, ASE, EPA, NADCA) are used only where the trade actually
 * carries them; everything else uses the generic "Licensed & Insured /
 * Insured / Satisfaction Guaranteed / Locally Owned" set. Tuples are typed
 * as `readonly TrustBadge[]` so the per-template usage stays compact (no
 * inline annotation needed).
 */
const b = (label: string, icon: TrustBadge['icon']): TrustBadge => ({ label, icon });

const BADGES = {
  // ── Construction / heavy build ──
  construction: [
    b('Licensed & Insured', 'shield-check'),
    b('BBB Accredited', 'badge-check'),
    b('10-Year Warranty', 'award'),
    b('OSHA Certified', 'verified'),
  ],
  roofing: [
    b('Licensed & Insured', 'shield-check'),
    b('BBB Accredited', 'badge-check'),
    b('Manufacturer Certified', 'verified'),
    b('Lifetime Warranty Available', 'award'),
  ],
  driveway_concrete: [
    b('Licensed & Insured', 'shield-check'),
    b('5-Year Workmanship Warranty', 'award'),
    b('BBB Accredited', 'badge-check'),
    b('Free Estimates', 'thumbs-up'),
  ],
  renovation: [
    b('Licensed General Contractor', 'badge-check'),
    b('Fully Insured', 'shield'),
    b('Workmanship Warranty', 'award'),
    b('References Available', 'star'),
  ],

  // ── Home Improvement ──
  homeImprovement: [
    b('Licensed & Insured', 'shield-check'),
    b('BBB Accredited', 'badge-check'),
    b('10-Year Warranty', 'award'),
    b('EPA Lead-Safe Certified', 'verified'),
  ],
  hvac: [
    b('Licensed & Insured', 'shield-check'),
    b('NATE Certified Techs', 'badge-check'),
    b('EPA 608 Certified', 'verified'),
    b('Workmanship Guarantee', 'award'),
  ],
  plumbing: [
    b('Licensed Master Plumber', 'badge-check'),
    b('Fully Insured', 'shield'),
    b('Workmanship Warranty', 'award'),
    b('Upfront Pricing', 'check-circle'),
  ],
  electrical: [
    b('Licensed Master Electrician', 'badge-check'),
    b('Fully Insured & Bonded', 'shield-check'),
    b('Code-Compliant Work', 'verified'),
    b('Free Estimates', 'thumbs-up'),
  ],
  evCharger: [
    b('Certified EV Installer', 'badge-check'),
    b('Licensed & Insured', 'shield-check'),
    b('Permit & Inspection Handled', 'clipboard-check'),
    b('Manufacturer Authorized', 'verified'),
  ],
  windows: [
    b('Licensed & Insured', 'shield-check'),
    b('Manufacturer Certified', 'badge-check'),
    b('Lifetime Warranty', 'award'),
    b('ENERGY STAR Partner', 'verified'),
  ],
  painting: [
    b('Licensed & Insured', 'shield-check'),
    b('EPA Lead-Safe Certified', 'verified'),
    b('Workmanship Warranty', 'award'),
    b('Free Color Consult', 'thumbs-up'),
  ],
  solar: [
    b('NABCEP Certified', 'badge-check'),
    b('Licensed & Insured', 'shield-check'),
    b('25-Year Production Warranty', 'award'),
    b('Free Energy Audit', 'thumbs-up'),
  ],

  // ── Emergency / Restoration ──
  emergency: [
    b('24/7 Emergency Service', 'clock'),
    b('IICRC Certified', 'badge-check'),
    b('Insurance Approved', 'verified'),
    b('Fully Insured', 'shield'),
  ],
  waterDamage: [
    b('24/7 Emergency Response', 'clock'),
    b('IICRC Certified', 'badge-check'),
    b('Insurance Direct-Billing', 'verified'),
    b('EPA Approved Process', 'shield-check'),
  ],
  moldRemediation: [
    b('IICRC Certified', 'badge-check'),
    b('EPA Approved Process', 'shield-check'),
    b('Insurance Approved', 'verified'),
    b('Workmanship Warranty', 'award'),
  ],
  emergencyHvac: [
    b('24/7 Emergency Service', 'clock'),
    b('NATE Certified Techs', 'badge-check'),
    b('Same-Day Service', 'star'),
    b('Licensed & Insured', 'shield-check'),
  ],
  locksmith: [
    b('24/7 Mobile Service', 'clock'),
    b('Licensed & Insured', 'shield-check'),
    b('ALOA Certified', 'badge-check'),
    b('Upfront Pricing', 'check-circle'),
  ],

  // ── Cleaning ──
  cleaning: [
    b('Eco-Friendly Products', 'leaf'),
    b('Insured Workers', 'shield'),
    b('Satisfaction Guaranteed', 'check-circle'),
    b('Same-Day Service', 'star'),
  ],
  deepCleaning: [
    b('Eco-Friendly Products', 'leaf'),
    b('Background-Checked Pros', 'shield-check'),
    b('Satisfaction Guaranteed', 'check-circle'),
    b('100% Bonded & Insured', 'shield'),
  ],
  moveOut: [
    b('Move-Out Guarantee', 'check-circle'),
    b('Insured & Bonded', 'shield-check'),
    b('Eco-Friendly Products', 'leaf'),
    b('Same-Day Available', 'star'),
  ],
  officeCleaning: [
    b('Commercial Insured', 'shield-check'),
    b('Background-Checked Crews', 'badge-check'),
    b('Green-Seal Products', 'leaf'),
    b('Flexible Scheduling', 'check-circle'),
  ],
  windowCleaning: [
    b('Insured Workers', 'shield-check'),
    b('Eco-Friendly Solutions', 'leaf'),
    b('Satisfaction Guaranteed', 'check-circle'),
    b('Locally Owned', 'star'),
  ],
  gutterCleaning: [
    b('Insured Workers', 'shield-check'),
    b('Satisfaction Guaranteed', 'check-circle'),
    b('Free Inspection', 'thumbs-up'),
    b('Locally Owned', 'star'),
  ],
  pressureWashing: [
    b('Insured Workers', 'shield-check'),
    b('Eco-Friendly Detergents', 'leaf'),
    b('Satisfaction Guaranteed', 'check-circle'),
    b('Same-Day Service', 'star'),
  ],
  pestControl: [
    b('Licensed Applicator', 'badge-check'),
    b('EPA Registered Products', 'shield-check'),
    b('Pet & Family Safe', 'leaf'),
    b('Service Guarantee', 'check-circle'),
  ],
  chimneySweep: [
    b('CSIA Certified', 'badge-check'),
    b('Licensed & Insured', 'shield-check'),
    b('Workmanship Guarantee', 'award'),
    b('Same-Day Available', 'star'),
  ],
  junkRemoval: [
    b('Licensed & Insured', 'shield-check'),
    b('Eco-Friendly Disposal', 'leaf'),
    b('Upfront Pricing', 'check-circle'),
    b('Same-Day Available', 'star'),
  ],

  // ── Outdoor ──
  outdoor: [
    b('Licensed Landscaper', 'badge-check'),
    b('Fully Insured', 'shield'),
    b('Free Estimates', 'thumbs-up'),
    b('Locally Owned', 'star'),
  ],
  treeService: [
    b('ISA Certified Arborist', 'badge-check'),
    b('Fully Insured', 'shield-check'),
    b('Free Estimates', 'thumbs-up'),
    b('Emergency Service', 'clock'),
  ],
  fence: [
    b('Licensed & Insured', 'shield-check'),
    b('Workmanship Warranty', 'award'),
    b('Free Estimates', 'thumbs-up'),
    b('Locally Owned', 'star'),
  ],
  deck: [
    b('Licensed & Insured', 'shield-check'),
    b('Workmanship Warranty', 'award'),
    b('Permit Handled', 'clipboard-check'),
    b('Free Design Consult', 'thumbs-up'),
  ],
  pool: [
    b('Certified Pool Operator', 'badge-check'),
    b('Licensed & Insured', 'shield-check'),
    b('Satisfaction Guaranteed', 'check-circle'),
    b('Locally Owned', 'star'),
  ],
  lawnCare: [
    b('Licensed Landscaper', 'badge-check'),
    b('Insured Crew', 'shield'),
    b('Satisfaction Guaranteed', 'check-circle'),
    b('Locally Owned', 'star'),
  ],

  // ── Automotive ──
  automotive: [
    b('ASE Certified', 'badge-check'),
    b('Fully Insured', 'shield-check'),
    b('Mobile Service', 'verified'),
    b('Satisfaction Guaranteed', 'check-circle'),
  ],
  towing: [
    b('Licensed & Insured', 'shield-check'),
    b('24/7 Dispatch', 'clock'),
    b('Flat-Rate Pricing', 'check-circle'),
    b('AAA Approved', 'badge-check'),
  ],
  detailing: [
    b('Mobile Service', 'verified'),
    b('Eco-Friendly Products', 'leaf'),
    b('Satisfaction Guaranteed', 'check-circle'),
    b('5-Star Rated', 'star'),
  ],

  // ── Professional ──
  webDesign: [
    b('5-Star Rated', 'star'),
    b('Portfolio Available', 'badge-check'),
    b('100% Satisfaction', 'check-circle'),
    b('Years of Experience', 'award'),
  ],
  photography: [
    b('Licensed Professional', 'badge-check'),
    b('Insured Equipment', 'shield-check'),
    b('Portfolio Available', 'star'),
    b('Satisfaction Guaranteed', 'check-circle'),
  ],
  moving: [
    b('Licensed & Insured', 'shield-check'),
    b('DOT Licensed', 'badge-check'),
    b('Free Estimates', 'thumbs-up'),
    b('BBB Accredited', 'verified'),
  ],
  homeInspection: [
    b('InterNACHI Certified', 'badge-check'),
    b('Licensed & Insured', 'shield-check'),
    b('Same-Day Report', 'clipboard-check'),
    b('Years of Experience', 'award'),
  ],

  // ── Repair Services ──
  applianceRepair: [
    b('Factory Trained Techs', 'badge-check'),
    b('Licensed & Insured', 'shield-check'),
    b('90-Day Parts Warranty', 'award'),
    b('Same-Day Service', 'star'),
  ],
  garageDoor: [
    b('Licensed & Insured', 'shield-check'),
    b('IDA Certified', 'badge-check'),
    b('Same-Day Service', 'star'),
    b('Workmanship Warranty', 'award'),
  ],

  // ── Home Improvement (specific) ──
  doors: [
    b('Licensed & Insured', 'shield-check'),
    b('Manufacturer Certified', 'badge-check'),
    b('Workmanship Warranty', 'award'),
    b('Free Estimates', 'thumbs-up'),
  ],
  siding: [
    b('Licensed & Insured', 'shield-check'),
    b('Manufacturer Certified', 'badge-check'),
    b('Lifetime Warranty Available', 'award'),
    b('Free Estimates', 'thumbs-up'),
  ],
  insulation: [
    b('Licensed & Insured', 'shield-check'),
    b('ENERGY STAR Partner', 'verified'),
    b('Workmanship Warranty', 'award'),
    b('Free Energy Audit', 'thumbs-up'),
  ],
  drywall: [
    b('Licensed & Insured', 'shield-check'),
    b('Workmanship Warranty', 'award'),
    b('Free Estimates', 'thumbs-up'),
    b('Locally Owned', 'star'),
  ],
  flooring: [
    b('Licensed & Insured', 'shield-check'),
    b('Manufacturer Certified', 'badge-check'),
    b('Workmanship Warranty', 'award'),
    b('Free Estimates', 'thumbs-up'),
  ],

  // Generic fallback
  generic: [
    b('Licensed & Insured', 'shield-check'),
    b('Satisfaction Guaranteed', 'check-circle'),
    b('Locally Owned', 'star'),
    b('Free Estimates', 'thumbs-up'),
  ],
} as const satisfies Record<string, readonly TrustBadge[]>;

export const TEMPLATE_PRESETS: TemplateConfig[] = [
  /* ── 1. Car towing ── */
  {
    id: 'car_towing', name: 'Car Towing', description: 'Distance-based tow pricing with add-on services.',
    // BATCH 0 — was dangling on `auto_detailing`; now maps to the real
    // `towing` trade id (added to trades.ts in the same PR).
    category: 'Automotive', trades: ['towing'],
    // TWO-ZONE black + yellow + two-column (inputs left, single result panel
    // right) — minimal and bold. Carries the towing trust-badge row (every
    // other template has one; this was the lone empty-badge outlier).
    trustBadges: BADGES.towing,
    // Elfsight-style single screen: every input + the result + the CTA on ONE
    // form, no step-by-step wizard.
    stepLayout: 'single',
    layout: 'two-column', theme: 'light', defaultIcon: 'Truck',
    // TWO-ZONE THEMING — two colours that NEVER overlap:
    //   * LEFT zone = white body + dark text; its accents (slider fill,
    //     toggles, selectors, checkmarks) use Colour B (#0d0d0d, near-black).
    //   * RIGHT zone = the result/summary panel, background = Colour B
    //     (#0d0d0d); the existing luminance/muted logic + the flat total
    //     render white on that dark panel.
    //   * Colour A (#ffd60a, hazard-yellow) is the CTA button ONLY — the
    //     widget's contrast guard auto-renders DARK text on the bright yellow.
    // Without an explicit style, toAdvancedConfig() would fall back to
    // deriveStyleFromCategory('Automotive').
    style: {
      // Wave width-uniform — explicit standard width so this premium template
      // matches every other default template (820px). Was implicit before.
      widgetWidth: 'wide',
      // Colour B — drives the LEFT-side accents AND the right result panel.
      accent: '#0d0d0d',
      // LEFT zone body = white, dark text on light surfaces.
      background: 'rgba(255,255,255,1)',
      surface: '#f6f7f9',
      border: '#e5e7eb',
      text: '#171717',
      // Colour B — the RIGHT result panel background (near-black).
      resultsBg: '#0d0d0d',
      // Colour A — the CTA button ONLY (hazard-yellow). The CTA's label colour
      // is derived from this colour's luminance → dark text on the yellow,
      // never white-on-yellow.
      ctaColor: '#ffd60a',
      success: '#10b981',
      error: '#ef4444',
      fontFamily: 'inter',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        // Total is the visual hero: a single large, bold figure on the dark
        // summary panel — the clearest read for an instant-quote calculator.
        emphasis: 'bold',
        border: 'subtle',
        range_mode: { enabled: false, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
    },
    header: { title: 'Dispatch a Tow Truck in 60 Seconds', subtitle: 'Licensed & insured · 24/7 response · Flat-rate per-mile pricing', align: 'left' },
    // Elfsight-clean: every input is full-width (colSpan 2) so the inputs
    // stack vertically in one column on the left, with the result panel on the
    // right — instead of half-width pairs that crowd and overlap on mobile.
    fields: [
      { id: 'vehicle_type', name: 'Vehicle Type', label: 'Vehicle type', type: 'select', colSpan: 2,
        help: 'Pick the type of vehicle that needs towing.',
        options: [opt('Car', 0), opt('SUV', 25), opt('Truck', 60), opt('Motorcycle', -10)] },
      { id: 'condition', name: 'Vehicle Condition', label: 'Vehicle condition', type: 'select', colSpan: 2,
        help: 'Lets us send the right equipment if it can’t roll.',
        options: [opt('Driveable', 0), opt('Not driveable', 45)] },
      { id: 'distance', name: 'Towing Distance', label: 'Distance to destination', type: 'slider', colSpan: 2,
        help: 'Drag the slider to the distance from pickup to drop-off.',
        min: 1, max: 100, step: 1, default_value: 8, unit: 'miles' },
      { id: 'extras', name: 'Additional Services', label: 'Roadside add-ons', type: 'multi_select', colSpan: 2,
        help: 'Add any roadside help you need on arrival.',
        options: [opt('Winching', 50), opt('Tire Change', 25), opt('Lockout Service', 35), opt('Fuel Delivery', 30)] },
    ],
    // Elfsight-style summary: a primary total + secondary metric rows (each
    // with a caption sublabel), mirroring "Total / Scholarships / Net Price".
    calculations: [
      { ...calc('Hook-up Fee', '45 + [Vehicle Type] + [Vehicle Condition]'), caption: 'Base callout + vehicle type.' },
      { ...calc('Mileage Charge', '[Towing Distance] * 5'), caption: 'Charged at $5.00 per mile.' },
      { ...calc('Roadside Add-ons', '[Additional Services]'), caption: 'Winching, lockout, fuel & more.' },
      { ...calc('Total Towing Cost', '[Hook-up Fee] + [Mileage Charge] + [Roadside Add-ons]'), caption: 'Estimated total — final cost confirmed at dispatch.' },
    ],
    result_calc: 'Total Towing Cost',
    results: {
      heading: 'Total estimated cost',
      show_breakdown: true,
      cta_label: 'Contact dispatch',
      cta_heading: 'Need a tow right now?',
      cta_sub: 'Our licensed, insured drivers are on call 24/7 — most tows arrive within 30–45 minutes. Get moving in one tap.',
      footnote: 'After-hours and storage surcharges quoted on dispatch.',
    },
  },

  /* ── 2. Driveway paving ── */
  {
    id: 'driveway_paving', name: 'Driveway Paving — Multi-Surface', description: 'Driveway quote across asphalt, concrete, block and resin surfaces, priced by area.',
    category: 'Construction', trades: ['concrete_driveway', 'concrete_patio'],
    trustBadges: BADGES.driveway_concrete,
    layout: 'single-column', theme: 'midnight', defaultIcon: 'Construction',
    requireAddress: true,
    style: {
      widgetWidth: 'wide',
      accent: '#f59e0b',
      background: '#0f172a',
      surface: '#1e293b',
      border: '#334155',
      text: '#e2e8f0',
      resultsBg: '#020617',
      ctaColor: '#f59e0b',
      success: '#22c55e',
      error: '#f87171',
      fontFamily: 'inter',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        range_mode: { enabled: true, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Get Your Driveway Paving Quote in 60 Seconds', subtitle: 'Licensed paving contractors · 10-year workmanship warranty · Free on-site survey', align: 'left' },
    steps: [
      { id: 'step_surface', label: 'Surface & size', help: 'The material and the area drive most of the price.', fields: ['material', 'area'] },
      { id: 'step_extras', label: 'Prep & finishing', help: 'Tearing out the old surface and adding edging are priced separately.', fields: ['removal', 'edging'] },
    ],
    fields: [
      { id: 'area', name: 'Driveway Area', label: 'Driveway size (sq ft)', type: 'slider',
        help: 'Length × width of the drive — a rough estimate is fine.',
        min: 100, max: 3000, step: 50, default_value: 700, unit: 'sq ft' },
      // Material is the highest-uncertainty driver → image-card radio.
      { id: 'material', name: 'Surface Material', label: 'Driveway surface material', type: 'radio',
        help: 'Sets the per-square-foot surface cost and the finished look.',
        options: [
          { ...optImg('Asphalt', 4, 'https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?w=300&h=300&fit=crop'),
            description: 'Budget-friendly black-top — fast to lay and seal.' },
          { ...optImg('Concrete', 6, 'https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=300&h=300&fit=crop'),
            description: 'Durable poured concrete — clean, low-maintenance finish.' },
          { ...optImg('Block paving', 9, 'https://images.unsplash.com/photo-1597047084897-51e81819a499?w=300&h=300&fit=crop'),
            description: 'Interlocking pavers — premium look, easy spot repairs.' },
          { ...optImg('Resin', 11, 'https://images.unsplash.com/photo-1604014237800-1c9102c219da?w=300&h=300&fit=crop'),
            description: 'Smooth resin-bound surface — seamless and permeable.' },
        ] },
      { id: 'removal', name: 'Old Surface Removal', label: 'Remove the existing surface', type: 'toggle',
        help: 'We break out and haul away the old drive before laying the new one.', on_value: 600 },
      { id: 'edging', name: 'Decorative Edging', label: 'Add decorative edging', type: 'toggle',
        help: 'A clean border course that frames the drive and holds the edges.', on_value: 350 },
    ],
    calculations: [
      { ...calc('Materials & Surface', '[Driveway Area] * [Surface Material]'), caption: 'Surface material and laying labor, per square foot.' },
      { ...calc('Prep & Removal', '[Old Surface Removal]'), caption: 'Break-out and disposal of the existing surface where selected.' },
      { ...calc('Finishing Touches', '[Decorative Edging]'), caption: 'Optional decorative edging course.' },
      { ...calc('Total Paving Cost', '[Materials & Surface] + [Prep & Removal] + [Finishing Touches]'),
        resultMode: 'primary', caption: 'Installed price — confirmed at a free on-site survey. Locked for 30 days.' },
    ],
    result_calc: 'Total Paving Cost',
    results: {
      heading: 'Your Driveway Estimate',
      show_breakdown: true,
      cta_label: 'Book My Free Survey',
      cta_heading: 'A driveway that lasts starts with the base',
      cta_sub: 'We excavate, lay a proper sub-base, and finish to a 10-year workmanship warranty. Book a free on-site survey and we’ll confirm your exact price.',
      submit_success: 'Booked! Our project lead will call within one business day to schedule your free on-site survey.',
      footnote: 'Includes excavation, sub-base, surface, and clean-up. Final price confirmed during free on-site survey. Quote locked for 30 days.',
    },
  },

  /* ── 3. Property cleaning ── */
  {
    id: 'property_cleaning', name: 'Property Cleaning', description: 'Room-based cleaning quote with extras.',
    category: 'Cleaning', trades: ['house_cleaning', 'office_cleaning', 'deep_cleaning'],
    trustBadges: BADGES.cleaning,
    layout: 'two-column', theme: 'light', defaultIcon: 'Sparkles',
    requireAddress: true,
    style: {
      widgetWidth: 'wide',
      accent: '#0d9488',
      background: '#f3faf8',
      surface: '#ffffff',
      border: '#d8ece8',
      text: '#0f172a',
      resultsBg: '#0f3f3a',
      ctaColor: '#14b8a6',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        range_mode: { enabled: true, band_pct: 6 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Get an Instant Cleaning Quote', subtitle: 'Bonded & insured cleaners · 4.9★ from 1,800+ jobs · 100% satisfaction re-clean guarantee', align: 'left' },
    steps: [
      { id: 'step_home', label: 'Your home', help: 'Room count sets the crew time we schedule.', fields: ['bedrooms', 'bathrooms'] },
      { id: 'step_service', label: 'Service & frequency', help: 'Add a deep clean and pick how often you want us.', fields: ['deep_clean', 'frequency'] },
    ],
    fields: [
      { id: 'bedrooms', name: 'Bedrooms', label: 'How many bedrooms?', type: 'number', min: 0, max: 12, step: 1, default_value: 3,
        help: 'More bedrooms means more floors, surfaces and baseboards to clean.' },
      { id: 'bathrooms', name: 'Bathrooms', label: 'How many bathrooms?', type: 'number', min: 0, max: 8, step: 1, default_value: 2,
        help: 'Bathrooms are the most labor-intensive room in any clean.' },
      { id: 'deep_clean', name: 'Deep Clean', label: 'Add a deep clean (inside oven, fridge, baseboards)', type: 'toggle', on_value: 60,
        help: 'Adds inside-the-appliance and detail work on top of the standard clean.' },
      { id: 'frequency', name: 'Frequency', label: 'How often do you want service?', type: 'radio',
        help: 'Recurring visits unlock a standing discount on every clean.',
        options: [
          { ...opt('One-off', 0), description: 'A single visit — no commitment.' },
          { ...opt('Fortnightly', -10), description: 'Every two weeks — a modest standing discount.' },
          { ...opt('Weekly', -18), description: 'Weekly service — our best per-visit rate.' },
        ] },
    ],
    calculations: [
      { ...calc('Bedroom Cleaning', '[Bedrooms] * 28'), caption: 'Per-bedroom detail labor.' },
      { ...calc('Bathroom Cleaning', '[Bathrooms] * 22'), caption: 'Per-bathroom scrub and sanitize.' },
      { ...calc('Deep Clean Add-on', '[Deep Clean]'), caption: 'Inside-the-appliance and detail tasks where selected.' },
      { ...calc('Frequency Discount', '[Frequency]'), caption: 'Standing discount for recurring service.' },
      { ...calc('Total Price', '[Bedroom Cleaning] + [Bathroom Cleaning] + [Deep Clean Add-on] + [Frequency Discount]'),
        resultMode: 'primary', caption: 'Your per-visit price — confirmed after a quick walk-through.' },
    ],
    result_calc: 'Total Price',
    results: {
      heading: 'Your Cleaning Quote',
      show_breakdown: true,
      cta_label: 'Book My Cleaning',
      cta_heading: 'Come home to a spotless house',
      cta_sub: 'Our bonded, insured cleaners bring everything they need and back every visit with a 24-hour re-clean guarantee. Book your first clean in seconds.',
      submit_success: 'Booked! Your cleaning coordinator will confirm the date and crew arrival window shortly.',
      footnote: 'Includes all supplies and a bonded cleaning team. 24-hour re-clean guarantee — if you find a spot, we come back free.',
    },
  },

  /* ── 4. Energy efficiency upgrade ── */
  {
    id: 'energy_upgrade', name: 'Energy Upgrade', description: 'Home efficiency upgrade estimate.',
    // BATCH 0 — covers a Solar upgrade option; map the solar registry ids.
    category: 'Home Improvement', trades: ['hvac_services', 'solar_panel', 'insulation_installation'],
    trustBadges: BADGES.hvac,
    layout: 'multi-column', theme: 'midnight', defaultIcon: 'Leaf',
    requireAddress: true,
    style: {
      widgetWidth: 'wide',
      accent: '#22c55e',
      background: '#0f1c14',
      surface: '#16271c',
      border: '#234231',
      text: '#e2e8f0',
      resultsBg: '#04130a',
      ctaColor: '#22c55e',
      success: '#22c55e',
      error: '#f87171',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        range_mode: { enabled: true, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Cut Your Energy Bill — Get a Free Upgrade Quote', subtitle: 'BPI-certified · ENERGY STAR partner · Most homeowners save 20–30% on monthly bills', align: 'left' },
    steps: [
      { id: 'step_upgrade', label: 'Upgrade & home', help: 'The upgrade and your home size set the equipment cost.', fields: ['upgrade', 'home_size'] },
      { id: 'step_incentives', label: 'Incentives & install', help: 'Apply rebates and add professional installation.', fields: ['incentives', 'install'] },
    ],
    fields: [
      // Upgrade type is the highest-uncertainty driver → image-card radio.
      { id: 'upgrade', name: 'Upgrade Type', label: 'Which upgrade are you considering?', type: 'radio',
        help: 'Pick the upgrade you’re weighing — we’ll show its net cost after incentives.',
        options: [
          { ...optImg('Insulation', 0, 'https://images.unsplash.com/photo-1558036117-15d82a90b9b1?w=300&h=300&fit=crop'),
            description: 'The cheapest, fastest payback — seals the envelope first.' },
          { ...optImg('Windows', 1500, 'https://images.unsplash.com/photo-1503594384566-461fe158e797?w=300&h=300&fit=crop'),
            description: 'Energy-efficient glass cuts drafts and outside noise.' },
          { ...optImg('HVAC', 4000, 'https://images.unsplash.com/photo-1558002038-1055907df827?w=300&h=300&fit=crop'),
            description: 'High-efficiency heating and cooling — big monthly savings.' },
          { ...optImg('Solar', 8000, 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=300&h=300&fit=crop'),
            description: 'Generate your own power and lock in the 30% tax credit.' },
        ] },
      { id: 'home_size', name: 'Home Size', label: 'Home size (sqft)', type: 'number',
        help: 'Finished living area — a quick estimate is fine.',
        min: 200, max: 8000, step: 50, default_value: 1800, unit: 'sqft' },
      { id: 'incentives', name: 'Local Incentives', label: 'Available rebates & tax credits', type: 'multi_select', colSpan: 2,
        help: 'Tick anything you qualify for — it comes straight off your total.',
        options: [opt('Rebates', -500), opt('Tax Incentives', -800)] },
      { id: 'install', name: 'Installation', label: 'Include professional installation', type: 'toggle', colSpan: 2, on_value: 1200,
        help: 'Turnkey install by our certified crews, permits handled.' },
    ],
    calculations: [
      { ...calc('Equipment & Materials', '[Upgrade Type] + [Home Size] * 2'), caption: 'Upgrade equipment scaled to your home size.' },
      { ...calc('Professional Installation', '[Installation]'), caption: 'Turnkey install where selected.' },
      { ...calc('Incentives Applied', '[Local Incentives]'), caption: 'Rebates and tax credits subtracted from your total.' },
      { ...calc('Estimated Upgrade Cost', '[Equipment & Materials] + [Professional Installation] + [Incentives Applied]'),
        resultMode: 'primary', caption: 'Net cost after incentives — confirmed at your free energy audit.' },
    ],
    result_calc: 'Estimated Upgrade Cost',
    results: {
      heading: 'Your Net Upgrade Cost',
      show_breakdown: true,
      cta_label: 'Schedule My Free Energy Audit',
      cta_heading: 'Stop paying to heat the outdoors',
      cta_sub: 'Our BPI-certified team measures where your home leaks energy and shows you the upgrades with the fastest payback. The audit is free — book it now.',
      submit_success: 'Requested! Your energy advisor will call within one business day to schedule your free home audit.',
      footnote: 'Eligible for the 30% federal energy tax credit on most upgrades. Free home energy audit included with every install.',
    },
  },

  /* ── 5. Landscaping ── */
  {
    id: 'landscaping', name: 'Landscaping', description: 'Garden landscaping & maintenance quote.',
    category: 'Outdoor', trades: ['landscaping', 'lawn_mowing', 'garden_maintenance', 'tree_trimming'],
    trustBadges: BADGES.outdoor,
    layout: 'two-column', theme: 'forest', defaultIcon: 'Trees',
    requireAddress: true,
    style: {
      widgetWidth: 'wide',
      accent: '#16a34a',
      background: '#f3faf5',
      surface: '#ffffff',
      border: '#d6ece0',
      text: '#0f172a',
      resultsBg: '#14401f',
      ctaColor: '#22c55e',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        range_mode: { enabled: true, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Design Your Dream Garden — Instant Quote', subtitle: 'Award-winning landscapers · Fully insured crews · Free design consultation', align: 'left' },
    steps: [
      { id: 'step_garden', label: 'Garden & service', help: 'Your garden size and service level set the base price.', fields: ['service', 'area'] },
      { id: 'step_extras', label: 'Extras & visits', help: 'Add optional work and set how often we visit.', fields: ['extras', 'visits'] },
    ],
    fields: [
      { id: 'area', name: 'Garden Area', label: 'Garden size (sq ft)', type: 'slider',
        help: 'Approximate area we’ll be working — a rough estimate is fine.',
        min: 100, max: 10000, step: 100, default_value: 1600, unit: 'sq ft' },
      // Service level is the highest-uncertainty driver → image-card radio.
      { id: 'service', name: 'Service', label: 'Which service do you need?', type: 'radio',
        help: 'Pick the level of work — from a quick tidy-up to a full redesign.',
        options: [
          { ...optImg('Mowing & tidy-up', 0.3, 'https://images.unsplash.com/photo-1592417817098-8fd3d9eb14a5?w=300&h=300&fit=crop'),
            description: 'Regular mow, edge and tidy to keep things sharp.' },
          { ...optImg('Full maintenance', 0.65, 'https://images.unsplash.com/photo-1558904541-efa843a96f01?w=300&h=300&fit=crop'),
            description: 'Mowing plus beds, hedges and seasonal care.' },
          { ...optImg('Garden redesign', 2, 'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=300&h=300&fit=crop'),
            description: 'A full design-and-build transformation of the space.' },
        ] },
      { id: 'extras', name: 'Extras', label: 'Optional extras', type: 'multi_select',
        help: 'Add any one-off work you’d like done alongside the service.',
        options: [opt('Green-waste removal', 90), opt('New turf', 480), opt('Planting & beds', 320)] },
      { id: 'visits', name: 'Visits', label: 'How many visits per month?', type: 'number',
        help: 'More frequent visits keep the garden in top shape year-round.',
        min: 1, max: 8, step: 1, default_value: 2, unit: '/mo' },
    ],
    calculations: [
      { ...calc('Maintenance Cost', '[Garden Area] * [Service] * [Visits]'), caption: 'Crew time by garden size, service level and visit frequency.' },
      { ...calc('Optional Extras', '[Extras]'), caption: 'One-off turf, planting and green-waste work.' },
      { ...calc('Estimated Quote', '[Maintenance Cost] + [Optional Extras]'),
        resultMode: 'primary', caption: 'Your monthly estimate — confirmed at a free design consultation.' },
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Monthly Estimate',
      show_breakdown: true,
      cta_label: 'Book My Free Consultation',
      cta_heading: 'A garden you’ll actually want to spend time in',
      cta_sub: 'Our insured crews handle everything from a weekly mow to a full redesign — and annual contracts save 10%. Book a free consultation to map it out.',
      submit_success: 'Booked! Your garden lead will call within one business day to schedule your free consultation.',
      footnote: 'Includes all labor, equipment, and standard green-waste disposal. Annual contracts save 10%.',
    },
  },

  /* ── 6. Gutter cleaning ── */
  {
    id: 'gutter_cleaning', name: 'Gutter Cleaning', description: 'Length-based gutter cleaning quote.',
    // BATCH 0 — the registry's own `gutter_cleaning` trade was missing here.
    category: 'Cleaning', trades: ['gutter_cleaning', 'window_cleaning', 'pressure_washing'],
    trustBadges: BADGES.gutterCleaning,
    layout: 'single-column', theme: 'forest', defaultIcon: 'Droplets',
    requireAddress: true,
    style: {
      widgetWidth: 'wide',
      accent: '#15803d',
      background: '#f3faf5',
      surface: '#ffffff',
      border: '#d6ece0',
      text: '#0f172a',
      resultsBg: '#14401f',
      ctaColor: '#22c55e',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        range_mode: { enabled: true, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Get Your Gutter Cleaning Quote in 60 Seconds', subtitle: 'Fully insured · OSHA-trained ladder crews · Free downspout flush included', align: 'left' },
    steps: [
      { id: 'step_size', label: 'Your gutters', help: 'Total length sets the base cleaning time.', fields: ['length'] },
      { id: 'step_access', label: 'Access', help: 'How tough the ladder work is — single-story or steep multi-story.', fields: ['difficulty'] },
    ],
    fields: [
      { id: 'length', name: 'Gutter Length', label: 'Total gutter length (feet)', type: 'slider',
        help: 'Roughly the perimeter of your roofline — a quick estimate is fine.',
        min: 1, max: 300, step: 1, default_value: 120, unit: 'feet' },
      { id: 'difficulty', name: 'Cleaning Difficulty', label: 'How tough is the access?', type: 'radio',
        help: 'Be honest about height and pitch — it just sets the crew and ladder gear.',
        options: [
          { ...optImg('Easy', 0, 'https://images.unsplash.com/photo-1503594384566-461fe158e797?w=300&h=300&fit=crop'),
            description: 'Single-story, ladder sits flat on level ground.' },
          { ...optImg('Moderate', 35, 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=300&h=300&fit=crop'),
            description: 'Two-story or steeper pitch — taller ladders, more setup.' },
          { ...optImg('Difficult', 80, 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=300&h=300&fit=crop'),
            description: 'Tall, steep or hard-to-reach runs needing extra safety gear.' },
        ] },
    ],
    calculations: [
      { ...calc('Linear-foot Cleaning', '[Gutter Length] * 2'), caption: 'Hand-clearing and flush, charged per foot of gutter.' },
      { ...calc('Access Surcharge', '[Cleaning Difficulty]'), caption: 'Extra ladder time and safety gear for tougher access.' },
      { ...calc('Estimated Cost', '[Linear-foot Cleaning] + [Access Surcharge]'),
        resultMode: 'primary', caption: 'Your cleaning price — confirmed when we arrive on site.' },
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Gutter Cleaning Quote',
      show_breakdown: true,
      cta_label: 'Schedule My Cleaning',
      cta_heading: 'Stop the next overflow before it starts',
      cta_sub: 'Clogged gutters cause fascia rot and foundation leaks. Our insured crews hand-clear every run and flush the downspouts — book a slot in seconds.',
      submit_success: 'Booked! Your cleaning coordinator will confirm the date and arrival window shortly.',
      footnote: 'Includes hand-removal of debris, downspout flush, and before/after photos. Free leaf-guard inspection on every visit.',
    },
  },

  /* ── 7. Fence installation ── */
  {
    id: 'fence_installation', name: 'Fence Installation', description: 'Per-foot fencing install estimate.',
    category: 'Outdoor', trades: ['fence_installation', 'deck_building'],
    trustBadges: BADGES.fence,
    layout: 'single-column', theme: 'forest', defaultIcon: 'Fence',
    requireAddress: true,
    style: {
      widgetWidth: 'wide',
      accent: '#15803d',
      background: '#f3faf5',
      surface: '#ffffff',
      border: '#d6ece0',
      text: '#0f172a',
      resultsBg: '#14401f',
      ctaColor: '#22c55e',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        range_mode: { enabled: true, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Get Your Fence Installation Quote in 60 Seconds', subtitle: 'Licensed fence contractors · 10-year structural warranty · Free property-line survey', align: 'left' },
    steps: [
      { id: 'step_material', label: 'Material & size', help: 'The material and the total run drive most of the price.', fields: ['material', 'length'] },
      { id: 'step_access', label: 'Gates & removal', help: 'Gates and tearing out the old fence are priced separately.', fields: ['gates', 'removal'] },
    ],
    fields: [
      { id: 'length', name: 'Fence Length', label: 'Fence length (feet)', type: 'slider',
        help: 'Measure along the property line where the fence will run.',
        min: 5, max: 650, step: 5, default_value: 100, unit: 'feet' },
      // Material is the highest-uncertainty driver → image-card radio.
      { id: 'material', name: 'Fence Type', label: 'Fence material', type: 'radio',
        help: 'Sets the per-foot material and labor cost and the finished look.',
        options: [
          { ...optImg('Timber panel', 12, 'https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=300&h=300&fit=crop'),
            description: 'Classic wood panels — budget-friendly and quick to install.' },
          { ...optImg('Closeboard', 16, 'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=300&h=300&fit=crop'),
            description: 'Overlapping vertical boards — sturdier and more private.' },
          { ...optImg('Composite', 24, 'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=300&h=300&fit=crop'),
            description: 'Low-maintenance composite — never needs staining.' },
          { ...optImg('Metal railing', 29, 'https://images.unsplash.com/photo-1494526585095-c41746248156?w=300&h=300&fit=crop'),
            description: 'Powder-coated metal — the longest-lasting option.' },
        ] },
      { id: 'gates', name: 'Gates', label: 'How many gates?', type: 'number',
        help: 'Each gate adds hardware, framing and hanging labor.',
        min: 0, max: 6, step: 1, default_value: 1 },
      { id: 'removal', name: 'Old Fence Removal', label: 'Remove the existing fence', type: 'toggle',
        help: 'We tear out and haul away the old fence before we build.', on_value: 220 },
    ],
    calculations: [
      { ...calc('Materials & Labor', '[Fence Length] * [Fence Type]'), caption: 'Posts, panels and install labor, per foot of fence.' },
      { ...calc('Gates', '[Gates] * 180'), caption: 'Framing, hardware and hanging for each gate.' },
      { ...calc('Old Fence Removal', '[Old Fence Removal]'), caption: 'Tear-out and disposal of the existing fence where selected.' },
      { ...calc('Total Fencing Cost', '[Materials & Labor] + [Gates] + [Old Fence Removal]'),
        resultMode: 'primary', caption: 'Installed price — confirmed at a free property-line survey.' },
    ],
    result_calc: 'Total Fencing Cost',
    results: {
      heading: 'Your Fence Estimate',
      show_breakdown: true,
      cta_label: 'Schedule My Free Survey',
      cta_heading: 'A straight, solid fence starts at the property line',
      cta_sub: 'We confirm your boundary, set every post in concrete, and back the build with a 10-year structural warranty. Lock in your free survey now.',
      submit_success: 'Requested! Our project lead will call within one business day to schedule your free property-line survey.',
      footnote: 'Includes posts, panels, hardware, and disposal of old fencing. 10-year workmanship warranty on every install.',
    },
  },

  /* ── 8. Roof repair ── */
  {
    id: 'roof_repair', name: 'Roof Repair — Quick Estimate', description: 'Fast roof repair ballpark by size, material and pitch.',
    category: 'Construction', trades: ['roofing', 'roofing_installation'],
    trustBadges: BADGES.roofing,
    layout: 'two-column', theme: 'midnight', defaultIcon: 'Home',
    requireAddress: true,
    style: {
      widgetWidth: 'wide',
      accent: '#f59e0b',
      background: '#0f172a',
      surface: '#1e293b',
      border: '#334155',
      text: '#e2e8f0',
      resultsBg: '#020617',
      ctaColor: '#f59e0b',
      success: '#22c55e',
      error: '#f87171',
      fontFamily: 'inter',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        range_mode: { enabled: true, band_pct: 10 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Get Your Roof Repair Quote in 60 Seconds', subtitle: 'Licensed & insured roofers · 4.9★ from 1,200+ jobs · Free written estimate', align: 'left' },
    steps: [
      { id: 'step_roof', label: 'Your roof', help: 'Size and material set the bulk of the cost.', fields: ['roof_size', 'roof_type'] },
      { id: 'step_access', label: 'Pitch & extras', help: 'Steeper roofs cost more to work on; add any extra repairs.', fields: ['pitch', 'features'] },
    ],
    fields: [
      { id: 'roof_size', name: 'Roof Size', label: 'Roof size (sqft)', type: 'number',
        help: 'Roughly your home footprint — a quick estimate is fine.',
        min: 100, max: 5000, step: 50, default_value: 1500, unit: 'sqft' },
      // Material is the highest-uncertainty driver → image-card radio.
      { id: 'roof_type', name: 'Roof Type', label: 'Roof material', type: 'radio',
        help: 'Sets the per-square-foot material cost and crew specialty.',
        options: [
          { ...optImg('Shingle', 4, 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=300&fit=crop'),
            description: 'Asphalt shingle — the most common, fastest to repair.' },
          { ...optImg('Metal', 7, 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=300&h=300&fit=crop'),
            description: 'Standing-seam metal — long-lasting, specialty labor.' },
          { ...optImg('Tile', 9, 'https://images.unsplash.com/photo-1503594384566-461fe158e797?w=300&h=300&fit=crop'),
            description: 'Clay or concrete tile — heavy, needs careful handling.' },
        ] },
      { id: 'pitch', name: 'Roof Pitch', label: 'Roof pitch', type: 'radio',
        help: 'Steeper roofs need more safety setup and slower, safer work.',
        options: [
          { ...opt('Low Slope', 0), description: 'Walkable — easy footing, standard labor.' },
          { ...opt('Medium Slope', 1), description: 'Moderate pitch — some harness and staging.' },
          { ...opt('High Slope', 3), description: 'Steep — full fall protection and roof jacks.' },
        ] },
      { id: 'features', name: 'Additional Features', label: 'Additional repairs', type: 'multi_select',
        help: 'Tick any extra work you already know you need.',
        options: [opt('Skylights', 500), opt('Gutter Replacement', 600)] },
    ],
    calculations: [
      { ...calc('Materials cost', '[Roof Size] * [Roof Type]'), caption: 'Roofing material scaled to your roof size.' },
      { ...calc('Labor & Pitch', '[Roof Size] * [Roof Pitch]'), caption: 'Install labor and the steepness surcharge.' },
      { ...calc('Additional Features', '[Additional Features]'), caption: 'Optional skylight and gutter work.' },
      { ...calc('Estimated Repair Cost', '[Materials cost] + [Labor & Pitch] + [Additional Features]'),
        resultMode: 'primary', caption: 'Ballpark price — confirmed at a free on-site inspection.' },
    ],
    result_calc: 'Estimated Repair Cost',
    results: {
      heading: 'Your Roof Repair Estimate',
      show_breakdown: true,
      cta_label: 'Schedule My Free Inspection',
      cta_heading: 'A small leak today is a new roof tomorrow',
      cta_sub: 'Our licensed roofers climb up, document the damage with photos, and hand you a written estimate — no pressure, no surprises. Book your free inspection.',
      submit_success: 'Requested! Our roofing lead will call within one business day to schedule your free inspection.',
      footnote: 'Final price confirmed during free on-site inspection. 12-month workmanship warranty + manufacturer materials warranty.',
    },
  },

  /* ── 9. Solar panels ── */
  {
    id: 'solar_panels', name: 'Solar — Quick Panel Estimate', description: 'Fast ballpark solar price from panel count, capacity and roof orientation.',
    // BATCH 0 — was mapped to `hvac_services`; this is a solar template
    // (with a battery-storage toggle) → map the real solar registry ids.
    category: 'Home Improvement', trades: ['solar_panel', 'solar_battery'],
    trustBadges: BADGES.solar,
    layout: 'multi-column', theme: 'light', defaultIcon: 'Sun',
    requireAddress: true,
    style: {
      widgetWidth: 'wide',
      accent: '#f59e0b',
      background: '#fffbeb',
      surface: '#ffffff',
      border: '#fde9bd',
      text: '#1c1917',
      resultsBg: '#1c1402',
      ctaColor: '#f59e0b',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        range_mode: { enabled: true, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Get Your Solar Install Quote — Plus Your Tax Credit', subtitle: 'NABCEP-certified installers · 25-year panel warranty · 30% federal tax credit eligible', align: 'left' },
    steps: [
      { id: 'step_system', label: 'Your system', help: 'Panel count and wattage set your system size.', fields: ['panels', 'capacity'] },
      { id: 'step_site', label: 'Roof & storage', help: 'Orientation affects production; add a battery for backup.', fields: ['orientation', 'battery'] },
    ],
    fields: [
      { id: 'panels', name: 'Panels', label: 'Number of solar panels', type: 'slider',
        help: 'Most homes need 15–30 panels — your installer fine-tunes this on site.',
        min: 1, max: 200, step: 1, default_value: 20, unit: 'panels' },
      { id: 'capacity', name: 'Capacity', label: 'Capacity per panel (W)', type: 'slider',
        help: 'Higher-wattage panels make more power from the same roof space.',
        min: 200, max: 600, step: 10, default_value: 400, unit: 'W' },
      { id: 'orientation', name: 'Orientation', label: 'Primary roof orientation', type: 'radio',
        help: 'South-facing roofs make the most power; we adjust for everything else.',
        options: [
          { ...opt('South', 0), description: 'Ideal — maximum sun all day, no adjustment.' },
          { ...opt('South-East', 120), description: 'Strong morning sun — a small array bump.' },
          { ...opt('South-West', 120), description: 'Strong afternoon sun — a small array bump.' },
          { ...opt('East / West', 280), description: 'Split exposure — more panels to hit your target.' },
        ] },
      { id: 'battery', name: 'Battery', label: 'Add battery storage', type: 'toggle',
        help: 'Stores daytime power for night use and keeps the lights on in an outage.', on_value: 4500 },
    ],
    calculations: [
      { ...calc('Panel System', '[Panels] * [Capacity] * 0.9'), caption: 'Panels, inverter and mounting scaled to your system size.' },
      { ...calc('Orientation Adjustment', '[Orientation]'), caption: 'Extra capacity to offset a non-ideal roof direction.' },
      { ...calc('Battery Storage', '[Battery]'), caption: 'Backup battery where selected.' },
      { ...calc('Estimated System Cost', '[Panel System] + [Orientation Adjustment] + [Battery Storage]'),
        resultMode: 'primary', caption: 'Before incentives — eligible for the 30% federal tax credit.' },
    ],
    result_calc: 'Estimated System Cost',
    results: {
      heading: 'Your Solar Install Estimate',
      show_breakdown: true,
      cta_label: 'Schedule My Free Site Survey',
      cta_heading: 'Lock in today’s 30% federal tax credit',
      cta_sub: 'Our NABCEP-certified team designs your array, handles every permit, and guarantees production for 25 years. Book a free site survey to see your real savings.',
      submit_success: 'Requested! Your solar advisor will call within one business day to schedule your free site survey.',
      footnote: 'Eligible for the 30% federal solar tax credit. Includes panels, inverter, permits, and interconnection. 25-year production guarantee.',
    },
  },

  /* ── 10. Interior painting ── */
  {
    id: 'interior_painting', name: 'Interior Painting', description: 'Room + finish interior painting quote.',
    category: 'Home Improvement', trades: ['interior_painting', 'exterior_painting'],
    trustBadges: BADGES.painting,
    layout: 'two-column', theme: 'mint', defaultIcon: 'PaintBucket',
    requireAddress: true,
    style: {
      widgetWidth: 'wide',
      accent: '#0d9488',
      background: '#f3faf8',
      surface: '#ffffff',
      border: '#d8ece8',
      text: '#0f172a',
      resultsBg: '#0f3f3a',
      ctaColor: '#14b8a6',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        range_mode: { enabled: true, band_pct: 7 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Get an Instant Interior Painting Quote', subtitle: 'Licensed & insured · Sherwin-Williams certified · 2-year workmanship warranty', align: 'left' },
    steps: [
      { id: 'step_scope', label: 'What we’re painting', help: 'Wall area and room count set the labor and paint.', fields: ['wall_area', 'rooms'] },
      { id: 'step_finish', label: 'Finish & ceilings', help: 'Choose your paint grade and whether to include ceilings.', fields: ['finish', 'ceilings'] },
    ],
    fields: [
      { id: 'wall_area', name: 'Wall Area', label: 'Wall area to paint (sq ft)', type: 'slider',
        help: 'Total wall surface across the rooms — a rough estimate is fine.',
        min: 100, max: 5000, step: 50, default_value: 1300, unit: 'sq ft' },
      { id: 'rooms', name: 'Rooms', label: 'How many rooms?', type: 'number',
        help: 'Each room adds masking, cut-in and clean-up time.',
        min: 1, max: 20, step: 1, default_value: 3 },
      // BD-2c — converted from `select` to `radio` with image cards. Finish
      // quality is the highest-uncertainty answer; image cards anchor on
      // visual finish (matte vs satin vs designer).
      { id: 'finish', name: 'Finish Quality', label: 'Paint finish quality', type: 'radio',
        help: 'Higher grades hide imperfections, scrub clean, and last longer.',
        options: [
          { ...optImg('Standard', 0.85, 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=300&h=300&fit=crop'),
            description: 'Quality matte — great for low-traffic bedrooms and ceilings.' },
          { ...optImg('Premium', 1.3, 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=300&h=300&fit=crop'),
            description: 'Washable satin — the popular choice for living spaces.' },
          { ...optImg('Designer', 1.85, 'https://images.unsplash.com/photo-1618220179428-22790b461013?w=300&h=300&fit=crop'),
            description: 'Top-tier color-matched line with the smoothest finish.' },
        ] },
      { id: 'ceilings', name: 'Ceilings', label: 'Include ceilings', type: 'toggle',
        help: 'Adds ceiling prep and a fresh coat throughout.', on_value: 240 },
    ],
    calculations: [
      { ...calc('Walls — Paint & Labor', '[Wall Area] * [Finish Quality]'), caption: 'Paint and labor by wall area and the finish you pick.' },
      { ...calc('Per-room Prep', '[Rooms] * 35'), caption: 'Masking, patching and clean-up per room.' },
      { ...calc('Ceilings', '[Ceilings]'), caption: 'Ceiling coat where selected.' },
      { ...calc('Total Painting Cost', '[Walls — Paint & Labor] + [Per-room Prep] + [Ceilings]'),
        resultMode: 'primary', caption: 'All-in price — confirmed at a quick on-site color visit.' },
    ],
    result_calc: 'Total Painting Cost',
    results: {
      heading: 'Your Painting Quote',
      show_breakdown: true,
      cta_label: 'Reserve My Slot',
      cta_heading: 'Fresh walls, zero mess, on schedule',
      cta_sub: 'Our certified painters mask everything, protect your floors, and leave the room spotless — backed by a 2-year workmanship warranty. Reserve your slot now.',
      submit_success: 'Reserved! Your painting coordinator will call within one business day to confirm colors and your start date.',
      footnote: 'Includes premium paint, all prep, drop cloths, and clean-up. 2-year workmanship warranty on every job.',
    },
  },

  /* ── 11. House renovation ── */
  {
    id: 'house_renovation', name: 'House Renovation', description: 'Area + labour renovation estimate.',
    // BATCH 0 — registry near-dupe ids (`kitchen_remodeling` /
    // `bathroom_remodeling`) added alongside the original ids.
    category: 'Construction', trades: ['general_renovation', 'kitchen_remodel', 'kitchen_remodeling', 'bathroom_remodel', 'bathroom_remodeling', 'flooring_installation'],
    trustBadges: BADGES.renovation,
    layout: 'multi-column', theme: 'light', defaultIcon: 'Hammer',
    header: { title: 'Start Your Home Renovation — Free Itemised Estimate', subtitle: 'Licensed general contractor · Bonded crews · Transparent material + labor breakdown', align: 'left' },
    fields: [
      { id: 'area', name: 'Area to Renovate', label: 'Area to renovate (sqft)', type: 'slider',
        min: 100, max: 5000, step: 50, default_value: 1200, unit: 'sqft' },
      { id: 'material', name: 'Material Cost', label: 'Material cost per sqft', type: 'number',
        min: 5, max: 200, step: 1, default_value: 33, unit: '$' },
      { id: 'labor_rate', name: 'Labor Rate', label: 'Labor rate per hour', type: 'number',
        min: 10, max: 150, step: 1, default_value: 55, unit: '$' },
      { id: 'labor_hours', name: 'Labor Hours', label: 'Estimated labor hours', type: 'slider',
        min: 10, max: 500, step: 5, default_value: 180, unit: 'hrs' },
    ],
    calculations: [
      calc('Material Cost', '[Area to Renovate] * [Material Cost]'),
      calc('Labor Cost', '[Labor Rate] * [Labor Hours]'),
      calc('Total Renovation Cost', '[Material Cost] + [Labor Cost]'),
    ],
    result_calc: 'Total Renovation Cost',
    results: {
      heading: 'Your Renovation Estimate',
      show_breakdown: true,
      cta_label: 'Schedule My Walk-through',
      footnote: 'Includes materials, labor, project management, and clean-up. Permits and structural work quoted separately during walk-through.',
    },
  },

  /* ══════════════════════════════════════════════════════════════════
     Phase 3 — premium reference templates. Five designs, each authored
     in all three layouts (single-column / two-column / multi-column)
     so the gallery can show the same calculator in every arrangement.
     Fields + formulas are identical across a design's three variants;
     only `id`, `name` and `layout` differ.
     ══════════════════════════════════════════════════════════════════ */

  /* ── Premium 1. Wedding Photography ── (blue → `light` theme) */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'hours', name: 'Hours of Coverage', label: 'Hours of coverage', type: 'slider',
        min: 4, max: 12, step: 1, default_value: 8, unit: 'hrs' },
      { id: 'album', name: 'Photo Album', label: 'Photo album', type: 'select',
        options: [opt('No Album', 0), opt('Standard', 350), opt('Premium', 750)] },
      { id: 'second_photographer', name: 'Second Photographer', label: 'Add a second photographer', type: 'toggle', on_value: 400 },
      { id: 'travel', name: 'Travel Distance', label: 'Travel distance', type: 'slider',
        min: 0, max: 100, step: 5, default_value: 10, unit: 'miles' },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Total Cost', '[Hours of Coverage] * 150 + [Photo Album] + [Second Photographer] + [Travel Distance] * 2.5'),
      calc('Deposit Required', 'ROUND([Total Cost] * 0.2, 2)'),
    ];
    const header: TemplateHeader = {
      title: 'Wedding Photography Quote Calculator',
      subtitle: 'Book Your Wedding Photographer Today!', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Deposit to be paid upfront to secure your date.',
      cta_label: 'Contact Us',
    };
    const base = {
      name: 'Wedding Photography', description: 'Wedding-specialist photography quote with album, second-photographer and travel options.',
      category: 'Professional', trades: ['photographer'],
      trustBadges: BADGES.photography,
      theme: 'light', defaultIcon: 'Gem', fields, calculations, result_calc: 'Total Cost', header, results,
    };
    return [
      { id: 'wedding_photography_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'wedding_photography_two_col', layout: 'two-column' as TemplateLayout, ...base },
      { id: 'wedding_photography_multi_col', layout: 'multi-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Premium 2. House Renovation ── (dark forest-green → `forest` theme) */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'area', name: 'Area to Renovate', label: 'Area to renovate', type: 'slider',
        min: 100, max: 5000, step: 50, default_value: 500, unit: 'sq ft' },
      { id: 'material_cost', name: 'Material Cost', label: 'Material cost per sq ft', type: 'slider',
        min: 5, max: 50, step: 1, default_value: 20, unit: '$/sq ft' },
      { id: 'labor_rate', name: 'Labor Rate', label: 'Labor rate per hour', type: 'slider',
        min: 10, max: 100, step: 5, default_value: 50, unit: '$/hr' },
      { id: 'labor_hours', name: 'Labor Hours', label: 'Estimated labor hours', type: 'slider',
        min: 10, max: 500, step: 10, default_value: 100, unit: 'hrs' },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Material Cost', '[Area to Renovate] * [Material Cost]'),
      calc('Labor Cost', '[Labor Rate] * [Labor Hours]'),
      calc('Total Renovation Cost', '[Material Cost] + [Labor Cost]'),
    ];
    const header: TemplateHeader = {
      title: 'House Renovation Cost Calculator',
      subtitle: 'Ready to Start Your Renovation?', align: 'left',
    };
    const results: TemplateResults = { footnote: 'A clear, itemised estimate — material and labour broken out so you know exactly where your budget goes.', cta_label: 'Contact Us' };
    const base = {
      name: 'House Renovation Pro', description: 'Premium whole-home renovation estimate with material & labour breakdown.',
      category: 'Construction', trades: ['general_contractor', 'handyman'],
      trustBadges: BADGES.renovation,
      theme: 'forest', defaultIcon: 'HardHat', fields, calculations, result_calc: 'Total Renovation Cost', header, results,
    };
    return [
      { id: 'house_renovation_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'house_renovation_two_col', layout: 'two-column' as TemplateLayout, ...base },
      { id: 'house_renovation_multi_col', layout: 'multi-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Premium 3. Carpet Cleaning ── (mint/green → `mint` theme) */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'room_size', name: 'Room Size', label: 'Average room size', type: 'slider',
        min: 100, max: 500, step: 10, default_value: 250, unit: 'sq ft' },
      { id: 'rooms', name: 'Number of Rooms', label: 'Number of rooms', type: 'slider',
        min: 1, max: 10, step: 1, default_value: 1, unit: 'rooms' },
      { id: 'extras', name: 'Additional Services', label: 'Additional services', type: 'multi_select',
        options: [opt('Stain Removal', 35), opt('Deodorizing', 25), opt('Scotchgard Protection', 45)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Total Cost', '([Room Size] * 0.45 + 25) * [Number of Rooms] + [Additional Services]'),
      calc('Cost per Room', 'ROUND([Total Cost] / [Number of Rooms], 2)'),
    ];
    const header: TemplateHeader = {
      title: 'Carpet Cleaning Cost Calculator',
      subtitle: 'Get Your Carpets Cleaned Now', align: 'left',
    };
    const results: TemplateResults = { footnote: 'Fresh, deep-cleaned carpets — book in minutes with an instant, all-in price.', cta_label: 'Book Now' };
    const base = {
      name: 'Carpet Cleaning — Room Packages', description: 'Room-based carpet cleaning packages with stain, deodorising and protection treatments.',
      // BATCH 0 — the registry's own `carpet_cleaning` trade was missing.
      category: 'Cleaning', trades: ['carpet_cleaning', 'house_cleaning'],
      trustBadges: BADGES.generic,
      theme: 'mint', defaultIcon: 'SprayCan', fields, calculations, result_calc: 'Total Cost', header, results,
    };
    return [
      { id: 'carpet_cleaning_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'carpet_cleaning_two_col', layout: 'two-column' as TemplateLayout, ...base },
      { id: 'carpet_cleaning_multi_col', layout: 'multi-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Premium 4. Roof Repair ── (dark forest-green → `forest` theme) */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'roof_area', name: 'Roof Area', label: 'Roof area', type: 'slider',
        min: 100, max: 5000, step: 50, default_value: 1500, unit: 'sq ft' },
      { id: 'material_type', name: 'Material Type', label: 'Material type', type: 'select',
        options: [opt('Asphalt Shingles', 4), opt('Metal', 8), opt('Tile', 12)] },
      { id: 'complexity', name: 'Repair Complexity', label: 'Repair complexity', type: 'radio',
        options: [opt('Simple', 1), opt('Moderate', 1.4), opt('Complex', 1.9)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Material Cost', '[Roof Area] * [Material Type]'),
      calc('Labor Cost', 'ROUND([Roof Area] * 3.5 * [Repair Complexity], 2)'),
      calc('Total Roof Repair Cost', '[Material Cost] + [Labor Cost]'),
    ];
    const header: TemplateHeader = {
      title: 'Roof Repair Cost Calculator',
      subtitle: 'Get Your Roof Repaired Now', align: 'left',
    };
    const results: TemplateResults = { footnote: 'A protected, watertight roof — get a transparent estimate with material and labour itemised.', cta_label: 'Schedule Now' };
    const base = {
      name: 'Roof Repair — Itemized Quote', description: 'Itemised roof repair estimate by area, material and job complexity, with material/labour breakdown.',
      category: 'Construction', trades: ['roofing', 'roofing_installation'],
      trustBadges: BADGES.roofing,
      theme: 'forest', defaultIcon: 'Hammer', fields, calculations, result_calc: 'Total Roof Repair Cost', header, results,
    };
    return [
      { id: 'roof_repair_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'roof_repair_two_col', layout: 'two-column' as TemplateLayout, ...base },
      { id: 'roof_repair_multi_col', layout: 'multi-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Premium 5. Moving Cost ── (blue → `light` theme) */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'distance', name: 'Distance', label: 'Moving distance', type: 'slider',
        min: 0, max: 3000, step: 25, default_value: 50, unit: 'miles' },
      { id: 'home_size', name: 'Home Size', label: 'Home size', type: 'select',
        options: [opt('1 Bedroom', 400), opt('2 Bedroom', 700), opt('3 Bedroom', 1100), opt('4 Bedroom', 1600)] },
      { id: 'packing', name: 'Packing Service', label: 'Add a full packing service', type: 'toggle', on_value: 350 },
      { id: 'extras', name: 'Additional Services', label: 'Additional services', type: 'multi_select',
        options: [opt('Storage', 200), opt('Fragile Item Handling', 150), opt('Cleaning', 180), opt('Full Value Protection Insurance', 250)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Transportation Cost', '[Distance] * 1.2 + [Home Size]'),
      calc('Packing Service Cost', '[Packing Service]'),
      calc('Additional Services Cost', '[Additional Services]'),
      calc('Total Moving Cost', '[Transportation Cost] + [Packing Service Cost] + [Additional Services Cost]'),
    ];
    const header: TemplateHeader = {
      title: 'Moving Cost Calculator',
      subtitle: 'Ready to Make Your Move?', align: 'left',
    };
    const results: TemplateResults = { footnote: 'One clear price for your whole move — transport, packing and extras itemised.', cta_label: 'Get a Quote Now' };
    const base = {
      name: 'Moving — Flat-Rate Package', description: 'Flat-rate moving quote by home size with packing service and add-ons — one all-in price.',
      category: 'Professional', trades: ['moving_services'],
      trustBadges: BADGES.generic,
      theme: 'light', defaultIcon: 'Package', fields, calculations, result_calc: 'Total Moving Cost', header, results,
    };
    return [
      { id: 'moving_cost_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'moving_cost_two_col', layout: 'two-column' as TemplateLayout, ...base },
      { id: 'moving_cost_multi_col', layout: 'multi-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ══════════════════════════════════════════════════════════════════
     Per-Trade Premium Expansion — 18 verticals × 2 layouts each
     (single-column + two-column). Same structural quality bar as the
     Pro 15 above: real fields, formulas that resolve via runCalculations
     to believable defaults, primary number + breakdown lines, CTA, and a
     warm closing footnote. `multi-column` deliberately skipped to keep
     scope bounded — the unified renderer falls back cleanly when a trade
     only ships two layouts.
     ══════════════════════════════════════════════════════════════════ */

  /* ── Trade 1. HVAC Repair / Replacement (Mechanical & Systems) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'service_type', name: 'Service Type', label: 'What do you need?', type: 'select',
        options: [opt('Tune-up / maintenance', 120), opt('Diagnostic & repair', 220), opt('Full system replacement', 4800)] },
      { id: 'system_size', name: 'System Size', label: 'System size (tons)', type: 'slider',
        min: 1.5, max: 6, step: 0.5, default_value: 3, unit: 'tons' },
      { id: 'system_age', name: 'System Age', label: 'System age', type: 'radio',
        options: [opt('Under 5 years', 0), opt('5 to 10 years', 80), opt('10 to 15 years', 180), opt('Over 15 years', 320)] },
      { id: 'urgency', name: 'Urgency', label: 'How urgent is it?', type: 'select',
        options: [opt('Scheduled visit', 0), opt('Within 24 hours', 75), opt('Same-day emergency', 195)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Refrigerant top-up', 145), opt('Smart thermostat install', 220), opt('Duct cleaning', 320), opt('Annual service plan', 180)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Service Cost', '[Service Type] + [System Size] * 35 + [System Age]'),
      calc('Add-ons Total', '[Extras]'),
      calc('Estimated Total', '[Service Cost] + [Urgency] + [Add-ons Total]'),
    ];
    const header: TemplateHeader = {
      title: 'HVAC Repair & Replacement Estimator',
      subtitle: 'Heating or cooling acting up? Get a clear price in under a minute.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Final pricing confirmed after on-site diagnostic. Most repairs scheduled within 48 hours.',
      cta_label: 'Book a Technician',
    };
    const base = {
      name: 'HVAC Repair & Replace', description: 'Per-trade HVAC quote covering diagnostics, repairs and full system replacement.',
      category: 'HVAC & Mechanical', trades: ['hvac_repair', 'hvac_installation', 'furnace_replacement', 'emergency_hvac', 'hvac_services'],
      trustBadges: BADGES.generic,
      theme: 'midnight', defaultIcon: 'AirVent', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'hvac_repair_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'hvac_repair_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 2. Plumbing Services (Mechanical & Systems) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'job_type', name: 'Job Type', label: 'What plumbing work do you need?', type: 'select',
        options: [opt('Clogged drain', 145), opt('Leaky faucet or fixture', 175), opt('Water heater repair', 285), opt('Pipe repair / replacement', 425), opt('Toilet install', 320), opt('Full bathroom rough-in', 1850)] },
      { id: 'urgency', name: 'Urgency', label: 'How urgent?', type: 'radio',
        options: [opt('Scheduled', 0), opt('Same day', 95), opt('After hours emergency', 245)] },
      { id: 'travel', name: 'Travel Distance', label: 'Travel distance', type: 'slider',
        min: 0, max: 60, step: 5, default_value: 10, unit: 'miles' },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Camera inspection', 145), opt('Water-pressure check', 65), opt('Shut-off valve replacement', 125), opt('Haul old fixtures', 55)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Labor & Materials', '[Job Type] + [Urgency]'),
      calc('Travel Fee', '[Travel Distance] * 2.5'),
      calc('Estimated Total', '[Labor & Materials] + [Travel Fee] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Plumbing Service Quote',
      subtitle: 'Tell us about the issue — get a transparent price in seconds.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Licensed plumbers, upfront pricing, no surprises. Most jobs completed the same day.',
      cta_label: 'Book a Plumber',
    };
    const base = {
      name: 'Plumbing — Service Calls & Emergency', description: 'Multi-job plumbing quote — repairs, installs and after-hours emergencies, with urgency tiers and travel fee.',
      category: 'HVAC & Mechanical', trades: ['plumbing_services', 'emergency_plumbing'],
      trustBadges: BADGES.plumbing,
      theme: 'light', defaultIcon: 'ShowerHead', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'plumbing_services_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'plumbing_services_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 3. Electrical Services (Mechanical & Systems) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'service', name: 'Service Type', label: 'What needs doing?', type: 'select',
        options: [opt('Outlet or switch replacement', 165), opt('Light fixture install', 195), opt('Ceiling fan install', 245), opt('Circuit / breaker repair', 380), opt('Panel upgrade (200A)', 2200), opt('Whole-home rewire', 5800)] },
      { id: 'rooms', name: 'Rooms Affected', label: 'Number of rooms / locations', type: 'number',
        min: 1, max: 20, step: 1, default_value: 1 },
      { id: 'permit', name: 'Permit Required', label: 'Permit needed', type: 'toggle', on_value: 185 },
      { id: 'urgency', name: 'Urgency', label: 'Urgency', type: 'radio',
        options: [opt('Scheduled', 0), opt('Within 24 hours', 110), opt('Same-day emergency', 275)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Smart switch upgrade', 95), opt('Surge protector', 145), opt('GFCI outlet add', 75), opt('Whole-home safety inspection', 165)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Job Cost', '[Service Type] * [Rooms Affected]'),
      calc('Compliance & Urgency', '[Permit Required] + [Urgency]'),
      calc('Estimated Total', '[Job Cost] + [Compliance & Urgency] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Electrical Service Estimator',
      subtitle: 'From a single outlet to a full panel upgrade — get a licensed-electrician price now.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'All work performed by licensed, insured electricians. Permits handled on your behalf.',
      cta_label: 'Schedule Service',
    };
    const base = {
      name: 'Electrical — Installs & Emergency', description: 'Room-by-room electrical quote — installs, panel upgrades and same-day emergencies, with permit handling.',
      category: 'HVAC & Mechanical', trades: ['electrical_services', 'emergency_electrical', 'ev_charger'],
      trustBadges: BADGES.electrical,
      theme: 'midnight', defaultIcon: 'PlugZap', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'electrical_services_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'electrical_services_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 4. Appliance Repair (Mechanical & Systems) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'appliance', name: 'Appliance', label: 'Which appliance?', type: 'select',
        options: [opt('Refrigerator', 195), opt('Dishwasher', 165), opt('Washer', 175), opt('Dryer', 165), opt('Oven / range', 215), opt('Microwave (built-in)', 145)] },
      { id: 'issue', name: 'Issue Severity', label: 'How severe is the issue?', type: 'radio',
        options: [opt('Minor (light fix, sensor reset)', 0), opt('Moderate (part replacement)', 145), opt('Major (compressor / motor)', 385)] },
      { id: 'age', name: 'Appliance Age', label: 'Appliance age', type: 'select',
        options: [opt('Under 3 years', 0), opt('3 to 7 years', 35), opt('Over 7 years', 95)] },
      { id: 'trip', name: 'Service Call Fee', label: 'Service call fee included', type: 'toggle', on_value: 95 },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Same-day visit', 75), opt('Extended 12-month parts warranty', 95), opt('Vent / hose inspection', 55)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Diagnosis & Repair', '[Appliance] + [Issue Severity] + [Appliance Age]'),
      calc('Estimated Total', '[Diagnosis & Repair] + [Service Call Fee] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Appliance Repair Quote',
      subtitle: 'Broken appliance? Get a fast, fixed-price quote.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Most repairs completed in a single visit. 90-day workmanship guarantee on all jobs.',
      cta_label: 'Book a Repair',
    };
    const base = {
      name: 'Appliance Repair — Same-Day Service', description: 'Severity-priced appliance repair with service-call fee and same-day options.',
      category: 'HVAC & Mechanical', trades: ['appliance_repair'],
      trustBadges: BADGES.applianceRepair,
      theme: 'coral', defaultIcon: 'WashingMachine', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'appliance_repair_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'appliance_repair_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 5. Drywall & Plaster (Construction) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'area', name: 'Wall / Ceiling Area', label: 'Area to drywall', type: 'slider',
        min: 50, max: 3000, step: 25, default_value: 400, unit: 'sq ft' },
      { id: 'work_type', name: 'Work Type', label: 'Type of work', type: 'select',
        options: [opt('Patch & repair', 1.8), opt('Hang & finish (new)', 3.2), opt('Skim coat / re-plaster', 2.6), opt('Soundproof drywall', 4.4)] },
      { id: 'finish', name: 'Finish Level', label: 'Finish level', type: 'radio',
        options: [opt('Level 3 (textured)', 0), opt('Level 4 (smooth paint-ready)', 0.6), opt('Level 5 (gallery smooth)', 1.4)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Texture matching', 220), opt('Prime coat included', 185), opt('Debris haul-away', 145), opt('Mold-resistant board', 320)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Drywall Subtotal', '[Wall / Ceiling Area] * ([Work Type] + [Finish Level])'),
      calc('Estimated Total', '[Drywall Subtotal] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Drywall & Plaster Estimator',
      subtitle: 'From a patch to a full hang & finish — get a square-foot price right now.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Clean, paint-ready walls in days, not weeks. All debris removed on completion.',
      cta_label: 'Request Quote',
    };
    const base = {
      name: 'Drywall & Plaster', description: 'Square-foot drywall and plaster quote with finish-level pricing.',
      category: 'Construction', trades: ['drywall_plaster'],
      trustBadges: BADGES.drywall,
      theme: 'mint', defaultIcon: 'Paintbrush', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'drywall_plaster_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'drywall_plaster_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 6. Tile Installation (Construction) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'area', name: 'Tile Area', label: 'Area to tile', type: 'slider',
        min: 20, max: 1500, step: 10, default_value: 120, unit: 'sq ft' },
      { id: 'tile_type', name: 'Tile Type', label: 'Tile type', type: 'select',
        options: [opt('Ceramic', 7), opt('Porcelain', 11), opt('Natural stone', 18), opt('Large-format / luxury', 24)] },
      { id: 'pattern', name: 'Pattern', label: 'Layout pattern', type: 'radio',
        options: [opt('Straight set', 0), opt('Diagonal', 1.5), opt('Herringbone / chevron', 3.5)] },
      { id: 'location', name: 'Location', label: 'Where is it going?', type: 'select',
        options: [opt('Floor', 0), opt('Wall', 1.5), opt('Shower / wet area', 4.5), opt('Backsplash', 2)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Remove existing tile', 320), opt('Subfloor prep', 275), opt('Heated floor system', 850), opt('Sealing & grout finish', 145)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Materials & Labor', '[Tile Area] * ([Tile Type] + [Pattern] + [Location])'),
      calc('Estimated Total', '[Materials & Labor] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Tile Installation Calculator',
      subtitle: 'Floors, walls, showers — get a per-square-foot price for any tile job.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Premium materials, lifetime workmanship warranty. Free measurement visit included.',
      cta_label: 'Get a Detailed Quote',
    };
    const base = {
      name: 'Tile Installation', description: 'Tile install quote by area, type, pattern and location.',
      category: 'Construction', trades: ['tile_installation', 'flooring_installation'],
      trustBadges: BADGES.flooring,
      theme: 'light', defaultIcon: 'Layers', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'tile_installation_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'tile_installation_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 7. Window Replacement (Home Improvement) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'windows', name: 'Number of Windows', label: 'Number of windows', type: 'slider',
        min: 1, max: 30, step: 1, default_value: 6, unit: 'windows' },
      { id: 'window_type', name: 'Window Type', label: 'Window type', type: 'select',
        options: [opt('Single-hung vinyl', 425), opt('Double-hung vinyl', 565), opt('Casement', 685), opt('Fiberglass premium', 845), opt('Bay / bow', 1450)] },
      { id: 'glass', name: 'Glass Package', label: 'Glass package', type: 'radio',
        options: [opt('Double-pane standard', 0), opt('Double-pane low-E', 65), opt('Triple-pane', 175)] },
      { id: 'removal', name: 'Removal', label: 'Remove & haul old windows', type: 'toggle', on_value: 245 },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Custom trim', 95), opt('Interior blinds', 145), opt('Exterior wrap', 85), opt('Lifetime warranty upgrade', 195)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Windows Subtotal', '[Number of Windows] * ([Window Type] + [Glass Package])'),
      calc('Extras Total', '[Extras] * [Number of Windows]'),
      calc('Estimated Total', '[Windows Subtotal] + [Removal] + [Extras Total]'),
    ];
    const header: TemplateHeader = {
      title: 'Window Replacement Estimator',
      subtitle: 'Energy-efficient new windows — get a per-window price you can trust.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'ENERGY STAR-rated windows installed by certified pros. Lifetime product warranty.',
      cta_label: 'Schedule a Measurement',
    };
    const base = {
      name: 'Window Replacement — Whole-Home', description: 'Whole-home window replacement for up to 30 windows, with glass packages and per-window trim add-ons.',
      category: 'Home Improvement', trades: ['window_replacement'],
      trustBadges: BADGES.windows,
      theme: 'light', defaultIcon: 'AppWindow', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'window_replacement_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'window_replacement_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 8. Door Installation (Home Improvement) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'door_type', name: 'Door Type', label: 'Door type', type: 'select',
        options: [opt('Interior pre-hung', 285), opt('Interior solid-core', 425), opt('Exterior steel', 685), opt('Exterior fiberglass', 845), opt('Sliding patio door', 1250), opt('French double door', 1650)] },
      { id: 'doors', name: 'Number of Doors', label: 'Number of doors', type: 'number',
        min: 1, max: 15, step: 1, default_value: 2 },
      { id: 'removal', name: 'Remove Old Door', label: 'Remove the old door & frame', type: 'toggle', on_value: 95 },
      { id: 'hardware', name: 'Hardware Level', label: 'Hardware level', type: 'radio',
        options: [opt('Standard knob set', 0), opt('Mid-range lever set', 75), opt('Premium smart lock', 245)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Custom trim & casing', 145), opt('Weatherstripping upgrade', 65), opt('Re-frame opening', 320), opt('Paint or stain finish', 125)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Doors Subtotal', '([Door Type] + [Hardware Level]) * [Number of Doors]'),
      calc('Service Total', '[Removal] * [Number of Doors] + [Extras]'),
      calc('Estimated Total', '[Doors Subtotal] + [Service Total]'),
    ];
    const header: TemplateHeader = {
      title: 'Door Installation Cost Calculator',
      subtitle: 'Interior or exterior, single or French — get a clear quote per door.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Pro install, all hardware fitted, debris removed. Most jobs done in a single day.',
      cta_label: 'Get a Detailed Quote',
    };
    const base = {
      name: 'Door Installation', description: 'Per-door install quote covering interior, exterior and patio doors.',
      category: 'Home Improvement', trades: ['door_installation'],
      trustBadges: BADGES.doors,
      theme: 'mint', defaultIcon: 'DoorOpen', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'door_installation_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'door_installation_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 9. Siding Installation (Construction) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'area', name: 'Siding Area', label: 'Exterior wall area', type: 'slider',
        min: 200, max: 5000, step: 50, default_value: 1800, unit: 'sq ft' },
      { id: 'material', name: 'Material', label: 'Siding material', type: 'select',
        options: [opt('Vinyl', 5), opt('Fiber-cement', 9), opt('Engineered wood', 11), opt('Cedar', 14), opt('Stone veneer accent', 22)] },
      { id: 'stories', name: 'Home Stories', label: 'Home height', type: 'radio',
        options: [opt('1 story', 0), opt('2 story', 1.5), opt('3 story', 3.5)] },
      { id: 'removal', name: 'Remove Old Siding', label: 'Remove existing siding', type: 'toggle', on_value: 1450 },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Insulation wrap (R-3)', 1850), opt('New gutters', 1450), opt('Trim & soffit upgrade', 1250), opt('Lifetime color warranty', 950)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Material & Labor', '[Siding Area] * ([Material] + [Home Stories])'),
      calc('Estimated Total', '[Material & Labor] + [Remove Old Siding] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Siding Installation Estimator',
      subtitle: 'Refresh your home exterior with a transparent per-square-foot quote.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Premium materials, factory-trained installers, manufacturer-backed warranties.',
      cta_label: 'Book a Free Inspection',
    };
    const base = {
      name: 'Siding Installation', description: 'Whole-home siding quote by area, material and number of stories.',
      category: 'Construction', trades: ['siding_installation'],
      trustBadges: BADGES.siding,
      theme: 'forest', defaultIcon: 'Home', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'siding_installation_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'siding_installation_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 10. Deck Construction (Outdoor) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'area', name: 'Deck Area', label: 'Deck size', type: 'slider',
        min: 50, max: 1500, step: 10, default_value: 300, unit: 'sq ft' },
      { id: 'material', name: 'Decking Material', label: 'Decking material', type: 'select',
        options: [opt('Pressure-treated pine', 22), opt('Cedar', 35), opt('Composite (mid)', 48), opt('Composite (premium)', 62), opt('Hardwood (ipe)', 78)] },
      { id: 'height', name: 'Deck Height', label: 'Deck height', type: 'radio',
        options: [opt('Ground level', 0), opt('Raised (under 8 ft)', 6), opt('Elevated (8 ft+)', 14)] },
      { id: 'railing', name: 'Railing', label: 'Railing style', type: 'select',
        options: [opt('No railing', 0), opt('Wood railing', 28), opt('Aluminum railing', 42), opt('Glass panel railing', 68)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Built-in bench seating', 850), opt('Pergola / shade structure', 1850), opt('LED step lighting', 650), opt('Stairs (one set)', 950)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Deck Subtotal', '[Deck Area] * ([Decking Material] + [Deck Height] + [Railing])'),
      calc('Estimated Total', '[Deck Subtotal] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Deck Construction Estimator',
      subtitle: 'Design your dream deck — get a transparent material + labor quote in seconds.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Custom-built decks with permits, inspection, and 10-year structural warranty included.',
      cta_label: 'Design My Deck',
    };
    const base = {
      name: 'Deck Construction', description: 'Custom deck build quote by area, material, height and railing style.',
      category: 'Outdoor', trades: ['deck_construction', 'deck_building'],
      trustBadges: BADGES.deck,
      theme: 'forest', defaultIcon: 'Fence', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'deck_construction_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'deck_construction_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 11. Insulation Installation (Home Improvement) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'area', name: 'Insulation Area', label: 'Area to insulate', type: 'slider',
        min: 100, max: 4000, step: 50, default_value: 1200, unit: 'sq ft' },
      { id: 'type', name: 'Insulation Type', label: 'Insulation type', type: 'select',
        options: [opt('Fiberglass batt', 1.8), opt('Blown-in cellulose', 2.4), opt('Spray foam (open-cell)', 4.2), opt('Spray foam (closed-cell)', 5.8), opt('Rigid foam board', 3.4)] },
      { id: 'location', name: 'Location', label: 'Where is the insulation going?', type: 'radio',
        options: [opt('Attic', 0), opt('Walls', 0.8), opt('Crawl space / basement', 1.4), opt('Rim joist seal', 2.2)] },
      { id: 'removal', name: 'Remove Old Insulation', label: 'Remove existing insulation', type: 'toggle', on_value: 685 },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Air sealing & gap fill', 485), opt('Vapor barrier', 325), opt('Attic baffles', 245), opt('Energy audit report', 295)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Materials & Labor', '[Insulation Area] * ([Insulation Type] + [Location])'),
      calc('Estimated Total', '[Materials & Labor] + [Remove Old Insulation] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Insulation Installation Quote',
      subtitle: 'Lower energy bills, year-round comfort — get a per-square-foot quote now.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'BPI-certified installers. Most homeowners see a 15-25% energy bill reduction.',
      cta_label: 'Schedule an Energy Audit',
    };
    const base = {
      name: 'Insulation Installation', description: 'Insulation quote by area, type and location with energy-audit add-on.',
      category: 'Home Improvement', trades: ['insulation_installation'],
      trustBadges: BADGES.insulation,
      theme: 'mint', defaultIcon: 'Snowflake', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'insulation_installation_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'insulation_installation_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 12. Pest Control (Specialty Services) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'pest', name: 'Pest Type', label: 'What pest are you dealing with?', type: 'select',
        options: [opt('General (ants / spiders / roaches)', 145), opt('Rodents (mice / rats)', 245), opt('Bed bugs', 485), opt('Termites', 685), opt('Wasps / hornets', 195), opt('Wildlife removal', 385)] },
      { id: 'home_size', name: 'Home Size', label: 'Home size', type: 'radio',
        options: [opt('Under 1,500 sq ft', 0), opt('1,500 to 3,000 sq ft', 65), opt('Over 3,000 sq ft', 145)] },
      { id: 'plan', name: 'Service Plan', label: 'Service plan', type: 'select',
        options: [opt('One-time treatment', 0), opt('Quarterly plan (annual)', 95), opt('Monthly premium plan', 245)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Exterior perimeter spray', 85), opt('Attic / crawl-space treatment', 145), opt('Eco-friendly products', 65), opt('Follow-up inspection', 75)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Treatment Cost', '[Pest Type] + [Home Size]'),
      calc('Estimated Total', '[Treatment Cost] + [Service Plan] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Pest Control Service Quote',
      subtitle: 'Identify your pest, get an instant treatment price — protection starts today.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Licensed pest pros, family- and pet-safe options. 30-day satisfaction guarantee.',
      cta_label: 'Schedule a Treatment',
    };
    const base = {
      name: 'Pest Control — Per-Pest Treatment', description: 'Targeted treatment pricing per pest — bed bugs, termites, rodents, wildlife — with home-size sizing.',
      category: 'Cleaning', trades: ['pest_control'],
      trustBadges: BADGES.pestControl,
      theme: 'forest', defaultIcon: 'Bug', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'pest_control_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'pest_control_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 13. Tree Service (Outdoor) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'service', name: 'Service Type', label: 'Service type', type: 'select',
        options: [opt('Trimming / pruning', 285), opt('Tree removal', 685), opt('Stump grinding', 195), opt('Emergency / storm damage', 950)] },
      { id: 'trees', name: 'Number of Trees', label: 'Number of trees', type: 'number',
        min: 1, max: 25, step: 1, default_value: 1 },
      { id: 'size', name: 'Tree Size', label: 'Average tree size', type: 'radio',
        options: [opt('Small (under 25 ft)', 0), opt('Medium (25 to 50 ft)', 185), opt('Large (50 to 75 ft)', 425), opt('Very large (75 ft+)', 850)] },
      { id: 'access', name: 'Access Difficulty', label: 'Site access', type: 'radio',
        options: [opt('Easy access', 0), opt('Tight / fenced yard', 145), opt('Crane required', 685)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Haul wood away', 145), opt('Wood chipping on site', 95), opt('Stump grinding included', 195), opt('Cabling / bracing', 245)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Per-Tree Cost', '[Service Type] + [Tree Size]'),
      calc('Job Subtotal', '[Per-Tree Cost] * [Number of Trees] + [Access Difficulty]'),
      calc('Estimated Total', '[Job Subtotal] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Tree Service Cost Calculator',
      subtitle: 'Trimming, removal, storm response — get an instant arborist quote.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Certified arborists, fully insured crews. Emergency response available 24/7.',
      cta_label: 'Request a Site Visit',
    };
    const base = {
      name: 'Tree Service — Removal & Storm', description: 'Per-tree quote for trimming, removal, stump grinding and storm response, with crane-access and cabling add-ons.',
      category: 'Outdoor', trades: ['tree_trimming', 'tree_service'],
      trustBadges: BADGES.treeService,
      theme: 'forest', defaultIcon: 'TreePine', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'tree_service_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'tree_service_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 14. Junk Removal (Specialty Services) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'load_size', name: 'Load Size', label: 'How much junk?', type: 'select',
        options: [opt('Single item pickup', 95), opt('Quarter truck load', 195), opt('Half truck load', 345), opt('Three-quarter truck load', 485), opt('Full truck load', 595)] },
      { id: 'category', name: 'Item Category', label: 'What kind of items?', type: 'radio',
        options: [opt('General household', 0), opt('Furniture / appliances', 65), opt('Construction debris', 145), opt('Yard waste', 45)] },
      { id: 'access', name: 'Access', label: 'Where are the items?', type: 'select',
        options: [opt('Curbside / garage', 0), opt('Inside ground floor', 35), opt('Upstairs / basement', 85)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Same-day pickup', 65), opt('E-waste / electronics', 75), opt('Hazardous item disposal', 145), opt('Light cleaning after', 95)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Pickup Cost', '[Load Size] + [Item Category] + [Access]'),
      calc('Estimated Total', '[Pickup Cost] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Junk Removal Quote',
      subtitle: 'From a single piece to a full truck — fast, transparent, no surprises.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'We load, haul, sweep up, and donate or recycle whenever possible.',
      cta_label: 'Book a Pickup',
    };
    const base = {
      name: 'Junk Removal — Loads & Special Items', description: 'Load-size pickup quote with item-category surcharges and e-waste / hazardous disposal options.',
      category: 'Cleaning', trades: ['junk_removal'],
      trustBadges: BADGES.junkRemoval,
      theme: 'coral', defaultIcon: 'Trash2', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'junk_removal_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'junk_removal_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 15. Pool Cleaning & Maintenance (Outdoor) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'pool_size', name: 'Pool Size', label: 'Pool size (gallons)', type: 'slider',
        min: 5000, max: 50000, step: 1000, default_value: 15000, unit: 'gal' },
      { id: 'service', name: 'Service Type', label: 'Service type', type: 'select',
        options: [opt('Weekly maintenance', 110), opt('One-time deep clean', 295), opt('Opening / closing service', 385), opt('Green-to-clean rescue', 485)] },
      { id: 'pool_type', name: 'Pool Type', label: 'Pool type', type: 'radio',
        options: [opt('In-ground concrete', 0), opt('Vinyl liner', -15), opt('Fiberglass', -25), opt('Saltwater system', 25)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Chemical balancing', 45), opt('Filter cleaning', 65), opt('Tile scrubbing', 85), opt('Equipment inspection', 75)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Service Cost', '[Service Type] + [Pool Type] + [Pool Size] * 0.004'),
      calc('Estimated Total', '[Service Cost] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Pool Cleaning Quote',
      subtitle: 'Crystal-clear water all season — get a per-visit price right now.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Trained pool techs, all chemicals included. Discounts on prepaid season packages.',
      cta_label: 'Schedule Pool Service',
    };
    const base = {
      name: 'Pool Cleaning — One-Time & Seasonal', description: 'One-time deep cleans, opening/closing and green-to-clean rescues, sized by pool volume.',
      category: 'Outdoor', trades: ['pool_cleaning', 'pool_service'],
      trustBadges: BADGES.generic,
      theme: 'mint', defaultIcon: 'Droplets', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'pool_cleaning_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'pool_cleaning_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 16. Garage Door (Mechanical & Systems) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'service', name: 'Service Type', label: 'What needs doing?', type: 'select',
        options: [opt('Spring replacement', 285), opt('Opener repair', 245), opt('Cable / roller replacement', 195), opt('Panel replacement', 485), opt('Full door replacement', 1450), opt('New opener install', 525)] },
      { id: 'door_size', name: 'Door Size', label: 'Door size', type: 'radio',
        options: [opt('Single car', 0), opt('Double car', 145), opt('Oversized / commercial', 385)] },
      { id: 'urgency', name: 'Urgency', label: 'Urgency', type: 'radio',
        options: [opt('Scheduled', 0), opt('Same day', 75), opt('After hours', 195)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Smart opener upgrade', 195), opt('Insulated panels', 285), opt('New weather seal', 95), opt('Battery backup', 145)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Service Cost', '[Service Type] + [Door Size]'),
      calc('Estimated Total', '[Service Cost] + [Urgency] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Garage Door Service Estimator',
      subtitle: 'Repair or replace — get a clear, same-day price for your garage door.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Most repairs completed in one visit. Lifetime warranty on springs and openers.',
      cta_label: 'Book a Technician',
    };
    const base = {
      name: 'Garage Door — Repairs & Same-Day', description: 'Repair-first garage door quote — springs, openers, cables and panels — with same-day and after-hours tiers.',
      category: 'HVAC & Mechanical', trades: ['garage_door'],
      trustBadges: BADGES.generic,
      theme: 'midnight', defaultIcon: 'Warehouse', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'garage_door_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'garage_door_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 17. Locksmith (Specialty Services) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'service', name: 'Service Type', label: 'What do you need?', type: 'select',
        options: [opt('Residential lockout', 95), opt('Car lockout', 145), opt('Re-key locks', 165), opt('New lock install', 195), opt('Smart lock install', 295), opt('Safe opening', 485)] },
      { id: 'locks', name: 'Number of Locks', label: 'How many locks?', type: 'number',
        min: 1, max: 12, step: 1, default_value: 1 },
      { id: 'urgency', name: 'Urgency', label: 'Urgency', type: 'radio',
        options: [opt('Scheduled appointment', 0), opt('Within the hour', 85), opt('After-hours emergency', 165)] },
      { id: 'travel', name: 'Travel', label: 'Travel distance', type: 'slider',
        min: 0, max: 50, step: 5, default_value: 10, unit: 'miles' },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('High-security keys', 65), opt('Master key system', 145), opt('Security assessment', 95), opt('Spare key set', 35)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Service Cost', '[Service Type] * [Number of Locks]'),
      calc('Trip Charge', '[Travel] * 2 + [Urgency]'),
      calc('Estimated Total', '[Service Cost] + [Trip Charge] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Locksmith Service Quote',
      subtitle: 'Locked out, locked in, or just upgrading — get a price in under a minute.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'Licensed, bonded, insured locksmiths. 24/7 mobile response across the metro area.',
      cta_label: 'Request a Locksmith',
    };
    const base = {
      name: 'Locksmith — Locks & Security', description: 'Full locksmith quote — re-keying, lock installs, smart locks and master-key systems, with travel fee.',
      category: 'Emergency', trades: ['locksmith'],
      trustBadges: BADGES.generic,
      theme: 'midnight', defaultIcon: 'Lock', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'locksmith_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'locksmith_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 18. Chimney Sweep (Cleaning) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'service', name: 'Service Type', label: 'Service type', type: 'select',
        options: [opt('Standard chimney sweep', 195), opt('Sweep + Level 2 inspection', 345), opt('Cap / crown repair', 485), opt('Liner replacement', 1850), opt('Creosote removal (heavy)', 425)] },
      { id: 'flues', name: 'Number of Flues', label: 'Number of flues', type: 'number',
        min: 1, max: 6, step: 1, default_value: 1 },
      { id: 'access', name: 'Access', label: 'Roof access', type: 'radio',
        options: [opt('Easy (1 story)', 0), opt('Moderate (2 story)', 65), opt('Difficult / steep pitch', 145)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Chimney cap install', 195), opt('Animal / nest removal', 145), opt('Smoke / camera inspection', 165), opt('Waterproofing seal', 285)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Service Cost', '[Service Type] * [Number of Flues]'),
      calc('Estimated Total', '[Service Cost] + [Access] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Chimney Sweep & Inspection Quote',
      subtitle: 'A safe, clean chimney before fire season — get an instant price.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'CSIA-certified sweeps, no-mess cleanup, written inspection report on every visit.',
      cta_label: 'Schedule Inspection',
    };
    const base = {
      name: 'Chimney Sweep', description: 'Chimney sweep and inspection quote with cap and liner options.',
      category: 'Cleaning', trades: ['chimney_sweep'],
      trustBadges: BADGES.chimneySweep,
      theme: 'coral', defaultIcon: 'Flame', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'chimney_sweep_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'chimney_sweep_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 19. Water Damage Restoration (Restoration) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'area', name: 'Affected Area', label: 'Affected area', type: 'slider',
        min: 50, max: 3000, step: 25, default_value: 350, unit: 'sq ft' },
      { id: 'water_class', name: 'Water Category', label: 'Water category', type: 'radio',
        options: [opt('Clean water (Cat 1)', 4.5), opt('Gray water (Cat 2)', 7.5), opt('Black water (Cat 3)', 12)] },
      { id: 'damage_level', name: 'Damage Level', label: 'Damage level', type: 'select',
        options: [opt('Class 1 — minor surface', 0), opt('Class 2 — carpet & walls', 485), opt('Class 3 — saturated structure', 1450), opt('Class 4 — specialty materials', 2850)] },
      { id: 'response', name: 'Response Time', label: 'Response time', type: 'radio',
        options: [opt('Within 24 hours', 0), opt('Same-day rapid response', 285), opt('Within 2 hours emergency', 685)] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Antimicrobial treatment', 425), opt('Content pack-out & storage', 850), opt('Insurance claim assistance', 0), opt('Air-quality testing', 295)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Extraction & Drying', '[Affected Area] * [Water Category]'),
      calc('Estimated Total', '[Extraction & Drying] + [Damage Level] + [Response Time] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Water Damage Restoration Estimator',
      subtitle: 'Burst pipe, flood, or leak? Get an immediate restoration quote.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'IICRC-certified techs on call 24/7. We work directly with your insurance carrier.',
      cta_label: 'Get Emergency Help',
    };
    const base = {
      name: 'Water Damage — Insurance-Grade Scope', description: 'Insurance-grade restoration scope by IICRC water category (1–3) and damage class (1–4), with rapid-response tiers.',
      category: 'Emergency', trades: ['water_damage', 'water_damage_restoration'],
      trustBadges: BADGES.generic,
      theme: 'coral', defaultIcon: 'Waves', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'water_damage_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'water_damage_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Trade 20. Mold Remediation (Restoration) ── */
  ...(() => {
    const fields: TemplateField[] = [
      { id: 'area', name: 'Affected Area', label: 'Affected area', type: 'slider',
        min: 10, max: 1000, step: 10, default_value: 80, unit: 'sq ft' },
      { id: 'severity', name: 'Severity', label: 'Mold severity', type: 'radio',
        options: [opt('Light surface mold', 8), opt('Moderate growth', 18), opt('Heavy / structural', 32), opt('Toxic black mold', 48)] },
      { id: 'location', name: 'Location', label: 'Where is the mold?', type: 'select',
        options: [opt('Bathroom / single room', 0), opt('Basement / crawl space', 285), opt('HVAC system', 685), opt('Multiple rooms', 485), opt('Attic', 325)] },
      { id: 'testing', name: 'Pre/Post Testing', label: 'Independent lab testing', type: 'toggle', on_value: 385 },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        options: [opt('Containment barriers', 285), opt('HEPA air scrubbing', 425), opt('Drywall / material replacement', 685), opt('Encapsulation coating', 545)] },
    ];
    const calculations: TemplateCalculation[] = [
      calc('Remediation Subtotal', '[Affected Area] * [Severity]'),
      calc('Estimated Total', '[Remediation Subtotal] + [Location] + [Pre/Post Testing] + [Extras]'),
    ];
    const header: TemplateHeader = {
      title: 'Mold Remediation Quote',
      subtitle: 'Safe, certified mold removal — get a detailed estimate without the guesswork.', align: 'left',
    };
    const results: TemplateResults = {
      footnote: 'IICRC-certified remediation, EPA-approved products, written clearance on every job.',
      cta_label: 'Book an Inspection',
    };
    const base = {
      name: 'Mold Removal — Area & Severity', description: 'Mold removal priced by affected area and severity — bathroom to HVAC and attic — with independent lab testing.',
      category: 'Emergency', trades: ['mold_remediation'],
      trustBadges: BADGES.moldRemediation,
      theme: 'magenta', defaultIcon: 'AlertTriangle', fields, calculations, result_calc: 'Estimated Total', header, results,
    };
    return [
      { id: 'mold_remediation_single_col', layout: 'single-column' as TemplateLayout, ...base },
      { id: 'mold_remediation_two_col', layout: 'two-column' as TemplateLayout, ...base },
    ];
  })(),

  /* ── Wave Y Batch 1 — Cleaning category expansion ──
     Four functional quote calculators covering the cleaning trades
     already present in client/src/data/trades.ts. Each uses generic
     industry inputs (square footage, level of soiling, add-ons) — no
     copy or visual identity borrowed from any external source. */

  /* ── 15. Deep home cleaning ── */
  {
    id: 'deep_home_cleaning', name: 'Deep Home Cleaning',
    description: 'Square-footage + room-count deep clean estimate with condition tier and add-ons.',
    category: 'Cleaning', trades: ['deep_cleaning', 'house_cleaning'],
    trustBadges: BADGES.deepCleaning,
    layout: 'two-column', theme: 'light', defaultIcon: 'Sparkles',
    requireAddress: true,
    // FLAGSHIP showcase style — fresh teal/mint palette, deep-teal result
    // panel, mint CTA. Per-room pricing is fairly exact → tight ±6% band.
    // Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#0d9488',
      background: '#f3faf8',
      surface: '#ffffff',
      border: '#d8ece8',
      text: '#0f172a',
      resultsBg: '#0f3f3a',
      ctaColor: '#14b8a6',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        range_mode: { enabled: true, band_pct: 6 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      // Appointment-based service — booking a clean date is the conversion.
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Book Your Top-to-Bottom Deep Clean', subtitle: 'Bonded & insured · Eco-friendly products · 24-hour re-clean guarantee', align: 'left' },
    steps: [
      { id: 'step_home', label: 'Your home', help: 'Size and room count set the crew time we schedule.', fields: ['sqft', 'bedrooms', 'bathrooms'] },
      { id: 'step_condition', label: 'Condition', help: 'How much build-up we are starting from.', fields: ['condition', 'extra_crew'] },
      { id: 'step_extras', label: 'Add-ons', help: 'Optional inside-the-appliance and detail tasks.', fields: ['extras'] },
    ],
    fields: [
      { id: 'sqft', name: 'Home Size', label: 'Home size (sqft)', type: 'slider',
        min: 400, max: 6000, step: 50, default_value: 1800, unit: 'sqft',
        help: 'Approximate finished living area — a quick estimate is fine.' },
      { id: 'bedrooms', name: 'Bedrooms', label: 'How many bedrooms?', type: 'number',
        min: 0, max: 10, step: 1, default_value: 3,
        help: 'More bedrooms means more surfaces, floors and baseboards to detail.' },
      { id: 'bathrooms', name: 'Bathrooms', label: 'How many bathrooms?', type: 'number',
        min: 0, max: 8, step: 1, default_value: 2,
        help: 'Bathrooms are the most labor-intensive room in a deep clean.' },
      // Image-card radio on the highest-uncertainty question (current condition).
      { id: 'condition', name: 'Condition', label: 'What condition is the home in?', type: 'radio',
        help: 'Be honest — it just sets crew time, and there is no judgment.',
        options: [
          { ...optImg('Lightly soiled', 0, 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=300&h=300&fit=crop'),
            description: 'Generally tidy, kept up with regular cleaning.' },
          { ...optImg('Average', 60, 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=300&h=300&fit=crop'),
            description: 'A few months since the last thorough clean.' },
          { ...optImg('Heavily soiled', 180, 'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?w=300&h=300&fit=crop'),
            description: 'Move-in/out, post-renovation, or long-deferred — needs extra scrubbing.' },
        ] },
      // show_if — an extra crew member only makes sense on a heavily-soiled job.
      { id: 'extra_crew', name: 'Extra Crew Member', label: 'Add an extra cleaner to finish in one visit', type: 'toggle',
        help: 'A heavy job can run long — a second cleaner gets it done same-day.',
        on_value: 120,
        show_if: { field: 'condition', op: 'eq', value: 'heavily_soiled' } },
      { id: 'extras', name: 'Add-ons', label: 'Add-on services', type: 'multi_select',
        help: 'Inside-the-appliance and detail tasks not part of a standard deep clean.',
        options: [
          { ...opt('Inside fridge', 35), description: 'Empty, wipe down and sanitize all shelves and drawers.' },
          opt('Inside oven', 40),
          opt('Inside cabinets', 55),
          opt('Interior windows', 70),
        ] },
    ],
    calculations: [
      { ...calc('Home Size Base', '[Home Size] * 0.18'), caption: 'Crew time scaled to your home size.' },
      { ...calc('Bedrooms & Bathrooms', '[Bedrooms] * 25 + [Bathrooms] * 30'), caption: 'Per-room detail labor.' },
      { ...calc('Condition Surcharge', '[Condition] + [Extra Crew Member]'), caption: 'Extra time for build-up, plus an added cleaner where chosen.' },
      { ...calc('Add-ons', '[Add-ons]'), caption: 'Optional inside-the-appliance and detail tasks.' },
      { ...calc('Estimated Quote', '[Home Size Base] + [Bedrooms & Bathrooms] + [Condition Surcharge] + [Add-ons]'),
        resultMode: 'primary', caption: 'Your deep-clean price — confirmed after a 5-minute walk-through.' },
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Deep Clean Quote',
      show_breakdown: true,
      cta_label: 'Book My Deep Clean',
      cta_heading: 'Come home to a spotless house',
      cta_sub: 'Pick a date now — bonded, background-checked cleaners with a 24-hour re-clean guarantee.',
      submit_success: 'Booked! Your cleaning coordinator will confirm the date and crew arrival window shortly.',
      footnote: 'Final price confirmed after a 5-minute walk-through. 24-hour re-clean guarantee — find a spot we missed, we come back free.',
    },
  },

  /* ── 16. Move-in / move-out cleaning ── */
  {
    id: 'move_out_cleaning', name: 'Move-Out Cleaning',
    description: 'Lease-handover clean priced by home size + urgency.',
    category: 'Cleaning', trades: ['move_in_out_cleaning', 'deep_cleaning'],
    trustBadges: BADGES.moveOut,
    layout: 'single-column', theme: 'light', defaultIcon: 'PackageOpen',
    header: { title: 'Get Your Full Deposit Back — Instant Move-Out Quote', subtitle: 'Landlord-checklist clean · Bonded crews · Same-day availability', align: 'left' },
    fields: [
      { id: 'sqft', name: 'Home Size', label: 'Home size (sqft)', type: 'slider',
        min: 300, max: 5000, step: 50, default_value: 1400, unit: 'sqft' },
      { id: 'condition', name: 'Move-Out Condition', label: 'How is the home being left?', type: 'select',
        options: [opt('Fairly clean', 0), opt('Average', 80), opt('Rough', 220)] },
      { id: 'urgency', name: 'Urgency', label: 'When do you need it done?', type: 'radio',
        options: [opt('Within a week', 0), opt('Within 48 hours', 60), opt('Same-day rush', 150)] },
      { id: 'extras', name: 'Extras', label: 'Add-on services', type: 'multi_select',
        options: [opt('Inside appliances', 60), opt('Carpet shampoo', 120), opt('Wall touch-up wash', 50), opt('Garage', 80)] },
    ],
    calculations: [
      calc('Home Size Base', '[Home Size] * 0.22'),
      calc('Condition & Urgency', '[Move-Out Condition] + [Urgency]'),
      calc('Add-on Services', '[Extras]'),
      calc('Estimated Quote', '[Home Size Base] + [Condition & Urgency] + [Add-on Services]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Move-Out Cleaning Quote',
      show_breakdown: true,
      cta_label: 'Book My Move-Out Clean',
      footnote: 'Built around your landlord\'s standard checklist. If your inspection fails, we re-clean free within 48 hours.',
    },
  },

  /* ── 17. Office / commercial cleaning ── */
  {
    id: 'office_cleaning', name: 'Office Cleaning',
    description: 'Recurring commercial cleaning by square footage + visit cadence.',
    category: 'Cleaning', trades: ['office_cleaning', 'commercial_cleaning'],
    trustBadges: BADGES.officeCleaning,
    layout: 'two-column', theme: 'midnight', defaultIcon: 'Building2',
    header: { title: 'Get a Per-Visit Office Cleaning Quote', subtitle: 'Bonded janitorial crews · OSHA-compliant · Flexible scheduling around your business hours', align: 'left' },
    fields: [
      { id: 'sqft', name: 'Office Size', label: 'Office size (sqft)', type: 'slider',
        min: 500, max: 25000, step: 100, default_value: 4000, unit: 'sqft' },
      { id: 'frequency', name: 'Frequency', label: 'How often do you want service?', type: 'select',
        options: [opt('Daily (5x/wk)', 1.0), opt('Three times a week', 0.85), opt('Weekly', 0.65), opt('Bi-weekly', 0.55)] },
      { id: 'time', name: 'Time of Service', label: 'When should our team come?', type: 'radio',
        options: [opt('Business hours', 0), opt('After hours', 35), opt('Weekends only', 60)] },
      { id: 'extras', name: 'Extras', label: 'Included services', type: 'multi_select',
        options: [opt('Restroom sanitation', 25), opt('Trash removal', 15), opt('Floor buffing', 65), opt('Window interior', 45)] },
    ],
    calculations: [
      calc('Office Cleaning Base', '[Office Size] * 0.06 * [Frequency]'),
      calc('Time-of-service Surcharge', '[Time of Service]'),
      calc('Included Services', '[Extras]'),
      calc('Per-Visit Cost', '[Office Cleaning Base] + [Time-of-service Surcharge] + [Included Services]'),
    ],
    result_calc: 'Per-Visit Cost',
    results: {
      heading: 'Your Per-Visit Quote',
      show_breakdown: true,
      cta_label: 'Schedule a Walk-through',
      footnote: 'Includes all supplies, bonded staff, and full liability coverage. 6- and 12-month contracts unlock 8–15% savings.',
    },
  },

  /* ── 18. Window cleaning ── */
  {
    id: 'window_cleaning_quote', name: 'Window Cleaning',
    description: 'Per-window pricing with story-height and access modifiers.',
    category: 'Cleaning', trades: ['window_cleaning', 'pressure_washing'],
    trustBadges: BADGES.windowCleaning,
    layout: 'single-column', theme: 'forest', defaultIcon: 'RectangleHorizontal',
    header: { title: 'Get a Streak-Free Window Cleaning Quote', subtitle: 'Fully insured · Pure-water poles · 100% streak-free guarantee', align: 'left' },
    fields: [
      { id: 'windows', name: 'Windows', label: 'Number of windows', type: 'slider',
        min: 1, max: 60, step: 1, default_value: 18, unit: 'windows' },
      { id: 'stories', name: 'Stories', label: 'Building height', type: 'radio',
        options: [opt('Single-story', 0), opt('Two-story', 4), opt('Three+ story', 9)] },
      { id: 'sides', name: 'Sides', label: 'Which sides should we clean?', type: 'select',
        options: [opt('Exterior only', 1.0), opt('Interior + exterior', 1.7)] },
      { id: 'screens', name: 'Screens', label: 'Include window screens', type: 'toggle', on_value: 45 },
      { id: 'tracks', name: 'Tracks', label: 'Detail-clean the tracks & sills', type: 'toggle', on_value: 35 },
    ],
    calculations: [
      calc('Window Cleaning', '[Windows] * (8 + [Stories]) * [Sides]'),
      calc('Screens & Tracks', '[Screens] + [Tracks]'),
      calc('Estimated Quote', '[Window Cleaning] + [Screens & Tracks]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Window Cleaning Quote',
      show_breakdown: true,
      cta_label: 'Book My Window Clean',
      footnote: 'Streak-free guarantee — find a smudge in the first 7 days, we come back free. Fully insured for residential & commercial.',
    },
  },

  /* ── Wave Y Batch 2 — Renovation category ── */

  /* ── 19. Kitchen renovation ── */
  {
    id: 'kitchen_renovation', name: 'Kitchen Renovation',
    description: 'Full-kitchen remodel estimate by size, cabinet grade, countertop material and finishes.',
    // BATCH 0 — registry near-dupe id `kitchen_remodeling` added.
    category: 'Construction', trades: ['kitchen_remodel', 'kitchen_remodeling', 'general_renovation', 'general_contractor'],
    trustBadges: BADGES.renovation,
    layout: 'two-column', theme: 'light', defaultIcon: 'ChefHat',
    requireAddress: true,
    // FLAGSHIP showcase style — warm walnut/clay palette, deep-espresso result
    // panel, brass CTA. High-variance remodel → range_mode ±12%. Never falls
    // back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#b45309',
      background: '#faf8f5',
      surface: '#ffffff',
      border: '#ece4d9',
      text: '#1c1917',
      resultsBg: '#3b2f25',
      ctaColor: '#d97706',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Cabinet/counter selection and behind-the-wall surprises drive a wide
        // band on a full kitchen — quote a range, confirm on the design visit.
        range_mode: { enabled: true, band_pct: 12 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      // Design-led sale — a booked consultation with a deposit converts far
      // better than an open-ended "we'll call you".
      deposit: {
        enabled: true,
        amount: 150,
        label: '$150 design deposit — credited to your project',
        iconName: 'Calendar',
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Design Your Dream Kitchen — Free Estimate', subtitle: 'NKBA-certified designers · Licensed contractors · 3D rendering with every consultation', align: 'left' },
    steps: [
      { id: 'step_layout', label: 'Layout & cabinets', help: 'Kitchen footprint and the cabinet grade you want.', fields: ['kitchen_size', 'cabinets'] },
      { id: 'step_surfaces', label: 'Countertops & appliances', help: 'The two finishes guests notice first — and the biggest swing in price.', fields: ['counters', 'appliances'] },
      { id: 'step_systems', label: 'Plumbing & extras', help: 'Optional layout changes and lighting that need a trade behind the wall.', fields: ['island', 'island_sink', 'plumbing_electric'] },
    ],
    fields: [
      { id: 'kitchen_size', name: 'Kitchen Size', label: 'Kitchen size (sqft)', type: 'slider',
        min: 80, max: 600, step: 10, default_value: 200, unit: 'sqft',
        help: 'Floor area of the kitchen — an average US kitchen is 150–250 sqft.' },
      { id: 'cabinets', name: 'Cabinets', label: 'Cabinet grade', type: 'select',
        help: 'Cabinets are usually the single largest line on a kitchen remodel.',
        options: [
          { ...opt('Stock', 90), description: 'Pre-built standard sizes — fastest and lowest cost.' },
          opt('Semi-custom', 160),
          opt('Custom built-in', 280),
        ] },
      // Image-card radio on the highest-uncertainty question (countertop material).
      { id: 'counters', name: 'Countertops', label: 'Which countertop material?', type: 'radio',
        help: 'Pick the look you want — we price the slab and fabrication to match.',
        options: [
          { ...optImg('Quartz', 75, 'https://images.unsplash.com/photo-1556909211-36987daf7b4d?w=300&h=300&fit=crop'),
            description: 'Engineered, non-porous, near-zero maintenance — the most-chosen surface.' },
          { ...optImg('Granite', 85, 'https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=300&h=300&fit=crop'),
            description: 'Natural stone, every slab unique — needs periodic sealing.' },
          { ...optImg('Laminate', 30, 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=300&h=300&fit=crop'),
            description: 'Budget-friendly with hundreds of patterns.' },
          { ...optImg('Marble', 130, 'https://images.unsplash.com/photo-1597047084897-51e81819a499?w=300&h=300&fit=crop'),
            description: 'The luxury statement — soft stone that patinas over time.' },
        ] },
      { id: 'appliances', name: 'Appliances', label: 'Appliance package', type: 'radio',
        help: 'Keep what works or fold a new suite into the project.',
        options: [
          opt('Keep existing', 0),
          { ...opt('Mid-range refresh', 4500), description: 'New matching stainless suite at the popular tier.' },
          opt('Pro-grade upgrade', 12000),
        ] },
      { id: 'island', name: 'Add Island', label: 'Add a kitchen island?', type: 'toggle',
        help: 'A new island usually needs its own circuit, and a sink island needs plumbing run to it.',
        on_value: 2400 },
      // show_if — a prep sink + plumbing run only applies once an island is added.
      { id: 'island_sink', name: 'Island Sink Plumbing', label: 'Add a prep sink in the island', type: 'toggle',
        help: 'Runs supply and drain lines under the floor to the new island.',
        on_value: 1300,
        show_if: { field: 'island', op: 'eq', value: 1 } },
      { id: 'plumbing_electric', name: 'Plumbing/Electric', label: 'Plumbing & electrical add-ons', type: 'multi_select',
        help: 'Anything that moves a pipe or adds a circuit — cheapest while walls are open.',
        options: [
          { ...opt('Move sink', 850), description: 'Re-route supply and drain to a new sink location.' },
          opt('Add island circuit', 700),
          opt('Under-cabinet lighting', 450),
          opt('New backsplash', 600),
        ] },
    ],
    calculations: [
      { ...calc('Cabinets & Countertops', '[Kitchen Size] * ([Cabinets] + [Countertops])'), caption: 'Cabinetry and counter material/fabrication scaled to your kitchen size.' },
      { ...calc('Appliance Package', '[Appliances]'), caption: 'New appliance suite where selected.' },
      { ...calc('Plumbing & Electrical', '[Add Island] + [Island Sink Plumbing] + [Plumbing/Electric]'), caption: 'Island, fixture moves, circuits and lighting.' },
      { ...calc('Estimated Project Cost', '[Cabinets & Countertops] + [Appliance Package] + [Plumbing & Electrical]'),
        resultMode: 'primary', caption: 'Full-project estimate — confirmed with 3D design at your free consultation.' },
    ],
    result_calc: 'Estimated Project Cost',
    results: {
      heading: 'Your Kitchen Estimate',
      show_breakdown: true,
      cta_label: 'Book My Design Consultation',
      cta_heading: 'See your kitchen in 3D before you commit',
      cta_sub: 'Reserve a design visit — we measure, render your layout, and lock this estimate into a fixed quote.',
      submit_success: 'Consultation booked! Your designer will reach out within one business day to schedule your in-home visit and 3D rendering.',
      footnote: 'Includes 3D design, cabinets, counters, fixtures, and labor. Permits & structural work confirmed during free on-site consultation.',
    },
  },

  /* ── 20. Bathroom renovation ── */
  {
    id: 'bathroom_renovation', name: 'Bathroom Renovation',
    description: 'Bathroom remodel pricing by size, finish tier, shower/tub configuration and premium add-ons.',
    // BATCH 0 — registry near-dupe id `bathroom_remodeling` added.
    category: 'Construction', trades: ['bathroom_remodel', 'bathroom_remodeling', 'general_renovation'],
    trustBadges: BADGES.renovation,
    layout: 'two-column', theme: 'light', defaultIcon: 'Bath',
    requireAddress: true,
    // FLAGSHIP showcase style — spa teal/stone palette, deep-slate result
    // panel, teal CTA. Behind-the-wall variance → range_mode ±10%. Never
    // falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#0e7490',
      background: '#f5f9fa',
      surface: '#ffffff',
      border: '#dde7ea',
      text: '#0f172a',
      resultsBg: '#1e293b',
      ctaColor: '#0891b2',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'plex',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Waterproofing and rot found behind old tile move the number — quote a band.
        range_mode: { enabled: true, band_pct: 10 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      deposit: {
        enabled: true,
        amount: 150,
        label: '$150 design deposit — credited to your project',
        iconName: 'Calendar',
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Get Your Bathroom Renovation Quote', subtitle: 'Licensed plumbers & tile pros · 5-year leak guarantee · Most baths done in 7–10 days', align: 'left' },
    steps: [
      { id: 'step_scope', label: 'Size & finish', help: 'How big the bathroom is and the finish level you want.', fields: ['size', 'tier'] },
      { id: 'step_shower', label: 'Shower & tub', help: 'The centerpiece of the room — and the biggest plumbing decision.', fields: ['shower'] },
      { id: 'step_extras', label: 'Premium add-ons', help: 'Comfort and luxury upgrades, including a custom tile design.', fields: ['extras', 'custom_tile'] },
    ],
    fields: [
      { id: 'size', name: 'Bathroom Size', label: 'Bathroom size', type: 'select',
        help: 'Bigger footprints mean more tile, more fixtures and more labor.',
        options: [
          { ...opt('Half bath', 1.0), description: 'Toilet + vanity only — no shower or tub.' },
          opt('Full bath — 60 to 80 sqft', 2.2),
          opt('Primary suite — 100+ sqft', 3.5),
        ] },
      { id: 'tier', name: 'Finish Tier', label: 'Finish tier', type: 'radio',
        help: 'Sets the grade of tile, fixtures and vanity across the whole room.',
        options: [
          { ...opt('Standard', 3500), description: 'Quality builder-grade fixtures and ceramic tile.' },
          opt('Premium', 7200),
          opt('Luxury', 14500),
        ] },
      // Image-card radio on the highest-uncertainty question (shower/tub config).
      { id: 'shower', name: 'Shower / Tub', label: 'Which shower or tub configuration?', type: 'radio',
        help: 'The plumbing and waterproofing scope changes with each option.',
        options: [
          { ...optImg('Walk-in shower', 3400, 'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=300&h=300&fit=crop'),
            description: 'Curbless or low-curb tiled shower — the most-requested upgrade.' },
          { ...optImg('New tub-shower combo', 1800, 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=300&h=300&fit=crop'),
            description: 'One-piece value option — keeps both bath and shower.' },
          { ...optImg('Freestanding tub', 4200, 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=300&h=300&fit=crop'),
            description: 'Spa centerpiece — usually paired with a separate shower.' },
          { ...optImg('Keep existing', 0, 'https://images.unsplash.com/photo-1507652313519-d4e9174996dd?w=300&h=300&fit=crop'),
            description: 'Re-finish around the current shower or tub.' },
        ] },
      { id: 'extras', name: 'Extras', label: 'Premium add-ons', type: 'multi_select',
        help: 'Comfort upgrades that are far cheaper to add during the remodel.',
        options: [
          { ...opt('Heated floor', 1400), description: 'Electric radiant mat under the tile — warm underfoot all winter.' },
          opt('Double vanity', 1900),
          opt('Smart toilet', 1200),
          opt('Recessed lighting', 700),
        ] },
      // show_if — a custom tile design only applies on the Luxury finish tier.
      { id: 'custom_tile', name: 'Custom Tile Design', label: 'Add a custom tile design', type: 'toggle',
        help: 'Mosaic accent walls and patterned floors — designed and dry-laid before install.',
        on_value: 2200,
        show_if: { field: 'tier', op: 'eq', value: 'luxury' } },
    ],
    calculations: [
      { ...calc('Materials & Labor', '[Finish Tier] * [Bathroom Size]'), caption: 'Tile, fixtures, vanity and labor scaled to room size and finish.' },
      { ...calc('Shower / Tub', '[Shower / Tub]'), caption: 'Shower or tub configuration and its plumbing scope.' },
      { ...calc('Premium Add-ons', '[Extras] + [Custom Tile Design]'), caption: 'Comfort upgrades and optional custom tile work.' },
      { ...calc('Estimated Quote', '[Materials & Labor] + [Shower / Tub] + [Premium Add-ons]'),
        resultMode: 'primary', caption: 'Full-remodel estimate — confirmed at your free design visit.' },
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Bathroom Estimate',
      show_breakdown: true,
      cta_label: 'Schedule My Design Visit',
      cta_heading: 'Turn your bathroom into a daily retreat',
      cta_sub: 'Book a design visit — we measure, confirm waterproofing scope, and lock this estimate into a fixed quote.',
      submit_success: 'Design visit booked! Your project lead will call within one business day to schedule and finalize your selections.',
      footnote: 'Includes demolition, tile, fixtures, plumbing, and clean-up. 5-year leak warranty and 2-year workmanship guarantee.',
    },
  },

  /* ── 21. Basement finishing ── */
  {
    id: 'basement_finishing', name: 'Basement Finishing',
    description: 'Per-sqft basement finish estimate with ceiling + scope modifiers.',
    category: 'Construction', trades: ['basement_finishing', 'general_renovation'],
    trustBadges: BADGES.renovation,
    layout: 'single-column', theme: 'midnight', defaultIcon: 'Wrench',
    header: { title: 'Turn Your Basement Into Living Space — Free Quote', subtitle: 'Licensed general contractor · Permit handling included · Adds avg. 70% ROI at resale', align: 'left' },
    fields: [
      { id: 'sqft', name: 'Basement Size', label: 'Basement size (sqft)', type: 'slider',
        min: 200, max: 2500, step: 50, default_value: 900, unit: 'sqft' },
      { id: 'ceiling', name: 'Ceiling', label: 'Ceiling treatment', type: 'select',
        options: [opt('Exposed (painted)', 8), opt('Drop tile', 14), opt('Full drywall', 22)] },
      { id: 'rooms', name: 'Rooms', label: 'Rooms to add', type: 'multi_select',
        options: [opt('Bedroom', 4200), opt('Bathroom', 7800), opt('Wet bar / kitchenette', 5600), opt('Home theater', 3900)] },
      { id: 'egress', name: 'Egress Window', label: 'Add code-required egress window', type: 'toggle', on_value: 3200 },
    ],
    calculations: [
      calc('Framing & Ceiling', '[Basement Size] * [Ceiling]'),
      calc('Rooms', '[Rooms]'),
      calc('Egress Window', '[Egress Window]'),
      calc('Estimated Project Cost', '[Framing & Ceiling] + [Rooms] + [Egress Window]'),
    ],
    result_calc: 'Estimated Project Cost',
    results: {
      heading: 'Your Basement Finishing Estimate',
      show_breakdown: true,
      cta_label: 'Book My Free Walk-through',
      footnote: 'Includes framing, electrical, drywall, flooring, and finish work. Permits and inspections handled on your behalf.',
    },
  },

  /* ── 22. Interior painting (Pro — granular prep + coats + height) ──
     Wave Y added this as a more detailed variant of the original
     `interior_painting` template (line 349). Renamed from `interior_painting`
     → `interior_painting_pro` to resolve the duplicate-ID conflict caught by
     the deep per-template Playwright spec (PR #372). */
  {
    id: 'interior_painting_pro', name: 'Interior Painting (Pro)',
    description: 'Per-sqft interior paint quote with prep and ceiling-height modifiers.',
    // BATCH 0 — dropped the dangling `painting` id (not in the registry);
    // `interior_painting` is the real id for this trade.
    category: 'Construction', trades: ['interior_painting'],
    trustBadges: BADGES.painting,
    layout: 'two-column', theme: 'light', defaultIcon: 'Paintbrush2',
    header: { title: 'Get a Professional Painting Quote', subtitle: 'Sherwin-Williams certified · Lead-safe certified · 3-year workmanship warranty', align: 'left' },
    fields: [
      { id: 'sqft', name: 'Wall Area', label: 'Wall area to paint (sqft)', type: 'slider',
        min: 200, max: 5000, step: 50, default_value: 1600, unit: 'sqft' },
      { id: 'coats', name: 'Coats', label: 'Number of paint coats', type: 'radio',
        options: [opt('One coat', 1.0), opt('Two coats (recommended)', 1.6)] },
      { id: 'ceiling_height', name: 'Ceiling Height', label: 'Ceiling height', type: 'select',
        options: [opt('Standard (8 ft)', 1.0), opt('High (9-10 ft)', 1.15), opt('Vaulted (12+ ft)', 1.35)] },
      { id: 'prep', name: 'Prep', label: 'Prep work required', type: 'multi_select',
        options: [opt('Patch holes', 120), opt('Sand & prime', 180), opt('Remove wallpaper', 400)] },
      { id: 'trim', name: 'Trim', label: 'Include trim & doors', type: 'toggle', on_value: 350 },
    ],
    calculations: [
      calc('Paint & Labor', '[Wall Area] * 1.3 * [Coats] * [Ceiling Height]'),
      calc('Prep Work', '[Prep]'),
      calc('Trim & Doors', '[Trim]'),
      calc('Estimated Quote', '[Paint & Labor] + [Prep Work] + [Trim & Doors]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Painting Quote',
      show_breakdown: true,
      cta_label: 'Reserve My Slot',
      footnote: 'Includes premium paint, all prep, drop cloths, and one accent wall. 3-year workmanship warranty. Final scope confirmed on-site.',
    },
  },

  /* ── Wave Y Batch 3 — Mechanical / Systems category ── */

  /* ── 23. HVAC installation ── */
  {
    id: 'hvac_installation', name: 'HVAC Installation',
    description: 'New HVAC system estimate by home size, system type, efficiency tier and comfort add-ons.',
    category: 'HVAC & Mechanical', trades: ['hvac_services', 'hvac_installation'],
    trustBadges: BADGES.hvac,
    layout: 'two-column', theme: 'light', defaultIcon: 'Thermometer',
    requireAddress: true,
    // FLAGSHIP showcase style — cool sky/steel palette, deep-navy result
    // panel, sky-blue CTA. Equipment pricing is fairly exact → tighter ±8%
    // band. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#0284c7',
      background: '#f4f8fb',
      surface: '#ffffff',
      border: '#dbe6ee',
      text: '#0f172a',
      resultsBg: '#0c2740',
      ctaColor: '#0ea5e9',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'geist',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Ductwork condition adjusts at the in-home sizing visit — modest band.
        range_mode: { enabled: true, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      // Comfort emergencies and seasonal rushes — booking a sizing visit with
      // a small deposit holds the slot.
      deposit: {
        enabled: true,
        amount: 99,
        label: '$99 reserves your sizing visit — credited to install',
        iconName: 'Calendar',
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Get Your HVAC Installation Quote', subtitle: 'NATE-certified technicians · 10-year parts & labor warranty · Same-week install available', align: 'left' },
    steps: [
      { id: 'step_home', label: 'Your home', help: 'Home size sets the equipment capacity and the labor.', fields: ['home_size'] },
      { id: 'step_system', label: 'System & efficiency', help: 'What you are installing and how efficient it runs — the main cost drivers.', fields: ['system_type', 'zones', 'efficiency'] },
      { id: 'step_comfort', label: 'Comfort add-ons', help: 'Optional indoor-air and convenience upgrades.', fields: ['extras'] },
    ],
    fields: [
      { id: 'home_size', name: 'Home Size', label: 'Home size (sqft)', type: 'slider',
        min: 600, max: 6000, step: 100, default_value: 2000, unit: 'sqft',
        help: 'Conditioned living area — we confirm a Manual-J load at the sizing visit.' },
      { id: 'system_type', name: 'System Type', label: 'Which system do you need?', type: 'select',
        help: 'Heat pumps both heat and cool; a mini-split skips ductwork entirely.',
        options: [
          { ...opt('Central AC + furnace', 7800), description: 'The most-installed setup — gas heat plus central cooling.' },
          opt('Central AC only', 4500),
          opt('Furnace only', 4200),
          { ...opt('Heat pump — all-in-one', 9500), description: 'Heats and cools electrically — qualifies for federal tax credits.' },
          opt('Ductless mini-split', 5800),
        ] },
      // show_if — zone count only matters for a ductless mini-split system.
      { id: 'zones', name: 'Mini-Split Zones', label: 'How many mini-split zones?', type: 'select',
        help: 'Each indoor head is a zone you can set to its own temperature.',
        options: [
          opt('1 zone', 0),
          { ...opt('2 zones', 1600), description: 'Most-common dual-head setup for two rooms.' },
          opt('3 zones', 3000),
          opt('4 or more zones', 4600),
        ],
        show_if: { field: 'system_type', op: 'eq', value: 'ductless_mini_split' } },
      // Image-card radio on the highest-uncertainty question (efficiency tier).
      { id: 'efficiency', name: 'Efficiency Tier', label: 'Which efficiency tier?', type: 'radio',
        help: 'Higher SEER costs more upfront and pays back in lower power bills.',
        options: [
          { ...optImg('Standard — 14 SEER', 1.0, 'https://images.unsplash.com/photo-1558002038-1055907df827?w=300&h=300&fit=crop'),
            description: 'Meets code, lowest upfront cost.' },
          { ...optImg('High-efficiency — 18 SEER', 1.25, 'https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?w=300&h=300&fit=crop'),
            description: 'The popular middle tier — noticeable bill savings.' },
          { ...optImg('Top tier — 20+ SEER', 1.5, 'https://images.unsplash.com/photo-1558036117-15d82a90b9b1?w=300&h=300&fit=crop'),
            description: 'Variable-speed comfort and the largest rebates.' },
        ] },
      { id: 'extras', name: 'Add-ons', label: 'Comfort add-ons', type: 'multi_select',
        help: 'Indoor-air and convenience upgrades — cheapest to add at install.',
        options: [
          { ...opt('Smart thermostat', 380), description: 'Learns your schedule and trims runtime automatically.' },
          opt('Whole-home humidifier', 750),
          opt('UV air purifier', 620),
          opt('Duct cleaning', 450),
        ] },
    ],
    calculations: [
      { ...calc('Equipment', '[System Type] * [Efficiency Tier] + [Mini-Split Zones]'), caption: 'Unit, coil and the efficiency multiplier, plus mini-split zones.' },
      { ...calc('Installation Labor', '[Home Size] * 0.8'), caption: 'Removal, set, refrigerant line-set and start-up scaled to home size.' },
      { ...calc('Comfort Add-ons', '[Add-ons]'), caption: 'Optional indoor-air and convenience upgrades.' },
      { ...calc('Estimated Project Cost', '[Equipment] + [Installation Labor] + [Comfort Add-ons]'),
        resultMode: 'primary', caption: 'Installed estimate — confirmed after the free in-home sizing visit.' },
    ],
    result_calc: 'Estimated Project Cost',
    results: {
      heading: 'Your HVAC Install Estimate',
      show_breakdown: true,
      cta_label: 'Book My Free Sizing Visit',
      cta_heading: 'Get the right-sized system, not just a quote',
      cta_sub: 'Reserve a sizing visit — we run the load calculation, confirm ductwork, and lock your install date.',
      submit_success: 'Sizing visit booked! Your comfort advisor will call within one business day to schedule and confirm equipment.',
      footnote: 'Includes equipment, standard installation, refrigerant, and start-up. 10-year parts warranty + 2-year labor warranty.',
    },
  },

  /* ── 24. Plumbing service ── */
  {
    id: 'plumbing_service', name: 'Plumbing — Per-Fixture Estimate',
    description: 'Single-job plumbing estimate priced per fixture, with urgency surcharge and add-ons.',
    category: 'HVAC & Mechanical', trades: ['plumbing_services', 'emergency_plumbing'],
    trustBadges: BADGES.plumbing,
    layout: 'two-column', theme: 'light', defaultIcon: 'Wrench',
    requireAddress: true,
    // FLAGSHIP showcase style — clean aqua/slate palette, deep-slate result
    // panel, blue CTA. Flat-rate per-fixture pricing is exact → range_mode off.
    // Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#2563eb',
      background: '#f5f7fb',
      surface: '#ffffff',
      border: '#dde3ee',
      text: '#0f172a',
      resultsBg: '#16233b',
      ctaColor: '#3b82f6',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'plex',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Flat-rate per fixture — show an exact figure, not a band.
        range_mode: { enabled: false, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      // Same-day dispatch trade — booking a window converts the lead immediately.
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Get an Upfront Plumbing Quote in 60 Seconds', subtitle: 'Licensed master plumbers · No hidden fees · Same-day & 24/7 emergency response', align: 'left' },
    steps: [
      { id: 'step_job', label: 'The job', help: 'What needs fixing and how many fixtures are involved.', fields: ['service', 'units'] },
      { id: 'step_when', label: 'How soon', help: 'Urgency sets the dispatch window and any after-hours fee.', fields: ['urgency', 'afterhours'] },
      { id: 'step_extras', label: 'Add-ons', help: 'Optional diagnostics and haul-away.', fields: ['extras'] },
    ],
    fields: [
      // Image-card radio on the highest-uncertainty question (what work is needed).
      { id: 'service', name: 'Service', label: 'What plumbing work do you need?', type: 'radio',
        help: 'Pick the closest match — your plumber confirms scope on arrival.',
        options: [
          { ...optImg('Leak repair', 220, 'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=300&h=300&fit=crop'),
            description: 'Dripping or burst supply line, valve or joint.' },
          { ...optImg('Drain clearing', 180, 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=300&h=300&fit=crop'),
            description: 'Slow or blocked sink, tub or main line.' },
          { ...optImg('Faucet replacement', 280, 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=300&h=300&fit=crop'),
            description: 'Swap a worn faucet for a new fixture you supply or we provide.' },
          { ...optImg('Toilet replacement', 420, 'https://images.unsplash.com/photo-1584622781564-1d987f7333c1?w=300&h=300&fit=crop'),
            description: 'Remove the old unit, reset the flange and install a new toilet.' },
          { ...optImg('Water heater install', 1800, 'https://images.unsplash.com/photo-1585129777188-94600bc7b4b3?w=300&h=300&fit=crop'),
            description: 'Tank or tankless swap including haul-away of the old unit.' },
        ] },
      { id: 'units', name: 'Units', label: 'How many fixtures?', type: 'number',
        min: 1, max: 10, step: 1, default_value: 1,
        help: 'Count each separate fixture or location that needs the same work.' },
      { id: 'urgency', name: 'Urgency', label: 'How urgent is it?', type: 'radio',
        help: 'Sooner means we hold a tighter window for you.',
        options: [
          { ...opt('Within a week', 0), description: 'Scheduled at the next convenient opening.' },
          opt('Within 24 hours', 75),
          opt('Emergency — same-day', 220),
        ] },
      // show_if — after-hours dispatch fee only applies to a same-day emergency.
      { id: 'afterhours', name: 'After-Hours Dispatch', label: 'Need it outside business hours (nights/weekends)?', type: 'toggle',
        help: 'Evening, overnight and weekend emergency dispatch carries a call-out premium.',
        on_value: 120,
        show_if: { field: 'urgency', op: 'eq', value: 'emergency_same_day' } },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        help: 'Optional diagnostics and disposal — added only if you want them.',
        options: [
          { ...opt('Haul away old fixture', 60), description: 'We remove and dispose of the replaced fixture.' },
          opt('Pressure test', 90),
          opt('Camera inspection', 140),
        ] },
    ],
    calculations: [
      { ...calc('Labor & Materials', '[Service] * [Units]'), caption: 'Flat-rate per-fixture labor and standard materials.' },
      { ...calc('Urgency Surcharge', '[Urgency] + [After-Hours Dispatch]'), caption: 'Priority scheduling and any after-hours dispatch fee.' },
      { ...calc('Add-ons', '[Extras]'), caption: 'Optional diagnostics and haul-away.' },
      { ...calc('Estimated Cost', '[Labor & Materials] + [Urgency Surcharge] + [Add-ons]'),
        resultMode: 'primary', caption: 'Flat-rate total — locked in writing before any work begins.' },
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Plumbing Quote',
      show_breakdown: true,
      cta_label: 'Dispatch a Plumber',
      cta_heading: 'A small leak today is a big bill tomorrow',
      cta_sub: 'Book a window now — your licensed plumber arrives with the price locked, no surprise add-ons.',
      submit_success: 'Request received! Our dispatcher will call within minutes to confirm your arrival window.',
      footnote: 'Flat-rate pricing locked before work begins. Licensed, bonded, insured. 1-year warranty on parts and labor.',
    },
  },

  /* ── 25. Electrical work ── */
  {
    id: 'electrical_work', name: 'Electrical — Per-Job Estimate',
    description: 'Per-job electrical estimate by quantity and wiring-access difficulty.',
    category: 'HVAC & Mechanical', trades: ['electrical_services', 'emergency_electrical'],
    trustBadges: BADGES.electrical,
    layout: 'single-column', theme: 'midnight', defaultIcon: 'Zap',
    requireAddress: true,
    style: {
      widgetWidth: 'wide',
      accent: '#facc15',
      background: '#0f172a',
      surface: '#1e293b',
      border: '#334155',
      text: '#e2e8f0',
      resultsBg: '#020617',
      ctaColor: '#facc15',
      success: '#22c55e',
      error: '#f87171',
      fontFamily: 'inter',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        range_mode: { enabled: true, band_pct: 10 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Get a Licensed Electrician Quote in 60 Seconds', subtitle: 'Licensed master electricians · Permits handled · 100% code-compliant guaranteed', align: 'left' },
    steps: [
      { id: 'step_job', label: 'The job', help: 'What you need and how many sets the base labor.', fields: ['job_type', 'quantity'] },
      { id: 'step_access', label: 'Access & permits', help: 'How hard the wiring run is, plus permit handling.', fields: ['access', 'permit'] },
    ],
    fields: [
      // Job type is the highest-uncertainty driver → image-card radio.
      { id: 'job_type', name: 'Job Type', label: 'What electrical work do you need?', type: 'radio',
        help: 'Pick the closest match — it sets the per-job labor and materials.',
        options: [
          { ...optImg('Add outlet / switch', 175, 'https://images.unsplash.com/photo-1558002038-1055907df827?w=300&h=300&fit=crop'),
            description: 'A new receptacle or switch on an existing circuit.' },
          { ...optImg('New light fixture', 220, 'https://images.unsplash.com/photo-1543589077-47d81606c1bf?w=300&h=300&fit=crop'),
            description: 'Swap or add a ceiling or wall light fixture.' },
          { ...optImg('Ceiling fan install', 290, 'https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?w=300&h=300&fit=crop'),
            description: 'Mount and wire a fan, with a rated box if needed.' },
          { ...optImg('Panel upgrade (200A)', 2400, 'https://images.unsplash.com/photo-1558036117-15d82a90b9b1?w=300&h=300&fit=crop'),
            description: 'Replace the main panel with a modern 200A service.' },
          { ...optImg('Whole-home rewire', 8500, 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=300&h=300&fit=crop'),
            description: 'Full rewire — old or unsafe wiring replaced throughout.' },
        ] },
      { id: 'quantity', name: 'Quantity', label: 'How many?', type: 'number',
        help: 'Number of the same job — e.g. three outlets or two fixtures.',
        min: 1, max: 20, step: 1, default_value: 2 },
      { id: 'access', name: 'Access', label: 'Wiring access difficulty', type: 'radio',
        help: 'Open framing is quick; fishing wire through finished walls takes longer.',
        options: [
          { ...optImg('Easy (open wall / accessible)', 0, 'https://images.unsplash.com/photo-1558002038-1055907df827?w=300&h=300&fit=crop'),
            description: 'Unfinished basement, garage or open framing.' },
          { ...optImg('Moderate', 45, 'https://images.unsplash.com/photo-1558036117-15d82a90b9b1?w=300&h=300&fit=crop'),
            description: 'Some drywall removal or attic access required.' },
          { ...optImg('Difficult (finished wall, tight crawl)', 120, 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=300&h=300&fit=crop'),
            description: 'Fishing through finished walls or a tight crawlspace.' },
        ] },
      { id: 'permit', name: 'Permit', label: 'Pull permits & arrange inspection', type: 'toggle', on_value: 220,
        help: 'We file the permit and schedule the inspection on your behalf.' },
    ],
    calculations: [
      { ...calc('Labor & Materials', '[Job Type] * [Quantity]'), caption: 'Per-job flat-rate labor and standard materials.' },
      { ...calc('Access Difficulty', '[Access] * [Quantity]'), caption: 'Extra time for tougher wiring runs.' },
      { ...calc('Permit & Inspection', '[Permit]'), caption: 'Permit filing and inspection where selected.' },
      { ...calc('Estimated Cost', '[Labor & Materials] + [Access Difficulty] + [Permit & Inspection]'),
        resultMode: 'primary', caption: 'Flat-rate estimate — confirmed in writing before any work begins.' },
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Electrical Quote',
      show_breakdown: true,
      cta_label: 'Schedule Service',
      cta_heading: 'Don’t gamble with your home’s wiring',
      cta_sub: 'Every job is done by a licensed master electrician and inspected for code compliance — backed by a 1-year workmanship warranty. Book a visit in seconds.',
      submit_success: 'Requested! Our dispatcher will call to confirm your arrival window shortly.',
      footnote: 'All work performed by licensed electricians and inspected for code compliance. 1-year workmanship warranty on every job.',
    },
  },

  /* ── 26. EV charger installation ── */
  {
    id: 'ev_charger_install', name: 'EV Charger Installation',
    description: 'Level-2 EV charger install with electrical-scope modifiers.',
    category: 'HVAC & Mechanical', trades: ['ev_charger', 'electrical_services'],
    trustBadges: BADGES.evCharger,
    layout: 'two-column', theme: 'forest', defaultIcon: 'BatteryCharging',
    header: { title: 'Charge at Home — EV Install Quote in 60 Seconds', subtitle: 'Tesla & ChargePoint certified · Licensed electricians · Most installs done same-day', align: 'left' },
    fields: [
      { id: 'charger_level', name: 'Charger Level', label: 'Charger level', type: 'radio',
        options: [opt('Level 1 (120V)', 350), opt('Level 2 (240V, 32A)', 950), opt('Level 2 (240V, 50A)', 1250)] },
      { id: 'wire_distance', name: 'Wire Distance', label: 'Distance from electrical panel (ft)', type: 'slider',
        min: 5, max: 120, step: 5, default_value: 30, unit: 'ft' },
      { id: 'panel_upgrade', name: 'Panel Upgrade', label: 'Panel capacity available?', type: 'radio',
        options: [opt('No (panel has capacity)', 0), opt('Subpanel add', 1100), opt('Full panel upgrade', 2400)] },
      { id: 'extras', name: 'Extras', label: 'Optional add-ons', type: 'multi_select',
        options: [opt('Permit + inspection', 220), opt('Trenching (outdoor)', 380), opt('Smart load-management module', 280)] },
    ],
    calculations: [
      calc('Charger & Install', '[Charger Level] + [Wire Distance] * 8'),
      calc('Panel Upgrade', '[Panel Upgrade]'),
      calc('Permits & Add-ons', '[Extras]'),
      calc('Estimated Project Cost', '[Charger & Install] + [Panel Upgrade] + [Permits & Add-ons]'),
    ],
    result_calc: 'Estimated Project Cost',
    results: {
      heading: 'Your EV Charger Install Quote',
      show_breakdown: true,
      cta_label: 'Schedule My Install',
      footnote: 'Many utilities offer EV-charger rebates of $200–$1,000. We file the paperwork for you — credit applied after install.',
    },
  },

  /* ── Wave Y Batch 4 — Outdoor / Driveway category ── */

  /* ── 27. Lawn care subscription ── */
  {
    id: 'lawn_care_subscription', name: 'Lawn Care Subscription',
    description: 'Recurring lawn maintenance priced by visit cadence, lawn size and per-visit services.',
    category: 'Outdoor', trades: ['lawn_mowing', 'landscaping', 'garden_maintenance'],
    trustBadges: BADGES.lawnCare,
    layout: 'two-column', theme: 'light', defaultIcon: 'Trees',
    requireAddress: true,
    // FLAGSHIP showcase style — fresh grass-green palette, deep-moss result
    // panel, lime CTA. Per-visit pricing is exact → range_mode off. Never
    // falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#16a34a',
      background: '#f4faf5',
      surface: '#ffffff',
      border: '#dcece0',
      text: '#0f172a',
      resultsBg: '#14361f',
      ctaColor: '#65a30d',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        range_mode: { enabled: false, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      // Subscription start — booking the first visit locks the recurring plan.
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Get an Instant Lawn Care Quote', subtitle: 'Licensed & insured crews · Eco-friendly options · Cancel anytime with 30 days notice', align: 'left' },
    steps: [
      { id: 'step_plan', label: 'Visit plan', help: 'How often we come and how big the lawn is.', fields: ['frequency', 'lawn_size'] },
      { id: 'step_services', label: 'Per-visit services', help: 'What is included on each visit.', fields: ['services', 'organic'] },
      { id: 'step_season', label: 'Season length', help: 'How much of the year you want the service running.', fields: ['season'] },
    ],
    fields: [
      // Image-card radio on the highest-uncertainty question (visit cadence).
      { id: 'frequency', name: 'Frequency', label: 'How often do you want service?', type: 'radio',
        help: 'More frequent visits keep the lawn sharper and cost less per visit.',
        options: [
          { ...optImg('Weekly', 1.0, 'https://images.unsplash.com/photo-1592417817098-8fd3d9eb14a5?w=300&h=300&fit=crop'),
            description: 'Best results — a manicured lawn all season.' },
          { ...optImg('Bi-weekly', 0.65, 'https://images.unsplash.com/photo-1558904541-efa843a96f01?w=300&h=300&fit=crop'),
            description: 'The popular balance of cost and curb appeal.' },
          { ...optImg('Monthly', 0.45, 'https://images.unsplash.com/photo-1605117882932-f9e32b03fea9?w=300&h=300&fit=crop'),
            description: 'Light upkeep for slow-growing or low-maintenance yards.' },
        ] },
      { id: 'lawn_size', name: 'Lawn Size', label: 'Lawn size (sqft)', type: 'slider',
        min: 500, max: 30000, step: 100, default_value: 7000, unit: 'sqft',
        help: 'A rough number is fine — a typical quarter-acre lot is about 8,000 sqft.' },
      { id: 'services', name: 'Services', label: 'Included services per visit', type: 'multi_select',
        help: 'Build the visit — mow only, or a full-service treatment each time.',
        options: [
          { ...opt('Mow', 25), description: 'Cut to the ideal height for your grass type.' },
          opt('Edge and trim', 18),
          opt('Blow-off cleanup', 12),
          opt('Fertilizer', 35),
          opt('Weed control', 30),
        ] },
      // show_if — an organic upgrade only matters once a chemical treatment
      // (weed control) is in the plan.
      { id: 'organic', name: 'Organic Upgrade', label: 'Upgrade to pet- & kid-safe organic treatment', type: 'toggle',
        help: 'Swaps the standard weed control for an OMRI-listed organic program.',
        on_value: 20,
        show_if: { field: 'services', op: 'contains', value: 'weed_control' } },
      { id: 'season', name: 'Season Length', label: 'Service season length', type: 'radio',
        help: 'Pre-pay the season to lock your slot and save.',
        options: [
          { ...opt('Full season — 8 months', 1.0), description: 'Spring through fall — the complete program.' },
          opt('Spring and summer — 5 months', 0.7),
          opt('Maintenance only — 3 months', 0.45),
        ] },
    ],
    calculations: [
      { ...calc('Lawn Size Base', '[Lawn Size] * 0.008 * [Frequency]'), caption: 'Per-visit base scaled to lawn size and how often we come.' },
      { ...calc('Included Services', '[Services] + [Organic Upgrade]'), caption: 'The services you build into each visit.' },
      { ...calc('Per-Visit Cost', '[Lawn Size Base] + [Included Services]'),
        resultMode: 'primary', caption: 'Your price per visit — billed only for visits performed.' },
    ],
    result_calc: 'Per-Visit Cost',
    results: {
      heading: 'Your Per-Visit Lawn Quote',
      show_breakdown: true,
      cta_label: 'Start My Lawn Service',
      cta_heading: 'A lawn you are proud of, on autopilot',
      cta_sub: 'Start your plan — licensed crews, eco-friendly options, and cancel anytime with 30 days notice.',
      submit_success: 'Welcome aboard! Your crew lead will confirm your first visit and recurring schedule shortly.',
      footnote: 'Includes labor, equipment, and standard fertilizer when selected. Seasonal pre-pay saves 8%. Cancel anytime with 30 days notice.',
    },
  },

  /* ── 28. Concrete driveway replacement ── */
  {
    id: 'concrete_driveway_replacement', name: 'Concrete Driveway',
    description: 'New concrete driveway with finish + removal modifiers.',
    category: 'Construction', trades: ['concrete_driveway', 'concrete_patio', 'concrete_slab'],
    trustBadges: BADGES.driveway_concrete,
    layout: 'single-column', theme: 'midnight', defaultIcon: 'Construction',
    header: { title: 'Get Your New Concrete Driveway Quote', subtitle: 'ACI-certified concrete pros · 25-year structural warranty · Free on-site measurement', align: 'left' },
    fields: [
      { id: 'area', name: 'Driveway Area', label: 'Driveway size (sqft)', type: 'slider',
        min: 100, max: 2000, step: 25, default_value: 600, unit: 'sqft' },
      { id: 'finish', name: 'Finish', label: 'Concrete finish type', type: 'select',
        options: [opt('Standard broom', 7), opt('Exposed aggregate', 11), opt('Stamped pattern', 14), opt('Colored + stamped', 18)] },
      { id: 'thickness', name: 'Thickness', label: 'Concrete thickness', type: 'radio',
        options: [opt('4" (light residential)', 1.0), opt('5" (recommended)', 1.18), opt('6" (heavy vehicle)', 1.35)] },
      { id: 'extras', name: 'Extras', label: 'Prep & reinforcement', type: 'multi_select',
        options: [opt('Remove old surface', 1100), opt('Reinforce with rebar', 480), opt('Add drainage channel', 620)] },
    ],
    calculations: [
      calc('Pour & Finish', '[Driveway Area] * [Finish] * [Thickness]'),
      calc('Prep & Reinforcement', '[Extras]'),
      calc('Estimated Project Cost', '[Pour & Finish] + [Prep & Reinforcement]'),
    ],
    result_calc: 'Estimated Project Cost',
    results: {
      heading: 'Your Concrete Driveway Quote',
      show_breakdown: true,
      cta_label: 'Book My Free Measurement',
      footnote: 'Includes form work, pour, finish, and 28-day cure. 25-year structural warranty on every install.',
    },
  },

  /* ── 29. Tree service ── */
  {
    id: 'tree_service', name: 'Tree Service',
    description: 'Trimming or removal estimate per tree with height + access modifiers.',
    category: 'Outdoor', trades: ['tree_service', 'tree_trimming'],
    trustBadges: BADGES.treeService,
    layout: 'two-column', theme: 'forest', defaultIcon: 'TreeDeciduous',
    header: { title: 'Get a Certified Arborist Quote in 60 Seconds', subtitle: 'ISA-certified arborists · $2M liability insurance · 24/7 emergency storm response', align: 'left' },
    fields: [
      { id: 'service', name: 'Service', label: 'What service do you need?', type: 'radio',
        options: [opt('Trim / prune', 200), opt('Removal (no stump)', 600), opt('Removal + stump grind', 850)] },
      { id: 'trees', name: 'Trees', label: 'How many trees?', type: 'number',
        min: 1, max: 20, step: 1, default_value: 1 },
      { id: 'height', name: 'Height', label: 'Tallest tree height', type: 'select',
        options: [opt('Under 25 ft', 1.0), opt('25-50 ft', 1.4), opt('50-75 ft', 1.9), opt('75+ ft', 2.6)] },
      { id: 'access', name: 'Access', label: 'Site access difficulty', type: 'radio',
        options: [opt('Easy (truck access)', 0), opt('Moderate (gate / yard work)', 120), opt('Difficult (over house / power lines)', 350)] },
      { id: 'haul', name: 'Haul Away', label: 'Haul away debris', type: 'toggle', on_value: 180 },
    ],
    calculations: [
      calc('Tree Work', '[Service] * [Trees] * [Height]'),
      calc('Access Surcharge', '[Access]'),
      calc('Debris Haul-away', '[Haul Away]'),
      calc('Estimated Quote', '[Tree Work] + [Access Surcharge] + [Debris Haul-away]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Tree Service Quote',
      show_breakdown: true,
      cta_label: 'Schedule My Free Assessment',
      footnote: 'ISA-certified arborists, fully insured to $2M. Free on-site assessment for jobs over $1,500. 24/7 emergency response.',
    },
  },

  /* ── 30. Pressure washing ── */
  {
    id: 'pressure_washing_quote', name: 'Pressure Washing',
    description: 'Per-sqft exterior surface clean by surface type, with access and treatment add-ons.',
    category: 'Cleaning', trades: ['pressure_washing', 'window_cleaning'],
    trustBadges: BADGES.pressureWashing,
    layout: 'two-column', theme: 'light', defaultIcon: 'Droplets',
    requireAddress: true,
    // FLAGSHIP showcase style — bright water-blue palette, deep-ocean result
    // panel, cyan CTA. Per-sqft pricing is exact → range_mode off. Never
    // falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#0891b2',
      background: '#f3f9fb',
      surface: '#ffffff',
      border: '#d6e8ee',
      text: '#0f172a',
      resultsBg: '#0c3a52',
      ctaColor: '#06b6d4',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'geist',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        range_mode: { enabled: false, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Restore Your Curb Appeal — Free Wash Quote', subtitle: 'Soft-wash certified · Surface-safe pressure · Driveway, siding, deck, patio in one visit', align: 'left' },
    steps: [
      { id: 'step_surface', label: 'Surface & area', help: 'What we are cleaning and roughly how much of it.', fields: ['surface', 'area'] },
      { id: 'step_access', label: 'Access', help: 'Height and reach change the setup and safety gear.', fields: ['access', 'moss'] },
      { id: 'step_extras', label: 'Treatments', help: 'Optional protection and detail add-ons.', fields: ['extras'] },
    ],
    fields: [
      // Image-card radio on the highest-uncertainty question (surface type).
      { id: 'surface', name: 'Surface Type', label: 'Which surface are we cleaning?', type: 'radio',
        help: 'Each surface uses a different method — soft-wash for delicate ones, pressure for hard ones.',
        options: [
          { ...optImg('Concrete or driveway', 0.30, 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=300&fit=crop'),
            description: 'Driveways, patios and walkways — pressure-washed to bare concrete.' },
          { ...optImg('Vinyl siding', 0.35, 'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=300&h=300&fit=crop'),
            description: 'Whole-house soft-wash that lifts grime without forcing water behind panels.' },
          { ...optImg('Wood deck', 0.45, 'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=300&h=300&fit=crop'),
            description: 'Low-pressure clean that protects the grain — pairs well with sealing.' },
          { ...optImg('Brick or stone', 0.40, 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=300&h=300&fit=crop'),
            description: 'Masonry and pavers — tuned pressure that spares the mortar.' },
          { ...optImg('Roof — soft wash', 0.55, 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=300&h=300&fit=crop'),
            description: 'No-pressure roof treatment that kills algae streaks safely.' },
        ] },
      { id: 'area', name: 'Area', label: 'Total area to wash (sqft)', type: 'slider',
        min: 100, max: 5000, step: 50, default_value: 1200, unit: 'sqft',
        help: 'A rough estimate is fine — a two-car driveway is about 600 sqft.' },
      { id: 'access', name: 'Access', label: 'How easy is the site to reach?', type: 'radio',
        help: 'Height and tight spots add setup time and safety gear.',
        options: [
          { ...opt('Standard — ground level', 0), description: 'Open, walk-up access from the driveway or yard.' },
          opt('Second story', 75),
          opt('Hard to reach', 150),
        ] },
      // show_if — a moss/algae kill-treatment only applies on a roof soft-wash.
      { id: 'moss', name: 'Moss & Algae Treatment', label: 'Add a moss & algae kill-treatment', type: 'toggle',
        help: 'A biocide step that stops black streaks from growing back for years.',
        on_value: 140,
        show_if: { field: 'surface', op: 'eq', value: 'roof_soft_wash' } },
      { id: 'extras', name: 'Extras', label: 'Add-on treatments', type: 'multi_select',
        help: 'Protection and detail work added at the same visit.',
        options: [
          { ...opt('Mildew or mold treatment', 80), description: 'Spot-kills organic growth so it does not return quickly.' },
          opt('Sealing after wash', 220),
          opt('Stairs and railings', 95),
        ] },
    ],
    calculations: [
      { ...calc('Surface Cleaning', '[Area] * [Surface Type]'), caption: 'Per-sqft cleaning at the rate for your surface.' },
      { ...calc('Access Surcharge', '[Access] + [Moss & Algae Treatment]'), caption: 'Height/reach setup plus optional roof treatment.' },
      { ...calc('Add-on Treatments', '[Extras]'), caption: 'Optional protection and detail add-ons.' },
      { ...calc('Estimated Quote', '[Surface Cleaning] + [Access Surcharge] + [Add-on Treatments]'),
        resultMode: 'primary', caption: 'Your wash price — confirmed on a quick walk-around before we start.' },
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Pressure Washing Quote',
      show_breakdown: true,
      cta_label: 'Book My Wash',
      cta_heading: 'See the difference in a single visit',
      cta_sub: 'Pick a date — surface-safe methods, fully insured, with before-and-after photos every time.',
      submit_success: 'Booked! We will confirm your wash date and arrival window shortly.',
      footnote: 'Surface-safe soft-wash and pressure-wash methods. Fully insured. Before-and-after photos with every job.',
    },
  },

  /* ── Wave Y Batch 5 — Auto / Emergency category ── */

  /* ── 31. Mobile car detailing ── */
  {
    id: 'mobile_car_detail', name: 'Mobile Car Detailing',
    description: 'Per-vehicle detail with package tiers and add-on services.',
    category: 'Automotive', trades: ['mobile_car_detailing', 'auto_detailing'],
    trustBadges: BADGES.detailing,
    layout: 'two-column', theme: 'midnight', defaultIcon: 'Car',
    header: { title: 'Book a Mobile Detail — We Come to You', subtitle: 'IDA-certified detailers · Eco-safe products · Fully self-contained — no water hookup needed', align: 'left' },
    fields: [
      { id: 'vehicle', name: 'Vehicle Size', label: 'Vehicle size', type: 'radio',
        options: [opt('Sedan / coupe', 1.0), opt('SUV / mid-size', 1.25), opt('Truck / full-size SUV', 1.5), opt('Van / 3-row SUV', 1.75)] },
      { id: 'package', name: 'Package', label: 'Detail package', type: 'select',
        options: [opt('Exterior only', 65), opt('Interior only', 85), opt('Full detail (in + out)', 145), opt('Premium (clay bar + wax)', 220), opt('Showroom (ceramic top-up)', 350)] },
      { id: 'extras', name: 'Extras', label: 'Optional add-ons', type: 'multi_select',
        options: [opt('Engine bay clean', 45), opt('Headlight restoration', 60), opt('Pet hair removal', 35), opt('Odor elimination', 50), opt('Leather conditioning', 40)] },
      { id: 'condition', name: 'Condition', label: 'Current vehicle condition', type: 'radio',
        options: [opt('Light (regular cleaning)', 0), opt('Moderate (3-6 months neglect)', 30), opt('Heavy (over a year)', 75)] },
    ],
    calculations: [
      calc('Detail Package', '[Package] * [Vehicle Size]'),
      calc('Optional Add-ons', '[Extras]'),
      calc('Condition Surcharge', '[Condition]'),
      calc('Estimated Quote', '[Detail Package] + [Optional Add-ons] + [Condition Surcharge]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Mobile Detail Quote',
      show_breakdown: true,
      cta_label: 'Book My Detail',
      footnote: 'We bring water, power, and pro-grade products to your driveway. 24-hour satisfaction guarantee — we re-do anything you\'re not happy with.',
    },
  },

  /* ── 32. Locksmith service ── */
  {
    id: 'locksmith_service', name: 'Locksmith — Emergency Call-Out',
    description: 'Lockout-first locksmith pricing with within-the-hour and after-hours response tiers.',
    category: 'Emergency', trades: ['locksmith'],
    trustBadges: BADGES.locksmith,
    layout: 'single-column', theme: 'midnight', defaultIcon: 'KeyRound',
    header: { title: 'Get a Locksmith on the Way — Upfront Quote', subtitle: 'Licensed · Bonded · Insured · 24/7 mobile response across the metro area', align: 'left' },
    fields: [
      { id: 'service', name: 'Service', label: 'What do you need?', type: 'select',
        options: [opt('Home lockout', 95), opt('Car lockout', 110), opt('Rekey lock', 65), opt('New deadbolt install', 180), opt('Smart lock install', 280), opt('Key duplication', 25)] },
      { id: 'quantity', name: 'Quantity', label: 'How many locks?', type: 'number',
        min: 1, max: 10, step: 1, default_value: 1 },
      { id: 'urgency', name: 'Urgency', label: 'How urgent?', type: 'radio',
        options: [opt('Within a few days', 0), opt('Within 24 hours', 35), opt('Now (within 1 hour)', 95)] },
      { id: 'time', name: 'Time of Service', label: 'Time of service', type: 'radio',
        options: [opt('Business hours', 0), opt('After hours / weekend', 45), opt('Overnight / holiday', 95)] },
    ],
    calculations: [
      calc('Service & Materials', '[Service] * [Quantity]'),
      calc('Urgency & Time', '[Urgency] + [Time of Service]'),
      calc('Estimated Cost', '[Service & Materials] + [Urgency & Time]'),
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Locksmith Quote',
      show_breakdown: true,
      cta_label: 'Request a Locksmith',
      footnote: 'Price locked before the truck rolls — no surprises on arrival. Licensed, bonded, $1M insured.',
    },
  },

  /* ── 33. Water damage restoration ── */
  {
    id: 'water_damage_restoration', name: 'Water Damage Restoration',
    description: 'Emergency water-damage scoping by affected area and severity.',
    category: 'Emergency', trades: ['water_damage_restoration', 'water_damage'],
    trustBadges: BADGES.waterDamage,
    layout: 'two-column', theme: 'magenta', defaultIcon: 'Droplet',
    header: { title: 'Get Emergency Water Damage Help — Free Estimate', subtitle: 'IICRC-certified technicians · 24/7 emergency dispatch · Direct insurance billing', align: 'left' },
    fields: [
      { id: 'area', name: 'Affected Area', label: 'Affected area (sqft)', type: 'slider',
        min: 50, max: 3000, step: 25, default_value: 350, unit: 'sqft' },
      { id: 'severity', name: 'Severity', label: 'Water category', type: 'radio',
        options: [opt('Class 1 (clean, minor)', 1.0), opt('Class 2 (gray water)', 1.4), opt('Class 3 (extensive saturation)', 2.0), opt('Class 4 (sewage / hazardous)', 2.8)] },
      { id: 'response', name: 'Response Time', label: 'How fast do you need us?', type: 'select',
        options: [opt('Next business day', 0), opt('Within 24 hours', 220), opt('Within 4 hours (emergency)', 580)] },
      { id: 'services', name: 'Services', label: 'Services needed', type: 'multi_select',
        options: [opt('Water extraction', 350), opt('Structural drying', 480), opt('Mold prevention', 280), opt('Contents pack-out', 620), opt('Reconstruction estimate', 0)] },
    ],
    calculations: [
      calc('Extraction & Drying', '[Affected Area] * 2.2 * [Severity]'),
      calc('Response Surcharge', '[Response Time]'),
      calc('Restoration Services', '[Services]'),
      calc('Estimated Cost', '[Extraction & Drying] + [Response Surcharge] + [Restoration Services]'),
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Restoration Estimate',
      show_breakdown: true,
      cta_label: 'Get Emergency Help',
      footnote: 'IICRC-certified technicians on call 24/7. We bill your insurance carrier directly when possible — most homeowners pay only their deductible.',
    },
  },

  /* ── 34. Emergency HVAC repair ── */
  {
    id: 'emergency_hvac', name: 'Emergency HVAC',
    description: 'After-hours HVAC repair with diagnostic + parts modifiers.',
    category: 'Emergency', trades: ['emergency_hvac', 'hvac_services'],
    trustBadges: BADGES.emergencyHvac,
    layout: 'single-column', theme: 'midnight', defaultIcon: 'Flame',
    header: { title: 'Dispatch an HVAC Tech Now — Same-Day Service', subtitle: 'NATE-certified technicians · 24/7 emergency response · Diagnostic credit applied to repair', align: 'left' },
    fields: [
      { id: 'system', name: 'System', label: 'Which system is failing?', type: 'radio',
        options: [opt('AC / cooling', 0), opt('Furnace / heating', 0), opt('Heat pump', 30), opt('Mini-split', 45)] },
      { id: 'time', name: 'Time of Service', label: 'When do you need us?', type: 'select',
        options: [opt('Business hours', 95), opt('Evening (5-10 PM)', 175), opt('Overnight (10 PM-7 AM)', 295), opt('Weekend / holiday', 220)] },
      { id: 'issue', name: 'Symptom', label: 'What\'s the symptom?', type: 'select',
        options: [opt('Not turning on', 0), opt('Running but not heating/cooling', 75), opt('Loud noise / vibration', 60), opt('Leaking water', 110), opt('Strange smell / burning', 140)] },
      { id: 'extras', name: 'Add-ons', label: 'Likely repairs', type: 'multi_select',
        options: [opt('Refrigerant top-up', 220), opt('Capacitor replacement', 175), opt('Thermostat replacement', 145), opt('System tune-up after fix', 95)] },
    ],
    calculations: [
      calc('Diagnostic & Trip', '[Time of Service]'),
      calc('System & Symptom', '[System] + [Symptom]'),
      calc('Likely Repairs', '[Add-ons]'),
      calc('Estimated Cost', '[Diagnostic & Trip] + [System & Symptom] + [Likely Repairs]'),
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Emergency HVAC Estimate',
      show_breakdown: true,
      cta_label: 'Dispatch a Technician',
      footnote: 'Diagnostic fee credited toward the repair when work is performed the same visit. 1-year warranty on parts and labor.',
    },
  },

  /* ── Wave Y Batch 6 — Professional services category ── */

  /* ── 35. Web design quote ── */
  {
    id: 'web_design_quote', name: 'Web Design',
    description: 'Website design + build pricing by page count and feature scope.',
    category: 'Professional', trades: ['web_design'],
    trustBadges: BADGES.webDesign,
    layout: 'two-column', theme: 'midnight', defaultIcon: 'Globe',
    header: { title: 'Get a Custom Website Quote in 60 Seconds', subtitle: '15+ years in business · 200+ launched sites · Free strategy call before you commit', align: 'left' },
    fields: [
      { id: 'pages', name: 'Pages', label: 'Number of pages', type: 'slider',
        min: 1, max: 50, step: 1, default_value: 8, unit: 'pages' },
      { id: 'tier', name: 'Design Tier', label: 'Design tier', type: 'radio',
        options: [opt('Template-based', 1.0), opt('Custom design', 1.8), opt('Premium custom + branding', 2.8)] },
      { id: 'features', name: 'Features', label: 'Features to include', type: 'multi_select',
        options: [opt('Contact form + CRM hookup', 280), opt('Blog / CMS', 450), opt('E-commerce (up to 50 products)', 1400), opt('Booking / scheduling', 380), opt('Multilingual (2 languages)', 850), opt('Member portal', 1200)] },
      { id: 'turnaround', name: 'Turnaround', label: 'Project turnaround', type: 'select',
        options: [opt('Standard (6-8 weeks)', 1.0), opt('Fast (3-4 weeks)', 1.25), opt('Rush (2 weeks)', 1.55)] },
    ],
    calculations: [
      calc('Design & Build', '[Pages] * 280 * [Design Tier] * [Turnaround]'),
      calc('Custom Features', '[Features]'),
      calc('Estimated Project Cost', '[Design & Build] + [Custom Features]'),
    ],
    result_calc: 'Estimated Project Cost',
    results: {
      heading: 'Your Web Design Estimate',
      show_breakdown: true,
      cta_label: 'Schedule a Strategy Call',
      footnote: 'Includes design, build, mobile responsive, 1 year of hosting, and 3 rounds of revisions. Fixed price — no surprises.',
    },
  },

  /* ── 36. Photography package ── */
  {
    id: 'photography_package', name: 'Photography Package',
    description: 'General photography quote — portraits, corporate events, real estate and weddings — by hours and deliverables.',
    category: 'Professional', trades: ['photography'],
    trustBadges: BADGES.photography,
    layout: 'two-column', theme: 'magenta', defaultIcon: 'Camera',
    header: { title: 'Get a Photography Package Quote', subtitle: 'Published in 30+ magazines · 4.9★ from 400+ clients · 100% money-back if you hate the gallery', align: 'left' },
    fields: [
      { id: 'event_type', name: 'Event Type', label: 'What\'s the shoot for?', type: 'select',
        options: [opt('Portrait session', 250), opt('Family / lifestyle', 380), opt('Corporate event', 850), opt('Wedding', 2400), opt('Real estate listing', 320), opt('Product / e-commerce', 480)] },
      { id: 'hours', name: 'Hours', label: 'Hours of coverage', type: 'number',
        min: 1, max: 12, step: 1, default_value: 4, unit: 'hr' },
      { id: 'deliverables', name: 'Deliverables', label: 'Deliverables', type: 'multi_select',
        options: [opt('Edited digital gallery', 0), opt('Printed photo book', 240), opt('Highlight reel (2-min video)', 380), opt('Same-day sneak peek', 150), opt('RAW file delivery', 200)] },
      { id: 'second_shooter', name: 'Second Shooter', label: 'Add a second photographer', type: 'toggle', on_value: 550 },
    ],
    calculations: [
      calc('Session Base', '[Event Type] + [Hours] * 90'),
      calc('Deliverables', '[Deliverables]'),
      calc('Second Photographer', '[Second Shooter]'),
      calc('Estimated Quote', '[Session Base] + [Deliverables] + [Second Photographer]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Photography Quote',
      show_breakdown: true,
      cta_label: 'Reserve My Date',
      footnote: 'Includes shoot, hand-edited gallery, and online delivery. 25% deposit holds your date — fully refundable up to 60 days out.',
    },
  },

  /* ── 37. Moving service ── */
  {
    id: 'moving_service', name: 'Moving — Crew & Distance Quote',
    description: 'Itemised local or long-distance moving quote by home size, crew size, distance and moving-day pricing.',
    category: 'Professional', trades: ['moving_services'],
    trustBadges: BADGES.moving,
    layout: 'single-column', theme: 'forest', defaultIcon: 'Truck',
    requireAddress: true,
    style: {
      widgetWidth: 'wide',
      accent: '#16a34a',
      background: '#f3faf5',
      surface: '#ffffff',
      border: '#d6ece0',
      text: '#0f172a',
      resultsBg: '#14401f',
      ctaColor: '#22c55e',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        range_mode: { enabled: true, band_pct: 10 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Get a Door-to-Door Moving Quote in 60 Seconds', subtitle: 'Licensed & insured movers · Full-value protection available · 4.8★ from 2,500+ moves', align: 'left' },
    steps: [
      { id: 'step_move', label: 'Home & distance', help: 'Home size and how far you’re going set the base move.', fields: ['home_size', 'distance'] },
      { id: 'step_crew', label: 'Crew & extras', help: 'Crew size, add-ons and which day you move.', fields: ['crew', 'extras', 'day'] },
    ],
    fields: [
      // Home size is the highest-uncertainty driver → image-card radio.
      { id: 'home_size', name: 'Home Size', label: 'Home size', type: 'radio',
        help: 'Pick the closest match — it sets crew time, truck size and materials.',
        options: [
          { ...optImg('Studio / 1 bed', 1.0, 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=300&h=300&fit=crop'),
            description: 'Up to ~600 sqft — fits a single truck load.' },
          { ...optImg('2 bedroom', 1.5, 'https://images.unsplash.com/photo-1503594384566-461fe158e797?w=300&h=300&fit=crop'),
            description: 'Typical apartment or small house.' },
          { ...optImg('3 bedroom', 2.1, 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=300&h=300&fit=crop'),
            description: 'Full household — our most common move.' },
          { ...optImg('4+ bedroom', 2.8, 'https://images.unsplash.com/photo-1494526585095-c41746248156?w=300&h=300&fit=crop'),
            description: 'Large home — may need a second truck.' },
        ] },
      { id: 'distance', name: 'Distance', label: 'Move distance (miles)', type: 'slider',
        help: 'Door-to-door miles between the old and new address.',
        min: 5, max: 1500, step: 5, default_value: 35, unit: 'miles' },
      { id: 'crew', name: 'Crew', label: 'Crew size', type: 'radio',
        help: 'A bigger crew finishes faster — often cheaper than the hourly difference.',
        options: [
          { ...opt('2-person crew', 1.0), description: 'Standard crew — best for smaller homes.' },
          { ...opt('3-person crew (faster)', 1.35), description: 'Faster load-out for a typical house.' },
          { ...opt('4-person crew (large homes)', 1.7), description: 'For large homes and tight timelines.' },
        ] },
      { id: 'extras', name: 'Extras', label: 'Optional add-ons', type: 'multi_select',
        help: 'Add packing, specialty handling, storage or extra coverage.',
        options: [opt('Full packing service', 480), opt('Specialty item (piano / safe)', 320), opt('Storage (1 month)', 180), opt('Disassembly + reassembly', 220), opt('Insurance bump (full value)', 150)] },
      { id: 'day', name: 'Day', label: 'Moving day', type: 'select',
        help: 'Weekday moves are the cheapest; weekends book up fast.',
        options: [opt('Weekday', 1.0), opt('Saturday', 1.15), opt('Sunday / holiday', 1.3)] },
    ],
    calculations: [
      { ...calc('Crew & Transport', '([Home Size] * 480 + [Distance] * 1.6) * [Crew] * [Day]'), caption: 'Crew time and mileage, adjusted for crew size and the day you move.' },
      { ...calc('Optional Add-ons', '[Extras]'), caption: 'Packing, specialty handling, storage and coverage.' },
      { ...calc('Estimated Cost', '[Crew & Transport] + [Optional Add-ons]'),
        resultMode: 'primary', caption: 'All-in estimate — no deposit required to reserve your date.' },
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Moving Quote',
      show_breakdown: true,
      cta_label: 'Reserve My Move',
      cta_heading: 'Lock your date before the calendar fills',
      cta_sub: 'Our licensed, insured crews wrap, load and place everything — with full-value protection available and no deposit to reserve. Grab your moving day now.',
      submit_success: 'Reserved! Your move coordinator will call within one business day to confirm your crew and timeline.',
      footnote: 'Local moves include first 60 miles. Long-distance includes blanket-wrap, tie-down, and standard liability. No deposit required.',
    },
  },

  /* ── 38. Home inspection ── */
  {
    id: 'home_inspection_quote', name: 'Home Inspection',
    description: 'Pre-purchase home inspection by sqft, home age and add-on tests.',
    category: 'Professional', trades: ['home_inspection'],
    trustBadges: BADGES.homeInspection,
    layout: 'two-column', theme: 'light', defaultIcon: 'ClipboardCheck',
    header: { title: 'Book an Independent Home Inspection', subtitle: 'InterNACHI-certified inspectors · 2,000+ homes inspected · Same-day report available', align: 'left' },
    fields: [
      { id: 'sqft', name: 'Home Size', label: 'Home size (sqft)', type: 'slider',
        min: 600, max: 8000, step: 100, default_value: 2200, unit: 'sqft' },
      { id: 'age', name: 'Home Age', label: 'Home age', type: 'select',
        options: [opt('Newer (under 10 yrs)', 1.0), opt('10-30 yrs', 1.1), opt('30-60 yrs', 1.2), opt('60+ yrs (heritage)', 1.35)] },
      { id: 'addons', name: 'Add-on Tests', label: 'Specialty add-on tests', type: 'multi_select',
        options: [opt('Radon test', 145), opt('Mold inspection', 220), opt('Termite / pest', 195), opt('Sewer scope camera', 280), opt('Pool / spa inspection', 175), opt('Thermal imaging scan', 260)] },
      { id: 'turnaround', name: 'Turnaround', label: 'Report turnaround', type: 'radio',
        options: [opt('Standard (48 hours)', 0), opt('Rush (next business day)', 95), opt('Same-day report', 180)] },
    ],
    calculations: [
      calc('Base Inspection', '[Home Size] * 0.18 * [Home Age]'),
      calc('Specialty Tests', '[Add-on Tests]'),
      calc('Rush Report', '[Turnaround]'),
      calc('Estimated Quote', '[Base Inspection] + [Specialty Tests] + [Rush Report]'),
    ],
    result_calc: 'Estimated Quote',
    results: {
      heading: 'Your Inspection Quote',
      show_breakdown: true,
      cta_label: 'Book My Inspection',
      footnote: 'Includes full visual inspection of 400+ items, photo report, and walk-through with the inspector. Buy-back guarantee available.',
    },
  },

  /* ── Wave Y Batch 7 — Specialty (6 templates) ── */

  /* ── 39. Solar panel installation ── */
  {
    id: 'solar_panel_install', name: 'Solar Panel Installation',
    description: 'Rooftop solar quote by system size, roof type and battery storage.',
    category: 'Home Improvement', trades: ['solar_panel', 'solar_battery'],
    trustBadges: BADGES.solar,
    layout: 'two-column', theme: 'forest', defaultIcon: 'Sun',
    header: { title: 'Go Solar — Free Install Quote + Tax Credit', subtitle: 'NABCEP-certified installers · 25-year production guarantee · 30% federal tax credit', align: 'left' },
    fields: [
      { id: 'system_size', name: 'System Size', label: 'System size (kW)', type: 'slider',
        min: 3, max: 25, step: 0.5, default_value: 8.5, unit: 'kW' },
      { id: 'roof_type', name: 'Roof Type', label: 'Roof type', type: 'select',
        options: [opt('Asphalt shingle', 1.0), opt('Tile (clay / concrete)', 1.18), opt('Metal standing seam', 1.1), opt('Flat / membrane', 1.12)] },
      { id: 'battery', name: 'Battery Storage', label: 'Battery storage', type: 'radio',
        options: [opt('No battery', 0), opt('Single battery (~13 kWh)', 12500), opt('Dual battery (~26 kWh)', 22500)] },
      { id: 'extras', name: 'Extras', label: 'Optional extras', type: 'multi_select',
        options: [opt('EV charger pre-wire', 380), opt('Critter guard', 240), opt('Monitoring app (premium)', 180), opt('Roof reinforcement', 850), opt('Permit + interconnect handling', 0)] },
    ],
    calculations: [
      calc('Panel System', '[System Size] * 2800 * [Roof Type]'),
      calc('Battery Storage', '[Battery Storage]'),
      calc('Optional Extras', '[Extras]'),
      calc('Estimated System Cost', '[Panel System] + [Battery Storage] + [Optional Extras]'),
    ],
    result_calc: 'Estimated System Cost',
    results: {
      heading: 'Your Solar System Estimate',
      show_breakdown: true,
      cta_label: 'Schedule My Site Survey',
      footnote: 'Eligible for the 30% federal tax credit + state and utility incentives. 25-year panel performance warranty + 10-year workmanship guarantee.',
    },
  },

  /* ── 40. Pool service ── */
  {
    id: 'pool_service_quote', name: 'Pool Service — Recurring Plan',
    description: 'Recurring per-visit pool maintenance by pool size and weekly / bi-weekly / monthly cadence.',
    category: 'Outdoor', trades: ['pool_service', 'pool_cleaning'],
    trustBadges: BADGES.pool,
    layout: 'single-column', theme: 'forest', defaultIcon: 'Waves',
    header: { title: 'Crystal-Clear Pool — Get a Service Quote', subtitle: 'CPO-certified pool techs · All chemicals & equipment included · Pre-pay season saves 10%', align: 'left' },
    fields: [
      { id: 'pool_size', name: 'Pool Size', label: 'Pool size', type: 'select',
        options: [opt('Small (under 15,000 gal)', 1.0), opt('Medium (15-25,000 gal)', 1.3), opt('Large (25,000+ gal)', 1.7)] },
      { id: 'frequency', name: 'Frequency', label: 'How often do you want service?', type: 'radio',
        options: [opt('Weekly', 1.0), opt('Bi-weekly', 0.55), opt('Monthly', 0.30)] },
      { id: 'services', name: 'Services', label: 'Included per visit', type: 'multi_select',
        options: [opt('Skim + vacuum', 30), opt('Brush walls + tile line', 18), opt('Chemistry test + adjust', 22), opt('Filter rinse', 15), opt('Equipment check', 12)] },
      { id: 'chemicals', name: 'Chemicals', label: 'Chemical supply', type: 'radio',
        options: [opt('You supply', 0), opt('We supply standard', 45), opt('We supply premium (saltwater / mineral)', 75)] },
    ],
    calculations: [
      calc('Service & Cleaning', '[Services] * [Pool Size] * [Frequency]'),
      calc('Chemicals', '[Chemicals]'),
      calc('Per-Visit Cost', '[Service & Cleaning] + [Chemicals]'),
    ],
    result_calc: 'Per-Visit Cost',
    results: {
      heading: 'Your Per-Visit Pool Quote',
      show_breakdown: true,
      cta_label: 'Start My Pool Service',
      footnote: 'CPO-certified techs, all equipment included. Pre-pay full season for 10% off. Cancel anytime with 30 days notice.',
    },
  },

  /* ── 41. Pest control ── */
  {
    id: 'pest_control_quote', name: 'Pest Control',
    description: 'Recurring pest control by home size and treatment scope.',
    category: 'Cleaning', trades: ['pest_control'],
    trustBadges: BADGES.pestControl,
    layout: 'two-column', theme: 'light', defaultIcon: 'Bug',
    header: { title: 'Get a Family-Safe Pest Control Quote', subtitle: 'Licensed pest pros · Pet- and kid-safe products · Free re-treatment between visits', align: 'left' },
    fields: [
      { id: 'home_size', name: 'Home Size', label: 'Home size (sqft)', type: 'slider',
        min: 600, max: 6000, step: 100, default_value: 2000, unit: 'sqft' },
      { id: 'plan', name: 'Plan', label: 'Service plan', type: 'radio',
        options: [opt('One-time treatment', 1.0), opt('Quarterly (recommended)', 0.40), opt('Monthly (heavy issue)', 0.18)] },
      { id: 'pests', name: 'Pests', label: 'What are we treating?', type: 'multi_select',
        options: [opt('General (ants, spiders)', 35), opt('Roaches', 65), opt('Wasps / hornets', 75), opt('Mice / rats', 110), opt('Termites (inspection)', 145), opt('Bedbugs (per room)', 220)] },
      { id: 'scope', name: 'Scope', label: 'Treatment scope', type: 'select',
        options: [opt('Interior only', 0), opt('Exterior only', 0), opt('Interior + exterior (full perimeter)', 60)] },
    ],
    calculations: [
      calc('Treatment Base', '[Home Size] * 0.06 * [Plan]'),
      calc('Target Pests', '[Pests]'),
      calc('Treatment Scope', '[Scope]'),
      calc('Estimated Cost', '[Treatment Base] + [Target Pests] + [Treatment Scope]'),
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Pest Control Quote',
      show_breakdown: true,
      cta_label: 'Schedule My Treatment',
      footnote: 'Family- and pet-safe products. Quarterly plans include free re-treatment between visits if pests return. 30-day satisfaction guarantee.',
    },
  },

  /* ── 42. Roof replacement ── */
  {
    id: 'roof_replacement', name: 'Roof Replacement',
    description: 'Full roof replacement by sqft, material and complexity, with tear-off, pitch and performance add-ons.',
    category: 'Construction', trades: ['roofing', 'roofing_installation'],
    trustBadges: BADGES.roofing,
    layout: 'two-column', theme: 'light', defaultIcon: 'Home',
    requireAddress: true,
    // FLAGSHIP showcase style — slate-graphite body, deep-charcoal result
    // panel, brick-red CTA. Replacements carry the widest on-site variance in
    // the catalogue → range_mode on at ±12%. Never falls back to
    // deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#b91c1c',
      background: '#f6f7f8',
      surface: '#ffffff',
      border: '#e1e4e8',
      text: '#111827',
      resultsBg: '#1f2937',
      ctaColor: '#dc2626',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'geist',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Decking, flashing and code-upgrade variance is found once the old
        // roof is off — quote as a band rather than a false-precision figure.
        range_mode: { enabled: true, band_pct: 12 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      // Storm-driven, schedule-critical replacements — locking a crew date is
      // the whole sale.
      deposit: {
        enabled: true,
        amount: 250,
        label: '$250 deposit reserves your install crew',
        iconName: 'Calendar',
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Get Your Roof Replacement Quote in 60 Seconds', subtitle: 'GAF Master Elite & Owens Corning certified · 50-year material warranty · Free drone roof survey', align: 'left' },
    steps: [
      { id: 'step_roof', label: 'Your roof', help: 'Roof footprint and the material you want on top of it.', fields: ['roof_size', 'material'] },
      { id: 'step_scope', label: 'Scope & pitch', help: 'Shape, steepness and how many old layers come off — the biggest cost drivers.', fields: ['complexity', 'pitch', 'pitch_staging', 'tear_off'] },
      { id: 'step_extras', label: 'Performance add-ons', help: 'Optional upgrades that extend the life of the new roof.', fields: ['extras'] },
    ],
    fields: [
      { id: 'roof_size', name: 'Roof Size', label: 'Roof size (sqft)', type: 'slider',
        min: 500, max: 5000, step: 50, default_value: 2200, unit: 'sqft',
        help: 'Roughly your home footprint × 1.4 for an average pitch — we confirm exact area by drone survey.' },
      // Image-card radio on the highest-uncertainty question (material).
      { id: 'material', name: 'Material', label: 'Which roofing material?', type: 'radio',
        help: 'Material drives most of the price — and how long the roof lasts.',
        options: [
          { ...optImg('Architectural shingle', 6.5, 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=300&fit=crop'),
            description: 'The US default — 30-year dimensional shingle, best value per year of life.' },
          { ...optImg('3-tab shingle', 4.5, 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=300&h=300&fit=crop'),
            description: 'Lowest upfront cost — flat profile, ~20-year life.' },
          { ...optImg('Metal standing seam', 11, 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=300&h=300&fit=crop'),
            description: '50-year life, sheds snow, lowers cooling bills — higher upfront.' },
          { ...optImg('Clay tile', 14, 'https://images.unsplash.com/photo-1503594384566-461fe158e797?w=300&h=300&fit=crop'),
            description: 'Mediterranean look, lifetime material — needs reinforced framing.' },
          { ...optImg('Slate', 19, 'https://images.unsplash.com/photo-1494526585095-c41746248156?w=300&h=300&fit=crop'),
            description: 'A century of life and unmatched looks — the premium tier.' },
        ] },
      { id: 'complexity', name: 'Complexity', label: 'How complex is the roof?', type: 'select',
        help: 'More valleys, dormers and intersections mean more cut-in labor and flashing.',
        options: [
          { ...opt('Simple — gable or hip', 1.0), description: 'One or two clean slopes, few penetrations.' },
          opt('Moderate — dormers, multiple slopes', 1.18),
          opt('Complex — turrets, valleys, intersections', 1.4),
        ] },
      { id: 'pitch', name: 'Steep Pitch', label: 'Is the roof steep (over 7/12 pitch)?', type: 'toggle',
        help: 'Steep roofs need fall-protection staging and slow the crew — adds access cost.',
        on_value: 1850 },
      // show_if — a steep roof unlocks the engineered safety-staging add-on
      // (only meaningful once the customer flags a steep pitch).
      { id: 'pitch_staging', name: 'Safety Staging', label: 'Add engineered roof staging & fall protection', type: 'toggle',
        help: 'Required on steep roofs — scaffolding, anchors and walk-boards keep the crew safe and the job on schedule.',
        on_value: 650,
        show_if: { field: 'pitch', op: 'eq', value: 1 } },
      { id: 'tear_off', name: 'Tear-Off', label: 'Tear off existing layers?', type: 'radio',
        help: 'Code usually caps a roof at two layers — a tear-off resets the clock and exposes the deck.',
        options: [
          { ...opt('No — overlay new layer', 0), description: 'Cheapest, but only legal over a single sound layer.' },
          opt('Tear off one layer', 1200),
          opt('Tear off two layers', 2200),
        ] },
      { id: 'extras', name: 'Extras', label: 'Performance add-ons', type: 'multi_select',
        help: 'Where most preventable leaks start — cheapest to add while the roof is open.',
        options: [
          { ...opt('Ice & water barrier upgrade', 580), description: 'Seals eaves and valleys against ice dams and wind-driven rain.' },
          opt('Ridge ventilation', 420),
          opt('New gutters', 1450),
          opt('Skylights — 3-pack', 1800),
        ] },
    ],
    calculations: [
      { ...calc('Materials & Labor', '[Roof Size] * [Material] * [Complexity]'), caption: 'Material, underlayment, fasteners and standard install labor.' },
      { ...calc('Tear-Off & Access', '[Tear-Off] + [Steep Pitch] + [Safety Staging]'), caption: 'Old-layer removal, disposal and steep-roof staging where needed.' },
      { ...calc('Performance Add-ons', '[Extras]'), caption: 'Optional barrier, ventilation, gutter and skylight upgrades.' },
      { ...calc('Estimated Project Cost', '[Materials & Labor] + [Tear-Off & Access] + [Performance Add-ons]'),
        resultMode: 'primary', caption: 'Turn-key estimate — final figure confirmed after the free drone survey.' },
    ],
    result_calc: 'Estimated Project Cost',
    results: {
      heading: 'Your Roof Replacement Estimate',
      show_breakdown: true,
      cta_label: 'Schedule My Free Inspection',
      cta_heading: 'A failing roof only gets more expensive',
      cta_sub: 'Lock a crew date now — our inspector confirms decking and material before any tear-off begins.',
      submit_success: 'Inspection requested! Your project manager will call within one business day to schedule the drone survey and confirm your estimate.',
      footnote: 'Manufacturer warranty (25–50 years) + 10-year workmanship warranty. Insurance-claim documentation provided on storm-damage jobs.',
    },
  },

  /* ── 43. Garage door service ── */
  {
    id: 'garage_door_service', name: 'Garage Door Service',
    description: 'Install, repair or replace by door size and opener.',
    category: 'HVAC & Mechanical', trades: ['garage_door'],
    trustBadges: BADGES.garageDoor,
    layout: 'single-column', theme: 'forest', defaultIcon: 'DoorOpen',
    requireAddress: true,
    style: {
      widgetWidth: 'wide',
      accent: '#15803d',
      background: '#f3faf5',
      surface: '#ffffff',
      border: '#d6ece0',
      text: '#0f172a',
      resultsBg: '#14401f',
      ctaColor: '#22c55e',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        range_mode: { enabled: true, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Get Your Garage Door Quote in 60 Seconds', subtitle: 'IDEA-accredited technicians · Lifetime warranty on springs · Same-day service available', align: 'left' },
    steps: [
      { id: 'step_service', label: 'Service & door', help: 'What you need plus the door size and style.', fields: ['service', 'door_size', 'door_type'] },
      { id: 'step_opener', label: 'Opener & extras', help: 'Choose an opener and any add-ons.', fields: ['opener', 'extras'] },
    ],
    fields: [
      { id: 'service', name: 'Service', label: 'What do you need?', type: 'radio',
        help: 'Tell us whether you’re repairing, installing, or replacing it all.',
        options: [
          { ...optImg('Repair only', 180, 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=300&h=300&fit=crop'),
            description: 'Fix a broken spring, cable, roller or panel.' },
          { ...optImg('New door install', 1400, 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=300&fit=crop'),
            description: 'Brand-new door fitted to your existing opener.' },
          { ...optImg('Door + opener replacement', 2200, 'https://images.unsplash.com/photo-1494526585095-c41746248156?w=300&h=300&fit=crop'),
            description: 'Full replacement — new door and a new opener.' },
        ] },
      { id: 'door_size', name: 'Door Size', label: 'Door size', type: 'select',
        help: 'Single-car, double-car, or an oversized/carriage opening.',
        options: [opt('Single (8-9 ft)', 1.0), opt('Double (16 ft)', 1.65), opt('Carriage / oversized', 2.1)] },
      { id: 'door_type', name: 'Door Style', label: 'Door style', type: 'select',
        help: 'Insulation and material set the price and the curb appeal.',
        options: [opt('Steel panel', 0), opt('Insulated steel', 380), opt('Wood / wood-look', 950), opt('Glass / modern', 1500)] },
      { id: 'opener', name: 'Opener', label: 'Opener (if installing)', type: 'radio',
        help: 'Belt drives are quieter; smart openers add app and voice control.',
        options: [
          { ...opt('Chain drive', 280), description: 'Reliable and economical — a little louder.' },
          { ...opt('Belt drive (quieter)', 380), description: 'Smooth, quiet operation — ideal near bedrooms.' },
          { ...opt('Smart / Wi-Fi enabled', 520), description: 'App control, voice assistants and remote access.' },
        ] },
      { id: 'extras', name: 'Extras', label: 'Add-ons', type: 'multi_select',
        help: 'Tick any extras to bundle into the same visit.',
        options: [opt('Battery backup', 120), opt('Keypad entry', 75), opt('Haul old door', 95), opt('New springs', 220)] },
    ],
    calculations: [
      { ...calc('Service & Door', '[Service] * [Door Size] + [Door Style]'), caption: 'Service and door, scaled by size, plus the style upgrade.' },
      { ...calc('Opener', '[Opener]'), caption: 'New opener where you’re installing one.' },
      { ...calc('Add-ons', '[Extras]'), caption: 'Optional backup, keypad, haul-away and springs.' },
      { ...calc('Estimated Cost', '[Service & Door] + [Opener] + [Add-ons]'),
        resultMode: 'primary', caption: 'Estimate — confirmed on site, most jobs done same day.' },
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Garage Door Quote',
      show_breakdown: true,
      cta_label: 'Book a Technician',
      cta_heading: 'A stuck door shouldn’t hold up your day',
      cta_sub: 'Our IDEA-accredited techs carry the common parts to fix most issues on the first visit — and back springs and openers for life. Book a same-day slot.',
      submit_success: 'Booked! Our dispatcher will call to confirm your same-day or next-day arrival window.',
      footnote: 'Lifetime warranty on springs and openers. Most repairs completed in a single visit. Same-day appointments available.',
    },
  },

  /* ── 44. Appliance repair ── */
  {
    id: 'appliance_repair', name: 'Appliance Repair',
    description: 'Per-appliance repair estimate with diagnostic + parts modifiers.',
    category: 'HVAC & Mechanical', trades: ['appliance_repair'],
    trustBadges: BADGES.applianceRepair,
    layout: 'single-column', theme: 'midnight', defaultIcon: 'Refrigerator',
    header: { title: 'Get an Appliance Repair Quote in 60 Seconds', subtitle: 'Factory-trained technicians · Flat-rate pricing · 90-day parts & labor warranty', align: 'left' },
    fields: [
      { id: 'appliance', name: 'Appliance', label: 'Which appliance?', type: 'select',
        options: [opt('Refrigerator', 220), opt('Dishwasher', 180), opt('Washer / dryer', 195), opt('Range / oven', 210), opt('Microwave', 145), opt('Garbage disposal', 130)] },
      { id: 'age', name: 'Age', label: 'Appliance age', type: 'radio',
        options: [opt('Under 5 years', 1.0), opt('5-10 years', 1.15), opt('10+ years', 1.3)] },
      { id: 'symptom', name: 'Symptom', label: 'What\'s the symptom?', type: 'select',
        options: [opt('Won\'t turn on', 0), opt('Runs but not working', 40), opt('Strange noise', 35), opt('Leaking', 60), opt('Burning smell / sparking', 85)] },
      { id: 'parts', name: 'Parts', label: 'Likely parts needed', type: 'radio',
        options: [opt('Diagnostic only', 0), opt('Minor part (under $50)', 60), opt('Major part ($50-$200)', 175), opt('OEM/specialty part ($200+)', 320)] },
    ],
    calculations: [
      calc('Diagnostic & Labor', '[Appliance] * [Age]'),
      calc('Symptom Surcharge', '[Symptom]'),
      calc('Parts', '[Parts]'),
      calc('Estimated Cost', '[Diagnostic & Labor] + [Symptom Surcharge] + [Parts]'),
    ],
    result_calc: 'Estimated Cost',
    results: {
      heading: 'Your Appliance Repair Quote',
      show_breakdown: true,
      cta_label: 'Book a Repair',
      footnote: 'Diagnostic fee waived when repair is performed same visit. 90-day warranty on all parts and labor. Most repairs done in one visit.',
    },
  },

  /* ── 45. Junk Removal (sample — W-AH-1, styled — W-AS-1) ── */
  {
    id: 'junk_removal_quote', name: 'Junk Removal',
    description: 'Truck-load pricing with surcharges for stairs, distance, and same-day pickup.',
    category: 'Cleaning', trades: ['junk_removal'],
    trustBadges: BADGES.junkRemoval,
    layout: 'single-column', theme: 'midnight', defaultIcon: 'Trash2',
    requireAddress: true,
    header: { title: 'Book a Junk Pickup in 60 Seconds', subtitle: 'We load, haul, and sweep up · Most items donated or recycled · Same-day pickup available', align: 'left' },
    // W-AS-1 — Action / Truck / Bold-Industrial visual identity.
    // W-AS-1b — extended with AO-6c Brand Studio fields: bgGradient body,
    // accent-tinted bold result panel. (Note: `animations` is not yet a
    // schema field on AdvStyle — wave-as1c will add it; for now the
    // identity comes from gradient + result-panel emphasis + accent border.)
    style: {
      widgetWidth: 'wide',      // Wave width-uniform — explicit standard width
      accent: '#fb923c',        // orange-400 bold action
      secondary: '#facc15',     // yellow-400 high-energy
      background: '#0f172a',    // slate-900 deep base
      surface: '#1e293b',       // slate-800 card
      border: '#334155',        // slate-700
      text: '#f8fafc',          // slate-50
      resultsBg: '#1e293b',
      success: '#22c55e',
      error: '#ef4444',
      fontFamily: 'geist',
      fieldStyle: 'filled',
      radius: 6,
      headingWeight: 800,
      bodyWeight: 500,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      // W-AS-1b — AO-6c Brand Studio: dark industrial diagonal gradient
      // body + bold orange-accented result panel.
      // W-AS-1c — direction promoted from clamped `'linear-down'` to true
      // diagonal `'to bottom right'`; border softened from full `'accent'`
      // to `'accent-tinted'`; per-template `animations` bundle added.
      bgMode: 'gradient',
      bgGradient: { from: '#0f172a', to: '#1e293b', direction: 'to bottom right' },
      bgImageTint: 0,
      resultPanel: {
        accentOverride: '#fb923c',
        emphasis: 'bold',
        border: 'accent-tinted',
        // W-BB-3 — junk removal has high cost variability (load size, access,
        // disposal). Range display ($2,300–$2,700) reduces buyer anxiety vs a
        // false-precision single value.
        range_mode: { enabled: true, band_pct: 8 },
      },
      animations: {
        step_transition: 'slide-fade',
        duration_ms: 280,
        reduced_motion_respect: true,
      },
    },
    fields: [
      // BD-2c — converted from `select` to `radio` with image cards. The
      // load-size question is the highest-engagement scope choice for junk
      // removal; image cards make truck-fill estimation intuitive.
      { id: 'load_size', name: 'Load Size', label: 'How much junk do you have?', type: 'radio',
        options: [
          optImg('1/4 truck', 120, 'https://images.unsplash.com/photo-1457269449834-928af64c684d?w=300&h=300&fit=crop'),
          optImg('1/2 truck', 220, 'https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=300&h=300&fit=crop'),
          optImg('3/4 truck', 320, 'https://images.unsplash.com/photo-1547754980-3df97fed72a8?w=300&h=300&fit=crop'),
          optImg('Full truck', 425, 'https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?w=300&h=300&fit=crop'),
        ] },
      { id: 'mattresses', name: 'Mattresses', label: 'Mattresses', type: 'number',
        min: 0, max: 5, step: 1, default_value: 1, unit: 'item' },
      { id: 'appliances', name: 'Appliances', label: 'Appliances (fridge, washer, etc.)', type: 'number',
        min: 0, max: 5, step: 1, default_value: 1, unit: 'item' },
      { id: 'stairs', name: 'Stairs', label: 'Items located up or down stairs', type: 'toggle', on_value: 50 },
      { id: 'distance', name: 'Distance', label: 'Distance to drop-off (miles)', type: 'slider',
        min: 0, max: 30, step: 1, default_value: 8, unit: 'miles' },
      { id: 'same_day', name: 'Same-day pickup', label: 'Same-day pickup', type: 'toggle', on_value: 75 },
    ],
    calculations: [
      calc('Load & Items', '[Load Size] + [Mattresses] * 25 + [Appliances] * 45'),
      calc('Access & Distance', '[Stairs] + [Distance] * 2'),
      calc('Same-day Pickup', '[Same-day pickup]'),
      calc('Total Removal Cost', '[Load & Items] + [Access & Distance] + [Same-day Pickup]'),
    ],
    result_calc: 'Total Removal Cost',
    results: {
      heading: 'Your Junk Removal Quote',
      show_breakdown: true,
      cta_label: 'Book My Pickup',
      footnote: 'Includes labor, disposal, and clean-up. We donate or recycle whenever possible. Hazardous materials quoted separately.',
    },
  },

  /* ── 46. Window Replacement (sample — W-AH-1, styled — W-AS-1)
   *
   * Template design v2 (Phase 1) — REFERENCE implementation of the global
   * rule. The result panel switches from white indigo-accent to the vivid
   * `#0F4A52` teal palette (`homeImprovement` from `RESULT_CARD_BG`); the
   * input column is grouped into THREE explicit steps so there is no
   * empty space below the inputs; layout stays two-column with the result
   * panel sticky on scroll (renderer behaviour). Other 46 templates keep
   * their existing styling — Phase 2 rolls the rule across the catalogue. */
  {
    id: 'window_replacement_quote', name: 'Window Replacement',
    description: 'Per-window pricing by type, frame material, and energy rating. Get an instant lifetime-warrantied quote in under 60 seconds.',
    category: 'Home Improvement', trades: ['window_replacement'],
    matchingTrades: ['construction', 'carpentry', 'general-contractor', 'remodeler'],
    trustBadges: BADGES.windows,
    layout: 'two-column', theme: 'light', defaultIcon: 'RectangleHorizontal',
    requireAddress: true,
    header: { title: 'Get Your Window Replacement Quote', subtitle: 'ENERGY STAR-certified installers · Lifetime product warranty · Free in-home measurement', align: 'left' },
    // Template design v2 — three explicit steps so the renderer's
    // multi-step flow groups inputs by intent (sizing, materials, install).
    // Each step has 2 fields, eliminating the empty space below the
    // first-step number input in the previous single-page layout.
    steps: [
      {
        id: 'sizing',
        label: 'Windows & Type',
        help: 'How many and what style',
        fields: ['count', 'type'],
      },
      {
        id: 'materials',
        label: 'Additional Features',
        help: 'Frame material & glass package',
        fields: ['frame', 'glass'],
      },
      {
        id: 'install',
        label: 'Installation Complexity',
        help: 'Professional install & removal',
        fields: ['install', 'disposal'],
      },
    ],
    // W-AS-1 — Clean / Glass / Professional visual identity.
    // Template design v2 (Phase 1) — result panel now uses the vivid teal
    // `homeImprovement` palette from `RESULT_CARD_BG` (#0F4A52) with
    // 12px rounded corners, white text, and ≥4.5:1 contrast on every
    // body-on-bg pairing. Outer card stays white with the 16px outer
    // radius from `TEMPLATE_CARD_STYLE`.
    style: {
      widgetWidth: 'wide',      // Wave width-uniform — explicit standard width
      accent: '#0F4A52',        // teal-deep — matches result panel bg
      secondary: '#5EEAD4',     // teal-200 accent (chips, ticks)
      background: '#f8fafc',    // slate-50 outer canvas
      surface: '#ffffff',       // input card bg
      border: 'rgba(0,0,0,0.06)', // TEMPLATE_CARD_STYLE.hairlineColor
      text: '#0f172a',          // slate-900 input text
      resultsBg: '#0F4A52',     // vivid teal result panel
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'jakarta',
      fieldStyle: 'outline',
      radius: 16,               // TEMPLATE_CARD_STYLE.outerRadius
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-center',
      logoSize: 'medium',
      // Outer canvas — soft slate; the inner result panel carries the
      // vivid colour so the page never feels oppressive.
      bgMode: 'solid',
      bgImageTint: 0,
      resultPanel: {
        accentOverride: '#5EEAD4',  // teal-200 for value pills + CTA
        emphasis: 'bold',
        border: 'accent',
      },
      animations: {
        // Respects prefers-reduced-motion (renderer-handled).
        step_transition: 'fade',
        duration_ms: 220,
        reduced_motion_respect: true,
      },
    },
    fields: [
      { id: 'count', name: 'Count', label: 'Number of windows', type: 'number',
        min: 1, max: 30, step: 1, default_value: 8, unit: 'windows' },
      // BD-2c — converted from `select` to `radio` with image cards.
      { id: 'type', name: 'Type', label: 'Window type', type: 'radio',
        options: [
          // 2026-05-24 — the `source.unsplash.com/?keywords` redirector now
          // returns ORB-blocked on direct fetches from the QuoteQuick widget
          // mounted at /products/quickquotepro, breaking these 5 cards.
          // Replaced with curated `images.unsplash.com/photo-<id>` direct
          // URLs (window-themed, 300x300 fit=crop) which aren't subject to
          // the same ORB policy.
          optImg('Single hung', 250, 'https://images.unsplash.com/photo-1503594384566-461fe158e797?w=300&h=300&fit=crop'),
          optImg('Double hung', 320, 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=300&fit=crop'),
          optImg('Sliding', 290, 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=300&h=300&fit=crop'),
          optImg('Picture', 410, 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=300&h=300&fit=crop'),
          optImg('Bay', 780, 'https://images.unsplash.com/photo-1494526585095-c41746248156?w=300&h=300&fit=crop'),
        ] },
      { id: 'frame', name: 'Frame', label: 'Frame material', type: 'select',
        options: [opt('Vinyl', 0), opt('Fiberglass', 110), opt('Wood', 180), opt('Aluminum', 60)] },
      { id: 'glass', name: 'Glass', label: 'Glass package', type: 'select',
        options: [opt('Standard double-pane', 0), opt('Energy-efficient (Low-E)', 85), opt('Triple-pane', 180)] },
      { id: 'install', name: 'Professional installation per window', label: 'Pro installation per window', type: 'toggle', on_value: 145 },
      { id: 'disposal', name: 'Haul away old windows', label: 'Haul away the old windows', type: 'toggle', on_value: 60 },
    ],
    calculations: [
      calc('Windows & Installation', '[Count] * ([Type] + [Frame] + [Glass] + [Professional installation per window])'),
      calc('Removal & Disposal', '[Haul away old windows]'),
      calc('Total Window Replacement', '[Windows & Installation] + [Removal & Disposal]'),
    ],
    result_calc: 'Total Window Replacement',
    results: {
      heading: 'Your Window Replacement Quote',
      show_breakdown: true,
      cta_label: 'Schedule My Measurement',
      footnote: 'Includes ENERGY STAR-rated windows, professional installation, and lifetime product warranty. Custom shapes or historic-property windows quoted separately.',
    },
  },

  /* ── 46b. Carpet Cleaning Cost (Elfsight replica — template design v2)
   *
   * Pixel-to-pixel replica of Elfsight's "Carpet Cleaning Cost Calculator"
   * with our adaptations: trust badges, sticky result shell, matchingTrades
   * for the gallery hover modal, and PR #530's design-v2 helpers.
   *
   * Visual identity differs from the deep-emerald `cleaning` palette in
   * `RESULT_CARD_BG` — the reference image uses a soft mint result panel
   * (`#E8F5E9`) with a dark-green CTA (`#166534`). The cleaning category
   * accent (`#047857`) still drives the slider fill so the brand link is
   * preserved. Range mode is intentionally OFF (cleaning quotes are
   * deterministic per-sqft × per-room).
   *
   * Two-column layout (3 input fields ≥ 3, per `recommendColumnLayout`);
   * single-step flow (3 fields < 4, per `recommendStepperMode`). Result
   * panel collapses below inputs at ≤768px (renderer-handled). */
  {
    id: 'carpet_cleaning_quote', name: 'Carpet Cleaning — Per Square Foot',
    description: 'Per-square-foot + per-room cleaning pricing with add-ons. Mint-green result panel, dark-green CTA. Inspired by Elfsight\'s Carpet Cleaning calc with our trust badges + sticky shell.',
    // BATCH 0 — the registry's own `carpet_cleaning` trade was missing.
    category: 'Cleaning', trades: ['carpet_cleaning', 'house_cleaning'],
    matchingTrades: ['carpet-cleaning', 'residential-cleaning', 'commercial-cleaning', 'janitorial', 'general-cleaning'],
    trustBadges: [
      b('Licensed & Insured', 'lock'),
      b('IICRC Certified', 'check-circle'),
      b('Eco-Friendly Products', 'leaf'),
      b('Satisfaction Guaranteed', 'star'),
    ],
    layout: 'two-column', theme: 'mint', defaultIcon: 'Sparkles',
    categoryIcon: 'Sparkles',
    header: {
      title: 'Carpet Cleaning Cost Calculator',
      subtitle: 'Per-room pricing · Eco-friendly products · IICRC-certified technicians',
      align: 'left',
    },
    // Template design v2 — mint-green result panel matches the Elfsight
    // reference image; deep-emerald `#047857` drives sliders + brand
    // accents; dark-green `#166534` is the CTA / value-pill colour.
    // Outer card stays white with 16px outer radius (TEMPLATE_CARD_STYLE).
    style: {
      widgetWidth: 'wide',      // Wave width-uniform — explicit standard width
      accent: '#047857',        // emerald — slider fill, brand accent
      secondary: '#A7F3D0',     // emerald-200 chips / ticks
      background: '#f8fafc',    // slate-50 outer canvas
      surface: '#ffffff',       // input card bg
      border: 'rgba(0,0,0,0.06)', // TEMPLATE_CARD_STYLE.hairlineColor
      text: '#0F172A',          // slate-900 input text
      resultsBg: '#E8F5E9',     // pastel mint — matches reference (NOT deep emerald)
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'jakarta',
      fieldStyle: 'outline',
      radius: 12,               // TEMPLATE_CARD_STYLE.innerRadius
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      bgImageTint: 0,
      resultPanel: {
        accentOverride: '#166534', // dark green — CTA "Book Now" + value pill
        emphasis: 'bold',
        border: 'subtle',
        // range_mode intentionally absent — cleaning quotes are deterministic.
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 220,
        reduced_motion_respect: true,
      },
    },
    fields: [
      { id: 'room_size', name: 'Room Size', label: 'Room Size (sq ft)', type: 'slider',
        min: 100, max: 500, step: 10, default_value: 250, unit: 'sq ft' },
      { id: 'rooms', name: 'Number of Rooms', label: 'Number of Rooms', type: 'slider',
        min: 1, max: 10, step: 1, default_value: 1, unit: 'rooms' },
      { id: 'extras', name: 'Additional Services', label: 'Additional Services', type: 'multi_select',
        options: [
          opt('Stain Removal', 25),
          opt('Deodorizing', 15),
          opt('Scotchgard Protection', 40),
        ] },
    ],
    calculations: [
      // Per the reference: Cost per Room = Room Size × $0.50.
      // Total = Cost per Room × Rooms + Additional Services.
      // With defaults (250 sq ft × 1 room) → Cost per Room = $125, Total = $125.
      calc('Cost per Room', 'ROUND([Room Size] * 0.5, 2)'),
      calc('Total Cost', '[Cost per Room] * [Number of Rooms] + [Additional Services]'),
    ],
    result_calc: 'Total Cost',
    results: {
      heading: 'Get Your Carpets Cleaned Now',
      show_breakdown: true,
      cta_label: 'Book Now',
      footnote: 'Experience the best carpet cleaning service at a fair price. Book your appointment today and enjoy a cleaner home.',
    },
  },

  /* ── 47. Mold Remediation (sample — W-AH-1, styled — W-AS-1) ── */
  {
    id: 'mold_remediation_quote', name: 'Mold Remediation',
    description: 'Severity-tiered remediation with containment, HVAC, and post-test add-ons.',
    category: 'Emergency', trades: ['mold_remediation'],
    trustBadges: BADGES.moldRemediation,
    layout: 'two-column', theme: 'forest', defaultIcon: 'Biohazard',
    requireAddress: true,
    header: { title: 'Get Your Mold Remediation Estimate', subtitle: 'IICRC-certified · EPA-protocol removal · Insurance documentation provided', align: 'left' },
    // W-AS-1 — Urgent / Warning / Trust visual identity.
    // W-AS-1b — extended with AO-6c Brand Studio fields: warm amber-to-peach
    // gradient body + bold red-accented result panel.
    style: {
      widgetWidth: 'wide',      // Wave width-uniform — explicit standard width
      accent: '#dc2626',        // red-600 urgency
      secondary: '#f59e0b',     // amber-500 warning emphasis
      background: '#fef3c7',    // amber-50 warm pale yellow
      surface: '#fffbeb',       // amber-50 lighter card
      border: '#fcd34d',        // amber-300
      text: '#451a03',          // amber-950 deep brown
      resultsBg: '#fffbeb',
      success: '#16a34a',       // "you're safe now"
      error: '#b91c1c',
      fontFamily: 'plex',
      fieldStyle: 'filled',
      radius: 8,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      // W-AS-1b — AO-6c Brand Studio: warm urgent amber→peach gradient
      // body, bold red-accented result panel with accent border.
      // W-AS-1c — direction normalised to CSS-standard `'to bottom'`;
      // border softened from full `'accent'` to `'accent-tinted'` so the
      // red doesn't shout over the amber body; animations bundle added.
      bgMode: 'gradient',
      bgGradient: { from: '#fef3c7', to: '#fed7aa', direction: 'to bottom' },
      bgImageTint: 0,
      resultPanel: {
        accentOverride: '#dc2626',
        emphasis: 'bold',
        border: 'accent-tinted',
        // W-BB-3 — mold remediation severity / containment / HVAC scope drives
        // wide cost variance. Range display tracks the actual quote uncertainty.
        range_mode: { enabled: true, band_pct: 8 },
      },
      animations: {
        step_transition: 'slide',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
    },
    fields: [
      { id: 'area', name: 'Area', label: 'Affected area (sqft)', type: 'slider',
        min: 10, max: 2000, step: 10, default_value: 80, unit: 'sqft' },
      // BD-2c — converted from `select` to `radio` with image cards. Severity
      // is the highest-uncertainty answer for homeowners; visual reference
      // shortens the decision.
      { id: 'severity', name: 'Severity', label: 'Mold severity', type: 'radio',
        options: [
          optImg('Surface mold (visible only)', 8, 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=300&h=300&fit=crop'),
          optImg('Moderate (subsurface, no structural)', 14, 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=300&h=300&fit=crop'),
          optImg('Severe (structural damage)', 26, 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=300&h=300&fit=crop'),
        ] },
      { id: 'mold_type', name: 'Mold Type', label: 'Mold type (if known)', type: 'select',
        options: [opt('Common (Cladosporium / Penicillium)', 0), opt('Aspergillus', 300), opt('Stachybotrys / Black mold', 850)] },
      { id: 'containment', name: 'Containment & negative-air setup required', label: 'Add containment & negative-air setup', type: 'toggle', on_value: 800 },
      { id: 'hvac', name: 'HVAC/ductwork remediation', label: 'Include HVAC & ductwork remediation', type: 'toggle', on_value: 650 },
      { id: 'post_test', name: 'Third-party air-quality test after remediation', label: 'Independent air-quality clearance test', type: 'toggle', on_value: 425 },
      { id: 'urgency', name: 'Urgency', label: 'How urgent is it?', type: 'select',
        options: [opt('Standard scheduling', 0), opt('Within 48 hours', 350), opt('Emergency (24h)', 900)] },
    ],
    calculations: [
      calc('Remediation & Materials', '[Area] * [Severity] + [Mold Type]'),
      calc('Containment & HVAC', '[Containment & negative-air setup required] + [HVAC/ductwork remediation]'),
      calc('Testing & Urgency', '[Third-party air-quality test after remediation] + [Urgency]'),
      calc('Total Remediation Cost', '[Remediation & Materials] + [Containment & HVAC] + [Testing & Urgency]'),
    ],
    result_calc: 'Total Remediation Cost',
    results: {
      heading: 'Your Mold Remediation Estimate',
      show_breakdown: true,
      cta_label: 'Schedule Inspection',
      footnote: 'Lab analysis + EPA-protocol removal included. Written clearance on every job. Insurance documentation provided on request.',
    },
  },

  /* ── 48. Moving — Live Distance Quote (PRICING-MODELS U7 showcase) ──
   *
   * The `address_distance` proof template: the customer types their NEW
   * address, the server resolves real driving miles from the business
   * origin (manual-miles fallback stays on), and the mileage feeds the
   * formula directly — `120 + [Distance] * 2.5`. Distinct by NAME from the
   * two existing moving templates ("Moving — Flat-Rate Package",
   * "Moving — Crew & Distance Quote" — #1753 renames; collapse is
   * name-keyed). Full showcase tier: explicit niche style, steps[] w/ help,
   * per-field help, option descriptions, image-card radio, show_if,
   * calc captions + primary resultMode, results CTA block + submit_success,
   * animations + premium countUp/staggerReveal.
   */
  {
    id: 'moving_live_distance', name: 'Moving — Live Distance Quote',
    description: 'Type the destination address — real driving miles price the move live, plus crew, hours, packing and specialty items.',
    category: 'Professional', trades: ['moving_services'],
    trustBadges: BADGES.moving,
    layout: 'two-column', theme: 'light', defaultIcon: 'Truck',
    // Showcase niche style — trust-navy body, deep-navy result panel,
    // amber CTA (contrast guard renders dark text on the bright amber).
    // Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#1d4ed8',
      background: '#f4f7fb',
      surface: '#ffffff',
      border: '#dbe4f0',
      text: '#0f172a',
      resultsBg: '#13294b',
      ctaColor: '#fbbf24',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'manrope',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Moving quotes carry real walkthrough variance — show a ±10% band.
        range_mode: { enabled: true, band_pct: 10 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      // Premium pack — count-up on the live total + stagger reveal per
      // step. cardFlip/confetti intentionally off (showcase-tier rule).
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Price Your Move From Your Real Address', subtitle: 'Licensed & insured movers · Live mileage pricing · 4.8★ from 2,500+ moves', align: 'left' },
    steps: [
      { id: 'step_move', label: 'Your move', help: 'Home size and where you’re headed.', fields: ['move_size', 'distance'] },
      { id: 'step_crew', label: 'Crew & time', help: 'We suggest 3 movers for most 2–3 bedroom homes.', fields: ['crew', 'hours'] },
      { id: 'step_extras', label: 'Packing & extras', help: 'Optional services — add only what you need.', fields: ['packing', 'fragile', 'hoist'] },
    ],
    fields: [
      // Image-card radio on the highest-uncertainty question (home size).
      { id: 'move_size', name: 'Move Size', label: 'How big is your move?', type: 'radio',
        help: 'Pick the closest match — it sets prep, pads and materials.',
        options: [
          { ...optImg('Studio / 1 bedroom', 0, 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=300&h=300&fit=crop'),
            description: 'Up to ~600 sqft — fits a single truck load.' },
          { ...optImg('2 bedroom', 150, 'https://images.unsplash.com/photo-1503594384566-461fe158e797?w=300&h=300&fit=crop'),
            description: 'Typical apartment or small house.' },
          { ...optImg('3 bedroom', 320, 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=300&h=300&fit=crop'),
            description: 'Full household — most popular size.' },
          { ...optImg('4+ bedroom', 540, 'https://images.unsplash.com/photo-1494526585095-c41746248156?w=300&h=300&fit=crop'),
            description: 'Large home — may need a second truck.' },
        ] },
      // PRICING-MODELS — the live mileage field. One-way miles (roundTrip
      // false), manual "Distance in miles" fallback stays on.
      { id: 'distance', name: 'Distance', label: 'Your new address', type: 'address_distance',
        help: 'Type the destination — we calculate real driving miles automatically.',
        distanceUnit: 'miles', roundTrip: false, allowManualDistance: true },
      { id: 'crew', name: 'Crew Size', label: 'How many movers?', type: 'select',
        help: 'Bigger crews finish faster — total labor often evens out.',
        options: [
          { ...opt('2 movers', 2), description: 'Best for studios and 1-beds.' },
          { ...opt('3 movers', 3), description: 'Our most-booked crew for 2–3 bedrooms.' },
          { ...opt('4 movers', 4), description: 'Large homes, stairs, or tight timelines.' },
        ] },
      { id: 'hours', name: 'Estimated Hours', label: 'Estimated hours on site', type: 'slider',
        help: 'Loading + unloading time. A 3-bedroom usually takes 5–7 hours.',
        min: 2, max: 12, step: 1, default_value: 5, unit: 'hours' },
      { id: 'packing', name: 'Full Packing Service', label: 'Add full packing service', type: 'toggle',
        help: 'We bring boxes, paper and wrap — and pack everything the day before.',
        on_value: 480 },
      { id: 'fragile', name: 'Specialty Items', label: 'Any specialty items?', type: 'multi_select',
        help: 'These need extra crew, equipment or crating.',
        options: [
          { ...opt('Piano', 320), description: 'Upright or baby grand — includes skid board & straps.' },
          opt('Gun safe', 280),
          opt('Artwork & antiques', 120),
          opt('Pool table', 350),
        ] },
      // show_if — only surfaces when the customer ticked "Piano" above.
      { id: 'hoist', name: 'Piano Hoisting', label: 'Piano needs stairs / hoisting', type: 'toggle',
        help: 'Tight stairwells or balcony hoists need a third specialist.',
        on_value: 250,
        show_if: { field: 'fragile', op: 'contains', value: 'piano' } },
    ],
    calculations: [
      { ...calc('Transport & Mileage', '120 + [Distance] * 2.5'), caption: 'Truck, fuel & $2.50 per driving mile from your address.' },
      { ...calc('Crew Labor', '[Crew Size] * [Estimated Hours] * 55'), caption: '$55 per mover, per hour.' },
      { ...calc('Packing & Home Size', '[Move Size] + [Full Packing Service]'), caption: 'Home-size prep plus optional full packing.' },
      { ...calc('Specialty Handling', '[Specialty Items] + [Piano Hoisting]'), caption: 'Pianos, safes & oversized pieces.' },
      { ...calc('Total Moving Estimate', '[Transport & Mileage] + [Crew Labor] + [Packing & Home Size] + [Specialty Handling]'),
        resultMode: 'primary', caption: 'Estimate — confirmed after a quick walkthrough call.' },
    ],
    result_calc: 'Total Moving Estimate',
    results: {
      heading: 'Your Moving Estimate',
      show_breakdown: true,
      cta_label: 'Reserve My Move Date',
      cta_heading: 'Moving dates fill fast',
      cta_sub: 'Lock your crew now — free cancellation up to 72 hours before moving day.',
      submit_success: 'You’re on the schedule! Our move coordinator will call within one business hour to confirm details.',
      footnote: 'Includes truck, fuel, pads & shrink-wrap. Final price confirmed after walkthrough — no hidden fees.',
    },
  },

  /* ── 49. Dumpster Rental — Size & Zone (PRICING-MODELS U7 showcase) ──
   *
   * The `rate_matrix` proof template — and the drayage-pattern proof:
   * rows = container sizes, cols = delivery zones, rates = lane prices,
   * with the 40yd × Zone C cell intentionally ABSENT so the
   * `custom_quote` missing-cell path ("quoted individually", lead still
   * captured) is exercised out of the box. Also carries the optional
   * `photo_upload` ("photo of the pile") — answer-only, never blocks
   * submit. Full showcase tier (see template-inventory spec).
   */
  {
    id: 'dumpster_rental_quote', name: 'Dumpster Rental — Size & Zone',
    description: 'Roll-off dumpster quote by container size and delivery zone, with debris surcharges, extra days and a photo of the pile.',
    category: 'Cleaning', trades: ['dumpster_rental', 'junk_removal'],
    trustBadges: BADGES.junkRemoval,
    layout: 'two-column', theme: 'light', defaultIcon: 'Trash2',
    requireAddress: true,
    // Showcase niche style — work-site warm neutral body, near-black
    // result panel, safety-orange accents. Never the category fallback.
    style: {
      widgetWidth: 'wide',
      accent: '#ea580c',
      background: '#f7f5f1',
      surface: '#ffffff',
      border: '#e7e1d6',
      text: '#1c1917',
      resultsBg: '#1c1917',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'inter',
      fieldStyle: 'filled',
      radius: 10,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Matrix rates are exact lane prices — no estimate band.
        range_mode: { enabled: false, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Get a Dumpster Price in 30 Seconds', subtitle: 'Same-week delivery · Flat zone pricing · 7-day rental included', align: 'left' },
    steps: [
      { id: 'step_size', label: 'Size & zone', help: 'Pick a container and your delivery zone.', fields: ['size_zone'] },
      { id: 'step_debris', label: 'Your debris', help: 'What goes in sets the disposal rate.', fields: ['debris', 'tonnage', 'placement'] },
      { id: 'step_schedule', label: 'Schedule & photos', help: 'Extra days and an optional photo of the pile.', fields: ['days_extra', 'photos'] },
    ],
    fields: [
      // PRICING-MODELS — the rate-matrix field. Size × zone lane pricing;
      // 40yd in Zone C is intentionally unpriced → custom_quote note.
      { id: 'size_zone', name: 'Base Rental Rate', label: 'Container size & delivery zone', type: 'rate_matrix',
        help: 'Zone is the driving distance from our yard — check the map on our site.',
        matrix: {
          rowLabel: 'Dumpster size',
          colLabel: 'Delivery zone',
          rows: [
            { id: 'yd10', label: '10 yard — small cleanout' },
            { id: 'yd20', label: '20 yard — remodel / roofing' },
            { id: 'yd30', label: '30 yard — construction' },
            { id: 'yd40', label: '40 yard — major demo' },
          ],
          cols: [
            { id: 'zone_a', label: 'Zone A — in town (0–10 mi)' },
            { id: 'zone_b', label: 'Zone B — 10–25 mi' },
            { id: 'zone_c', label: 'Zone C — 25–40 mi' },
          ],
          rates: {
            yd10: { zone_a: 295, zone_b: 325, zone_c: 365 },
            yd20: { zone_a: 395, zone_b: 430, zone_c: 470 },
            yd30: { zone_a: 495, zone_b: 535, zone_c: 580 },
            // 40yd × Zone C intentionally absent → "quoted individually".
            yd40: { zone_a: 595, zone_b: 640 },
          },
          missingCell: 'custom_quote',
        } },
      { id: 'debris', name: 'Debris Type', label: 'What are you tossing?', type: 'select',
        help: 'Material sets the disposal rate at the transfer station.',
        options: [
          { ...opt('Household & furniture', 0), description: 'General junk, furniture, boxes — standard rate.' },
          { ...opt('Construction & demo', 45), description: 'Mixed C&D — drywall, lumber, fixtures.' },
          { ...opt('Concrete & dirt', 120), description: 'Heavy inert loads — fill limits apply.' },
          { ...opt('Roofing shingles', 85), description: 'Asphalt shingles — billed by the square over 20.' },
        ] },
      // show_if — tonnage only matters for heavy inert loads.
      { id: 'tonnage', name: 'Estimated Tonnage', label: 'Roughly how many tons?', type: 'select',
        help: 'Concrete & dirt loads are weight-limited — pick your best guess.',
        options: [
          opt('Under 2 tons (included)', 0),
          { ...opt('2–4 tons', 90), description: 'Most partial-slab and patio tear-outs.' },
          opt('4+ tons', 220),
        ],
        show_if: { field: 'debris', op: 'eq', value: 'concrete_dirt' } },
      // Image-card radio on the highest-uncertainty question (placement).
      { id: 'placement', name: 'Placement', label: 'Where should it go?', type: 'radio',
        help: 'Street placement usually needs a city permit — we pull it for you.',
        options: [
          { ...optImg('Driveway', 0, 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=300&fit=crop'),
            description: 'Boards under the rails protect your surface.' },
          optImg('Street / curb (permit)', 75, 'https://images.unsplash.com/photo-1457269449834-928af64c684d?w=300&h=300&fit=crop'),
          optImg('Yard or lot', 40, 'https://images.unsplash.com/photo-1547754980-3df97fed72a8?w=300&h=300&fit=crop'),
        ] },
      { id: 'days_extra', name: 'Extra Days', label: 'Days beyond the included week', type: 'slider',
        help: 'First 7 days are included — slide for a longer project.',
        min: 0, max: 21, step: 1, default_value: 0, unit: 'days' },
      // PRICING-MODELS — optional photo of the pile. Answer-only: rides in
      // the lead, contributes $0, and submit never blocks on it.
      { id: 'photos', name: 'Photos', label: 'Add a photo of the pile (optional)', type: 'photo_upload',
        help: 'A quick photo helps us confirm you picked the right size.',
        maxPhotos: 3, maxPhotoMb: 8 },
    ],
    calculations: [
      { ...calc('Base Rental', '[Base Rental Rate]'), caption: 'Includes 7-day rental, delivery, pickup & disposal to the weight limit.' },
      { ...calc('Extended Days', '[Extra Days] * 10'), caption: '$10 per day beyond the included week.' },
      { ...calc('Debris & Placement', '[Debris Type] + [Estimated Tonnage] + [Placement]'), caption: 'Material surcharge, overweight tonnage & placement.' },
      { ...calc('Total Rental Cost', '[Base Rental] + [Extended Days] + [Debris & Placement]'),
        resultMode: 'primary', caption: 'All-in price — confirmed at booking, no fuel surcharges.' },
    ],
    result_calc: 'Total Rental Cost',
    results: {
      heading: 'Your Dumpster Quote',
      show_breakdown: true,
      cta_label: 'Book My Dumpster',
      cta_heading: 'Lock in your delivery date',
      cta_sub: 'Same-week delivery in all three zones — driveway-safe placement on every drop.',
      submit_success: 'Booked! Dispatch will text your delivery window within the hour.',
      footnote: 'Weight limits: 10yd = 2 tons, 20yd = 3 tons, 30yd = 4 tons, 40yd = 5 tons. Overage billed at $65/ton.',
    },
  },

  /* ════ TEMPLATES BATCH 1 — "Mechanical money" (template-inventory spec) ════
   *
   * Five showcase-tier templates for the highest-purchase-intent mechanical
   * trades (TOP-15 #1 water heater, #11 generator, #10 security+cctv,
   * #6 septic, bench duct cleaning). Every entry ships the FULL showcase
   * tier (mirrors the two U7 exemplars above): explicit niche style block,
   * defaultIcon + trade-true trustBadges, per-field help + option
   * descriptions, ≥1 show_if branch, an image-card radio on the highest-
   * uncertainty question, calc captions + a `resultMode: 'primary'` total,
   * results CTA block + submit_success, explicit 3-step grouping with step
   * help, and animations + premium countUp/staggerReveal (no cardFlip /
   * confetti). Image cards use curated `images.unsplash.com/photo-<id>`
   * direct URLs (the non-deprecated convention — each ID verified live;
   * the `source.unsplash.com` keyword redirector is ORB-blocked).
   */

  /* ── 50. Water Heater Replacement (BATCH 1 #1) ──
   * Tank vs tankless image cards; venting/gas-line upgrade only surfaces on
   * the tankless branch (show_if). Deposit + booking fit this trade (urgent,
   * schedule-driven replacements) so both are enabled in the style block. */
  {
    id: 'water_heater_replacement', name: 'Water Heater Replacement',
    description: 'Tank vs tankless replacement pricing by capacity and fuel, with haul-away, code upgrades and same-day booking.',
    category: 'HVAC & Mechanical', trades: ['water_heater'],
    trustBadges: [
      b('Licensed Master Plumber', 'badge-check'),
      b('Tank & Tankless Certified', 'verified'),
      b('Permit & Inspection Handled', 'clipboard-check'),
      b('Same-Day Replacement', 'clock'),
    ],
    layout: 'two-column', theme: 'light', defaultIcon: 'Flame',
    requireAddress: true,
    // Showcase niche style — warm copper/flame palette, deep-rust result
    // panel, amber CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#c2410c',
      background: '#faf7f2',
      surface: '#ffffff',
      border: '#eadfd2',
      text: '#1c1917',
      resultsBg: '#7c2d12',
      ctaColor: '#f59e0b',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Replacements carry venting/code variance found on site — ±10%.
        range_mode: { enabled: true, band_pct: 10 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
      // BD-3k — deposit + booking fit this trade: urgent, schedule-driven
      // replacements where locking an install slot is the whole sale.
      deposit: {
        enabled: true,
        amount: 75,
        label: '$75 deposit reserves your install slot',
        iconName: 'Calendar',
      },
      booking: { enabled: true, source: 'wefixtrades-default' },
    },
    header: { title: 'Water Heater Out? Price the Replacement Now', subtitle: 'Licensed master plumbers · Same-day swaps · Tank & tankless certified', align: 'left' },
    steps: [
      { id: 'step_heater', label: 'Your heater', help: 'Pick a heater style and the right capacity for your household.', fields: ['wh_type', 'wh_capacity'] },
      { id: 'step_fuel', label: 'Fuel & code work', help: 'Fuel type sets the hookup; tankless may need venting upgrades.', fields: ['wh_fuel', 'wh_venting'] },
      { id: 'step_extras', label: 'Haul-away & extras', help: 'Optional — add only what your install needs.', fields: ['wh_removal', 'wh_addons'] },
    ],
    fields: [
      // Image-card radio on the highest-uncertainty question (tank vs tankless).
      { id: 'wh_type', name: 'Heater Type', label: 'Which style of water heater?', type: 'radio',
        help: 'Not sure? Most replacements swap like-for-like — tank for tank.',
        options: [
          { ...optImg('Standard tank', 1150, 'https://images.unsplash.com/photo-1585129777188-94600bc7b4b3?w=300&h=300&fit=crop'),
            description: 'Familiar 40–75 gal storage tank — lowest installed cost.' },
          { ...optImg('Tankless on-demand', 2950, 'https://images.unsplash.com/photo-1611270629569-8b357cb88da9?w=300&h=300&fit=crop'),
            description: 'Endless hot water and ~30% lower fuel bills — higher install cost.' },
        ] },
      { id: 'wh_capacity', name: 'Capacity', label: 'What size does your household need?', type: 'select',
        help: 'Match capacity to people, not square footage.',
        options: [
          opt('40 gallon — 1-2 people', 0),
          { ...opt('50 gallon — 2-4 people', 140), description: 'The most-installed size in US homes.' },
          opt('75 gallon or high-flow tankless', 420),
        ] },
      { id: 'wh_fuel', name: 'Fuel Type', label: 'What fuel does your current heater use?', type: 'select',
        help: 'Check the label on the old unit — gas heaters have a vent pipe on top.',
        options: [
          opt('Natural gas', 0),
          { ...opt('Electric', -120), description: 'No venting needed — usually the cheapest swap.' },
          opt('Propane', 130),
        ] },
      // show_if — venting/gas-line code work only applies to tankless installs.
      { id: 'wh_venting', name: 'Venting & Gas Upgrade', label: 'Add venting & gas-line upgrade', type: 'toggle',
        help: 'Most tankless conversions need a larger gas line and stainless venting.',
        on_value: 600,
        show_if: { field: 'wh_type', op: 'eq', value: 'tankless_on_demand' } },
      { id: 'wh_removal', name: 'Old Heater Haul-Away', label: 'Haul away the old heater', type: 'toggle',
        help: 'We drain, disconnect and recycle the old unit the same visit.',
        on_value: 95 },
      { id: 'wh_addons', name: 'Add-ons', label: 'Code & protection add-ons', type: 'multi_select',
        help: 'Your installer will confirm which of these your local code requires.',
        options: [
          { ...opt('Expansion tank', 175), description: 'Required by code on closed plumbing systems.' },
          opt('Smart leak detector & auto-shutoff', 240),
          opt('Drain pan & new supply lines', 85),
        ] },
    ],
    calculations: [
      { ...calc('Unit & Installation', '[Heater Type] + [Capacity]'), caption: 'New unit, standard install labor and basic fittings.' },
      { ...calc('Fuel & Code Work', '[Fuel Type] + [Venting & Gas Upgrade]'), caption: 'Fuel-type difference plus any venting / gas-line code work.' },
      { ...calc('Haul-Away & Add-ons', '[Old Heater Haul-Away] + [Add-ons]'), caption: 'Old-unit recycling and optional protection add-ons.' },
      { ...calc('Total Installed Price', '[Unit & Installation] + [Fuel & Code Work] + [Haul-Away & Add-ons]'),
        resultMode: 'primary', caption: 'Installed price incl. permit — confirmed before any work starts.' },
    ],
    result_calc: 'Total Installed Price',
    results: {
      heading: 'Your Installed Price',
      show_breakdown: true,
      cta_label: 'Book My Replacement',
      cta_heading: 'No hot water is an emergency',
      cta_sub: 'Reserve a same-day slot — your plumber arrives with the unit on the truck.',
      submit_success: 'Slot reserved! Your install coordinator will call within 30 minutes to confirm the unit and arrival window.',
      footnote: 'Includes permit, new shut-off valve and standard fittings. 6-year tank warranty / 15-year tankless warranty.',
    },
  },

  /* ── 51. Generator Installation (BATCH 1 #2) ──
   * kW tiers as image cards (the spec's image-choice question); propane tank
   * sizing only surfaces on the propane fuel branch (show_if). */
  {
    id: 'generator_install_quote', name: 'Generator Installation',
    description: 'Standby generator pricing by kW tier, transfer switch and fuel source, with site prep and cold-weather extras.',
    category: 'HVAC & Mechanical', trades: ['generator_installation'],
    trustBadges: [
      b('Licensed Master Electrician', 'badge-check'),
      b('Factory-Certified Installer', 'verified'),
      b('Permit & Inspection Handled', 'clipboard-check'),
      b('24/7 Storm Response', 'zap'),
    ],
    layout: 'two-column', theme: 'light', defaultIcon: 'Zap',
    requireAddress: true,
    // Showcase niche style — graphite body, near-black result panel,
    // storm-amber CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#d97706',
      background: '#f6f7f9',
      surface: '#ffffff',
      border: '#e2e5ea',
      text: '#111827',
      resultsBg: '#111827',
      ctaColor: '#fbbf24',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'geist',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Trenching / gas-run variance is found at the site survey — ±10%.
        range_mode: { enabled: true, band_pct: 10 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Never Lose Power — Price Your Standby Generator', subtitle: 'Factory-certified installers · Permits handled · 10-year warranty available', align: 'left' },
    steps: [
      { id: 'step_size', label: 'Generator size', help: 'Pick the kW tier that matches what you want to keep running.', fields: ['gen_kw'] },
      { id: 'step_power', label: 'Power & fuel', help: 'The switch decides which circuits stay live; fuel sets the hookup.', fields: ['gen_switch', 'gen_fuel', 'gen_tank'] },
      { id: 'step_site', label: 'Site & extras', help: 'Pad, weather and monitoring options for your install.', fields: ['gen_pad', 'gen_extras'] },
    ],
    fields: [
      // Image-card radio on the highest-uncertainty question (kW tier).
      { id: 'gen_kw', name: 'Generator Size', label: 'How much of the house should it run?', type: 'radio',
        help: 'Sized by what stays on during an outage — not by home size alone.',
        options: [
          { ...optImg('10 kW — essentials', 6400, 'https://images.unsplash.com/photo-1610563166150-b34df4f3bcd6?w=300&h=300&fit=crop'),
            description: 'Fridge, furnace, well pump and lights.' },
          { ...optImg('14 kW — most homes', 8200, 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=300&h=300&fit=crop'),
            description: 'Adds AC and kitchen circuits — our most-installed size.' },
          { ...optImg('22 kW — whole home', 10900, 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=300&h=300&fit=crop'),
            description: 'Runs everything, including central air.' },
          { ...optImg('26 kW plus — large home', 13600, 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=300&h=300&fit=crop'),
            description: 'Multiple AC units, pool gear, large square footage.' },
        ] },
      { id: 'gen_switch', name: 'Transfer Switch', label: 'Which transfer switch?', type: 'select',
        help: 'The switch flips your home to generator power automatically.',
        options: [
          opt('Automatic 100A — essential circuits', 0),
          { ...opt('Automatic 200A — whole panel', 450), description: 'Backs up every breaker in the panel.' },
          opt('Smart load-management switch', 900),
        ] },
      { id: 'gen_fuel', name: 'Fuel Source', label: 'What will fuel it?', type: 'select',
        help: 'Natural gas is cheapest if you have a meter; propane works anywhere.',
        options: [
          { ...opt('Natural gas hookup', 0), description: 'Ties into your existing gas meter — no tank to fill.' },
          opt('Propane with new tank', 1350),
          opt('Diesel standby', 2100),
        ] },
      // show_if — tank sizing only matters on the propane branch.
      { id: 'gen_tank', name: 'Propane Tank Size', label: 'Propane tank size', type: 'select',
        help: 'Bigger tanks run longer between fills — most homes pick 500 gal.',
        options: [
          opt('250 gallon', 0),
          { ...opt('500 gallon', 650), description: 'Roughly a week of continuous backup for most homes.' },
          opt('1,000 gallon', 1500),
        ],
        show_if: { field: 'gen_fuel', op: 'eq', value: 'propane_with_new_tank' } },
      { id: 'gen_pad', name: 'Concrete Pad & Site Prep', label: 'Add concrete pad & site prep', type: 'toggle',
        help: 'A level pad with gravel skirt — required where soil shifts or floods.',
        on_value: 480 },
      { id: 'gen_extras', name: 'Extras', label: 'Climate & monitoring extras', type: 'multi_select',
        help: 'Popular add-ons — all installable later, cheapest at install time.',
        options: [
          { ...opt('Cold-weather kit', 320), description: 'Battery warmer + crankcase heater for sub-freezing starts.' },
          opt('Wi-Fi smart monitoring', 280),
          opt('Extended 10-year warranty', 1100),
        ] },
    ],
    calculations: [
      { ...calc('Generator & Install Labor', '[Generator Size]'), caption: 'Unit, rigging, electrical hookup and startup test.' },
      { ...calc('Switching & Fuel Setup', '[Transfer Switch] + [Fuel Source] + [Propane Tank Size]'), caption: 'Transfer switch, fuel hookup and tank where needed.' },
      { ...calc('Site Prep & Extras', '[Concrete Pad & Site Prep] + [Extras]'), caption: 'Pad, cold-weather kit, monitoring and warranty options.' },
      { ...calc('Total Installed Cost', '[Generator & Install Labor] + [Switching & Fuel Setup] + [Site Prep & Extras]'),
        resultMode: 'primary', caption: 'Turn-key installed price — confirmed at the free site survey.' },
    ],
    result_calc: 'Total Installed Cost',
    results: {
      heading: 'Your Generator Quote',
      show_breakdown: true,
      cta_label: 'Schedule My Free Site Survey',
      cta_heading: 'Install before the next storm season',
      cta_sub: 'Survey takes 45 minutes — we confirm gas, panel and placement, then lock your install date.',
      submit_success: 'Survey requested! Our project manager will call within one business day to schedule your visit.',
      footnote: 'Includes permit, electrical and fuel hookup, startup and county inspection. Financing available on installs over $5,000.',
    },
  },

  /* ── 52. Security & Camera Installation (BATCH 1 #3) ──
   * One template covering security_system + cctv_installation. Doorbell
   * wiring only surfaces when the video doorbell add-on is picked
   * (show_if contains). Monitoring select carries per-option descriptions. */
  {
    id: 'security_camera_install', name: 'Security & Camera Installation',
    description: 'Home security and camera system pricing by system type and camera count, with smart add-ons and monitoring plans.',
    category: 'HVAC & Mechanical', trades: ['security_system', 'cctv_installation'],
    trustBadges: [
      b('Licensed & Insured', 'shield-check'),
      b('UL-Listed Equipment', 'verified'),
      b('Background-Checked Techs', 'users'),
      b('1-Year Workmanship Warranty', 'award'),
    ],
    layout: 'two-column', theme: 'light', defaultIcon: 'ShieldCheck',
    requireAddress: true,
    // Showcase niche style — steel-indigo palette, deep-indigo result panel.
    // Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#4338ca',
      background: '#f5f6fa',
      surface: '#ffffff',
      border: '#dfe2ee',
      text: '#111827',
      resultsBg: '#1e1b4b',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'plex',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Component pricing is per-device exact — no estimate band.
        range_mode: { enabled: false, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Protect Your Home — Price a Camera & Security System', subtitle: 'UL-listed equipment · Background-checked installers · No long contracts', align: 'left' },
    steps: [
      { id: 'step_system', label: 'Your system', help: 'Pick a system style and how many cameras you need.', fields: ['sec_type', 'sec_cameras'] },
      { id: 'step_smart', label: 'Smart add-ons', help: 'Doorbells, locks and lights that tie into the same app.', fields: ['sec_addons', 'sec_doorbell_wiring'] },
      { id: 'step_monitoring', label: 'Monitoring', help: 'Who responds when something trips — you or a 24/7 center.', fields: ['sec_monitoring'] },
    ],
    fields: [
      // Image-card radio on the highest-uncertainty question (system type).
      { id: 'sec_type', name: 'System Type', label: 'Which system style fits your home?', type: 'radio',
        help: 'Wired records 24/7; wireless installs fastest — mixed covers both.',
        options: [
          { ...optImg('Wired 4K PoE', 420, 'https://images.unsplash.com/photo-1558002038-1055907df827?w=300&h=300&fit=crop'),
            description: 'Sharpest video, 24/7 local recording — needs cable runs.' },
          { ...optImg('Wireless Wi-Fi', 180, 'https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?w=300&h=300&fit=crop'),
            description: 'Fastest install and easy to expand — battery or plug-in.' },
          { ...optImg('Mixed wired + wireless', 320, 'https://images.unsplash.com/photo-1558036117-15d82a90b9b1?w=300&h=300&fit=crop'),
            description: 'Wired where it matters, wireless where it’s hard to reach.' },
        ] },
      { id: 'sec_cameras', name: 'Cameras', label: 'How many cameras?', type: 'slider',
        help: 'Most homes cover doors, driveway and yard with 4–6 cameras.',
        min: 1, max: 16, step: 1, default_value: 4, unit: 'cameras' },
      { id: 'sec_addons', name: 'Smart Add-ons', label: 'Smart security add-ons', type: 'multi_select',
        help: 'Everything controls from one app — add what you’ll actually use.',
        options: [
          { ...opt('Video doorbell', 230), description: 'See and talk to anyone at the door from your phone.' },
          opt('Smart locks — 2 doors', 310),
          opt('Motion floodlight cams', 260),
          opt('Indoor siren & keypad', 180),
        ] },
      // show_if — chime wiring only applies when the video doorbell is picked.
      { id: 'sec_doorbell_wiring', name: 'Doorbell Wiring & Chime', label: 'Add doorbell wiring & chime setup', type: 'toggle',
        help: 'For homes without existing doorbell wiring — includes transformer.',
        on_value: 90,
        show_if: { field: 'sec_addons', op: 'contains', value: 'video_doorbell' } },
      { id: 'sec_monitoring', name: 'Monitoring Plan', label: 'Who should respond to alerts?', type: 'select',
        help: 'Pro monitoring dispatches police/fire even when your phone is off.',
        options: [
          { ...opt('Self-monitored — app alerts', 0), description: 'Free push alerts to your phone; you decide what to do.' },
          { ...opt('24/7 pro monitoring — first year', 300), description: '$25/mo billed annually — live agents dispatch police & fire.' },
          { ...opt('Pro monitoring + cellular backup — first year', 420), description: 'Keeps protecting you through internet and power outages.' },
        ] },
    ],
    calculations: [
      { ...calc('Cameras & Installation', '[Cameras] * 165 + [System Type]'), caption: '$165 per camera installed, plus the system wiring base.' },
      { ...calc('Smart Devices', '[Smart Add-ons] + [Doorbell Wiring & Chime]'), caption: 'Doorbell, locks, lights and any wiring they need.' },
      { ...calc('Monitoring — First Year', '[Monitoring Plan]'), caption: 'Renews at the same monthly rate after year one.' },
      { ...calc('Total System Price', '[Cameras & Installation] + [Smart Devices] + [Monitoring — First Year]'),
        resultMode: 'primary', caption: 'Equipment, professional install and first-year monitoring.' },
    ],
    result_calc: 'Total System Price',
    results: {
      heading: 'Your Security Quote',
      show_breakdown: true,
      cta_label: 'Book My Install',
      cta_heading: 'Most installs done in one visit',
      cta_sub: 'Pick a day — your installer walks the property with you, mounts every device and sets up the app before leaving.',
      submit_success: 'You’re booked! We’ll text your install window and a pre-visit checklist within the hour.',
      footnote: 'No long-term contracts — monitoring is month-to-month after the first year. All video stays yours.',
    },
  },

  /* ── 53. Septic Pumping & Service (BATCH 1 #4) ──
   * Pumping vs inspection vs repair as image cards, with TWO show_if
   * branches: tank size only on the pumping branch, repair picker only on
   * the repair branch. */
  {
    id: 'septic_service_quote', name: 'Septic Pumping & Service',
    description: 'Septic tank pumping, inspection and repair pricing by tank size, with lid locating and effluent filter service.',
    category: 'HVAC & Mechanical', trades: ['septic_services'],
    trustBadges: [
      b('State-Licensed Septic Contractor', 'badge-check'),
      b('Fully Insured', 'shield'),
      b('Compliant Waste Disposal', 'leaf'),
      b('Same-Week Scheduling', 'calendar'),
    ],
    layout: 'two-column', theme: 'light', defaultIcon: 'Droplets',
    requireAddress: true,
    // Showcase niche style — earthy field-green palette, deep-green result
    // panel, lime CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#15803d',
      background: '#f5f7f2',
      surface: '#ffffff',
      border: '#e1e7d8',
      text: '#1a2e1a',
      resultsBg: '#14532d',
      ctaColor: '#a3e635',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'manrope',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Repairs vary until the lid is open — show a ±10% band.
        range_mode: { enabled: true, band_pct: 10 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Septic Pumping & Service — Instant Price', subtitle: 'State-licensed · Same-week service · Compliant disposal on every load', align: 'left' },
    steps: [
      { id: 'step_service', label: 'Service', help: 'What does your system need today?', fields: ['sep_service'] },
      { id: 'step_tank', label: 'Your tank', help: 'Size and access set the pump-out time on site.', fields: ['sep_tank_size', 'sep_locate'] },
      { id: 'step_repairs', label: 'Repairs & extras', help: 'Only pick what applies — we confirm everything on site.', fields: ['sep_repair', 'sep_filter'] },
    ],
    fields: [
      // Image-card radio on the highest-uncertainty question (service type).
      { id: 'sep_service', name: 'Service Needed', label: 'What does your septic system need?', type: 'radio',
        help: 'Not sure? Slow drains or odors usually start with a pump-out.',
        options: [
          { ...optImg('Tank pumping', 345, 'https://images.unsplash.com/photo-1599696848652-f0ff23bc911f?w=300&h=300&fit=crop'),
            description: 'Full pump-out & licensed disposal — recommended every 3–5 years.' },
          { ...optImg('Inspection with camera', 425, 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=300&h=300&fit=crop'),
            description: 'Point-of-sale or routine — written report with photos.' },
          { ...optImg('Repair visit', 285, 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=300&h=300&fit=crop'),
            description: 'Diagnostic plus the first hour of repair labor on site.' },
        ] },
      // show_if — tank size prices the pump-out volume (pumping branch only).
      { id: 'sep_tank_size', name: 'Tank Size', label: 'How big is your tank?', type: 'select',
        help: 'Check your county septic record if unsure — we can look it up too.',
        options: [
          { ...opt('Up to 1,000 gallons', 0), description: 'Most 2–3 bedroom homes.' },
          opt('1,250 gallons', 65),
          opt('1,500 gallons or larger', 145),
        ],
        show_if: { field: 'sep_service', op: 'eq', value: 'tank_pumping' } },
      { id: 'sep_locate', name: 'Locate & Uncover Lid', label: 'Locate & uncover the lid', type: 'toggle',
        help: 'We locate the tank and hand-dig up to 12 inches to expose the lid.',
        on_value: 125 },
      // show_if — repair picker only surfaces on the repair branch.
      { id: 'sep_repair', name: 'Repair Needed', label: 'What needs repairing?', type: 'select',
        help: 'Pick the closest match — the diagnostic confirms it before work starts.',
        options: [
          opt('Baffle replacement', 420),
          opt('Lid or riser replacement', 380),
          opt('Inlet / outlet line jetting', 350),
          { ...opt('Not sure — diagnose on site', 0), description: 'The repair-visit rate covers diagnosis; parts quoted on site.' },
        ],
        show_if: { field: 'sep_service', op: 'eq', value: 'repair_visit' } },
      { id: 'sep_filter', name: 'Effluent Filter Clean', label: 'Clean the effluent filter', type: 'toggle',
        help: 'A clogged filter is the #1 cause of slow drains between pump-outs.',
        on_value: 55 },
    ],
    calculations: [
      { ...calc('Service Visit', '[Service Needed]'), caption: 'Truck, technician and the base service you picked.' },
      { ...calc('Tank & Access', '[Tank Size] + [Locate & Uncover Lid]'), caption: 'Pump-out volume plus locating / digging to the lid.' },
      { ...calc('Repairs & Extras', '[Repair Needed] + [Effluent Filter Clean]'), caption: 'Repair parts & labor and filter service.' },
      { ...calc('Total Service Cost', '[Service Visit] + [Tank & Access] + [Repairs & Extras]'),
        resultMode: 'primary', caption: 'All-in price — no disposal or fuel surcharges added later.' },
    ],
    result_calc: 'Total Service Cost',
    results: {
      heading: 'Your Septic Quote',
      show_breakdown: true,
      cta_label: 'Schedule My Service',
      cta_heading: 'Catch it before it backs up',
      cta_sub: 'Same-week appointments — most pump-outs take under an hour once we’re on site.',
      submit_success: 'Scheduled! Dispatch will text your arrival window and a gate/access checklist shortly.',
      footnote: 'Licensed disposal included on every load. If we pump and find a repair, the visit fee credits toward the fix.',
    },
  },

  /* ── 54. Air Duct & Dryer Vent Cleaning (BATCH 1 #5) ──
   * Per-register pricing with a condition image-card radio; rooftop dryer
   * vent access only surfaces when dryer vent cleaning is toggled on
   * (show_if against a toggle: value 1 = on). */
  {
    id: 'duct_vent_cleaning', name: 'Air Duct & Dryer Vent Cleaning',
    description: 'Whole-home duct cleaning priced per register, with furnace deep-clean, sanitizing and dryer vent service.',
    category: 'HVAC & Mechanical', trades: ['duct_cleaning', 'dryer_vent_cleaning'],
    trustBadges: [
      b('NADCA Certified', 'badge-check'),
      b('Licensed & Insured', 'shield-check'),
      b('HEPA-Filtered Equipment', 'verified'),
      b('Before & After Photos', 'clipboard-check'),
    ],
    layout: 'two-column', theme: 'light', defaultIcon: 'Wind',
    requireAddress: true,
    // Showcase niche style — clean-air teal palette, deep-teal result panel.
    // Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#0e7490',
      background: '#f2f8fa',
      surface: '#ffffff',
      border: '#d9e8ee',
      text: '#0f172a',
      resultsBg: '#164e63',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'sora',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Per-register pricing is deterministic — no estimate band.
        range_mode: { enabled: false, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Breathe Easier — Price Your Duct Cleaning', subtitle: 'NADCA-certified techs · HEPA-filtered trucks · Before/after photos every job', align: 'left' },
    steps: [
      { id: 'step_home', label: 'Your home', help: 'Count your registers and tell us the duct condition.', fields: ['duct_vents', 'duct_condition'] },
      { id: 'step_system', label: 'System add-ons', help: 'The furnace cabinet and coil collect the most buildup.', fields: ['duct_furnace', 'duct_sanitize'] },
      { id: 'step_dryer', label: 'Dryer vent', help: 'Lint-clogged dryer vents are a top cause of house fires.', fields: ['duct_dryer', 'duct_rooftop'] },
    ],
    fields: [
      { id: 'duct_vents', name: 'Supply Vents', label: 'How many vents (registers)?', type: 'slider',
        help: 'Count every floor, wall and ceiling register — returns included free.',
        min: 6, max: 40, step: 1, default_value: 12, unit: 'vents' },
      // Image-card radio on the highest-uncertainty question (duct condition).
      { id: 'duct_condition', name: 'Duct Condition', label: 'How dirty are the ducts?', type: 'radio',
        help: 'Pull a register and peek — your best guess is fine.',
        options: [
          { ...optImg('Routine refresh', 0, 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=300&h=300&fit=crop'),
            description: 'Cleaned within ~5 years — standard agitation pass.' },
          { ...optImg('Heavy buildup', 110, 'https://images.unsplash.com/photo-1585060544812-6b45742d762f?w=300&h=300&fit=crop'),
            description: 'Never cleaned, pets, or visible dust plumes from vents.' },
          { ...optImg('Post-renovation dust', 190, 'https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=300&h=300&fit=crop'),
            description: 'Drywall and sawdust need a HEPA double-pass.' },
        ] },
      { id: 'duct_furnace', name: 'Furnace & Blower Deep Clean', label: 'Add furnace & blower deep clean', type: 'toggle',
        help: 'Opens the cabinet to clean the blower wheel and coil face.',
        on_value: 130 },
      { id: 'duct_sanitize', name: 'Sanitizing Fog Treatment', label: 'Add sanitizing fog treatment', type: 'toggle',
        help: 'EPA-registered antimicrobial fog — recommended after heavy buildup.',
        on_value: 95 },
      { id: 'duct_dryer', name: 'Dryer Vent Cleaning', label: 'Add dryer vent cleaning', type: 'toggle',
        help: 'Clears lint from the dryer to the exterior cap — takes ~30 minutes.',
        on_value: 129 },
      // show_if — rooftop access only matters when the dryer vent is added.
      { id: 'duct_rooftop', name: 'Rooftop Dryer Vent Access', label: 'Dryer vents through the roof', type: 'toggle',
        help: 'Roof terminations need ladder access and a cap clean-out.',
        on_value: 75,
        show_if: { field: 'duct_dryer', op: 'eq', value: 1 } },
    ],
    calculations: [
      { ...calc('Ducts & Registers', '120 + [Supply Vents] * 28'), caption: 'Trunk-line clean plus $28 per supply register.' },
      { ...calc('Condition Surcharge', '[Duct Condition]'), caption: 'Extra agitation passes for heavier buildup.' },
      { ...calc('Add-on Services', '[Furnace & Blower Deep Clean] + [Sanitizing Fog Treatment] + [Dryer Vent Cleaning] + [Rooftop Dryer Vent Access]'), caption: 'Furnace, sanitizing and dryer vent options.' },
      { ...calc('Total Cleaning Price', '[Ducts & Registers] + [Condition Surcharge] + [Add-on Services]'),
        resultMode: 'primary', caption: 'Flat price — includes before/after photos of every trunk line.' },
    ],
    result_calc: 'Total Cleaning Price',
    results: {
      heading: 'Your Duct Cleaning Quote',
      show_breakdown: true,
      cta_label: 'Book My Cleaning',
      cta_heading: 'Allergy season is coming',
      cta_sub: 'Most homes are done in 2–3 hours — you get before/after photos of every line we clean.',
      submit_success: 'Booked! We’ll text your arrival window and a quick prep checklist (clear access to registers).',
      footnote: 'NADCA-standard source-removal cleaning — negative-pressure HEPA truck, not a shop-vac. Returns cleaned free.',
    },
  },

  /* ════ TEMPLATES BATCH 2 — "Surfaces" (template-inventory spec) ════
   *
   * Five showcase-tier templates for high-intent surface trades (TOP-15 #2
   * garage floor coating, #3 asphalt paving+sealcoat, bench paver patio, #12
   * countertops, plus retaining wall). Every entry ships the FULL showcase
   * tier identical to the Batch 1 exemplars above: explicit niche style block,
   * defaultIcon + trade-true trustBadges, per-field help + option
   * descriptions, ≥1 show_if branch validated against real option ids, an
   * image-card radio / image_choice on the highest-uncertainty (material/
   * finish) question, calc captions + exactly one `resultMode: 'primary'`
   * total, results CTA block (cta_heading/cta_sub/submit_success), explicit
   * 3-step grouping with step help covering every input, and animations +
   * premium countUp/staggerReveal (no cardFlip / confetti). All four
   * material-card image URLs use curated `images.unsplash.com/photo-<id>`
   * direct URLs (each ID verified live → HTTP 200).
   */

  /* ── 55. Garage Floor Coating / Epoxy (BATCH 2 #1) ──
   * sqft × finish-tier image cards (flake / metallic / solid). Prep level
   * select; show_if surfaces the moisture-barrier upgrade only on the
   * "Heavy grinding" prep branch (failed concrete needs sealing first).
   * Range mode — slab condition isn't fully known until grinding starts. */
  {
    id: 'garage_floor_coating_quote', name: 'Garage Floor Coating — Epoxy & Polyaspartic',
    description: 'Garage floor coating priced by square footage and finish tier, with prep level, bay count and high-traffic add-ons.',
    category: 'Home Improvement', trades: ['garage_floor_coating'],
    trustBadges: [
      b('Licensed & Insured', 'shield-check'),
      b('Manufacturer-Certified Installers', 'verified'),
      b('15-Year Coating Warranty', 'award'),
      b('1-Day Polyaspartic Cure', 'clock'),
    ],
    layout: 'two-column', theme: 'light', defaultIcon: 'LayoutGrid',
    requireAddress: true,
    // Showcase niche style — slate-graphite body, near-black result panel,
    // electric-blue CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#2563eb',
      background: '#f5f6f8',
      surface: '#ffffff',
      border: '#e0e3e9',
      text: '#111827',
      resultsBg: '#0f172a',
      ctaColor: '#38bdf8',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'geist',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Slab condition (cracks, oil, moisture) is found at grinding — ±10%.
        range_mode: { enabled: true, band_pct: 10 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Price Your Garage Floor Coating in 60 Seconds', subtitle: 'Manufacturer-certified installers · 15-year warranty · Drive on it in 24 hours', align: 'left' },
    steps: [
      { id: 'step_floor', label: 'Your floor', help: 'Garage size and the finish you want underfoot.', fields: ['gfc_size', 'gfc_finish'] },
      { id: 'step_prep', label: 'Prep & condition', help: 'How the slab is prepped sets adhesion and warranty.', fields: ['gfc_prep', 'gfc_moisture'] },
      { id: 'step_extras', label: 'Coverage & extras', help: 'Bay count and optional high-traffic upgrades.', fields: ['gfc_bays', 'gfc_addons'] },
    ],
    fields: [
      { id: 'gfc_size', name: 'Floor Area', label: 'Garage floor area (sq ft)', type: 'slider',
        help: 'A standard 2-car garage is about 400–480 sq ft.',
        min: 200, max: 1400, step: 20, default_value: 440, unit: 'sq ft' },
      // image_choice on the highest-uncertainty question (finish tier).
      { id: 'gfc_finish', name: 'Finish Tier', label: 'Which finish do you want?', type: 'image_choice',
        help: 'Flake hides imperfections; metallic is a showroom look; solid is clean and simple.',
        options: [
          { ...optImg('Solid color', 3, 'https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=300&h=300&fit=crop'),
            description: 'One-coat solid epoxy — clean, budget-friendly garage finish.' },
          { ...optImg('Decorative flake', 5, 'https://images.unsplash.com/photo-1632759145351-1d592919f522?w=300&h=300&fit=crop'),
            description: 'Broadcast color flake in a clear topcoat — hides cracks, best-seller.' },
          { ...optImg('Metallic epoxy', 8, 'https://images.unsplash.com/photo-1604014237800-1c9102c219da?w=300&h=300&fit=crop'),
            description: 'Marbled metallic pigment — high-gloss showroom look.' },
        ] },
      { id: 'gfc_prep', name: 'Surface Prep', label: 'How is the slab now?', type: 'select',
        help: 'Diamond grinding is the gold standard — it opens the concrete for a permanent bond.',
        options: [
          { ...opt('Good — light diamond grind', 0), description: 'Clean, sound slab — standard mechanical prep.' },
          { ...opt('Stained / oily — degrease + grind', 220), description: 'Oil-soaked slabs need degreasing before coating.' },
          { ...opt('Heavy grinding + crack repair', 480), description: 'Pitted or cracked slab — fill, patch and aggressive grind.' },
        ] },
      // show_if — moisture barrier only matters on heavily-ground / failed slabs.
      { id: 'gfc_moisture', name: 'Moisture Barrier Primer', label: 'Add moisture-barrier primer', type: 'toggle',
        help: 'Older slabs without a vapor barrier can push moisture and delaminate — this seals it first.',
        on_value: 1.5,
        show_if: { field: 'gfc_prep', op: 'eq', value: 'heavy_grinding_crack_repair' } },
      { id: 'gfc_bays', name: 'Garage Bays', label: 'How many bays?', type: 'select',
        help: 'Bay count sets crew size and mix volume for the day.',
        options: [
          opt('1 bay', 0),
          { ...opt('2 bays', 150), description: 'The most common garage — single-day install.' },
          opt('3+ bays', 350),
        ] },
      { id: 'gfc_addons', name: 'Add-ons', label: 'High-traffic upgrades', type: 'multi_select',
        help: 'Optional — all installable now, cheapest while the crew is on site.',
        options: [
          { ...opt('Anti-slip aggregate', 120), description: 'Fine grit in the topcoat — grippy when wet, garage-safe.' },
          opt('Extra-thick polyaspartic topcoat', 260),
          opt('Cove base / wall trim', 180),
        ] },
    ],
    calculations: [
      { ...calc('Coating & Material', '[Floor Area] * [Finish Tier]'), caption: 'Per-square-foot coating cost at your chosen finish tier.' },
      { ...calc('Prep Work', '[Surface Prep] + [Floor Area] * [Moisture Barrier Primer]'), caption: 'Grinding, repairs and any moisture-barrier sealing.' },
      { ...calc('Coverage & Extras', '[Garage Bays] + [Add-ons]'), caption: 'Bay coverage and optional high-traffic upgrades.' },
      { ...calc('Total Coating Price', '[Coating & Material] + [Prep Work] + [Coverage & Extras]'),
        resultMode: 'primary', caption: 'Installed price — confirmed at a quick on-site slab check.' },
    ],
    result_calc: 'Total Coating Price',
    results: {
      heading: 'Your Garage Floor Quote',
      show_breakdown: true,
      cta_label: 'Book My Garage Floor',
      cta_heading: 'Most garages coat in a single day',
      cta_sub: 'Pick a date — we grind, coat and topcoat, and you drive on it within 24 hours.',
      submit_success: 'Booked! Your project lead will call within one business day to confirm color, prep and your install date.',
      footnote: 'Includes diamond grinding, base coat, color and clear topcoat. 15-year manufacturer warranty on the coating system.',
    },
  },

  /* ── 56. Asphalt Paving & Sealcoating (BATCH 2 #2) ──
   * Service-type radio (new paving vs sealcoat) drives TWO show_if branches:
   * paving reveals depth/base prep, sealcoat reveals coat count. Distinct by
   * NAME + id from the existing "Driveway Paving — Multi-Surface" template
   * (collapse is name-keyed). Range mode — sub-base condition varies. */
  {
    id: 'asphalt_paving_sealcoat', name: 'Asphalt Paving & Sealcoating',
    description: 'Asphalt driveway pricing for new paving or sealcoating, by square footage, depth, base prep and crack repair.',
    category: 'Construction', trades: ['asphalt_driveway', 'driveway_sealing'],
    trustBadges: BADGES.driveway_concrete,
    layout: 'two-column', theme: 'light', defaultIcon: 'Construction',
    requireAddress: true,
    // Showcase niche style — warm-asphalt charcoal body, near-black result
    // panel, safety-amber CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#374151',
      background: '#f6f6f5',
      surface: '#ffffff',
      border: '#e3e3e1',
      text: '#1c1917',
      resultsBg: '#1f2937',
      ctaColor: '#f59e0b',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'inter',
      fieldStyle: 'filled',
      radius: 10,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Sub-base condition is found once the old surface is up — ±10%.
        range_mode: { enabled: true, band_pct: 10 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Asphalt Driveway — Paving or Sealcoat Price Now', subtitle: 'Licensed paving crews · 10-year workmanship warranty · Free on-site measure', align: 'left' },
    steps: [
      { id: 'step_service', label: 'Service', help: 'New asphalt, or refresh and protect what you have.', fields: ['asp_service', 'asp_area'] },
      { id: 'step_paving', label: 'Build-up', help: 'Depth and base prep set the life of new asphalt.', fields: ['asp_depth', 'asp_base'] },
      { id: 'step_finish', label: 'Sealcoat & extras', help: 'Coats, crack repair and edging options.', fields: ['asp_coats', 'asp_extras'] },
    ],
    fields: [
      // image_choice on the branching question (the whole quote forks here).
      { id: 'asp_service', name: 'Service Type', label: 'What does your driveway need?', type: 'image_choice',
        help: 'New paving rebuilds the surface; sealcoating protects asphalt that’s still sound.',
        options: [
          { ...optImg('New asphalt paving', 7, 'https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?w=300&h=300&fit=crop'),
            description: 'Tear-out and fresh hot-mix asphalt — priced per square foot.' },
          { ...optImg('Sealcoat & protect', 0.35, 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=300&fit=crop'),
            description: 'Refresh and protect existing asphalt — extends its life 3–5 years.' },
        ] },
      { id: 'asp_area', name: 'Driveway Area', label: 'Driveway area (sq ft)', type: 'slider',
        help: 'A typical 2-car driveway is around 600 sq ft. Pace it off if unsure.',
        min: 200, max: 4000, step: 50, default_value: 600, unit: 'sq ft' },
      // show_if — depth only matters for NEW paving.
      { id: 'asp_depth', name: 'Asphalt Depth', label: 'Asphalt thickness', type: 'select',
        help: 'Thicker mats carry heavier loads — 3" suits most residential driveways.',
        options: [
          { ...opt('2" residential', 0), description: 'Light-use cars only — minimum residential depth.' },
          { ...opt('3" standard', 1.5), description: 'The most-paved residential depth — cars and light trucks.' },
          opt('4" heavy-duty / RV', 3),
        ],
        show_if: { field: 'asp_service', op: 'eq', value: 'new_asphalt_paving' } },
      // show_if — base prep only matters for NEW paving.
      { id: 'asp_base', name: 'Base Preparation', label: 'Base / sub-grade prep', type: 'select',
        help: 'A compacted stone base is what keeps new asphalt from cracking.',
        options: [
          { ...opt('Re-pave over solid base', 0), description: 'Existing base is sound — overlay only.' },
          { ...opt('New 4" crushed-stone base', 2), description: 'Standard for a full rebuild — graded and compacted.' },
          opt('Excavate + rebuild soft sub-grade', 3.5),
        ],
        show_if: { field: 'asp_service', op: 'eq', value: 'new_asphalt_paving' } },
      // show_if — coat count only matters for SEALCOATING.
      { id: 'asp_coats', name: 'Sealcoat Coats', label: 'How many sealcoat coats?', type: 'select',
        help: 'Two coats last longer on older or porous asphalt.',
        options: [
          { ...opt('One coat', 0), description: 'Good for asphalt sealed within the last 2–3 years.' },
          { ...opt('Two coats', 0.18), description: 'Recommended for older or never-sealed driveways.' },
        ],
        show_if: { field: 'asp_service', op: 'eq', value: 'sealcoat_protect' } },
      { id: 'asp_extras', name: 'Extras', label: 'Repairs & finishing', type: 'multi_select',
        help: 'Crack filling and edging — cheapest done with the crew on site.',
        options: [
          { ...opt('Crack filling & pothole patch', 180), description: 'Rout and hot-rubber fill before the surface coat.' },
          opt('Paver / Belgian-block edging', 420),
          opt('Re-stripe lines & numbers', 95),
        ] },
    ],
    calculations: [
      { ...calc('Surface Work', '[Driveway Area] * ([Service Type] + [Asphalt Depth] + [Sealcoat Coats])'), caption: 'Per-square-foot paving or sealcoat at your chosen build-up.' },
      { ...calc('Base Preparation', '[Driveway Area] * [Base Preparation]'), caption: 'Stone base and sub-grade work for new asphalt.' },
      { ...calc('Repairs & Finishing', '[Extras]'), caption: 'Crack repair, edging and striping options.' },
      { ...calc('Total Driveway Price', '[Surface Work] + [Base Preparation] + [Repairs & Finishing]'),
        resultMode: 'primary', caption: 'Installed price — confirmed at a free on-site measure.' },
    ],
    result_calc: 'Total Driveway Price',
    results: {
      heading: 'Your Driveway Quote',
      show_breakdown: true,
      cta_label: 'Book My Free Measure',
      cta_heading: 'Paving season books up fast',
      cta_sub: 'We measure on site, confirm depth and base, then lock your install or sealcoat date.',
      submit_success: 'Requested! Our estimator will call within one business day to schedule your free measure.',
      footnote: 'New paving includes tear-out, base, hot-mix asphalt and compaction. 10-year workmanship warranty on paving.',
    },
  },

  /* ── 57. Paver Patio & Walkway (BATCH 2 #3) ──
   * Paver-style image cards; sqft slider; base-prep select. show_if surfaces
   * the firepit kit picker only when "Firepit" is chosen in the add-ons
   * multi_select (contains). Range mode — excavation/grade varies on site. */
  {
    id: 'paver_patio_walkway', name: 'Paver Patio & Walkway',
    description: 'Paver patio and walkway pricing by square footage and paver style, with base prep, borders and firepit add-ons.',
    category: 'Outdoor', trades: ['interlocking_pavers', 'patio_installation', 'stamped_concrete'],
    trustBadges: [
      b('Licensed & Insured', 'shield-check'),
      b('ICPI-Certified Installers', 'verified'),
      b('Lifetime Paver Warranty', 'award'),
      b('Free 3D Design Preview', 'thumbs-up'),
    ],
    layout: 'two-column', theme: 'light', defaultIcon: 'Grid3x3',
    requireAddress: true,
    // Showcase niche style — sandstone-warm body, deep-stone result panel,
    // terracotta CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#b45309',
      background: '#f8f5f0',
      surface: '#ffffff',
      border: '#eae3d7',
      text: '#1c1917',
      resultsBg: '#3f3326',
      ctaColor: '#f59e0b',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Excavation depth and grade vary until the layout is staked — ±10%.
        range_mode: { enabled: true, band_pct: 10 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Design Your Paver Patio — Instant Price', subtitle: 'ICPI-certified installers · Lifetime paver warranty · Free 3D design preview', align: 'left' },
    steps: [
      { id: 'step_layout', label: 'Size & style', help: 'How big, and which paver look you’re after.', fields: ['ppw_area', 'ppw_style'] },
      { id: 'step_base', label: 'Base & border', help: 'The base is what keeps pavers level for decades.', fields: ['ppw_base', 'ppw_border'] },
      { id: 'step_extras', label: 'Features', help: 'Optional living-space features for your patio.', fields: ['ppw_addons', 'ppw_firepit'] },
    ],
    fields: [
      { id: 'ppw_area', name: 'Paved Area', label: 'Patio / walkway area (sq ft)', type: 'slider',
        help: 'A comfortable dining patio is about 250–400 sq ft.',
        min: 60, max: 1200, step: 10, default_value: 300, unit: 'sq ft' },
      // image_choice on the highest-uncertainty question (paver style).
      { id: 'ppw_style', name: 'Paver Style', label: 'Which paver style?', type: 'image_choice',
        help: 'Style sets the per-square-foot material cost — premium pavers cost more but last a lifetime.',
        options: [
          { ...optImg('Standard concrete paver', 14, 'https://images.unsplash.com/photo-1597047084897-51e81819a499?w=300&h=300&fit=crop'),
            description: 'Classic interlocking pavers — durable and budget-friendly.' },
          { ...optImg('Tumbled / cobble', 18, 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=300&h=300&fit=crop'),
            description: 'Old-world tumbled edges — soft, rounded, premium look.' },
          { ...optImg('Large-format porcelain', 24, 'https://images.unsplash.com/photo-1556909211-36987daf7b4d?w=300&h=300&fit=crop'),
            description: 'Modern oversized slabs — sleek, stain-proof, top-tier.' },
        ] },
      { id: 'ppw_base', name: 'Base Preparation', label: 'Base build-up', type: 'select',
        help: 'A deep compacted base is the #1 factor in a patio that never heaves.',
        options: [
          { ...opt('Standard 6" base', 0), description: 'Right for foot-traffic patios and walkways.' },
          { ...opt('Heavy 8–10" base (clay / frost)', 4), description: 'For clay soils or freeze-thaw climates.' },
          opt('Permeable base (drainage)', 7),
        ] },
      { id: 'ppw_border', name: 'Border / Soldier Course', label: 'Decorative border', type: 'select',
        help: 'A contrasting border frames the patio and locks the field pavers.',
        options: [
          opt('No border', 0),
          { ...opt('Single soldier course', 6), description: 'One row of contrasting pavers around the edge.' },
          opt('Double border + inlay', 11),
        ] },
      { id: 'ppw_addons', name: 'Features', label: 'Outdoor living features', type: 'multi_select',
        help: 'Add the features you want — each is cheapest built with the patio.',
        options: [
          { ...opt('Firepit', 0), description: 'Adds a paver firepit — pick a kit on the next question.' },
          opt('Seat wall (per 10 ft)', 1400),
          opt('Step / landing', 650),
          opt('Landscape lighting', 480),
        ] },
      // show_if — firepit kit picker only surfaces when "Firepit" is ticked.
      { id: 'ppw_firepit', name: 'Firepit Kit', label: 'Which firepit kit?', type: 'select',
        help: 'Wood-burning is simplest; gas adds a plumbed line and burner.',
        options: [
          { ...opt('Wood-burning paver kit', 900), description: 'Round or square modular kit — no gas line needed.' },
          opt('Gas firepit + burner', 2200),
        ],
        show_if: { field: 'ppw_addons', op: 'contains', value: 'firepit' } },
    ],
    calculations: [
      { ...calc('Pavers & Installation', '[Paved Area] * ([Paver Style] + [Base Preparation] + [Border / Soldier Course])'), caption: 'Per-square-foot pavers, base build-up and border course.' },
      { ...calc('Outdoor Features', '[Features] + [Firepit Kit]'), caption: 'Seat walls, steps, lighting and any firepit kit.' },
      { ...calc('Total Patio Price', '[Pavers & Installation] + [Outdoor Features]'),
        resultMode: 'primary', caption: 'Installed price — confirmed after a free on-site design visit.' },
    ],
    result_calc: 'Total Patio Price',
    results: {
      heading: 'Your Paver Patio Quote',
      show_breakdown: true,
      cta_label: 'Book My Free Design Visit',
      cta_heading: 'See it in 3D before you commit',
      cta_sub: 'We measure, stake the layout and send a free 3D design preview before any work begins.',
      submit_success: 'Requested! Our designer will call within one business day to schedule your free on-site visit.',
      footnote: 'Includes excavation, compacted base, paver installation, polymeric sand and edge restraint. Lifetime paver warranty.',
    },
  },

  /* ── 58. Retaining Wall Installation (BATCH 2 #4) ──
   * Wall material image cards (block / natural stone / timber); the
   * high-uncertainty driver is linear feet × height. show_if surfaces the
   * tiered-engineering note when height ≥ 4 ft (code/permit threshold).
   * Range mode — excavation + drainage depth vary on site. */
  {
    id: 'retaining_wall_quote', name: 'Retaining Wall Installation',
    description: 'Retaining wall pricing by material, linear feet and height, with drainage, geo-grid reinforcement and step-downs.',
    category: 'Outdoor', trades: ['retaining_wall'],
    trustBadges: [
      b('Licensed & Insured', 'shield-check'),
      b('Engineered for Walls Over 4 ft', 'verified'),
      b('Lifetime Block Warranty', 'award'),
      b('Free On-Site Survey', 'thumbs-up'),
    ],
    layout: 'two-column', theme: 'light', defaultIcon: 'BrickWall',
    requireAddress: true,
    // Showcase niche style — stone-grey body, deep-slate result panel,
    // moss-green CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#57534e',
      background: '#f5f5f4',
      surface: '#ffffff',
      border: '#e2e1de',
      text: '#1c1917',
      resultsBg: '#292524',
      ctaColor: '#84cc16',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'manrope',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Excavation, drainage depth and soil retention vary on site — ±10%.
        range_mode: { enabled: true, band_pct: 10 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Price Your Retaining Wall in 60 Seconds', subtitle: 'Engineered builds · Lifetime block warranty · Free on-site survey', align: 'left' },
    steps: [
      { id: 'step_wall', label: 'Material & size', help: 'The material and the wall’s footprint drive most of the price.', fields: ['rw_material', 'rw_length', 'rw_height'] },
      { id: 'step_engineering', label: 'Drainage & structure', help: 'Taller walls need drainage and reinforcement to last.', fields: ['rw_drainage', 'rw_geogrid'] },
      { id: 'step_extras', label: 'Finishing', help: 'Optional steps, caps and lighting.', fields: ['rw_addons'] },
    ],
    fields: [
      // image_choice on the highest-uncertainty driver (wall material).
      { id: 'rw_material', name: 'Wall Material', label: 'Which wall material?', type: 'image_choice',
        help: 'Material sets the per-square-foot face cost and the look of the finished wall.',
        options: [
          { ...optImg('Segmental block', 32, 'https://images.unsplash.com/photo-1615529182904-14819c35db37?w=300&h=300&fit=crop'),
            description: 'Engineered interlocking block — most popular, fastest to build.' },
          { ...optImg('Natural stone', 52, 'https://images.unsplash.com/photo-1556912173-3bb406ef7e77?w=300&h=300&fit=crop'),
            description: 'Hand-laid quarried stone — premium, organic look.' },
          { ...optImg('Pressure-treated timber', 24, 'https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=300&h=300&fit=crop'),
            description: 'Treated timber ties — budget option for shorter walls.' },
        ] },
      { id: 'rw_length', name: 'Wall Length', label: 'Wall length (linear ft)', type: 'slider',
        help: 'Measure along the base of where the wall will run.',
        min: 10, max: 200, step: 5, default_value: 40, unit: 'ft' },
      { id: 'rw_height', name: 'Wall Height', label: 'Average wall height (ft)', type: 'slider',
        help: 'Height is the biggest cost driver — taller walls need engineering. Measure at the tallest point.',
        min: 2, max: 10, step: 1, default_value: 3, unit: 'ft' },
      { id: 'rw_drainage', name: 'Drainage System', label: 'Drainage build-up', type: 'select',
        help: 'Gravel backfill and a drain pipe are what keep a wall from bowing — skip at your own risk.',
        options: [
          { ...opt('Standard gravel + drain pipe', 0), description: 'Included on every wall we build — the right default.' },
          { ...opt('Heavy drainage (wet / clay site)', 12), description: 'Extra gravel chimney and outlets for saturated soils.' },
        ] },
      // show_if — geo-grid reinforcement only matters once height ≥ 4 ft.
      { id: 'rw_geogrid', name: 'Geo-Grid Reinforcement', label: 'Add engineered geo-grid reinforcement', type: 'toggle',
        help: 'Walls 4 ft and taller need geo-grid tied back into the soil — usually code-required.',
        on_value: 14,
        show_if: { field: 'rw_height', op: 'gte', value: 4 } },
      { id: 'rw_addons', name: 'Finishing', label: 'Finishing touches', type: 'multi_select',
        help: 'Optional finishing — cheapest built with the wall.',
        options: [
          { ...opt('Capstones', 450), description: 'Finished cap course along the full wall top.' },
          opt('Steps / tiered transition', 850),
          opt('Integrated wall lighting', 520),
        ] },
    ],
    calculations: [
      { ...calc('Wall Face & Material', '[Wall Length] * [Wall Height] * ([Wall Material] + [Drainage System] + [Geo-Grid Reinforcement])'), caption: 'Square-foot wall face × material, drainage and reinforcement.' },
      { ...calc('Capstones & Finishing', '[Finishing]'), caption: 'Caps, steps and lighting options.' },
      { ...calc('Total Wall Price', '[Wall Face & Material] + [Capstones & Finishing]'),
        resultMode: 'primary', caption: 'Installed price — confirmed at a free on-site survey.' },
    ],
    result_calc: 'Total Wall Price',
    results: {
      heading: 'Your Retaining Wall Quote',
      show_breakdown: true,
      cta_label: 'Book My Free Survey',
      cta_heading: 'Walls over 4 ft need engineering',
      cta_sub: 'We survey grade and soil on site, confirm drainage and reinforcement, then lock your build date.',
      submit_success: 'Requested! Our project lead will call within one business day to schedule your free site survey.',
      footnote: 'Includes excavation, base, drainage gravel, drain pipe and block installation. Engineering quoted for walls over 4 ft.',
    },
  },

  /* ── 59. Countertop Installation (BATCH 2 #5) ──
   * The image_choice materials showcase (laminate / quartz / granite /
   * marble) — the per-square-foot driver. Edge-profile select with
   * per-option descriptions; sink-cutout count; show_if surfaces the
   * waterfall-edge upgrade only for the premium stone branches (quartz /
   * granite / marble). */
  {
    id: 'countertop_installation', name: 'Countertop Installation',
    description: 'Countertop pricing by material and square footage, with edge profile, sink cutouts and backsplash.',
    category: 'Home Improvement', trades: ['countertops'],
    trustBadges: [
      b('Licensed & Insured', 'shield-check'),
      b('Certified Stone Fabricators', 'verified'),
      b('Digital Laser Templating', 'badge-check'),
      b('Lifetime Sealant Warranty', 'award'),
    ],
    layout: 'two-column', theme: 'light', defaultIcon: 'Square',
    requireAddress: true,
    // Showcase niche style — warm-marble cream body, deep-espresso result
    // panel, brass CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#9a3412',
      background: '#f9f6f1',
      surface: '#ffffff',
      border: '#ece4d8',
      text: '#1c1917',
      resultsBg: '#292018',
      ctaColor: '#d97706',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'jakarta',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Slab pricing is per-sq-ft exact once material is picked — no band.
        range_mode: { enabled: false, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Price Your New Countertops in 60 Seconds', subtitle: 'Certified fabricators · Laser-templated · Lifetime sealant warranty', align: 'left' },
    steps: [
      { id: 'step_material', label: 'Material & size', help: 'Pick a material and tell us roughly how much surface you have.', fields: ['ctp_material', 'ctp_area'] },
      { id: 'step_edge', label: 'Edges & cutouts', help: 'Edge profile and how many sinks or cooktops drop in.', fields: ['ctp_edge', 'ctp_cutouts', 'ctp_waterfall'] },
      { id: 'step_finish', label: 'Backsplash & extras', help: 'Optional backsplash and demo of the old tops.', fields: ['ctp_backsplash', 'ctp_demo'] },
    ],
    fields: [
      // image_choice — the materials showcase, per-sq-ft pricing driver.
      { id: 'ctp_material', name: 'Material', label: 'Which countertop material?', type: 'image_choice',
        help: 'Material is the biggest cost driver — quartz is the most popular for its durability.',
        options: [
          { ...optImg('Laminate', 28, 'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=300&h=300&fit=crop'),
            description: 'Budget-friendly, hundreds of patterns — great for rentals and laundry rooms.' },
          { ...optImg('Quartz (engineered)', 70, 'https://images.unsplash.com/photo-1600210492493-0946911123ea?w=300&h=300&fit=crop'),
            description: 'Non-porous, no sealing, most consistent look — our best-seller.' },
          { ...optImg('Granite', 60, 'https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=300&h=300&fit=crop'),
            description: 'Natural stone, each slab unique — heat-proof, needs periodic sealing.' },
          { ...optImg('Marble', 95, 'https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?w=300&h=300&fit=crop'),
            description: 'Classic luxury veining — softest stone, best for baking and baths.' },
        ] },
      { id: 'ctp_area', name: 'Counter Area', label: 'Countertop area (sq ft)', type: 'slider',
        help: 'An average kitchen runs 40–55 sq ft including the island.',
        min: 15, max: 150, step: 5, default_value: 45, unit: 'sq ft' },
      { id: 'ctp_edge', name: 'Edge Profile', label: 'Which edge profile?', type: 'select',
        help: 'The edge is the detail you’ll touch every day — fancier profiles take more fabrication time.',
        options: [
          { ...opt('Eased / straight', 0), description: 'Clean square edge with a softened top — included.' },
          { ...opt('Beveled', 6), description: 'A 45° angled cut — subtle, modern detail.' },
          { ...opt('Bullnose (rounded)', 9), description: 'Fully rounded edge — soft and family-friendly.' },
          { ...opt('Ogee (decorative)', 16), description: 'Carved S-curve — the premium, traditional look.' },
        ] },
      { id: 'ctp_cutouts', name: 'Sink & Cooktop Cutouts', label: 'How many sink / cooktop cutouts?', type: 'select',
        help: 'Each undermount sink, drop-in cooktop or faucet hole is cut and polished by hand.',
        options: [
          opt('1 cutout', 0),
          { ...opt('2 cutouts', 150), description: 'Typical kitchen — one sink plus a cooktop.' },
          opt('3+ cutouts', 320),
        ] },
      // show_if — waterfall edge only offered on premium stone materials.
      { id: 'ctp_waterfall', name: 'Waterfall Island Edge', label: 'Add a waterfall island edge', type: 'toggle',
        help: 'The slab runs vertically down the island sides — a high-end stone feature.',
        on_value: 1200,
        show_if: { field: 'ctp_material', op: 'ne', value: 'laminate' } },
      { id: 'ctp_backsplash', name: 'Matching Backsplash', label: 'Add a matching slab backsplash', type: 'select',
        help: 'A slab backsplash in the same material — no grout lines to clean.',
        options: [
          opt('No slab backsplash', 0),
          { ...opt('4" standard backsplash', 14), description: 'Per linear foot — the classic short backsplash.' },
          opt('Full-height backsplash', 38),
        ] },
      { id: 'ctp_demo', name: 'Remove Old Countertops', label: 'Remove & dispose of old countertops', type: 'toggle',
        help: 'We tear out and haul away the existing tops the day we template-install.',
        on_value: 220 },
    ],
    calculations: [
      { ...calc('Material & Fabrication', '[Counter Area] * ([Material] + [Edge Profile] + [Matching Backsplash])'), caption: 'Per-square-foot material, edge fabrication and any slab backsplash.' },
      { ...calc('Cutouts & Features', '[Sink & Cooktop Cutouts] + [Waterfall Island Edge]'), caption: 'Hand-cut sink/cooktop openings and any waterfall edge.' },
      { ...calc('Removal', '[Remove Old Countertops]'), caption: 'Tear-out and disposal of the old countertops.' },
      { ...calc('Total Countertop Price', '[Material & Fabrication] + [Cutouts & Features] + [Removal]'),
        resultMode: 'primary', caption: 'Installed price — confirmed after free laser templating.' },
    ],
    result_calc: 'Total Countertop Price',
    results: {
      heading: 'Your Countertop Quote',
      show_breakdown: true,
      cta_label: 'Book My Free Templating',
      cta_heading: 'See real slabs before you decide',
      cta_sub: 'We laser-template your kitchen and help you pick the exact slab — install is usually one week later.',
      submit_success: 'Booked! Your design consultant will call within one business day to schedule your free templating visit.',
      footnote: 'Includes laser templating, fabrication, professional installation and seam finishing. Lifetime sealant warranty on stone.',
    },
  },

  /* ════ TEMPLATES BATCH 3 — "Outdoor / Seasonal" (template-inventory spec) ════
   *
   * Five showcase-tier templates for high-intent outdoor / seasonal trades
   * (TOP-15 #7 irrigation, #8 snow removal — the dual-branch show_if showcase,
   * #9 holiday lighting, #14 artificial turf, #5 foundation repair + basement
   * waterproofing — one template, two canonical reno trade ids). Every entry
   * ships the FULL showcase tier identical to the Batch 1–2 exemplars above:
   * explicit niche style block, defaultIcon + trade-true trustBadges, per-field
   * help on every input + ≥1 option description, ≥1 show_if branch validated
   * against real option ids, an image-card radio / image_choice on the highest-
   * uncertainty question, calc captions + exactly one `resultMode: 'primary'`
   * total, results CTA block (cta_heading/cta_sub/submit_success), explicit
   * 3-step grouping with step help covering every input, and animations +
   * premium countUp/staggerReveal (no cardFlip / confetti). All image-card URLs
   * reuse curated `images.unsplash.com/photo-<id>` direct URLs already proven
   * live in the production catalogue (Batch 0–2).
   */

  /* ── 60. Irrigation / Sprinkler System (BATCH 3 #1) ──
   * zones count is the driver; system-type image cards (new install vs repair);
   * smart vs standard controller; backflow add-on. show_if forks the build:
   * a NEW install reveals trenching/heads-per-zone, a REPAIR reveals the
   * zone-count being serviced. */
  {
    id: 'irrigation_sprinkler_system', name: 'Irrigation & Sprinkler System',
    description: 'Sprinkler system pricing by zone count and job type, with smart-controller, backflow and per-zone trenching options.',
    category: 'Outdoor', trades: ['irrigation_sprinklers'],
    trustBadges: [
      b('Licensed & Insured', 'shield-check'),
      b('Certified Backflow Testers', 'verified'),
      b('Water-Sense Partner', 'leaf'),
      b('Free On-Site Design', 'thumbs-up'),
    ],
    layout: 'two-column', theme: 'light', defaultIcon: 'Droplets',
    requireAddress: true,
    // Showcase niche style — fresh irrigation green body, deep-evergreen
    // result panel, sky-blue CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#0e7490',
      background: '#f3f8f6',
      surface: '#ffffff',
      border: '#d9e8e2',
      text: '#14211c',
      resultsBg: '#103b30',
      ctaColor: '#0891b2',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Trenching distance and soil vary until the site walk — ±10%.
        range_mode: { enabled: true, band_pct: 10 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Sprinkler System — Price Your Install or Repair', subtitle: 'Licensed irrigation pros · Certified backflow testing · Free on-site design', align: 'left' },
    steps: [
      { id: 'step_job', label: 'Job type', help: 'A brand-new system, or service for one you already have.', fields: ['irr_job', 'irr_zones'] },
      { id: 'step_install', label: 'Build details', help: 'Trenching and controller choices for a new install.', fields: ['irr_trenching', 'irr_controller'] },
      { id: 'step_extras', label: 'Compliance & extras', help: 'Backflow testing and finishing add-ons.', fields: ['irr_backflow', 'irr_extras'] },
    ],
    fields: [
      // image_choice on the branching question (the whole quote forks here).
      { id: 'irr_job', name: 'Job Type', label: 'What do you need done?', type: 'image_choice',
        help: 'New systems are priced per zone; repairs are priced per zone serviced.',
        options: [
          { ...optImg('New system install', 850, 'https://images.unsplash.com/photo-1599696848652-f0ff23bc911f?w=300&h=300&fit=crop'),
            description: 'Full design and install — heads, valves, controller and backflow.' },
          { ...optImg('Repair / tune-up', 120, 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=300&h=300&fit=crop'),
            description: 'Diagnose and fix broken heads, leaks or valves on an existing system.' },
        ] },
      { id: 'irr_zones', name: 'Number of Zones', label: 'How many watering zones?', type: 'slider',
        help: 'A typical quarter-acre lawn runs 4–6 zones. Unsure? We confirm on site.',
        min: 1, max: 16, step: 1, default_value: 5, unit: 'zones' },
      // show_if — trenching only matters for a NEW install.
      { id: 'irr_trenching', name: 'Trenching Difficulty', label: 'Yard / trenching conditions', type: 'select',
        help: 'Rocky or root-bound soil takes longer to trench and lay pipe.',
        options: [
          { ...opt('Open lawn — easy trenching', 0), description: 'Soft, clear soil — standard pipe-pulling.' },
          opt('Some obstacles / hardpan', 35),
          opt('Rocky or heavy roots', 75),
        ],
        show_if: { field: 'irr_job', op: 'eq', value: 'new_system_install' } },
      // show_if — controller upgrade is a new-install choice.
      { id: 'irr_controller', name: 'Controller', label: 'Which controller?', type: 'radio',
        help: 'Smart controllers adjust to weather and cut water bills 20–30%.',
        options: [
          { ...optImg('Standard timer', 0, 'https://images.unsplash.com/photo-1558002038-1055907df827?w=300&h=300&fit=crop'),
            description: 'Reliable fixed-schedule timer — lowest up-front cost.' },
          { ...optImg('Smart Wi-Fi controller', 240, 'https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?w=300&h=300&fit=crop'),
            description: 'App-controlled, weather-aware — qualifies for many water rebates.' },
        ],
        show_if: { field: 'irr_job', op: 'eq', value: 'new_system_install' } },
      { id: 'irr_backflow', name: 'Backflow Preventer', label: 'Add backflow preventer & test', type: 'toggle',
        help: 'Required by code on most municipal water connections.',
        on_value: 320 },
      { id: 'irr_extras', name: 'Extras', label: 'Finishing add-ons', type: 'multi_select',
        help: 'Optional — pick only what your yard needs.',
        options: [
          { ...opt('Drip line for beds & borders', 280), description: 'Low-flow drip tubing for planting beds.' },
          opt('Rain / soil-moisture sensor', 130),
          opt('Winterization (first blow-out)', 95),
        ] },
    ],
    calculations: [
      { ...calc('Zones & Heads', '[Number of Zones] * ([Job Type] + [Trenching Difficulty])'), caption: 'Per-zone heads, valves and pipe at your job type and soil.' },
      { ...calc('Controller & Backflow', '[Controller] + [Backflow Preventer]'), caption: 'Controller choice plus code-required backflow protection.' },
      { ...calc('Finishing Add-ons', '[Extras]'), caption: 'Drip lines, sensors and winterization.' },
      { ...calc('Total System Price', '[Zones & Heads] + [Controller & Backflow] + [Finishing Add-ons]'),
        resultMode: 'primary', caption: 'Installed price — confirmed at a free on-site design walk.' },
    ],
    result_calc: 'Total System Price',
    results: {
      heading: 'Your Sprinkler Quote',
      show_breakdown: true,
      cta_label: 'Book My Free Design',
      cta_heading: 'Green lawn, lower water bill',
      cta_sub: 'We map your zones on site, confirm head placement and lock your install date.',
      submit_success: 'Requested! Our irrigation designer will call within one business day to schedule your free site walk.',
      footnote: 'New installs include design, heads, valves, controller and backflow. One-year workmanship warranty on all parts.',
    },
  },

  /* ── 61. Snow Removal (BATCH 3 #2) — the dual-branch show_if showcase ──
   * A per-visit vs seasonal-contract radio forks the whole quote: per-visit
   * reveals driveway size + estimated visits; seasonal reveals season length +
   * service level. Two show_if branches against the SAME controller id, each
   * gated on a different option value. Range mode — snowfall is unpredictable. */
  {
    id: 'snow_removal_service', name: 'Snow Removal Service',
    description: 'Snow removal pricing for per-visit plowing or a full seasonal contract, by driveway size, service level and season length.',
    category: 'Outdoor', trades: ['snow_removal'],
    trustBadges: [
      b('Licensed & Insured', 'shield-check'),
      b('24/7 Storm Response', 'clock'),
      b('Salt & De-Ice Certified', 'verified'),
      b('Locally Owned', 'map-pin'),
    ],
    layout: 'two-column', theme: 'light', defaultIcon: 'Snowflake',
    requireAddress: true,
    // Showcase niche style — cold winter-blue body, deep-navy result panel,
    // ice-blue CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#1d4ed8',
      background: '#f2f6fc',
      surface: '#ffffff',
      border: '#dbe5f5',
      text: '#101828',
      resultsBg: '#0f1f3d',
      ctaColor: '#2563eb',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'inter',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Snowfall is unpredictable — seasonal pricing carries a ±15% band.
        range_mode: { enabled: true, band_pct: 15 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Snow Removal — Per Visit or Seasonal Price', subtitle: '24/7 storm response · Licensed & insured · Salt and de-icing included', align: 'left' },
    steps: [
      { id: 'step_plan', label: 'Plan & size', help: 'Pay per storm, or lock one seasonal price. Then your driveway size.', fields: ['snow_plan', 'snow_drive_size'] },
      { id: 'step_pervisit', label: 'Per-visit details', help: 'How often we plow per storm event.', fields: ['snow_visits'] },
      { id: 'step_seasonal', label: 'Seasonal details', help: 'Season length and how thoroughly we clear.', fields: ['snow_season_length', 'snow_service_level', 'snow_extras'] },
    ],
    fields: [
      // The branching controller — per-visit vs seasonal forks the quote.
      { id: 'snow_plan', name: 'Plan Type', label: 'How do you want to pay?', type: 'radio',
        help: 'Per-visit suits light winters; seasonal caps your cost no matter the snowfall.',
        options: [
          { ...optImg('Per visit per storm', 75, 'https://images.unsplash.com/photo-1457269449834-928af64c684d?w=300&h=300&fit=crop'),
            description: 'Pay only when it snows — billed per plow visit.' },
          { ...optImg('Seasonal contract', 0, 'https://images.unsplash.com/photo-1547754980-3df97fed72a8?w=300&h=300&fit=crop'),
            description: 'One flat price for the whole season — unlimited storms.' },
        ] },
      { id: 'snow_drive_size', name: 'Driveway Size', label: 'How big is your driveway?', type: 'select',
        help: 'Count the cars that fit end-to-end if unsure.',
        options: [
          { ...opt('1-2 car (short)', 0), description: 'A standard single or double driveway.' },
          opt('3-4 car / extended', 40),
          opt('Long rural / commercial', 95),
        ] },
      // show_if BRANCH A — per-visit only: how many visits we estimate.
      { id: 'snow_visits', name: 'Estimated Visits', label: 'Estimated plow visits this winter', type: 'slider',
        help: 'A typical northern winter runs 12–20 plowable storms. We bill only actual visits.',
        min: 1, max: 40, step: 1, default_value: 15, unit: 'visits',
        show_if: { field: 'snow_plan', op: 'eq', value: 'per_visit_per_storm' } },
      // show_if BRANCH B — seasonal only: season length.
      { id: 'snow_season_length', name: 'Season Length', label: 'How long is your snow season?', type: 'select',
        help: 'Pick the closest match for your region — sets the contract base.',
        options: [
          { ...opt('Short (3 months)', 450), description: 'Milder regions — Nov through Jan.' },
          { ...opt('Standard (4 months)', 650), description: 'Most northern markets — Nov through Feb.' },
          opt('Long (5+ months)', 900),
        ],
        show_if: { field: 'snow_plan', op: 'eq', value: 'seasonal_contract' } },
      // show_if BRANCH B — seasonal only: service level.
      { id: 'snow_service_level', name: 'Service Level', label: 'How thoroughly should we clear?', type: 'radio',
        help: 'Higher tiers trigger at a lower snow depth and include hand-work.',
        options: [
          { ...opt('Driveway plow only', 0), description: 'Clears the driveway after each qualifying storm.' },
          { ...opt('Driveway + walkways', 120), description: 'Adds shoveled walkways and front steps.' },
          opt('Full property + priority response', 280),
        ],
        show_if: { field: 'snow_plan', op: 'eq', value: 'seasonal_contract' } },
      // show_if BRANCH B — seasonal only: de-icing add-ons.
      { id: 'snow_extras', name: 'De-Icing Add-ons', label: 'Salt & de-icing options', type: 'multi_select',
        help: 'Optional — keeps surfaces safe between plow visits.',
        options: [
          { ...opt('Salt driveway each visit', 110), description: 'Rock salt applied after every plow.' },
          opt('Walkway ice-melt service', 70),
          opt('Eco / pet-safe de-icer upgrade', 60),
        ],
        show_if: { field: 'snow_plan', op: 'eq', value: 'seasonal_contract' } },
    ],
    calculations: [
      { ...calc('Per-Visit Cost', '([Plan Type] + [Driveway Size]) * [Estimated Visits]'), caption: 'Per-storm plow rate at your driveway size, across the winter.' },
      { ...calc('Seasonal Base', '[Season Length] + [Driveway Size] + [Service Level]'), caption: 'Flat seasonal contract at your length and service level.' },
      { ...calc('De-Icing Add-ons', '[De-Icing Add-ons]'), caption: 'Salt and ice-melt service on the seasonal plan.' },
      { ...calc('Total Estimated Cost', '[Per-Visit Cost] + [Seasonal Base] + [De-Icing Add-ons]'),
        resultMode: 'primary', caption: 'Your winter estimate — seasonal locks the price regardless of snowfall.' },
    ],
    result_calc: 'Total Estimated Cost',
    results: {
      heading: 'Your Snow Removal Quote',
      show_breakdown: true,
      cta_label: 'Reserve My Spot',
      cta_heading: 'Routes fill before the first storm',
      cta_sub: 'Lock your driveway on our plow route now — seasonal customers get priority dispatch.',
      submit_success: 'Reserved! Dispatch will confirm your route and storm-response details before the season starts.',
      footnote: 'Seasonal contracts include unlimited plow visits at the chosen depth trigger. Per-visit billing is per actual storm only.',
    },
  },

  /* ── 62. Holiday / Christmas Light Installation (BATCH 3 #3) ──
   * Linear roofline feet is the driver; design-tier image cards (classic /
   * premium / luxury); trees & wraps add-ons. show_if surfaces the wrap-count
   * picker only when "Tree & shrub wraps" is chosen (contains on a
   * multi_select). Takedown-included toggle. */
  {
    id: 'holiday_light_installation', name: 'Holiday Light Installation',
    description: 'Christmas & holiday lighting priced by roofline footage and design tier, with tree wraps, walkway lighting and takedown.',
    category: 'Outdoor', trades: ['holiday_lighting'],
    trustBadges: [
      b('Licensed & Insured', 'shield-check'),
      b('Commercial-Grade LED', 'verified'),
      b('Install + Takedown + Storage', 'calendar'),
      b('Locally Owned', 'map-pin'),
    ],
    layout: 'two-column', theme: 'midnight', defaultIcon: 'Sparkles',
    requireAddress: true,
    // Showcase niche style — festive deep-evergreen body, midnight result
    // panel, warm-gold CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#b91c1c',
      background: '#0f2a1f',
      surface: '#14352a',
      border: '#1f4a3a',
      text: '#f4f7f4',
      resultsBg: '#08160f',
      ctaColor: '#f59e0b',
      success: '#22c55e',
      error: '#f87171',
      fontFamily: 'sora',
      fieldStyle: 'filled',
      radius: 14,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Peak height and roofline complexity vary — show a ±10% band.
        range_mode: { enabled: true, band_pct: 10 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Holiday Lights — Price Your Display Now', subtitle: 'Commercial-grade LED · Install, takedown & storage included · Fully insured', align: 'left' },
    steps: [
      { id: 'step_roofline', label: 'Roofline', help: 'How much roofline to light, and the look you want.', fields: ['hol_feet', 'hol_tier'] },
      { id: 'step_features', label: 'Features', help: 'Trees, wraps and walkway accents.', fields: ['hol_addons', 'hol_wraps'] },
      { id: 'step_service', label: 'Service', help: 'Takedown and storage options.', fields: ['hol_takedown'] },
    ],
    fields: [
      { id: 'hol_feet', name: 'Roofline Feet', label: 'Roofline footage to light', type: 'slider',
        help: 'A typical single-story home is around 150–200 ft of roofline.',
        min: 50, max: 600, step: 10, default_value: 180, unit: 'ft' },
      // image_choice on the highest-uncertainty question (design tier).
      { id: 'hol_tier', name: 'Design Tier', label: 'Which design tier?', type: 'image_choice',
        help: 'Tier sets the per-foot price — premium adds color-matched clips and warm-white runs.',
        options: [
          { ...optImg('Classic warm white', 4, 'https://images.unsplash.com/photo-1543589077-47d81606c1bf?w=300&h=300&fit=crop'),
            description: 'Clean single-color roofline — the timeless look.' },
          { ...optImg('Premium multi-element', 6, 'https://images.unsplash.com/photo-1512389142860-9c449e58a543?w=300&h=300&fit=crop'),
            description: 'Roofline plus accents and color-matched clips.' },
          { ...optImg('Luxury full display', 9, 'https://images.unsplash.com/photo-1576919228236-a097c32a5cd4?w=300&h=300&fit=crop'),
            description: 'Designer display — roofline, trees, wraps and walkway in one look.' },
        ] },
      { id: 'hol_addons', name: 'Features', label: 'Add display features', type: 'multi_select',
        help: 'Pick the accents you want — each is priced as a flat add.',
        options: [
          { ...opt('Tree & shrub wraps', 0), description: 'Wrapped trunks and shrubs — pick a count on the next question.' },
          opt('Walkway / pathway lights', 180),
          opt('Wreaths & garland (per entry)', 140),
        ] },
      // show_if — wrap count only surfaces when wraps are selected (contains).
      { id: 'hol_wraps', name: 'Tree Wraps', label: 'How many trees / shrubs to wrap?', type: 'slider',
        help: 'Each wrapped trunk or shrub is priced per unit, lights and labor included.',
        min: 1, max: 20, step: 1, default_value: 3, unit: 'wraps',
        show_if: { field: 'hol_addons', op: 'contains', value: 'tree_shrub_wraps' } },
      { id: 'hol_takedown', name: 'Takedown & Storage', label: 'Add takedown & off-season storage', type: 'toggle',
        help: 'We remove everything in January and store your lights until next year.',
        on_value: 150 },
    ],
    calculations: [
      { ...calc('Roofline Lighting', '[Roofline Feet] * [Design Tier]'), caption: 'Per-foot commercial LED at your chosen design tier.' },
      { ...calc('Features & Wraps', '[Features] + ([Tree Wraps] * 65)'), caption: 'Walkway lights, wreaths and per-tree wraps.' },
      { ...calc('Takedown & Storage', '[Takedown & Storage]'), caption: 'January removal and off-season storage.' },
      { ...calc('Total Display Price', '[Roofline Lighting] + [Features & Wraps] + [Takedown & Storage]'),
        resultMode: 'primary', caption: 'All-in seasonal price — install, energy-safe wiring and warranty included.' },
    ],
    result_calc: 'Total Display Price',
    results: {
      heading: 'Your Holiday Display Quote',
      show_breakdown: true,
      cta_label: 'Book My Install',
      cta_heading: 'Holiday calendars fill by November',
      cta_sub: 'Reserve your install week now — our crews book solid right after Thanksgiving.',
      submit_success: 'Booked! Your lighting designer will call within one business day to confirm your display and install week.',
      footnote: 'Includes commercial-grade LED, professional install, in-season service calls and full warranty. Takedown optional.',
    },
  },

  /* ── 63. Artificial Turf Installation (BATCH 3 #4) ──
   * sqft × turf-grade is the high-uncertainty driver (image_choice cards:
   * landscape / pet / putting); base prep select; pet-system add-on. show_if
   * surfaces the pet-drainage system only when the pet-grade turf is chosen.
   * Range mode — sub-base condition isn't known until excavation. */
  {
    id: 'artificial_turf_installation', name: 'Artificial Turf Installation',
    description: 'Artificial turf pricing by square footage and turf grade, with base prep, pet-drainage system and edging options.',
    category: 'Outdoor', trades: ['artificial_turf'],
    trustBadges: [
      b('Licensed & Insured', 'shield-check'),
      b('15-Year Turf Warranty', 'award'),
      b('Drainage-Certified Install', 'verified'),
      b('Free On-Site Measure', 'thumbs-up'),
    ],
    layout: 'two-column', theme: 'light', defaultIcon: 'Trees',
    requireAddress: true,
    // Showcase niche style — fresh turf-green body, deep-field result panel,
    // lime CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#15803d',
      background: '#f3f8f1',
      surface: '#ffffff',
      border: '#dcebd6',
      text: '#14241a',
      resultsBg: '#10341f',
      ctaColor: '#65a30d',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Sub-base condition is found at excavation — show a ±12% band.
        range_mode: { enabled: true, band_pct: 12 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Artificial Turf — Instant Per-Square-Foot Price', subtitle: '15-year turf warranty · Drainage-certified installs · Free on-site measure', align: 'left' },
    steps: [
      { id: 'step_area', label: 'Area & grade', help: 'How much turf, and which grade fits your use.', fields: ['turf_area', 'turf_grade'] },
      { id: 'step_base', label: 'Base prep', help: 'The compacted base is what keeps turf flat for years.', fields: ['turf_base', 'turf_pet'] },
      { id: 'step_extras', label: 'Edging & extras', help: 'Borders and finishing options.', fields: ['turf_extras'] },
    ],
    fields: [
      { id: 'turf_area', name: 'Turf Area', label: 'Area to cover (sq ft)', type: 'slider',
        help: 'A typical backyard lawn is 500–1,200 sq ft. Pace it off if unsure.',
        min: 100, max: 5000, step: 50, default_value: 600, unit: 'sq ft' },
      // image_choice on the highest-uncertainty driver (turf grade).
      { id: 'turf_grade', name: 'Turf Grade', label: 'Which turf grade?', type: 'image_choice',
        help: 'Grade sets the per-square-foot material cost — pet and putting grades cost more.',
        options: [
          { ...optImg('Landscape grade', 9, 'https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=300&h=300&fit=crop'),
            description: 'Soft, natural-looking lawn turf — best all-round value.' },
          { ...optImg('Pet grade antimicrobial', 12, 'https://images.unsplash.com/photo-1556909211-36987daf7b4d?w=300&h=300&fit=crop'),
            description: 'Tighter weave with antimicrobial backing — built for pets.' },
          { ...optImg('Putting / sport grade', 15, 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=300&h=300&fit=crop'),
            description: 'Dense, true-roll surface for putting greens and play areas.' },
        ] },
      { id: 'turf_base', name: 'Base Preparation', label: 'Base / sub-grade prep', type: 'select',
        help: 'A compacted aggregate base is what stops turf from rippling.',
        options: [
          { ...opt('Standard 3" base', 0), description: 'Crushed aggregate, graded and compacted — most yards.' },
          opt('Heavy 4" base / poor soil', 2.5),
          opt('Excavate + rebuild soft sub-grade', 4),
        ] },
      // show_if — pet drainage system only matters on the pet-grade turf.
      { id: 'turf_pet', name: 'Pet Drainage System', label: 'Add pet-drainage & deodorizer layer', type: 'toggle',
        help: 'A drainage core plus deodorizing infill keeps pet areas odor-free.',
        on_value: 480,
        show_if: { field: 'turf_grade', op: 'eq', value: 'pet_grade_antimicrobial' } },
      { id: 'turf_extras', name: 'Edging & Extras', label: 'Borders & finishing', type: 'multi_select',
        help: 'Optional — clean edges and accents that lift the finished look.',
        options: [
          { ...opt('Bender-board / paver border', 320), description: 'Crisp contained edge around the turf field.' },
          opt('Cool-touch infill upgrade', 240),
          opt('Old sod removal & haul-away', 380),
        ] },
    ],
    calculations: [
      { ...calc('Turf & Installation', '[Turf Area] * ([Turf Grade] + [Base Preparation])'), caption: 'Per-square-foot turf and compacted base at your grade.' },
      { ...calc('Pet System', '[Pet Drainage System]'), caption: 'Drainage core and deodorizing infill for pet areas.' },
      { ...calc('Edging & Extras', '[Edging & Extras]'), caption: 'Borders, infill upgrades and old-sod removal.' },
      { ...calc('Total Turf Price', '[Turf & Installation] + [Pet System] + [Edging & Extras]'),
        resultMode: 'primary', caption: 'Installed price — confirmed at a free on-site measure.' },
    ],
    result_calc: 'Total Turf Price',
    results: {
      heading: 'Your Turf Quote',
      show_breakdown: true,
      cta_label: 'Book My Free Measure',
      cta_heading: 'Never mow again',
      cta_sub: 'We measure on site, confirm base prep and drainage, then lock your install date.',
      submit_success: 'Requested! Our turf estimator will call within one business day to schedule your free measure.',
      footnote: 'Includes excavation, compacted base, premium turf, infill and edge fastening. 15-year manufacturer turf warranty.',
    },
  },

  /* ── 64. Foundation Repair & Basement Waterproofing (BATCH 3 #5) ──
   * One template, TWO canonical reno trade ids. A problem-type radio
   * (cracks / bowing / water) forks the quote via show_if: cracks & bowing
   * reveal affected linear feet; water reveals the waterproofing method.
   * Sump-pump add-on. Range mode — soil and structural variance is high. */
  {
    id: 'foundation_repair_waterproofing', name: 'Foundation Repair & Waterproofing',
    description: 'Foundation repair and basement waterproofing priced by problem type, affected footage and method, with sump-pump and warranty options.',
    category: 'Construction', trades: ['foundation_repair', 'basement_waterproofing'],
    trustBadges: [
      b('Licensed & Insured', 'shield-check'),
      b('Structural Engineer On Staff', 'badge-check'),
      b('Transferable Lifetime Warranty', 'award'),
      b('Free Inspection', 'thumbs-up'),
    ],
    layout: 'two-column', theme: 'light', defaultIcon: 'Building2',
    requireAddress: true,
    // Showcase niche style — solid concrete-grey body, deep-bedrock result
    // panel, structural-blue CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#475569',
      background: '#f5f6f7',
      surface: '#ffffff',
      border: '#e2e5e9',
      text: '#1c1f24',
      resultsBg: '#1e293b',
      ctaColor: '#2563eb',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'inter',
      fieldStyle: 'filled',
      radius: 10,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Soil and structural variance is high — show a ±15% band.
        range_mode: { enabled: true, band_pct: 15 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Foundation & Basement — Price Your Repair', subtitle: 'Structural engineer on staff · Transferable lifetime warranty · Free inspection', align: 'left' },
    steps: [
      { id: 'step_problem', label: 'The problem', help: 'What you are seeing — this sets the repair approach.', fields: ['fnd_problem', 'fnd_feet'] },
      { id: 'step_water', label: 'Waterproofing', help: 'How we keep the water out (water-intrusion jobs).', fields: ['fnd_method'] },
      { id: 'step_extras', label: 'Protection & extras', help: 'Sump pump and warranty add-ons.', fields: ['fnd_sump', 'fnd_extras'] },
    ],
    fields: [
      // The branching controller — problem type forks the whole quote.
      { id: 'fnd_problem', name: 'Problem Type', label: 'What are you seeing?', type: 'radio',
        help: 'Not sure? Our free inspection confirms the cause before any quote is final.',
        options: [
          { ...optImg('Foundation cracks', 90, 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=300&h=300&fit=crop'),
            description: 'Vertical or stair-step cracks — sealed and reinforced per linear foot.' },
          { ...optImg('Bowing / settling walls', 320, 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=300&h=300&fit=crop'),
            description: 'Inward-bowing or settling walls — stabilized with piers or anchors.' },
          { ...optImg('Water intrusion / damp basement', 0, 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=300&h=300&fit=crop'),
            description: 'Leaks, seepage or musty damp — solved with a waterproofing system.' },
        ] },
      // show_if — linear feet prices crack-sealing and bowing-wall jobs.
      { id: 'fnd_feet', name: 'Affected Feet', label: 'Affected length (linear feet)', type: 'slider',
        help: 'Estimate the run of cracked or bowing wall — we verify at inspection.',
        min: 4, max: 120, step: 2, default_value: 20, unit: 'ft',
        show_if: { field: 'fnd_problem', op: 'ne', value: 'water_intrusion_damp_basement' } },
      // show_if — waterproofing method only surfaces on the water branch.
      { id: 'fnd_method', name: 'Waterproofing Method', label: 'Which waterproofing approach?', type: 'select',
        help: 'Interior drainage is least disruptive; exterior is the most thorough.',
        options: [
          { ...opt('Interior drain + sealant', 4200), description: 'Interior perimeter drain tied to a sump — minimal yard disruption.' },
          opt('Exterior membrane excavation', 8500),
          { ...opt('Crack injection only', 1200), description: 'Polyurethane injection for isolated wall leaks.' },
        ],
        show_if: { field: 'fnd_problem', op: 'eq', value: 'water_intrusion_damp_basement' } },
      { id: 'fnd_sump', name: 'Sump Pump System', label: 'Add a sump pump with battery backup', type: 'toggle',
        help: 'A battery-backup sump keeps pumping through power outages and heavy storms.',
        on_value: 1450 },
      { id: 'fnd_extras', name: 'Protection Add-ons', label: 'Protection & finishing', type: 'multi_select',
        help: 'Optional — long-term protection and warranty upgrades.',
        options: [
          { ...opt('Dehumidifier system', 1800), description: 'Sealed-basement dehumidifier — controls humidity year-round.' },
          opt('Vapor barrier wall liner', 1600),
          opt('Transferable lifetime warranty', 650),
        ] },
    ],
    calculations: [
      { ...calc('Structural Repair', '[Problem Type] * [Affected Feet]'), caption: 'Per-linear-foot crack sealing or wall stabilization.' },
      { ...calc('Waterproofing System', '[Waterproofing Method]'), caption: 'Interior or exterior waterproofing for water-intrusion jobs.' },
      { ...calc('Protection & Pump', '[Sump Pump System] + [Protection Add-ons]'), caption: 'Sump pump, dehumidifier and warranty add-ons.' },
      { ...calc('Total Project Price', '[Structural Repair] + [Waterproofing System] + [Protection & Pump]'),
        resultMode: 'primary', caption: 'Estimated price — confirmed at a free structural inspection.' },
    ],
    result_calc: 'Total Project Price',
    results: {
      heading: 'Your Foundation Quote',
      show_breakdown: true,
      cta_label: 'Book My Free Inspection',
      cta_heading: 'Small cracks get expensive fast',
      cta_sub: 'Our engineer inspects on site, confirms the cause and prices the fix with a transferable warranty.',
      submit_success: 'Requested! Our foundation specialist will call within one business day to schedule your free inspection.',
      footnote: 'Includes structural inspection, engineered repair and code-compliant waterproofing. Transferable lifetime warranty available.',
    },
  },

  /* ══════════════════════════════════════════════════════════════════
   * BATCH 4 — "Auto + Niche" (template-inventory build-spec Batch 4).
   * 5 showcase-tier templates. Every item carries the full 9-point
   * showcase kit (niche style block, defaultIcon, ≥3 trade-true badges,
   * per-field help, ≥1 option description, ≥1 validated show_if,
   * image_choice on the highest-uncertainty driver, calc captions +
   * one resultMode:'primary', results cta_heading/cta_sub/submit_success,
   * steps[], animations + premiumAnimations). dumpster_rental is SKIPPED
   * to avoid duplicating #49 ("Dumpster Rental — Size & Zone"); a Land
   * Surveying template stands in, plus a Mobile Mechanic 5th.
   * ══════════════════════════════════════════════════════════════════ */

  /* ── 65. Vehicle Wrap & Paint Protection Film (BATCH 4 #1) ──
   * A coverage image_choice forks the quote: the two wrap options reveal a
   * finish picker (gloss / matte / colour-shift); the PPF option reveals a
   * coverage-zone select instead. Vehicle size scales the wrap area; design
   * service is an optional add-on. */
  {
    id: 'vehicle_wrap_ppf', name: 'Vehicle Wrap & Paint Protection Film',
    description: 'Vinyl vehicle wraps and paint protection film priced by coverage, vehicle size and finish, with design service and ceramic-coating add-ons.',
    category: 'Automotive', trades: ['vehicle_wrap', 'paint_protection_film'],
    trustBadges: [
      b('3M & Avery Certified Installers', 'badge-check'),
      b('Wrap Lifetime Warranty', 'award'),
      b('Paint-Safe Removal Guaranteed', 'shield-check'),
      b('Free Design Proof', 'thumbs-up'),
    ],
    layout: 'two-column', theme: 'midnight', defaultIcon: 'Car',
    // Showcase niche style — deep graphite body, near-black result panel,
    // electric-cyan CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#06b6d4',
      background: '#14181f',
      surface: '#1d232d',
      border: '#2c333f',
      text: '#f1f5f9',
      resultsBg: '#0b0e13',
      ctaColor: '#06b6d4',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'sora',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Final wrap area is confirmed when the vehicle is on the lift — ±10%.
        range_mode: { enabled: true, band_pct: 10 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Vehicle Wrap & PPF — Instant Price', subtitle: '3M & Avery certified · Lifetime wrap warranty · Free design proof', align: 'left' },
    steps: [
      { id: 'step_coverage', label: 'Coverage & vehicle', help: 'What you want covered, and how big the vehicle is.', fields: ['vw_coverage', 'vw_size'] },
      { id: 'step_finish', label: 'Finish & zones', help: 'The film finish (wraps) or coverage zones (PPF).', fields: ['vw_finish', 'vw_ppf_zone'] },
      { id: 'step_extras', label: 'Design & extras', help: 'Custom design and protection add-ons.', fields: ['vw_design', 'vw_extras'] },
    ],
    fields: [
      // image_choice on the highest-uncertainty driver — what coverage type.
      { id: 'vw_coverage', name: 'Coverage', label: 'What are you wrapping?', type: 'image_choice',
        help: 'A full wrap recolours the whole vehicle; PPF is clear film that shields the paint.',
        options: [
          { ...optImg('Full vehicle wrap', 2400, 'https://images.unsplash.com/photo-1604014237800-1c9102c219da?w=300&h=300&fit=crop'),
            description: 'Bumper-to-bumper colour change — the whole exterior in vinyl.' },
          { ...optImg('Partial / accent wrap', 1100, 'https://images.unsplash.com/photo-1632759145351-1d592919f522?w=300&h=300&fit=crop'),
            description: 'Hood, roof, mirrors or racing stripes — accent panels only.' },
          { ...optImg('Paint protection film front', 1600, 'https://images.unsplash.com/photo-1494526585095-c41746248156?w=300&h=300&fit=crop'),
            description: 'Clear self-healing film over hood, fenders and mirrors.' },
        ] },
      { id: 'vw_size', name: 'Vehicle Size', label: 'Vehicle size', type: 'radio',
        help: 'Bigger vehicles take more film and more labor hours.',
        options: [
          opt('Coupe / sedan', 1.0),
          opt('Crossover / small SUV', 1.25),
          opt('Truck / full-size SUV', 1.5),
          opt('Van / commercial', 1.8),
        ] },
      // show_if — finish picker only matters for the two wrap options (ne PPF).
      { id: 'vw_finish', name: 'Finish', label: 'Which vinyl finish?', type: 'select',
        help: 'Specialty finishes use premium cast vinyl and cost more per panel.',
        options: [
          { ...opt('Gloss color', 0), description: 'Standard gloss cast vinyl — the broadest colour range.' },
          opt('Satin / matte', 350),
          opt('Color-shift / chrome', 900),
        ],
        show_if: { field: 'vw_coverage', op: 'ne', value: 'paint_protection_film_front' } },
      // show_if — coverage zones only surface on the PPF option (eq PPF).
      { id: 'vw_ppf_zone', name: 'PPF Zones', label: 'How much PPF coverage?', type: 'select',
        help: 'More coverage means more clear film — full-front is the popular choice.',
        options: [
          { ...opt('Partial front bumper & hood strip', 0), description: 'High-impact zones only — bumper and a hood leading edge.' },
          opt('Full front hood fenders mirrors', 600),
          opt('Track pack full front plus rockers', 1400),
        ],
        show_if: { field: 'vw_coverage', op: 'eq', value: 'paint_protection_film_front' } },
      { id: 'vw_design', name: 'Design Service', label: 'Add custom design service', type: 'toggle',
        help: 'Our designers build a print-ready proof from your logo or concept.',
        on_value: 450 },
      { id: 'vw_extras', name: 'Add-ons', label: 'Protection & finishing', type: 'multi_select',
        help: 'Optional — extra protection and finishing touches.',
        options: [
          { ...opt('Ceramic coating over film', 650), description: 'Hydrophobic ceramic top-coat — easier washing, deeper gloss.' },
          opt('Chrome delete trim blackout', 480),
          opt('Window tint package', 320),
        ] },
    ],
    calculations: [
      { ...calc('Coverage & Size', '[Coverage] * [Vehicle Size]'), caption: 'Base film and labor, scaled to your vehicle size.' },
      { ...calc('Finish & Zones', '[Finish] + [PPF Zones]'), caption: 'Specialty wrap finish or extra PPF coverage zones.' },
      { ...calc('Design & Add-ons', '[Design Service] + [Add-ons]'), caption: 'Custom design proof, ceramic, chrome delete and tint.' },
      { ...calc('Total Install Price', '[Coverage & Size] + [Finish & Zones] + [Design & Add-ons]'),
        resultMode: 'primary', caption: 'Installed price — confirmed once we measure the vehicle.' },
    ],
    result_calc: 'Total Install Price',
    results: {
      heading: 'Your Wrap / PPF Quote',
      show_breakdown: true,
      cta_label: 'Book My Install',
      cta_heading: 'Turn heads — and protect the paint',
      cta_sub: 'We confirm panels and finish in person, send a free design proof, then lock your install slot.',
      submit_success: 'Requested! Our wrap specialist will call within one business day to confirm your design and schedule the install.',
      footnote: 'Includes premium cast vinyl or self-healing PPF, professional install and a paint-safe removal guarantee. Lifetime wrap warranty available.',
    },
  },

  /* ── 66. Window Tinting (BATCH 4 #2) ──
   * Vehicle type scales the window count; a film-tier image_choice drives the
   * per-window price; a windshield-strip toggle adds a fixed line. The ceramic
   * and IR-ceramic tiers carry upsell descriptions. */
  {
    id: 'window_tinting', name: 'Window Tinting',
    description: 'Automotive window tinting priced by vehicle type, film tier and window count, with an optional windshield sun-strip.',
    category: 'Automotive', trades: ['window_tinting'],
    trustBadges: [
      b('Lifetime Tint Warranty', 'award'),
      b('Bubble & Peel Guarantee', 'shield-check'),
      b('Legal-Limit Compliant', 'badge-check'),
      b('Computer-Cut Precision', 'verified'),
    ],
    layout: 'two-column', theme: 'midnight', defaultIcon: 'Car',
    // Showcase niche style — smoked-charcoal body, near-black result panel,
    // amber CTA (sun / heat-rejection cue). Never falls back to derive.
    style: {
      widgetWidth: 'wide',
      accent: '#f59e0b',
      background: '#15171c',
      surface: '#1e2129',
      border: '#2d313b',
      text: '#f1f5f9',
      resultsBg: '#0c0e12',
      ctaColor: '#f59e0b',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'geist',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Window count is confirmed at the bay — small ±8% band.
        range_mode: { enabled: true, band_pct: 8 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Window Tint — Price in 30 Seconds', subtitle: 'Lifetime tint warranty · No bubble, no peel · Legal-limit compliant', align: 'left' },
    steps: [
      { id: 'step_vehicle', label: 'Vehicle', help: 'Vehicle type sets how many windows we tint.', fields: ['wt_vehicle'] },
      { id: 'step_film', label: 'Film & windows', help: 'Pick the film tier and how many windows.', fields: ['wt_film', 'wt_windows'] },
      { id: 'step_extras', label: 'Extras', help: 'Windshield strip and finishing options.', fields: ['wt_strip', 'wt_extras'] },
    ],
    fields: [
      { id: 'wt_vehicle', name: 'Vehicle Type', label: 'Vehicle type', type: 'radio',
        help: 'Coupes have fewer side windows than SUVs and vans — it changes the count.',
        options: [
          opt('2-door coupe', 0),
          opt('Sedan', 0),
          opt('SUV / crossover', 0),
          opt('Truck crew cab', 0),
        ] },
      // image_choice on the highest-uncertainty driver — which film tier.
      { id: 'wt_film', name: 'Film Tier', label: 'Which film tier?', type: 'image_choice',
        help: 'Higher tiers reject more heat and UV — ceramic stays cooler without going darker.',
        options: [
          { ...optImg('Dyed film', 28, 'https://images.unsplash.com/photo-1543589077-47d81606c1bf?w=300&h=300&fit=crop'),
            description: 'Classic look and glare control — the budget-friendly tier.' },
          { ...optImg('Ceramic film', 48, 'https://images.unsplash.com/photo-1512389142860-9c449e58a543?w=300&h=300&fit=crop'),
            description: 'Blocks far more heat and 99% UV without interfering with signals.' },
          { ...optImg('IR ceramic film', 65, 'https://images.unsplash.com/photo-1576919228236-a097c32a5cd4?w=300&h=300&fit=crop'),
            description: 'Top-tier infrared rejection — noticeably cooler cabin, crystal clarity.' },
        ] },
      { id: 'wt_windows', name: 'Windows', label: 'How many windows?', type: 'slider',
        help: 'Count the windows you want tinted — most sedans do 5 (4 doors + rear).',
        min: 1, max: 9, step: 1, default_value: 5, unit: 'windows' },
      // show_if — the matching ceramic sun-strip is offered on the heat-rejecting
      // tiers (ceramic / IR ceramic), not on basic dyed film.
      { id: 'wt_strip', name: 'Windshield Strip', label: 'Add a matching windshield sun-strip', type: 'toggle',
        help: 'A legal-height ceramic tint band across the top of the windshield cuts sun glare.',
        on_value: 45,
        show_if: { field: 'wt_film', op: 'ne', value: 'dyed_film' } },
      { id: 'wt_extras', name: 'Extras', label: 'Finishing options', type: 'multi_select',
        help: 'Optional — removal of old film and protection add-ons.',
        options: [
          { ...opt('Old film removal', 90), description: 'Strip and clean bubbled or purple old tint before re-tinting.' },
          opt('Windshield full ceramic tint', 180),
          opt('Sunroof tint', 70),
        ] },
    ],
    calculations: [
      { ...calc('Film & Windows', '[Film Tier] * [Windows]'), caption: 'Per-window price for your chosen film tier.' },
      { ...calc('Windshield Strip', '[Windshield Strip]'), caption: 'Optional legal-height sun-strip across the windshield.' },
      { ...calc('Extras', '[Extras]'), caption: 'Old-film removal, windshield tint and sunroof.' },
      { ...calc('Total Tint Price', '[Film & Windows] + [Windshield Strip] + [Extras]'),
        resultMode: 'primary', caption: 'Out-the-door price — confirmed when we count the glass.' },
    ],
    result_calc: 'Total Tint Price',
    results: {
      heading: 'Your Tint Quote',
      show_breakdown: true,
      cta_label: 'Book My Tint',
      cta_heading: 'Cooler cabin, zero glare',
      cta_sub: 'We confirm the window count and your legal limit, then tint it computer-cut in one visit.',
      submit_success: 'Requested! Our tint shop will call within one business day to schedule your appointment.',
      footnote: 'Includes computer-cut film, professional install and a lifetime no-bubble, no-peel warranty. State legal-limit compliant.',
    },
  },

  /* ── 67. Short-Term Rental (Airbnb) Turnover Cleaning (BATCH 4 #3) ──
   * Recurring per-turnover cleaning, distinct from one-off move-out cleaning.
   * Bedrooms/baths drive the base; a turnover-frequency select prices the
   * recurring plan; a linen-service toggle reveals a restock add-on (show_if).
   * countUp + range mode on the per-turnover headline. */
  {
    id: 'str_turnover_cleaning', name: 'Short-Term Rental Turnover Cleaning',
    description: 'Airbnb / short-term-rental turnover cleaning priced per turnover by bedrooms, baths and frequency, with hotel-style linen service and guest-restock options.',
    category: 'Cleaning', trades: ['str_turnover_cleaning'],
    trustBadges: [
      b('Insured & Bonded', 'shield-check'),
      b('Same-Day Turnover Guarantee', 'award'),
      b('Photo-Verified Checklist', 'verified'),
      b('5-Star Host Rated', 'thumbs-up'),
    ],
    layout: 'two-column', theme: 'coral', defaultIcon: 'Sparkles',
    // Showcase niche style — warm hospitality body, deep-plum result panel,
    // coral CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#e11d48',
      background: '#fdf3f4',
      surface: '#ffffff',
      border: '#f4dadd',
      text: '#241418',
      resultsBg: '#3b1722',
      ctaColor: '#e11d48',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'outfit',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Actual mess between guests varies — show a ±10% per-turnover band.
        range_mode: { enabled: true, band_pct: 10 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'STR Turnover Cleaning — Price Per Turn', subtitle: 'Same-day turnover guarantee · Photo-verified checklist · 5-star host rated', align: 'left' },
    steps: [
      { id: 'step_size', label: 'Property size', help: 'Bedrooms and baths set the base turnover time.', fields: ['str_beds', 'str_baths'] },
      { id: 'step_plan', label: 'Turnover plan', help: 'How often the property turns between guests.', fields: ['str_freq', 'str_linen'] },
      { id: 'step_extras', label: 'Add-ons', help: 'Restock and finishing options.', fields: ['str_restock', 'str_extras'] },
    ],
    fields: [
      { id: 'str_beds', name: 'Bedrooms', label: 'Bedrooms', type: 'slider',
        help: 'Count sleeping rooms — each bedroom adds beds to strip and remake.',
        min: 1, max: 8, step: 1, default_value: 2, unit: 'bd' },
      { id: 'str_baths', name: 'Bathrooms', label: 'Bathrooms', type: 'slider',
        help: 'Bathrooms are the most time-intensive part of a turnover.',
        min: 1, max: 6, step: 1, default_value: 2, unit: 'ba' },
      // image_choice on the highest-uncertainty driver — how busy the listing is
      // (it also forks the restock add-on via the linen toggle below).
      { id: 'str_freq', name: 'Turnover Frequency', label: 'How often does it turn over?', type: 'image_choice',
        help: 'Higher-frequency listings get a lower per-turnover rate.',
        options: [
          { ...optImg('Occasional a few turns a month', 1.0, 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=300&h=300&fit=crop'),
            description: 'Pay-as-you-go per turnover — no commitment.' },
          { ...optImg('Weekly turnovers', 0.92, 'https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=300&h=300&fit=crop'),
            description: 'Recurring weekly slot — 8% off every turnover.' },
          { ...optImg('High-volume multiple per week', 0.85, 'https://images.unsplash.com/photo-1585060544812-6b45742d762f?w=300&h=300&fit=crop'),
            description: 'Priority recurring crew — 15% off every turnover.' },
        ] },
      // show_if — linen service is the gateway to the restock add-on below.
      { id: 'str_linen', name: 'Linen Service', label: 'Add hotel-style linen service', type: 'toggle',
        help: 'We bring fresh laundered linens and towels each turn — no on-site laundry wait.',
        on_value: 35 },
      // show_if — restock only surfaces once linen service is on.
      { id: 'str_restock', name: 'Guest Restock', label: 'Restock guest consumables', type: 'select',
        help: 'We replenish the essentials so the next guest walks into a stocked place.',
        options: [
          { ...opt('Essentials paper soap coffee', 18), description: 'Toilet paper, hand soap, dish soap, coffee and trash bags.' },
          opt('Welcome pack with snacks', 32),
        ],
        show_if: { field: 'str_linen', op: 'eq', value: 'true' } },
      { id: 'str_extras', name: 'Add-ons', label: 'Finishing options', type: 'multi_select',
        help: 'Optional — deeper-clean and host-protection add-ons.',
        options: [
          { ...opt('Inside fridge & oven', 25), description: 'Wipe-down inside the fridge and oven between guests.' },
          opt('Patio / balcony tidy', 20),
          opt('Damage-check photo report', 15),
        ] },
    ],
    calculations: [
      { ...calc('Base Turnover', '(45 + ([Bedrooms] * 18) + ([Bathrooms] * 22)) * [Turnover Frequency]'), caption: 'Per-turnover base by bedrooms and baths, at your frequency rate.' },
      { ...calc('Linen & Restock', '[Linen Service] + [Guest Restock]'), caption: 'Hotel-style linens and guest-consumable restock.' },
      { ...calc('Add-ons', '[Add-ons]'), caption: 'Inside appliances, outdoor tidy and damage-check report.' },
      { ...calc('Price Per Turnover', '[Base Turnover] + [Linen & Restock] + [Add-ons]'),
        resultMode: 'primary', caption: 'Per-turnover price — billed each time we turn the property.' },
    ],
    result_calc: 'Price Per Turnover',
    results: {
      heading: 'Your Per-Turnover Price',
      show_breakdown: true,
      cta_label: 'Set Up My Turnovers',
      cta_heading: 'Never miss a checkout window',
      cta_sub: 'We sync to your booking calendar, turn the place same-day and send a photo-verified checklist after every clean.',
      submit_success: 'Requested! Our STR coordinator will call within one business day to connect your calendar and schedule your first turnover.',
      footnote: 'Per-turnover pricing with a same-day turnover guarantee and a photo-verified checklist after every clean. Linen service and restocking optional.',
    },
  },

  /* ── 68. Land Surveying (BATCH 4 #4 — dumpster substitute) ──
   * Substituted for dumpster_rental to avoid duplicating #49's size×zone
   * matrix. Survey-type select drives the per-acre rate and carries
   * descriptions (boundary / topographic / ALTA); acreage scales it; a
   * corner-count slider reveals only on a boundary survey (show_if); a rush
   * toggle adds expedited turnaround. */
  {
    id: 'land_surveying', name: 'Land Surveying',
    description: 'Professional land surveying priced by survey type and acreage, with monument corner-marking and rush-turnaround options.',
    category: 'Professional', trades: ['land_surveying'],
    trustBadges: [
      b('Licensed PLS On Staff', 'badge-check'),
      b('State-Recorded Plats', 'verified'),
      b('Stamped & Sealed Drawings', 'award'),
      b('Free Scope Consultation', 'thumbs-up'),
    ],
    layout: 'two-column', theme: 'royal', defaultIcon: 'Map',
    requireAddress: true,
    // Showcase niche style — clean professional body, deep-navy result panel,
    // royal-blue CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#1d4ed8',
      background: '#f5f8fc',
      surface: '#ffffff',
      border: '#dbe4f0',
      text: '#0f172a',
      resultsBg: '#172554',
      ctaColor: '#1d4ed8',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'inter',
      fieldStyle: 'filled',
      radius: 10,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Terrain, vegetation and records research vary the field hours — ±15%.
        range_mode: { enabled: true, band_pct: 15 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Land Survey — Get a Scoped Quote', subtitle: 'Licensed PLS on staff · State-recorded plats · Stamped & sealed drawings', align: 'left' },
    steps: [
      { id: 'step_type', label: 'Survey type', help: 'The survey type sets the standard and the per-acre rate.', fields: ['srv_type', 'srv_acres'] },
      { id: 'step_detail', label: 'Detail', help: 'Corner marking and other scope detail.', fields: ['srv_corners'] },
      { id: 'step_extras', label: 'Turnaround & extras', help: 'Rush turnaround and deliverable add-ons.', fields: ['srv_rush', 'srv_extras'] },
    ],
    fields: [
      // image_choice on the highest-uncertainty driver — the survey type sets
      // the per-acre rate AND forks corner-marking via show_if below.
      { id: 'srv_type', name: 'Survey Type', label: 'Which survey do you need?', type: 'image_choice',
        help: 'Lenders and title companies usually specify the type — ask if unsure.',
        options: [
          { ...optImg('Boundary survey', 110, 'https://images.unsplash.com/photo-1457269449834-928af64c684d?w=300&h=300&fit=crop'),
            description: 'Locates and marks your legal property lines and corners.' },
          { ...optImg('Topographic survey', 145, 'https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=300&h=300&fit=crop'),
            description: 'Maps elevations and contours for design and grading.' },
          { ...optImg('ALTA NSPS survey', 220, 'https://images.unsplash.com/photo-1547754980-3df97fed72a8?w=300&h=300&fit=crop'),
            description: 'The comprehensive standard lenders require for commercial deals.' },
        ] },
      { id: 'srv_acres', name: 'Acreage', label: 'Parcel size (acres)', type: 'slider',
        help: 'A typical suburban lot is well under an acre — estimate if unsure.',
        min: 0.1, max: 40, step: 0.1, default_value: 1, unit: 'ac' },
      // show_if — corner monumentation only applies to a boundary survey.
      { id: 'srv_corners', name: 'Corner Markers', label: 'Property corners to monument', type: 'slider',
        help: 'We set a recorded iron monument at each property corner you need marked.',
        min: 0, max: 12, step: 1, default_value: 4, unit: 'corners',
        show_if: { field: 'srv_type', op: 'eq', value: 'boundary_survey' } },
      { id: 'srv_rush', name: 'Rush Turnaround', label: 'Rush turnaround (5 business days)', type: 'toggle',
        help: 'Expedites field crew scheduling and drafting ahead of the standard queue.',
        on_value: 400 },
      { id: 'srv_extras', name: 'Deliverables', label: 'Deliverable add-ons', type: 'multi_select',
        help: 'Optional — extra deliverables your title company or designer may need.',
        options: [
          { ...opt('Elevation certificate', 350), description: 'FEMA elevation certificate for flood-zone insurance.' },
          opt('CAD file for designer', 180),
          opt('Recorded plat filing', 220),
        ] },
    ],
    calculations: [
      { ...calc('Survey Fieldwork', '600 + ([Survey Type] * [Acreage])'), caption: 'Mobilization plus per-acre field and research time at your survey standard.' },
      { ...calc('Corner Monuments', '[Corner Markers] * 65'), caption: 'Recorded iron monument set at each property corner.' },
      { ...calc('Turnaround & Deliverables', '[Rush Turnaround] + [Deliverables]'), caption: 'Rush scheduling and extra recorded deliverables.' },
      { ...calc('Total Survey Fee', '[Survey Fieldwork] + [Corner Monuments] + [Turnaround & Deliverables]'),
        resultMode: 'primary', caption: 'Surveying fee — confirmed after a free scope consultation.' },
    ],
    result_calc: 'Total Survey Fee',
    results: {
      heading: 'Your Survey Quote',
      show_breakdown: true,
      cta_label: 'Request My Survey',
      cta_heading: 'Know exactly where your lines are',
      cta_sub: 'Our licensed surveyor confirms the scope, pulls the records and schedules the field crew.',
      submit_success: 'Requested! Our survey coordinator will call within one business day to confirm scope and schedule the field crew.',
      footnote: 'Includes records research, field survey and stamped, sealed drawings by a licensed PLS. Recorded plat filing optional.',
    },
  },

  /* ── 69. Mobile Mechanic / Diagnostic (BATCH 4 #5) ──
   * Service-type select drives the job; a diagnostic-first image_choice
   * captures the highest-uncertainty case (warning light vs known repair);
   * vehicle age and after-hours surcharge; a mobile-trip toggle reveals a
   * distance band (show_if) only when the customer wants come-to-you service. */
  {
    id: 'mobile_mechanic', name: 'Mobile Mechanic & Diagnostic',
    description: 'Come-to-you mobile mechanic pricing by service type and vehicle, with on-site diagnostics, after-hours response and a mobile trip charge.',
    category: 'Automotive', trades: ['mobile_mechanic'],
    trustBadges: [
      b('ASE-Certified Technicians', 'badge-check'),
      b('12-Month / 12k-Mile Warranty', 'award'),
      b('We Come to You', 'truck'),
      b('Upfront, No-Surprise Pricing', 'shield-check'),
    ],
    layout: 'two-column', theme: 'midnight', defaultIcon: 'Wrench',
    requireAddress: true,
    // Showcase niche style — deep slate body, near-black result panel,
    // safety-green CTA. Never falls back to deriveStyleFromCategory.
    style: {
      widgetWidth: 'wide',
      accent: '#22c55e',
      background: '#15181e',
      surface: '#1e222b',
      border: '#2c313c',
      text: '#f1f5f9',
      resultsBg: '#0b0e12',
      ctaColor: '#22c55e',
      success: '#16a34a',
      error: '#dc2626',
      fontFamily: 'jakarta',
      fieldStyle: 'filled',
      radius: 12,
      headingWeight: 700,
      bodyWeight: 400,
      fontSize: 'medium',
      logoPlacement: 'top-left',
      logoSize: 'medium',
      bgMode: 'solid',
      resultPanel: {
        emphasis: 'bold',
        border: 'subtle',
        // Parts and labor confirm after the on-site diagnostic — ±12%.
        range_mode: { enabled: true, band_pct: 12 },
      },
      animations: {
        step_transition: 'fade',
        duration_ms: 250,
        reduced_motion_respect: true,
      },
      premiumAnimations: {
        enabled: true,
        countUp: true,
        staggerReveal: true,
        cardFlip: false,
        confetti: false,
      },
    },
    header: { title: 'Mobile Mechanic — We Come to You', subtitle: 'ASE-certified techs · 12-month / 12k-mile warranty · Upfront pricing', align: 'left' },
    steps: [
      { id: 'step_service', label: 'What you need', help: 'Pick the service — a diagnostic if you are not sure.', fields: ['mm_service', 'mm_vehicle'] },
      { id: 'step_when', label: 'When & where', help: 'Timing and whether we drive to you.', fields: ['mm_timing', 'mm_mobile'] },
      { id: 'step_extras', label: 'Trip & extras', help: 'Distance band and add-on services.', fields: ['mm_distance', 'mm_extras'] },
    ],
    fields: [
      // image_choice on the highest-uncertainty driver — what kind of service.
      { id: 'mm_service', name: 'Service', label: 'What do you need?', type: 'image_choice',
        help: 'Not sure what is wrong? Start with a diagnostic — the fee credits toward the repair.',
        options: [
          { ...optImg('Diagnostic warning light', 95, 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=300&h=300&fit=crop'),
            description: 'On-site scan and inspection — the fee credits toward any repair we do.' },
          { ...optImg('Brakes pads & rotors', 320, 'https://images.unsplash.com/photo-1494526585095-c41746248156?w=300&h=300&fit=crop'),
            description: 'Front or rear pads and rotors replaced in your driveway.' },
          { ...optImg('Battery alternator or starter', 260, 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=300&h=300&fit=crop'),
            description: 'No-start diagnosis and charging-system part replacement.' },
        ] },
      { id: 'mm_vehicle', name: 'Vehicle Age', label: 'Vehicle age', type: 'radio',
        help: 'Older and luxury vehicles take more labor time and pricier parts.',
        options: [
          opt('Newer under 5 years', 1.0),
          opt('Typical 5 to 12 years', 1.15),
          opt('Older luxury or European', 1.4),
        ] },
      { id: 'mm_timing', name: 'Timing', label: 'How soon?', type: 'radio',
        help: 'After-hours and weekend visits carry a small dispatch surcharge.',
        options: [
          opt('Scheduled next few days', 0),
          opt('Same-day', 40),
          opt('After-hours or weekend', 90),
        ] },
      { id: 'mm_mobile', name: 'Mobile Visit', label: 'Come to me (mobile visit)', type: 'toggle',
        help: 'We bring the shop to your home or office — toggle off for shop drop-off.',
        on_value: 0 },
      // show_if — distance band only surfaces when a mobile visit is requested.
      { id: 'mm_distance', name: 'Trip Distance', label: 'Distance from our shop', type: 'select',
        help: 'A small trip charge covers the drive to you — the first 15 miles are free.',
        options: [
          { ...opt('Within 15 miles', 0), description: 'No trip charge — you are in our free service radius.' },
          opt('15-30 miles', 35),
          opt('30-50 miles', 70),
        ],
        show_if: { field: 'mm_mobile', op: 'eq', value: 'true' } },
      { id: 'mm_extras', name: 'Add-ons', label: 'Add-on services', type: 'multi_select',
        help: 'Optional — common services worth bundling into one visit.',
        options: [
          { ...opt('Oil & filter change', 75), description: 'Full-synthetic oil and a new filter while we are there.' },
          opt('Multi-point inspection', 45),
          opt('Wiper & cabin-filter refresh', 40),
        ] },
    ],
    calculations: [
      { ...calc('Service & Vehicle', '[Service] * [Vehicle Age]'), caption: 'Base service labor and parts, scaled to your vehicle.' },
      { ...calc('Timing & Trip', '[Timing] + [Trip Distance]'), caption: 'After-hours dispatch and the come-to-you trip charge.' },
      { ...calc('Add-ons', '[Add-ons]'), caption: 'Oil change, inspection and filter refresh bundled in.' },
      { ...calc('Total Estimate', '[Service & Vehicle] + [Timing & Trip] + [Add-ons]'),
        resultMode: 'primary', caption: 'Estimate — confirmed after the on-site diagnostic.' },
    ],
    result_calc: 'Total Estimate',
    results: {
      heading: 'Your Mobile Repair Estimate',
      show_breakdown: true,
      cta_label: 'Book My Mobile Mechanic',
      cta_heading: 'Skip the shop — we come to you',
      cta_sub: 'Our ASE tech confirms the diagnosis on site, prices the parts upfront, then fixes it in your driveway.',
      submit_success: 'Requested! Our dispatcher will call within one business day to schedule your mobile visit.',
      footnote: 'Includes ASE-certified mobile technician, parts and a 12-month / 12,000-mile warranty. Diagnostic fee credits toward any repair.',
    },
  },
];

/* ─── Lookups ─── */

export function getTemplatePreset(id: string): TemplateConfig | undefined {
  return TEMPLATE_PRESETS.find(t => t.id === id);
}

export function getPresetsByLayout(layout: TemplateLayout): TemplateConfig[] {
  return TEMPLATE_PRESETS.filter(t => t.layout === layout);
}

export function getPresetsByCategory(category: string): TemplateConfig[] {
  return TEMPLATE_PRESETS.filter(t => t.category === category);
}

/** All distinct categories, in first-seen order — for the Phase 2 gallery. */
export function getTemplateCategories(): string[] {
  const seen: string[] = [];
  for (const t of TEMPLATE_PRESETS) if (!seen.includes(t.category)) seen.push(t.category);
  return seen;
}

/** Layout-variant id suffixes. A template whose id ends in one of these is a
 *  per-layout VARIANT of a logical template (they share the same `name`); only
 *  the layout differs. Layout is chosen in-editor, so these must collapse to a
 *  single gallery card. */
const LAYOUT_VARIANT_SUFFIXES = ['_single_col', '_two_col', '_multi_col'] as const;

function hasLayoutSuffix(id: string): boolean {
  return LAYOUT_VARIANT_SUFFIXES.some((s) => id.endsWith(s));
}

/** Collapse layout variants (…_single_col/_two_col/_multi_col that share a
 *  display name) to ONE representative per template name, preserving
 *  catalogue order. Used by the gallery + marketing listing so the same
 *  title never appears as multiple cards. Layout itself is chosen in-editor.
 *
 *  Per-name representative preference (best kept id):
 *    (a) an id WITHOUT a layout suffix (the base/canonical, e.g.
 *        `junk_removal_quote`), else
 *    (b) the `_two_col` variant (sensible default layout), else
 *    (c) the first occurrence seen.
 *  The kept representatives appear in original catalogue order (first-seen
 *  position of each name). Pure — never mutates the input. */
export function collapseLayoutVariants(list: TemplateConfig[]): TemplateConfig[] {
  // first-seen order of names → preserves catalogue order of representatives.
  const order: string[] = [];
  const chosen = new Map<string, TemplateConfig>();

  for (const t of list) {
    const name = t.name.trim();
    const current = chosen.get(name);
    if (!current) {
      order.push(name);
      chosen.set(name, t);
      continue;
    }
    // A representative is already chosen — only replace it if `t` is strictly
    // more canonical (preference (a) base > (b) _two_col > (c) first seen).
    const currentIsBase = !hasLayoutSuffix(current.id);
    if (currentIsBase) continue; // (a) already held — nothing beats it.
    const tIsBase = !hasLayoutSuffix(t.id);
    if (tIsBase) {
      chosen.set(name, t); // upgrade to canonical base.
      continue;
    }
    // Neither is base: prefer _two_col over the first-seen suffixed variant.
    const currentIsTwoCol = current.id.endsWith('_two_col');
    if (!currentIsTwoCol && t.id.endsWith('_two_col')) {
      chosen.set(name, t);
    }
  }

  return order.map((name) => chosen.get(name)!);
}

/* ─── Runtime config bridge ─── */

/**
 * Wave H5 — Style tab overrides.
 *
 * Composed on top of the resolved `WidgetTheme` at render time. Every field is
 * optional; absent fields fall through to the theme defaults so a calculator
 * without a Style customisation looks identical to its template. The shape is
 * intentionally narrow: it carries USER choices, not derivations (e.g.
 * accentTint is recomputed from `accent` at render time).
 *
 * `fieldStyle`, `radius` and `widgetWidth` are structural — the renderer
 * applies them via inline styles / data-attributes. They are PERSISTABLE: no
 * `__preview` flag here so a saved style survives a server round-trip.
 */
export type AdvFieldStyle = 'filled' | 'outline';
/**
 * Curated font families exposed in the Style tab.
 *
 * Wave L S3 — expanded with modern grotesks that fit the design system
 * (Satoshi, Geist, Plus Jakarta Sans, IBM Plex Sans, Outfit, Sora). The
 * resolved font-family stacks (client/src/components/wizard/elfsight/types.ts
 * → FONT_FAMILY_STACKS) all end with `system-ui, sans-serif` so a network
 * failure to load the webfont degrades gracefully.
 */
export type AdvFontFamily =
  | 'system' | 'inter' | 'manrope'
  | 'satoshi' | 'geist' | 'jakarta' | 'plex' | 'outfit' | 'sora';
export type AdvWidgetWidth = 'narrow' | 'wide' | 'full';
/** W-AO-6b — logo placement in the calculator header. */
export type AdvLogoPlacement = 'top-left' | 'top-center' | 'top-right' | 'hidden';
/** W-AO-6b — logo render size in pixels (small=24, medium=36, large=52). */
export type AdvLogoSize = 'small' | 'medium' | 'large';
/** W-AO-6b — heading & body font weights (segmented). */
export type AdvHeadingWeight = 500 | 600 | 700 | 800;
export type AdvBodyWeight = 400 | 500;
/** W-AO-6b — base font size token. */
export type AdvFontSize = 'small' | 'medium' | 'large';
export interface AdvStyle {
  /** Accent / CTA colour. Overrides theme.accent. */
  accent?: string;
  /**
   * Colour A — the CTA button background ONLY. When set, the CTA uses this
   * colour instead of deriving from `accent`/result panel, and its label
   * colour is derived from this colour's luminance (dark text on a bright
   * CTA, white on a dark CTA — never white-on-yellow). Two-zone theming:
   * `accent` (Colour B) drives the left-side accents + result panel, while
   * `ctaColor` (Colour A) is reserved for the CTA alone. Absent → the CTA
   * keeps its legacy accent/result-tinted derivation (no regression).
   */
  ctaColor?: string;
  /** Calculator body background. Overrides theme.bg. */
  background?: string;
  /** Primary text colour. Overrides theme.text. */
  text?: string;
  /** Result-panel background. Overrides theme.result. */
  resultsBg?: string;
  /** W-AO-6b — secondary CTA / accent-variant colour. */
  secondary?: string;
  /** W-AO-6b — card / panel surface colour (distinct from body background). */
  surface?: string;
  /** W-AO-6b — input + container border colour. */
  border?: string;
  /** W-AO-6b — positive-state colour (quote confirmed, etc). */
  success?: string;
  /** W-AO-6b — error / validation-failure colour. */
  error?: string;
  fontFamily?: AdvFontFamily;
  fieldStyle?: AdvFieldStyle;
  /**
   * Label placement for inputs. `float` (default) = the title-in-field
   * floating-label pattern. `stacked` = an Elfsight-style layout: a bold
   * dark title ABOVE the field with a small grey help line BELOW it. Opt-in
   * per calculator (currently used by the marketing template previews).
   */
  labelLayout?: 'float' | 'stacked';
  /** Corner radius in pixels (0–24). */
  radius?: number;
  widgetWidth?: AdvWidgetWidth;
  /**
   * Wave AC-1 — per-viewport pixel widths. Optional; when set, override
   * the `widgetWidth` enum for the matching viewport. Clamped at the
   * renderer to safe ranges (desktop 320–800, mobile 320–440).
   */
  widgetWidthDesktop?: number;
  widgetWidthMobile?: number;
  /** W-AO-6b — logo placement in the header (top-left / center / right / hidden). */
  logoPlacement?: AdvLogoPlacement;
  /** W-AO-6b — logo size (small=24px / medium=36px / large=52px). */
  logoSize?: AdvLogoSize;
  /** W-AO-6b — heading font weight (500 / 600 / 700 / 800). */
  headingWeight?: AdvHeadingWeight;
  /** W-AO-6b — body font weight (400 / 500). */
  bodyWeight?: AdvBodyWeight;
  /** W-AO-6b — base font size (small=14px / medium=16px / large=18px). */
  fontSize?: AdvFontSize;

  /* ─── W-AO-6c — Brand Studio Wave 1 (Pro tier) ───────────────────
   *
   * All Brand Studio fields are OPTIONAL and server-side tier-gated: a
   * free-tier calculator's update is stripped of these keys before
   * persistence (calculatorRoutes.ts). The renderer ALSO ignores them
   * when `planTier !== 'pro'/'business'` — defense in depth.
   */

  /** Raw CSS injected inside a scoped `<style>` tag at the widget root.
   *  Author-supplied; never executed as JS. Scoped via the unique
   *  `.qq-widget-${calculatorId}` class so it doesn't escape into the
   *  host page. */
  customCss?: string;

  /** Background mode for the widget body. Defaults to `'solid'` (uses
   *  the existing `background` colour token). `'gradient'` reads
   *  `bgGradient`; `'image'` reads `bgImageUrl` + `bgImageTint`. */
  bgMode?: AdvBgMode;

  /** Two-stop gradient + direction used when `bgMode === 'gradient'`. */
  bgGradient?: AdvBgGradient;

  /** Data URL (or remote URL) of the background image used when
   *  `bgMode === 'image'`. Reuses the existing logo-upload pipeline. */
  bgImageUrl?: string;

  /** Tint overlay opacity for the image background, 0-50 (percent). The
   *  overlay tint uses the calculator's `background` colour so the brand
   *  shows through. */
  bgImageTint?: number;

  /** Result-panel overrides — colours / emphasis / border. Optional;
   *  every sub-field falls through to the resolved theme default. */
  resultPanel?: AdvResultPanel;

  /* ─── W-AO-6d — Brand Studio Wave 2 (Pro tier) ───────────────────
   *
   * Step / transition animations. Optional; server-side stripped for
   * non-Pro tiers and renderer-side ignored when `planTier` isn't
   * unlocked. Absent value → instant transition (pre-AO-6d behaviour).
   */
  animations?: AdvAnimations;

  /**
   * BD-3l — Premium Animations Pack (Pro tier). When `enabled === true`
   * the widget runtime layers six high-craft effects (spring physics,
   * count-up, stagger reveal, CTA gradient pulse, 3D card flip, confetti)
   * on top of the base step-transition `animations` bundle above. Each
   * sub-effect can be individually disabled while the master stays on.
   * Server-side stripped for non-Pro tiers (BRAND_STUDIO_STYLE_KEYS).
   * Renderer-side honours `prefers-reduced-motion` defensively.
   */
  premiumAnimations?: AdvPremiumAnimations;

  /**
   * BD-2c — AI chat bubble visibility mode. Research (BD-0): the always-
   * visible bubble competes with the form; treating it as a "stuck-customer
   * rescue" (revealed at step >= 2, after 30s idle, or on explicit Help
   * click) improves both form completion AND chat engagement.
   *
   *  - `'rescue'` (default for Pro tier on new calculators) — hidden until
   *    the user has progressed past the first step or shown signs of being
   *    stuck. Once revealed, stays visible for the rest of the session.
   *  - `'always'` — legacy behaviour. Bubble visible from page load.
   *
   * Absent → renderer defaults to `'rescue'`. Free-tier calculators always
   * use `'rescue'` regardless of stored value (Pro-only toggle).
   */
  aiChatVisibility?: 'rescue' | 'always';

  /**
   * BD-3k — Deposit-required preview. Optional. When `enabled === true`
   * the widget result step shows a small accent-tinted badge above the
   * action buttons ("$X deposit required to schedule"); tapping the badge
   * opens a Stripe-style preview card (visual only — NEVER charges money
   * in preview; production deposit checkout is wired through an existing
   * Stripe flow elsewhere). Absent → no badge, legacy behaviour.
   */
  deposit?: AdvDeposit;

  /**
   * BD-3k — Online-booking calendar preview. Optional. When `enabled === true`
   * the widget renders a 3-day slot-picker beneath the price headline on the
   * result step. `source: 'wefixtrades-default'` uses mock slots in-widget
   * (delegates to BB-1's `book_appointment` customer tool when available);
   * `'cal.com-url'` / `'calendly-url'` open the external scheduler. Absent →
   * no calendar, legacy behaviour.
   */
  booking?: AdvBooking;

  /**
   * Owner toggle for the widget's trust-badge strip. Absent / true → the row
   * shows; false → hidden. Mirrored on ShellStyle so the editor toggle
   * round-trips through save into the persisted advanced style.
   */
  showTrustBadges?: boolean;

  /**
   * BD-3k — "Powered by WeFixTrades" footer badge. Optional. Absent →
   * defaults to ON (badge shown). When `showPoweredBy === false` the
   * badge is hidden. Free-tier calculators have this locked ON regardless
   * of stored value (renderer-side defense + server-side strip via
   * `BRAND_STUDIO_STYLE_KEYS`). Pro+ tiers can toggle freely.
   */
  branding?: AdvBranding;

  /**
   * BD-3m — Floating-launcher embed mode. Optional. When `enabled === true`
   * the embed script renders a 56×56 circular launcher icon in the chosen
   * corner; clicking expands the full widget in a 480×720 panel. Absent /
   * `enabled === false` → inline embed (legacy behaviour).
   *
   * `customIconUrl` + `label` are Pro-tier only and listed in
   * `BRAND_STUDIO_STYLE_KEYS`; free-tier patches that set them are stripped
   * server-side. `enabled` and `position` are available on every tier so
   * any owner can opt into the floating embed shape.
   */
  floatingLauncher?: AdvFloatingLauncher;

  /**
   * BG-7 Item 6 — per-template button-copy overrides. Every field optional;
   * unset values fall back to the renderer's default copy ("Back" /
   * "Continue" / "See my quote" / "Email me this quote" / "Book a
   * consultation"). All values are sanitized HTML (compact RichTextField).
   *
   * Pro-tier — listed in `BRAND_STUDIO_STYLE_KEYS` so free-tier patches
   * are stripped before persistence; the renderer also falls back to
   * defaults when planTier is free (defense in depth).
   */
  buttonCopy?: AdvButtonCopy;
}

/**
 * BG-7 Item 6 — per-template button-copy override slot. All five fields
 * are optional; an absent / empty value means "use the renderer default".
 *
 * Values are stored as sanitized HTML and sanitized again on read — same
 * pattern as the other RichTextField-backed slots (header.title,
 * results.heading, option.label, step.description).
 */
export interface AdvButtonCopy {
  /** Override for the "← Back" stepper button. */
  back?: string;
  /** Override for the primary "Continue" / "Next" stepper button. */
  next?: string;
  /** Override for the final-step "See my quote" advance button. */
  submit?: string;
  /** Override for the contact step's primary soft CTA (default
   *  "Email me this quote"). */
  emailQuote?: string;
  /** Override for the contact step's hard CTA (default "Book a
   *  consultation"). */
  bookSlot?: string;
}

/** W-AO-6c — Brand Studio background mode. */
export type AdvBgMode = 'solid' | 'gradient' | 'image';

/** W-AO-6c — gradient direction shorthand consumed by the renderer.
 *  W-AS-1c — extended with standard CSS linear-gradient direction shorthands
 *  (`'to top'`, `'to bottom right'`, …) so templates can pick diagonals.
 *  The legacy `'linear-*'` values are retained for backwards-compat with
 *  any stored configs from AO-6c. */
export type AdvBgGradientDirection =
  | 'linear-up' | 'linear-down' | 'linear-left' | 'linear-right' | 'radial'
  | 'to top' | 'to top right' | 'to right' | 'to bottom right'
  | 'to bottom' | 'to bottom left' | 'to left' | 'to top left';

/** W-AO-6c — two-stop gradient + direction. */
export interface AdvBgGradient {
  from?: string;
  to?: string;
  direction?: AdvBgGradientDirection;
}

/** W-AO-6c — result-panel emphasis token. */
export type AdvResultEmphasis = 'subtle' | 'normal' | 'bold';

/** W-AO-6c — result-panel border treatment.
 *  W-AS-1c — `'accent-tinted'` added: a 1.5px accent border at ~22% opacity,
 *  midway between the hairline `'subtle'` and the full-strength `'accent'`. */
export type AdvResultBorder = 'none' | 'subtle' | 'accent' | 'accent-tinted';

/** W-BB-3 — range-pricing display mode. When `enabled`, the headline value
 *  renders as `$LOW – $HIGH` (±band_pct, rounded to $25). Industry-standard
 *  for trades quoting — lowers buyer commitment anxiety. Default off so
 *  existing 44 templates render identically. */
export interface AdvResultRangeMode {
  /** When true, headline renders as a range; false / absent → single value. */
  enabled: boolean;
  /** Band percentage (5–25). Default 8 → $2500 becomes $2300–$2700. */
  band_pct: number;
}

/** W-AO-6c — result-panel overrides. Every field optional; absent →
 *  the existing renderer defaults win. */
export interface AdvResultPanel {
  /** Override accent colour for the headline value + dividers. */
  accentOverride?: string;
  /** Override the result-panel background (defaults to `resultsBg`). */
  bgOverride?: string;
  /** Headline value emphasis — `'normal'` (default), `'subtle'` or `'bold'`. */
  emphasis?: AdvResultEmphasis;
  /** Border treatment — `'subtle'` (default), `'none'`, `'accent'`. */
  border?: AdvResultBorder;
  /** W-BB-3 — range-pricing display mode. Absent → single value (legacy). */
  range_mode?: AdvResultRangeMode;
}

/** W-AO-6d — step transition kinds. `none` = instant (legacy behaviour). */
export type AdvStepTransition = 'none' | 'fade' | 'slide' | 'slide-fade';

/** W-AO-6d — animations bundle. Every field optional; absent value →
 *  legacy instant transition. */
export interface AdvAnimations {
  step_transition?: AdvStepTransition;
  /** Transition duration in ms; clamped to 100..600 at render. */
  duration_ms?: number;
  /** When true (default), `prefers-reduced-motion: reduce` forces instant. */
  reduced_motion_respect?: boolean;
}

/**
 * BD-3l — Premium Animations Pack (Pro tier).
 *
 * A single master toggle (`enabled`) flips on six "wow"-tier animations
 * that make the widget feel like Linear/Vercel-grade craft. Granular per-
 * effect toggles let owners mix in/out individual effects — when a sub-
 * toggle is `undefined` AND `enabled === true`, it defaults to `true`
 * (i.e. the master switch turns the whole pack on). All effects respect
 * `prefers-reduced-motion: reduce` (renderer-side, defense in depth).
 *
 * Pro-gated via `BRAND_STUDIO_STYLE_KEYS` — free-tier patches setting
 * `premiumAnimations` are stripped before save.
 */
export interface AdvPremiumAnimations {
  /** Master toggle — enables the whole pack. */
  enabled: boolean;
  /** Spring-physics transitions (replaces ease curves). Default on when `enabled`. */
  spring?: boolean;
  /** Number count-up on result reveal (extends pre-existing useCountUp). */
  countUp?: boolean;
  /** Stagger reveal on step entry — cascading 40 ms per child. */
  staggerReveal?: boolean;
  /** CTA conic-gradient pulse animation. */
  ctaPulse?: boolean;
  /** 3D card flip on step change. */
  cardFlip?: boolean;
  /** Subtle confetti burst on quote completion (final step). */
  confetti?: boolean;
}

/**
 * BD-3k — Deposit preview. Owner enables a "deposit required to schedule"
 * affordance in the widget result step. The amount + label are surfaced
 * as a small accent-tinted badge above the action buttons; tapping the
 * badge opens a Stripe-style preview card (read-only — production
 * Stripe Checkout integration is owned elsewhere, this is the visual
 * surface only).
 */
/**
 * P2 UX — allowed deposit-badge icon names. Whitelisted set of 10
 * lucide-react glyphs the wizard offers in its inline icon picker. The
 * renderer maps each name back to its lucide component; unknown values
 * fall through to the default `Lock` icon (back-compat with calculators
 * saved before the picker shipped).
 */
export type AdvDepositIconName =
  | 'Lock'
  | 'Shield'
  | 'ShieldCheck'
  | 'Check'
  | 'CheckCircle'
  | 'Calendar'
  | 'Clock'
  | 'BadgeCheck'
  | 'FileCheck'
  | 'Award';

export interface AdvDeposit {
  /** Master toggle — when false the badge is hidden entirely. */
  enabled: boolean;
  /** Deposit amount (whole units of the business-level currency;
   *  clamped 1..100000 at render). Currency is sourced from
   *  `numberFormat.currency` (settings-level ISO 4217 code) — the
   *  field is currency-agnostic at the schema layer. */
  amount: number;
  /** Override copy for the badge. Default: "Deposit required to schedule". */
  label?: string;
  /** P2 UX — icon glyph rendered to the left of the badge text. Defaults
   *  to `'Lock'` (the legacy hard-coded icon) when absent. */
  iconName?: AdvDepositIconName;
}

/**
 * BD-3k — Online-booking calendar preview. When enabled the widget shows
 * a 3-day slot-picker beneath the result-step price headline. Three
 * sources are supported:
 *   - 'wefixtrades-default' — built-in mock slots; production wires to
 *     BB-1's `book_appointment` customer tool when available.
 *   - 'cal.com-url' / 'calendly-url' — owner-supplied external scheduler
 *     URL opens in a new tab when a slot is tapped.
 */
export type AdvBookingSource = 'wefixtrades-default' | 'cal.com-url' | 'calendly-url';
export interface AdvBooking {
  /** Master toggle — when false the calendar block is hidden entirely. */
  enabled: boolean;
  /** Slot source. Defaults to the built-in mock when absent. */
  source: AdvBookingSource;
  /** External scheduler URL — required when source is cal.com / calendly. */
  url?: string;
}

/**
 * BD-3k — WeFixTrades branding badge in the sticky footer. Default is
 * ON across all tiers; Pro+ can opt out via `showPoweredBy: false`. The
 * server-side gate (BRAND_STUDIO_STYLE_KEYS) strips free-tier patches
 * that try to disable the badge, locking it ON for the free tier.
 */
export interface AdvBranding {
  /** When true (default) the footer badge is rendered. */
  showPoweredBy: boolean;
}

/**
 * BD-3m — Floating-launcher corner positions. The four viewport corners
 * the launcher icon can dock into. `'bottom-right'` matches the chat-bubble
 * default so it's the most natural starting position.
 */
export type AdvFloatingLauncherPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left';

/**
 * BD-3m — Floating-launcher (collapsed icon → expanded widget) embed mode.
 *
 * When `enabled === true` the embed script renders a small launcher icon
 * docked in the chosen corner instead of an inline widget. Clicking the
 * icon expands the full AdvancedCalculator in a 480×720 panel (auto-fits
 * the viewport; full-screen with backdrop scrim on ≤ 768px).
 *
 * - `enabled` + `position` are available on every tier (free-tier owners
 *   can opt into the floating shape).
 * - `customIconUrl` + `label` are Pro-tier only; listed in
 *   `BRAND_STUDIO_STYLE_KEYS` so free-tier patches are stripped before
 *   persistence. The renderer also ignores them when not Pro (defense in
 *   depth, same pattern as the rest of Brand Studio).
 *
 * Collision with the AI chat bubble (`qq-chat-position` localStorage): when
 * the launcher's corner matches the chat's resolved corner, the launcher
 * offsets 72px horizontally (desktop) or vertically (mobile) so the two
 * affordances never overlap. AIChatBubble.tsx is read-only from BD-3m — the
 * collision math is one-way (chat is the older surface, launcher yields).
 */
export interface AdvFloatingLauncher {
  /** Master toggle — when false (or absent) the embed renders inline. */
  enabled?: boolean;
  /** Viewport corner the launcher docks into. Defaults to `'bottom-right'`. */
  position?: AdvFloatingLauncherPosition;
  /** Pro-tier — replaces the default Calculator icon with an owner-uploaded
   *  image (data URL; ≤ 1 MB enforced by the StyleTab uploader). */
  customIconUrl?: string;
  /** Pro-tier — replaces the screen-reader label with custom copy (e.g.
   *  "Open quote calculator"). When absent the launcher reads "Open quote
   *  calculator". */
  label?: string;
}

/**
 * W-AO-6c — list of Brand Studio fields used by the server-side tier
 * gate to strip free-tier patches before persistence. Kept here (not in
 * the route) so the shape stays the source of truth.
 *
 * Wave 57 — strategic gating pivot. Under the Webflow/Notion/Figma model
 * adopted in Wave 57, the BUILDER is the trial — every visual / copy /
 * style customisation is free. Only OUTCOMES (live widget branding,
 * deposit capture, AI chat customer replies, custom domain, multi-calc,
 * etc.) remain paid. We therefore strip ONLY the `branding` key here
 * (the "Powered by WeFixTrades" footer toggle — that surfaces on the
 * LIVE widget and is the primary Free → Pro upsell). Every other former
 * Brand Studio key (customCss, bgGradient, animations, buttonCopy, etc.)
 * is now a free-tier builder feature.
 *
 * History (kept for context):
 *   - Pre-Wave-57 the set included: customCss, bgMode, bgGradient,
 *     bgImageUrl, bgImageTint, resultPanel, animations, aiChatVisibility,
 *     premiumAnimations, branding, buttonCopy.
 *   - Wave 57 retains: branding only.
 */
export const BRAND_STUDIO_STYLE_KEYS = [
  // BD-3k — WeFixTrades "Powered by" branding badge. The renderer also
  // defensively forces this ON for non-Pro tiers (defense in depth). The
  // server strip in calculatorRoutes.ts removes any attempt by a free-tier
  // caller to set `branding.showPoweredBy = false` so the badge stays
  // visible on the live widget — the primary outcome-tier upsell.
  'branding',
] as const;
/**
 * BD-3m — Floating-launcher Pro-only NESTED keys.
 *
 * Wave 57 — the strategic gating pivot moved every builder-time
 * customisation to Free. The floating-launcher icon and screen-reader
 * label are both pure builder-time visual customisation (no runtime
 * cost), so the set is now empty. The matching strip block in
 * calculatorRoutes.ts is therefore a no-op for the nested keys, kept
 * intact so future per-key Pro gating (if any) has a place to land.
 */
export const FLOATING_LAUNCHER_PRO_KEYS = [] as const;
export type FloatingLauncherProKey = (typeof FLOATING_LAUNCHER_PRO_KEYS)[number];
export type BrandStudioStyleKey = (typeof BRAND_STUDIO_STYLE_KEYS)[number];

/**
 * Brand defaults — Wave H5. Used by the StyleTab and by
 * `buildBlankPreviewConfig` so the preview seeds with the user's brand instead
 * of the Elfsight default.
 */
/**
 * Wave AC-1 — `widgetWidthDesktop` / `widgetWidthMobile` are intentionally
 * absent from the defaults. They're per-viewport pixel overrides that only
 * apply when the user explicitly picks one in the Style tab; otherwise the
 * renderer falls back to the existing `widgetWidth` enum.
 */
/**
 * Wave AC-1 — `widgetWidthDesktop` / `widgetWidthMobile` are intentionally
 * absent from the defaults.
 *
 * W-AO-6b — `secondary`, `surface`, `border`, `success`, `error`,
 * `logoPlacement`, `logoSize`, `headingWeight`, `bodyWeight` and `fontSize`
 * are also intentionally absent. They are NEW optional tokens; when unset
 * the renderer falls through to the legacy behaviour (`theme.surface`,
 * `theme.border`, default 600/400 weights, 16px base). Adding them to the
 * defaults would force every existing config to render with the new values.
 */
type AdvStyleOptionalOnly =
  | 'widgetWidthDesktop' | 'widgetWidthMobile'
  // Colour A — CTA-only colour. Optional and intentionally absent from
  // DEFAULT_ADV_STYLE so a calculator that doesn't set it keeps the legacy
  // accent/result-tinted CTA derivation (no regression).
  | 'ctaColor'
  | 'secondary' | 'surface' | 'border' | 'success' | 'error'
  | 'logoPlacement' | 'logoSize'
  | 'headingWeight' | 'bodyWeight' | 'fontSize'
  // Owner toggle, optional — absent/true → trust-badge strip shows.
  | 'showTrustBadges'
  // W-AO-6c — Brand Studio fields. All Pro-tier only, all optional and
  // intentionally absent from `DEFAULT_ADV_STYLE` so a fresh calculator
  // renders identically to the pre-AO-6c build.
  | 'customCss' | 'bgMode' | 'bgGradient' | 'bgImageUrl' | 'bgImageTint'
  | 'resultPanel'
  // W-AO-6d — Brand Studio Wave 2 animations. Same rationale as 6c
  // fields: Pro-only, optional, absent → instant transition (legacy).
  | 'animations'
  // BD-3l — Premium Animations Pack. Same rationale: Pro-only, optional,
  // absent → no premium effects (legacy widget look).
  | 'premiumAnimations'
  // BD-2c — AI chat visibility mode. Absent → renderer defaults to
  // 'rescue' (the new BD-0 behaviour). Pro tier can opt back to 'always'.
  | 'aiChatVisibility'
  // BD-3k — Inline preview features. All three are opt-in (master toggle
  // off by default) so absence keeps the widget rendering identically
  // to pre-BD-3k builds. `branding` is server-side tier-gated;
  // `deposit` + `booking` are available on every tier.
  | 'deposit' | 'booking' | 'branding'
  // BD-3m — Floating launcher embed mode. `enabled` + `position` are
  // free-tier allowed; `customIconUrl` + `label` are Pro-tier only
  // (stripped from free-tier patches by calculatorRoutes.ts as
  // `floatingLauncher.customIconUrl` / `floatingLauncher.label`). Absent
  // → inline embed (legacy behaviour).
  | 'floatingLauncher'
  // BG-7 Item 6 — per-template button-copy overrides. Pro-tier only;
  // absent → renderer default copy.
  | 'buttonCopy'
  // Label placement. Absent → `float` (title-in-field, the legacy default),
  // so a fresh calculator renders identically; `stacked` is opt-in.
  | 'labelLayout';

export const DEFAULT_ADV_STYLE: Required<Omit<AdvStyle, AdvStyleOptionalOnly>> = {
  accent: '#0d3cfc',
  background: '#ffffff',
  text: '#0f172a',
  resultsBg: '#ffffff',
  fontFamily: 'system',
  fieldStyle: 'filled',
  radius: 12,
  widgetWidth: 'wide',
};

/**
 * Number-format overrides — Wave H6. Drives the renderer's currency
 * formatting independent of the user's browser locale. Optional; absent slot
 * → pre-H6 en-US defaults.
 */
export interface AdvNumberFormat {
  thousands?: ',' | ' ' | '';
  decimal?: '.' | ',';
  /** ISO-4217 3-letter code. */
  currency?: string;
}

/**
 * BD-2b — Good/Better/Best 3-tier pricing.
 *
 * When `tiered.enabled === true`, the result step renders three tier cards
 * (Essential / Standard / Premium by default) instead of a single headline
 * value. Each tier price = `baseQuote * tier.multiplier`, rounded to the
 * nearest $25. The middle tier is marked `mostPopular` and gets a small
 * badge — anchors the choice toward the recommended price point.
 *
 * Research (BD-0): tiered presentation consistently outperforms single-price
 * AND 4+-tier alternatives (Journal of Business Research; FieldPulse + Jobber
 * recommend it specifically for trades). Auto-enabled for scope-spectrum
 * categories (Construction / Home Improvement / Outdoor) via
 * `shouldDefaultTiered()`; flat-fee categories (Cleaning / Professional /
 * Automotive / Emergency) keep the single-price model.
 */
export interface TemplateTier {
  /** Price multiplier — 1.0 = base quote. Three sensible defaults: 0.85 / 1.0 / 1.35. */
  multiplier: number;
  /** Short label shown above the price (e.g. "Essential", "Standard", "Premium"). */
  label: string;
  /** One-line description shown beneath the label. */
  tagline: string;
  /** When true, render a "Most Popular" badge above the card. Usually the middle tier. */
  mostPopular?: boolean;
}

export interface TemplateTiered {
  /** When true, the result step renders 3 tier cards instead of a single value. */
  enabled: boolean;
  /** Optional explicit tier shape. When absent, falls back to `DEFAULT_TIERS`. */
  tiers?: TemplateTier[];
}

/** The default Essential / Standard / Premium shape applied when `tiered.enabled`
 *  is on but no explicit `tiers[]` is provided. */
export const DEFAULT_TIERS: ReadonlyArray<TemplateTier> = [
  { multiplier: 0.85, label: 'Essential', tagline: 'Core scope, value pricing' },
  { multiplier: 1.0,  label: 'Standard',  tagline: 'Recommended for most homes', mostPopular: true },
  { multiplier: 1.35, label: 'Premium',   tagline: 'Top materials, extended warranty' },
];

/**
 * BD-2b — scope-spectrum categories where Good/Better/Best is the right
 * default. Material/scope spectrum exists (e.g. roof asphalt vs metal,
 * vinyl windows vs wood-clad, basic patio vs travertine).
 *
 * Flat-fee / variance-not-scope categories opt out:
 *   - Cleaning     — commodity per-visit pricing
 *   - Professional — flat fees by service
 *   - Automotive   — distance / type drives price, not material spectrum
 *   - Emergency    — variance is severity/access, not scope
 */
export function shouldDefaultTiered(category: string | undefined): boolean {
  const id = resolveDerivedCategoryId(category);
  return id === 'construction' || id === 'home-improvement' || id === 'outdoor';
}

/**
 * Resolve the effective tiered configuration for a runtime advanced config.
 *
 * Precedence:
 *   1. Explicit `advanced.tiered` (owner toggled in StyleTab) wins verbatim.
 *   2. Otherwise, derive from `advanced.category` via `shouldDefaultTiered()` —
 *      scope-spectrum categories default to enabled, everything else stays
 *      single-price.
 *   3. Tiers default to `DEFAULT_TIERS` when enabled but no explicit list.
 */
export function resolveTieredConfig(
  tiered: TemplateTiered | undefined,
  category: string | undefined,
): { enabled: boolean; tiers: TemplateTier[] } {
  if (tiered && typeof tiered.enabled === 'boolean') {
    const tiers = tiered.tiers && tiered.tiers.length > 0
      ? tiered.tiers
      : [...DEFAULT_TIERS];
    return { enabled: tiered.enabled, tiers };
  }
  if (shouldDefaultTiered(category)) {
    return { enabled: true, tiers: [...DEFAULT_TIERS] };
  }
  return { enabled: false, tiers: [...DEFAULT_TIERS] };
}

/**
 * BD-2b — business profile fields (trust signals).
 *
 * Owned by the wizard owner's profile (NOT per-template), so a multi-template
 * setup shares one license #, one Google rating, one BBB rating across every
 * calculator. Surfaced inline via `TrustStripHeader` (above-the-fold rating +
 * licensed/insured pills) and `TrustBlockUnderCTA` (license #, insured-up-to,
 * tiny icon row).
 *
 * Every field optional — when the whole object is undefined OR empty, the
 * trust strip / trust block render `null` (no placeholders).
 *
 * Research (BD-0): inline trust signals lift CVR 15-30%; CTA-adjacent trust
 * placement beats footer by 40-60% (hashmeta).
 */
export interface BusinessProfile {
  /** Aggregate Google rating (e.g. 4.8). Renders next to a star icon. */
  googleRating?: number;
  /** Total review count (e.g. 2134 → "2,134 Google reviews"). */
  googleReviewCount?: number;
  /** Years in business — drives the "15 years serving Phoenix" pill. */
  yearsInBusiness?: number;
  /** State license number — renders as "License #ABC12345" under the CTA. */
  licenseNumber?: string;
  /** Free-text insurance amount — e.g. "Insured up to $2M" or "Fully insured". */
  insuredAmount?: string;
  /** Optional service area — pairs with `yearsInBusiness` ("Serving Phoenix"). */
  serviceArea?: string;
  /** BBB rating letter grade (A+, A, B, etc.) when applicable. */
  bbbRating?: string;
}

/**
 * The runtime `calculator_settings.advanced` shape — what the renderer and the
 * builder persist. Kept identical to the pre-refactor shape so no stored
 * calculator needs migration; only the catalogue module shape changed.
 *
 * Wave H5 widens it with the optional `style` slot — back-compatible (older
 * configs render unchanged because every style field is optional and falls
 * through to the resolved theme).
 * Wave H6 widens it again with the optional `numberFormat` slot — also
 * back-compatible (absent → pre-H6 en-US defaults).
 * BD-2b widens it again with optional `tiered` + `businessProfile` — both
 * additive opt-in and back-compatible.
 */
export interface AdvancedConfigShape {
  enabled: true;
  theme: string;
  /** Wave W-AH-2 — Lucide icon name used in the header's logo slot fallback. */
  defaultIcon?: string;
  /** BD-2a / BD-1 — small category icon rendered LEFT of the step title. */
  categoryIcon?: string;
  /** BD-2a — derived/explicit category bucket; drives the default category
   *  icon and other category-derived defaults. */
  category?: string;
  /** BD-2a — optional explicit step grouping. Absent → auto-derived. */
  steps?: TemplateStep[];
  /** BD-2a — owner override: when explicitly `false`, the multi-step renderer
   *  is disabled and the widget reverts to the legacy single-form layout. */
  stepLayout?: 'stepper' | 'single';
  layout: TemplateLayout;
  fields: TemplateField[];
  calculations: TemplateCalculation[];
  result_calc: string;
  header: TemplateHeader;
  results?: TemplateResults;
  /** Wave H5 — user-driven Style tab overrides. */
  style?: AdvStyle;
  /** Wave H6 — user-driven Settings tab number-format overrides. */
  numberFormat?: AdvNumberFormat;
  /** BD-2b — Good/Better/Best 3-tier pricing. Absent → derived from category
   *  (scope-spectrum categories default-on; flat-fee default-off). */
  tiered?: TemplateTiered;
  /** BD-2b — business profile (license #, Google rating, etc.). When absent
   *  or empty, the trust strip + trust block render `null`. */
  businessProfile?: BusinessProfile;
  /** BD-2c — opt-in: render Google Places address autocomplete on the
   *  contact step. Absent / false → name + email + phone only (legacy). */
  requireAddress?: boolean;
  /** BF-9 — pre-curated trust badges (lucide icon + short label). Carried
   *  through verbatim by `toAdvancedConfig`; rendered as a pill row by the
   *  widget header. Absent → no badge row. */
  trustBadges?: readonly TrustBadge[];
  /**
   * Action tab — client-side spam honeypot on the lead-capture modal.
   * Absent / `true` → ON (protect by default); explicit `false` → OFF.
   * No backend involvement.
   */
  spamProtection?: boolean;
  /**
   * PRICING-MODELS — per-business anchor address for `address_distance`
   * fields. The server geocodes it ONCE on save (serviceAreaMapRoutes
   * pattern) and stores lat/lng beside the address; the distance endpoint
   * reads it server-side (the widget client never supplies the origin).
   * NOTE: `businessProfile.serviceArea` (free text) is NOT the anchor.
   */
  origin?: { address: string; lat?: number; lng?: number };
}

/* ─── W-BB-2 — Per-category visual identity (derived at load time) ───
 *
 * The three AS-1c templates (junk_removal_quote, window_replacement_quote,
 * mold_remediation_quote) ship explicit `style:` blocks and KEEP them — the
 * derivation helper is only called as a fallback inside `toAdvancedConfig`
 * when `template.style` is absent.
 *
 * Palette table mirrors the visual treatment specified by Wave AP-1
 * (`client/src/lib/categoryStyles.ts`). It is duplicated here intentionally
 * — `shared/` cannot import from `client/`, and keeping the table in
 * `shared/` makes it the source of truth for the renderer; the client
 * gallery palette stays in sync via the cross-checked entries.
 */
export type DerivedCategoryId =
  | 'automotive' | 'construction' | 'cleaning' | 'home-improvement'
  | 'emergency' | 'outdoor' | 'professional' | 'default';

interface DerivedCategoryPalette {
  bgFromHex: string;
  bgToHex: string;
  accent: string;
  urgency: 'low' | 'medium' | 'high';
  animationStyle: AdvStepTransition;
  headingWeight: AdvHeadingWeight;
  fontFamily: AdvFontFamily;
}

// BF-8 — palettes retoned for the live widget: desaturated, premium/business
// vibe (Stripe / Linear / Notion grade). Each category still has its own
// distinct hue family so the 7 buckets remain visually separable; only the
// saturation/brightness was pulled back. The card-mockup palette in
// `client/src/lib/categoryStyles.ts` (TemplateCardMockup) stays vivid for
// thumbnail differentiation — these defaults only affect the rendered widget.
const DERIVED_CATEGORY_PALETTES: Record<DerivedCategoryId, DerivedCategoryPalette> = {
  automotive: {
    bgFromHex: '#0c111c', bgToHex: '#1a2030', accent: '#d97706',
    urgency: 'high', animationStyle: 'slide-fade',
    headingWeight: 800, fontFamily: 'geist',
  },
  construction: {
    bgFromHex: '#1a1715', bgToHex: '#2b2723', accent: '#b45309',
    urgency: 'medium', animationStyle: 'slide',
    headingWeight: 700, fontFamily: 'satoshi',
  },
  cleaning: {
    bgFromHex: '#f6fbf9', bgToHex: '#e7f3ed', accent: '#0f766e',
    urgency: 'low', animationStyle: 'fade',
    headingWeight: 600, fontFamily: 'jakarta',
  },
  'home-improvement': {
    bgFromHex: '#f5f8fb', bgToHex: '#e2eaf5', accent: '#1d4ed8',
    urgency: 'medium', animationStyle: 'fade',
    headingWeight: 700, fontFamily: 'inter',
  },
  emergency: {
    bgFromHex: '#fff7ed', bgToHex: '#ffedd5', accent: '#b91c1c',
    urgency: 'high', animationStyle: 'slide-fade',
    headingWeight: 800, fontFamily: 'manrope',
  },
  outdoor: {
    bgFromHex: '#f4f8f4', bgToHex: '#e0ebe0', accent: '#15803d',
    urgency: 'low', animationStyle: 'slide',
    headingWeight: 700, fontFamily: 'jakarta',
  },
  professional: {
    bgFromHex: '#f8f4fa', bgToHex: '#ebe3f0', accent: '#6d28d9',
    urgency: 'medium', animationStyle: 'fade',
    headingWeight: 600, fontFamily: 'satoshi',
  },
  default: {
    bgFromHex: '#f1f5f9', bgToHex: '#e2e8f0', accent: '#475569',
    urgency: 'low', animationStyle: 'fade',
    headingWeight: 600, fontFamily: 'system',
  },
};

/** Collapse the wider `category` string set down to one of the 7 visual
 *  families used by the live renderer. Mirrors the gallery's
 *  `getCategoryStyle()` in `client/src/lib/categoryStyles.ts`. */
export function resolveDerivedCategoryId(category: string | undefined): DerivedCategoryId {
  if (!category) return 'default';
  const c = category.toLowerCase();
  if (c.includes('automotive') || c.includes('moving') || c.includes('mechanical')) return 'automotive';
  if (c.includes('construction') || c.includes('driveway') || c.includes('renovation')) return 'construction';
  if (c.includes('cleaning')) return 'cleaning';
  if (c.includes('home improvement') || c.includes('hvac')) return 'home-improvement';
  if (c.includes('emergency') || c.includes('restoration') || c.includes('repair')) return 'emergency';
  if (c.includes('outdoor') || c.includes('renewable')) return 'outdoor';
  if (c.includes('professional') || c.includes('photography') || c.includes('specialty')) return 'professional';
  return 'default';
}

/** Fixed rotation so two templates within the same category don't read as
 *  identical. Indexed by template position within its category. */
const GRADIENT_DIRECTION_ROTATION: AdvBgGradientDirection[] = [
  'to bottom right', 'to bottom', 'to bottom left', 'radial',
];

/** Compute a deterministic in-category index for a given template id —
 *  by hashing the id into 0..N so a template always lands on the same
 *  gradient direction across reloads. */
function indexFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * BD-2a-polish — reverse lookup: given a gradient `from` colour seen on a
 * live shell style, infer the derived category id that produced it.
 *
 * Used by `StyleTab` to know whether to show the "consider enabling range
 * mode" suggestion above the toggle, WITHOUT plumbing the template id /
 * category through the wizard shell props. If the user has hand-tweaked the
 * background colour, the lookup returns `'default'` and the banner stays
 * hidden — which is exactly what we want (a customised style implies the
 * user already knows the look they're after).
 */
export function inferDerivedCategoryFromBgFrom(
  bgFrom: string | undefined,
): DerivedCategoryId {
  if (!bgFrom) return 'default';
  const hex = bgFrom.trim().toLowerCase();
  for (const [id, palette] of Object.entries(DERIVED_CATEGORY_PALETTES)) {
    if (palette.bgFromHex.toLowerCase() === hex) {
      return id as DerivedCategoryId;
    }
  }
  return 'default';
}

/**
 * BD-2a-polish — categories where range-pricing is the right default.
 *
 * High-variance trades: real cost moves with site conditions / scope (roofing,
 * mold remediation, window replacement, HVAC installs, foundation work).
 * Showing `$2,300 – $2,700` tracks the actual uncertainty and converts better
 * than a false-precision single value.
 *
 * Everything NOT in this set defaults to a flat single price — commodity work
 * like gutter cleaning ($149), drain unclog ($89), lawn mowing per visit, or
 * professional services priced as flat fees. A range there reads as "they
 * don't know what they're doing" and HURTS conversion.
 *
 * Owners can still flip the toggle per-template via Style tab → Brand Studio
 * → Result panel → Display as range.
 */
export function shouldDefaultRangeMode(category: string | undefined): boolean {
  const id = resolveDerivedCategoryId(category);
  return id === 'construction' || id === 'emergency' || id === 'home-improvement';
}

/* ─── Template themes — 13 approved reference combos ──────────────────
 *
 * Single source of truth for the per-template theming system. Every
 * style-LESS template resolves to ONE of these 13 combos (via
 * `defaultThemeForTemplate`) so it loads with a category-appropriate
 * palette instead of the generic white/blue default. The website +
 * wizard thumbnail import these same exports so the gallery, the live
 * widget, and the picker thumbnail all agree on the colours.
 */
export interface ThemeCombo {
  id: string; name: string;
  bg: string; text: string; surface: string; border: string;   // shared light body
  resultsBg: string; accent: string; ctaColor: string;
}

// ── Per-combo body derivation ────────────────────────────────────────
// Earlier every combo spread an IDENTICAL flat-white body (`#fff` bg,
// `#f6f7f9` surface, `#e5e7eb` border), so only the result panel + accents
// picked up the theme and the widget read as a coloured card floating in a
// white shell. We now DERIVE a subtle, theme-coherent light body from each
// combo's accent: a faintly accent-tinted canvas, an accent-tinted field
// surface, and a low-alpha accent border. The body stays light with dark
// text (readability first — this is a customer-fill calculator); the
// renderer still funnels every text colour through `guardTextColor`, so the
// tint can never push contrast below AA.

/** Parse `#rgb` / `#rrggbb` into 0-255 channels. Falls back to mid-grey for
 *  any non-hex value so the math never throws. */
function parseHexRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return { r: 128, g: 128, b: 128 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Mix `color` over opaque white at `amount` (0-1) → an opaque hex tint.
 *  Used so the canvas/surface read as a very light wash of the accent
 *  while staying near-white and fully readable. */
function tintOverWhite(color: string, amount: number): string {
  const { r, g, b } = parseHexRgb(color);
  const mix = (c: number) => Math.round(255 + (c - 255) * amount);
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

/** A low-alpha accent border (rgba) — themes the resting field/input
 *  hairlines without the harsh flat grey, and stays subtle on the light
 *  canvas. */
function accentBorder(color: string, alpha: number): string {
  const { r, g, b } = parseHexRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Derive a subtle, theme-coherent LIGHT body from a combo's accent.
 * Tasteful by design: the canvas (`bg`) is a ~2.5% accent wash over white,
 * field surfaces (`surface`) a ~5% wash, and the border a low-alpha accent
 * hairline. Text stays near-`#171717` so it remains legible on the tint
 * (and the renderer re-guards it through `guardTextColor`). Pure + total
 * — same input always yields the same body, no side effects.
 */
export function deriveComboBody(accent: string): { bg: string; text: string; surface: string; border: string } {
  return {
    bg: tintOverWhite(accent, 0.025),     // ~2.5% accent wash — canvas reads as part of the theme, still near-white
    surface: tintOverWhite(accent, 0.05), // ~5% accent wash — field fills sit a touch above the canvas, theme-coherent
    border: accentBorder(accent, 0.18),   // low-alpha accent hairline — replaces flat #e5e7eb, themes resting field borders
    text: '#171717',                      // dark body text — legibility first; guardTextColor re-checks AA at render
  };
}

export const THEME_COMBOS: readonly ThemeCombo[] = [
  { id: 'black-yellow', name: 'Black · Yellow', ...deriveComboBody('#0d0d0d'), resultsBg: '#0d0d0d', accent: '#0d0d0d', ctaColor: '#ffd60a' },
  { id: 'car-rental',   name: 'Crimson',        ...deriveComboBody('#d83a3d'), resultsBg: '#d83a3d', accent: '#d83a3d', ctaColor: '#141414' },
  { id: 'mortgage',     name: 'Sky Tint',       ...deriveComboBody('#2563eb'), resultsBg: '#eaf1fb', accent: '#2563eb', ctaColor: '#2563eb' },
  { id: 'loan',         name: 'Onyx · Red',     ...deriveComboBody('#ed3237'), resultsBg: '#1a1a1a', accent: '#ed3237', ctaColor: '#ed3237' },
  { id: 'emi',          name: 'Azure',          ...deriveComboBody('#29abe2'), resultsBg: '#29abe2', accent: '#29abe2', ctaColor: '#141414' },
  { id: 'bmi',          name: 'Mint Tint',      ...deriveComboBody('#2e9e3f'), resultsBg: '#e8f3e9', accent: '#2e9e3f', ctaColor: '#2e9e3f' },
  { id: 'profit',       name: 'Forest',         ...deriveComboBody('#4a7a4e'), resultsBg: '#4a7a4e', accent: '#4a7a4e', ctaColor: '#141414' },
  { id: 'fees',         name: 'Navy',           ...deriveComboBody('#2f6be0'), resultsBg: '#1e2a44', accent: '#2f6be0', ctaColor: '#2f6be0' },
  { id: 'reno',         name: 'Olive · Orange', ...deriveComboBody('#e8821e'), resultsBg: '#4a5240', accent: '#e8821e', ctaColor: '#e8821e' },
  { id: 'tshirt',       name: 'Violet',         ...deriveComboBody('#7c5cc4'), resultsBg: '#7c5cc4', accent: '#7c5cc4', ctaColor: '#141414' },
  { id: 'wedding',      name: 'Royal · Orange', ...deriveComboBody('#1e6fd4'), resultsBg: '#1e6fd4', accent: '#1e6fd4', ctaColor: '#e8821e' },
  { id: 'carbon',       name: 'Teal',           ...deriveComboBody('#1a9b8e'), resultsBg: '#1a9b8e', accent: '#1a9b8e', ctaColor: '#141414' },
  { id: 'cake',         name: 'Blush',          ...deriveComboBody('#ec4899'), resultsBg: '#fce7f0', accent: '#ec4899', ctaColor: '#ec4899' },
];

export const DEFAULT_THEME_COMBO: ThemeCombo = THEME_COMBOS.find(c => c.id === 'mortgage')!;

/** Map a combo's palette onto the AdvStyle colour slots the renderer reads. */
export function comboToStyleColors(c: ThemeCombo): Pick<AdvStyle,'accent'|'background'|'text'|'surface'|'border'|'resultsBg'|'ctaColor'> {
  return { accent: c.accent, background: c.bg, text: c.text, surface: c.surface, border: c.border, resultsBg: c.resultsBg, ctaColor: c.ctaColor };
}

/** Per-template-id overrides (combo id keyed by template id). These win over
 *  the category default. */
const THEME_OVERRIDES_BY_ID: Record<string, string> = {
  // black-yellow
  car_towing: 'black-yellow', mobile_car_detail: 'black-yellow',
  electrical_work: 'black-yellow', locksmith: 'black-yellow',
  locksmith_service: 'black-yellow',
  // loan
  roof_repair: 'loan', roofing: 'loan', roof_replacement: 'loan',
  chimney_sweep: 'loan', water_damage: 'loan',
  water_damage_restoration: 'loan', mold_remediation: 'loan',
  emergency_hvac: 'loan',
  // cake
  interior_painting: 'cake', interior_painting_pro: 'cake',
  // tshirt
  web_design_quote: 'tshirt',
  // wedding
  photography_package: 'wedding',
  // emi
  solar_panels: 'emi', solar_panel_install: 'emi',
  window_replacement: 'emi', window_replacement_quote: 'emi',
  window_cleaning_quote: 'emi', bathroom_renovation: 'emi',
  plumbing_service: 'emi',
  // bmi
  energy_upgrade: 'bmi', insulation: 'bmi',
  move_out_cleaning: 'bmi', ev_charger_install: 'bmi',
  // carbon
  property_cleaning: 'carbon', gutter_cleaning: 'carbon',
  pool_service_quote: 'carbon', pressure_washing_quote: 'carbon',
  deep_home_cleaning: 'carbon',
  // profit
  landscaping: 'profit', siding: 'profit', pest_control: 'profit',
  pest_control_quote: 'profit', tree_service: 'profit',
  tree_trimming: 'profit', lawn_care_subscription: 'profit',
  // reno
  driveway_paving: 'reno', fence_installation: 'reno',
  house_renovation: 'reno', drywall: 'reno', deck: 'reno',
  junk_removal: 'reno', junk_removal_quote: 'reno',
  kitchen_renovation: 'reno', concrete_driveway_replacement: 'reno',
  tile_installation: 'reno', flooring: 'reno',
  // fees
  general_contractor: 'fees', moving_services: 'fees',
  moving_service: 'fees', hvac_installation: 'fees',
  appliance_repair: 'fees', door_installation: 'fees',
  garage_door: 'fees', garage_door_service: 'fees',
  office_cleaning: 'fees', basement_finishing: 'fees',
  home_inspection_quote: 'fees',
};

/** Per-category default combo (combo id keyed by the preset's `category`
 *  string). Used when the template id has no explicit override. */
const THEME_BY_CATEGORY: Record<string, string> = {
  'Automotive': 'black-yellow',
  'Emergency': 'black-yellow',
  'Restoration': 'loan',
  'Construction': 'reno',
  'Renovation': 'reno',
  'Driveway': 'reno',
  'Home Improvement': 'emi',
  'HVAC & Mechanical': 'fees',
  'Mechanical': 'fees',
  'Cleaning': 'carbon',
  'Outdoor': 'profit',
  'Professional': 'fees',
  'Photography & Events': 'wedding',
  'Renewable Energy': 'emi',
  'Specialty Services': 'profit',
  'Repair Services': 'fees',
  'Moving': 'fees',
};

function comboById(id: string): ThemeCombo | undefined {
  return THEME_COMBOS.find(c => c.id === id);
}

/**
 * Resolve a template's default theme combo: per-id override → category
 * default → mortgage fallback.
 *
 * `category` is optional; when omitted, the preset is looked up in
 * TEMPLATE_PRESETS by id to read its category.
 */
export function defaultThemeForTemplate(templateId: string, category?: string): ThemeCombo {
  const id = (templateId ?? '').toLowerCase();
  const overrideId = THEME_OVERRIDES_BY_ID[id];
  if (overrideId) {
    const combo = comboById(overrideId);
    if (combo) return combo;
  }
  const cat = category ?? TEMPLATE_PRESETS.find(p => p.id === templateId)?.category;
  if (cat) {
    const catComboId = THEME_BY_CATEGORY[cat];
    if (catComboId) {
      const combo = comboById(catComboId);
      if (combo) return combo;
    }
  }
  return DEFAULT_THEME_COMBO;
}

/**
 * W-BB-2 — derive a full `AdvStyle` from a template's `category` field.
 *
 * Called by `toAdvancedConfig` ONLY when the template doesn't carry its own
 * `style` block, so the 3 AS-1c templates remain untouched.
 *
 * Per-category palette + per-template gradient direction variation, so the
 * 44 derived templates feel distinctly different without hand-editing each
 * one.
 */
export function deriveStyleFromCategory(t: Pick<TemplateConfig, 'id' | 'category'>): AdvStyle {
  const palette = DERIVED_CATEGORY_PALETTES[resolveDerivedCategoryId(t.category)];
  // Wave 10 — AI-generated templates (replace_template tool) may omit `id`,
  // and partial preset objects from older save formats may too. Guard
  // indexFromId so the gradient direction picker doesn't crash the page
  // with "Cannot read properties of undefined (reading 'length')".
  const direction =
    GRADIENT_DIRECTION_ROTATION[indexFromId(t.id ?? '') % GRADIENT_DIRECTION_ROTATION.length];
  // BD-2a-polish — range-pricing default is OPT-IN by category.
  // High-variance: Construction / Emergency / Home Improvement → on.
  // Commodity / flat-fee: Cleaning / Outdoor / Professional / Automotive → off.
  // The 2 AS-1c samples that already ship explicit `style:` blocks
  // (junk_removal, mold_remediation) keep their own settings — they're explicit
  // and `toAdvancedConfig` only calls this helper as a FALLBACK. Owners can
  // flip per template via Style tab → Brand Studio → Result panel → Display
  // as range.
  const defaultRangeEnabled = shouldDefaultRangeMode(t.category);
  // Per-template theming — resolve the category-appropriate reference combo
  // and spread its palette onto the colour slots the renderer reads, so a
  // style-LESS template loads themed (not the generic white/blue default).
  // Combos are FLAT light bodies → bgMode 'solid' (was 'gradient').
  const combo = defaultThemeForTemplate(t.id ?? '', t.category);
  return {
    ...comboToStyleColors(combo),
    bgMode: 'solid',
    bgGradient: { from: palette.bgFromHex, to: palette.bgToHex, direction },
    resultPanel: {
      accentOverride: combo.accent,
      emphasis: palette.urgency === 'high' ? 'bold' : 'normal',
      border: palette.urgency === 'high' ? 'accent-tinted' : 'subtle',
      range_mode: { enabled: defaultRangeEnabled, band_pct: 8 },
    },
    animations: {
      step_transition: palette.animationStyle,
      duration_ms: 250,
      reduced_motion_respect: true,
    },
    headingWeight: palette.headingWeight,
    fontFamily: palette.fontFamily,
  };
}

/** Produce a persistable `calculator_settings.advanced` object from a template. */
export function toAdvancedConfig(t: TemplateConfig): AdvancedConfigShape {
  // W-BB-2 — templates with their own `style` block (the 3 AS-1c samples)
  // KEEP that block verbatim; everything else gets a category-derived style
  // so the gallery isn't 44 identical-looking white cards.
  //
  // BD-2a-polish — for templates with an explicit `style:` that DOES NOT
  // declare `range_mode`, the default now follows the same category-driven
  // opt-in rule as the derived templates (high-variance categories get range
  // mode on; commodity / flat-fee categories get it off). Templates that
  // already set `range_mode` (junk_removal, mold_remediation) keep their
  // explicit choice — explicit overrides always win.
  let style: AdvStyle;
  if (t.style) {
    style = { ...t.style };
    const existingPanel = t.style.resultPanel ?? {};
    if (existingPanel.range_mode === undefined) {
      style = {
        ...style,
        resultPanel: {
          ...existingPanel,
          range_mode: {
            enabled: shouldDefaultRangeMode(t.category),
            band_pct: 8,
          },
        },
      };
    }
  } else {
    style = deriveStyleFromCategory(t);
  }
  return {
    enabled: true,
    theme: t.theme,
    layout: t.layout,
    fields: t.fields,
    calculations: t.calculations,
    result_calc: t.result_calc,
    header: t.header,
    category: t.category,
    ...(t.results ? { results: t.results } : {}),
    ...(t.defaultIcon ? { defaultIcon: t.defaultIcon } : {}),
    ...(t.categoryIcon ? { categoryIcon: t.categoryIcon } : {}),
    ...(t.steps ? { steps: t.steps } : {}),
    ...(t.stepLayout ? { stepLayout: t.stepLayout } : {}),
    // BD-2b — carry an explicit `tiered` block through verbatim when the
    // template ships one; otherwise leave it absent so the renderer's
    // category-driven default (`resolveTieredConfig`) takes over.
    ...(t.tiered ? { tiered: t.tiered } : {}),
    // BD-2c — carry the address-autocomplete opt-in through verbatim.
    ...(t.requireAddress ? { requireAddress: true } : {}),
    // BF-9 — carry the pre-curated trust-badge row through verbatim.
    ...(t.trustBadges && t.trustBadges.length > 0
      ? { trustBadges: t.trustBadges }
      : {}),
    style,
  };
}

/**
 * Build a synthetic placeholder `AdvancedConfigShape` for the live preview.
 *
 * Used when the user picks a layout (or Blank) with no real template — the
 * `AdvancedCalculator` renderer needs a real config to render the CSS-Grid
 * layouts, otherwise the preview falls back to the legacy stepper pipeline
 * that doesn't honour `single-column | two-column | multi-column` at all.
 *
 * This config is PREVIEW-ONLY: callers must NOT persist it to a saved
 * calculator. It carries `__preview: true` so persistence layers can filter
 * it out, and `calculator_settings` strips it on Continue.
 */
export function buildBlankPreviewConfig(
  layout: TemplateLayout, _businessName?: string,
): AdvancedConfigShape & { __preview: true } {
  // Leave `header.title` blank so the renderer falls back to the live
  // `calculator.business_name` (which updates as the user types), keeping the
  // preview header reactive. No `subtitle` — Wave G removed the auto-subtitle
  // from the placeholder so the preview header reads as a single clean line.
  // Service type + Quantity share a row (`colSpan: 1`); Add-ons spans the
  // full width below them.
  return {
    enabled: true,
    theme: 'light',
    layout,
    fields: [
      { id: 'service', name: 'Service', label: 'Service type', type: 'select', colSpan: 1,
        options: [opt('Standard', 100), opt('Premium', 180), opt('Deluxe', 260)] },
      { id: 'quantity', name: 'Quantity', label: 'Quantity', type: 'number', colSpan: 1,
        min: 1, max: 50, step: 1, default_value: 1 },
      { id: 'addons', name: 'Add-ons', label: 'Add-ons', type: 'multi_select', colSpan: 2,
        options: [opt('Express', 40), opt('Materials', 60), opt('Warranty', 25)] },
    ],
    calculations: [calc('Estimated Total', '[Service] * [Quantity] + [Add-ons]')],
    result_calc: 'Estimated Total',
    header: { title: '', align: 'left' },
    results: { footnote: 'Preview only — your real numbers appear once you set pricing.' },
    // Wave H5 — seed with brand defaults so the placeholder preview already
    // reads "on brand" and the Style tab starts from a known baseline.
    style: { ...DEFAULT_ADV_STYLE },
    __preview: true,
  } as AdvancedConfigShape & { __preview: true };
}
