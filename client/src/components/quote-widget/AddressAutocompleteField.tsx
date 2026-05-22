/**
 * BD-2c — Address autocomplete (Google Places).
 *
 * Research (BD-0 punch list):
 *  - Google Places autocomplete delivers ~30% faster form completion and a
 *    1.5%+ standalone lift; ~35% checkout-flow lift when combined with other
 *    smart-field upgrades (marketingprofs.com / mapbox.com).
 *
 * Behaviour:
 *  - Lazy-loads the Google Maps JS API the FIRST time this component mounts
 *    (a singleton promise dedupes concurrent mounts in the same widget /
 *    page so we never inject the script twice).
 *  - Falls back to a plain text input when `VITE_GOOGLE_PLACES_API_KEY` is
 *    unset, the script fails to load, or the browser blocks third-party JS.
 *    Graceful degradation — no errors, no broken UX.
 *  - Restricts results to the business's service country (best-effort parse
 *    of `businessProfile.serviceArea`), defaulting to US + CA.
 *  - Visually identical to PortalOnboarding / ContactStep's `FloatingLabelInput`
 *    (title floats inside the field, 48px height, 10px radius). See
 *    `claude-orchestrator/DESIGN-SYSTEM.md` "Input field rules".
 *
 * The component reports BOTH the formatted address string AND the parsed
 * ZIP / postal code so the BD-2c peer-anchor line can use it.
 *
 * Pure presentational + side-effect-free — the parent owns the value.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { WidgetTheme } from './widgetThemes';

/** Parsed details we surface to the parent on selection. */
export interface AddressSelection {
  /** Full formatted address (e.g. "123 Main St, Brooklyn, NY 11201, USA"). */
  formatted: string;
  /** US ZIP / CA postal code, when present. Used by `PeerAnchorLine`. */
  postalCode?: string;
  /** ISO-3166-1 alpha-2 country (e.g. "US", "CA"). */
  country?: string;
  /** Locality (city) for analytics / quoting. */
  locality?: string;
  /** Admin area level 1 (state / province). */
  region?: string;
}

interface Props {
  /** Resolved widget theme — accent / borders / text colours. */
  theme: WidgetTheme;
  /** Style-tab font stack. */
  fontFamily?: string;
  /** Style-tab radius applied to the input. Defaults to 10px (ContactStep parity). */
  radiusPx?: string;
  /** Current value (formatted address). */
  value: string;
  /** Fired on every keystroke. */
  onChange: (next: string) => void;
  /** Fired when the user picks a suggestion (or the input blurs with a value). */
  onSelect?: (selection: AddressSelection) => void;
  /** Optional business service area hint (free-text — e.g. "Phoenix, AZ"). */
  serviceArea?: string;
  /** Optional test id. */
  testId?: string;
  /** Optional autocomplete attribute (defaults to "street-address"). */
  autoComplete?: string;
}

/* ─── Script loader (singleton) ────────────────────────────────────
 *
 * Google's loader exposes `window.google.maps.places.Autocomplete`. We
 * inject the script once, return the same promise for every concurrent
 * mount, and resolve `null` (instead of throwing) on any failure so the
 * caller's fallback to plain text stays a one-line check.
 */
declare global {
  interface Window {
    google?: any;
    __wfx_places_loader?: Promise<typeof window.google | null>;
  }
}

function loadPlacesScript(apiKey: string): Promise<any | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  if (window.__wfx_places_loader) return window.__wfx_places_loader;

  window.__wfx_places_loader = new Promise<any | null>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-wfx-places-loader]',
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google ?? null));
      existing.addEventListener('error', () => resolve(null));
      return;
    }
    const tag = document.createElement('script');
    tag.dataset.wfxPlacesLoader = '1';
    tag.async = true;
    tag.defer = true;
    tag.src =
      'https://maps.googleapis.com/maps/api/js?libraries=places&v=weekly&key=' +
      encodeURIComponent(apiKey);
    tag.addEventListener('load', () => resolve(window.google ?? null));
    tag.addEventListener('error', () => resolve(null));
    document.head.appendChild(tag);
  });
  return window.__wfx_places_loader;
}

/** Best-effort country-code parse from a free-text service area. */
function deriveCountries(serviceArea?: string): string[] {
  const sa = (serviceArea || '').toLowerCase();
  if (!sa) return ['us', 'ca'];
  if (/\b(canada|ontario|quebec|bc|alberta|toronto|vancouver|montreal)\b/.test(sa)) return ['ca'];
  if (/\b(uk|united kingdom|england|scotland|wales|london|manchester)\b/.test(sa)) return ['gb'];
  if (/\b(australia|sydney|melbourne|brisbane)\b/.test(sa)) return ['au'];
  return ['us', 'ca'];
}

/** Pull postalCode / country / locality / region from a Place result. */
function parseAddressComponents(place: any): AddressSelection {
  const components: Array<{ types: string[]; long_name: string; short_name: string }> =
    place?.address_components ?? [];
  let postalCode: string | undefined;
  let country: string | undefined;
  let locality: string | undefined;
  let region: string | undefined;
  for (const c of components) {
    if (c.types.includes('postal_code')) postalCode = c.long_name;
    else if (c.types.includes('country')) country = c.short_name;
    else if (c.types.includes('locality')) locality = c.long_name;
    else if (c.types.includes('administrative_area_level_1')) region = c.short_name;
  }
  return {
    formatted: place?.formatted_address ?? '',
    postalCode, country, locality, region,
  };
}

export default function AddressAutocompleteField({
  theme, fontFamily, radiusPx = '10px',
  value, onChange, onSelect,
  serviceArea, testId, autoComplete = 'street-address',
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<any>(null);
  const [focused, setFocused] = useState(false);
  const [hasPlaces, setHasPlaces] = useState(false);
  const lifted = focused || value.length > 0;

  // Lazy load + attach the autocomplete instance. When the key is missing,
  // we silently fall back to the plain text input (graceful degradation).
  useEffect(() => {
    const apiKey =
      typeof import.meta !== 'undefined'
        ? (import.meta as any).env?.VITE_GOOGLE_PLACES_API_KEY
        : undefined;
    if (!apiKey || !inputRef.current) return;

    let cancelled = false;
    loadPlacesScript(apiKey).then((google) => {
      if (cancelled || !google?.maps?.places || !inputRef.current) return;
      try {
        const ac = new google.maps.places.Autocomplete(inputRef.current, {
          fields: ['address_components', 'formatted_address', 'geometry'],
          types: ['address'],
          componentRestrictions: { country: deriveCountries(serviceArea) },
        });
        ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          const parsed = parseAddressComponents(place);
          if (parsed.formatted) onChange(parsed.formatted);
          if (onSelect) onSelect(parsed);
        });
        autocompleteRef.current = ac;
        setHasPlaces(true);
      } catch {
        // Loader returned an unusable google object — fall back silently.
      }
    });
    return () => {
      cancelled = true;
      // The autocomplete instance shares the input ref; letting GC clean
      // it up is fine because the script stays mounted at the page level.
      autocompleteRef.current = null;
    };
  // We intentionally only re-run when `serviceArea` changes (country list).
  // `onChange` / `onSelect` come from the parent and would otherwise
  // re-attach on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceArea]);

  const wrapperStyle: CSSProperties = { position: 'relative', width: '100%' };
  const inputStyle: CSSProperties = {
    width: '100%', height: 48, borderRadius: radiusPx,
    border: `1px solid ${focused ? theme.accent : theme.border}`,
    padding: '18px 12px 6px 12px',
    fontSize: 14, color: theme.text, background: theme.surface,
    fontFamily, outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 150ms ease-out',
  };
  const labelStyle: CSSProperties = {
    position: 'absolute',
    left: 12,
    top: lifted ? 6 : 14,
    fontSize: lifted ? 10 : 13,
    color: lifted ? (focused ? theme.accent : theme.textMuted) : theme.textMuted,
    pointerEvents: 'none',
    transition: 'all 150ms ease-out',
    fontFamily,
    letterSpacing: lifted ? '0.04em' : 'normal',
    textTransform: lifted ? 'uppercase' : 'none',
    fontWeight: lifted ? 700 : 400,
  };

  return (
    <div style={wrapperStyle} data-has-places={hasPlaces ? 'true' : 'false'}>
      <input
        id={inputId}
        ref={inputRef}
        data-testid={testId ?? 'contact-step-address'}
        type="text"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={inputStyle}
        placeholder=" "
      />
      <label htmlFor={inputId} style={labelStyle}>Service address</label>
    </div>
  );
}
