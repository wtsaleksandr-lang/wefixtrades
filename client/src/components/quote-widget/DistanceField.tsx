/**
 * PRICING-MODELS (U2) — `address_distance` runtime field.
 *
 * The customer types/picks their address (reuses the BD-2c
 * `AddressAutocompleteField`, which already lazy-loads Google Places and
 * degrades to a plain text input when the key is missing). 400 ms after the
 * address settles we POST `/api/quote-widget/distance` — the SERVER resolves
 * driving distance from the business `advanced.origin` (the client never
 * supplies the origin, so the rate anchor can't be spoofed).
 *
 * UI states (all rendered in a reserved chip slot so the layout never jumps):
 *   - loading   → small spinner + "Calculating distance…"
 *   - resolved  → accent-tinted chip "↦ 12.4 mi from our location"
 *   - error     → honest one-liner + (when `allowManualDistance`, default ON)
 *                 a compact manual "Distance in miles/km" number input
 *   - out of service area (`maxDistanceMiles` exceeded) → soft note; the lead
 *                 still captures (the parent nulls `quote_amount`).
 *
 * Editor preview (no `calculatorId` — same pattern as the contact_form
 * component's disabled submit): the lookup is replaced with a 10 mi sample,
 * clearly labelled, so owners see the resolved chip without burning quota.
 *
 * The parent owns the answer (`DistanceAnswer`); this component is a
 * controlled input + side-effectful resolver.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { WidgetTheme } from './widgetThemes';
import AddressAutocompleteField from './AddressAutocompleteField';
import type { AddressSelection } from './AddressAutocompleteField';
import { guardTextColor } from '@/lib/contrastGuard';

/** Server failure reasons (contract with quoteWidgetDistanceRoutes — U1).
 *  `unresolved` = the destination address didn't resolve / no driving route
 *  exists (actionable: fix the address); distinct from `unavailable`, which
 *  is a transient/config problem the customer can't fix. */
export type DistanceErrorReason =
  | 'no_origin' | 'quota' | 'unavailable' | 'unresolved' | 'not_found' | 'network';

/**
 * The persisted answer for an `address_distance` field. Rides in the lead's
 * `answers` jsonb untouched. `distanceMiles` is ALWAYS stored in miles
 * (canonical) — display + formula contribution convert per `distanceUnit`.
 */
export interface DistanceAnswer {
  /** What the customer typed / picked. */
  address: string;
  /** Resolved (or manually entered) driving distance, in MILES. */
  distanceMiles: number | null;
  /** Server-resolved driving duration, minutes. */
  durationMin?: number | null;
  /** Server-normalised address (when resolved). */
  formattedAddress?: string;
  /** True when the customer typed the distance by hand (lookup failed). */
  manual?: boolean;
  status: 'idle' | 'loading' | 'resolved' | 'error';
  /** Why the lookup failed (status === 'error'). */
  errorReason?: DistanceErrorReason;
}

export const MILES_TO_KM = 1.60934;

/** Runtime type guard — answers round-trip through JSON / template swaps. */
export function isDistanceAnswer(v: unknown): v is DistanceAnswer {
  return !!v && typeof v === 'object' && !Array.isArray(v)
    && typeof (v as DistanceAnswer).address === 'string'
    && 'status' in (v as Record<string, unknown>);
}

/** POST /api/quote-widget/distance response (contract with U1). */
interface DistanceApiOk {
  ok: true;
  distanceMiles: number;
  distanceKm?: number;
  durationMin?: number;
  formattedAddress?: string;
}
interface DistanceApiErr {
  ok: false;
  reason?: 'no_origin' | 'quota' | 'unavailable' | 'unresolved' | 'not_found';
}

const ERROR_COPY: Record<DistanceErrorReason, string> = {
  no_origin: 'Distance lookup isn’t set up yet — enter your distance below.',
  quota: 'Distance lookup is busy right now.',
  unavailable: 'Distance lookup is temporarily unavailable.',
  unresolved: 'We couldn’t find that address — please check it and try again.',
  not_found: 'We couldn’t find that address.',
  network: 'Distance lookup is temporarily unavailable.',
};

interface Props {
  /** Owner's field title — floats inside the address input (title-in-field). */
  label: string;
  theme: WidgetTheme;
  accent: string;
  fontFamily?: string;
  radiusPx: string;
  value: DistanceAnswer;
  onChange: (next: DistanceAnswer) => void;
  /** Absent → wizard editor preview (sample distance, no network). */
  calculatorId?: number;
  fieldId: string;
  distanceUnit?: 'miles' | 'km';
  roundTrip?: boolean;
  maxDistanceMiles?: number;
  /** Default TRUE — manual fallback input when the lookup fails. */
  allowManualDistance?: boolean;
  /** Business service-area hint → Places country restriction. */
  serviceArea?: string;
}

/** Format a canonical-miles value in the field's display unit. */
function formatDistance(miles: number, unit: 'miles' | 'km'): string {
  const v = unit === 'km' ? miles * MILES_TO_KM : miles;
  const rounded = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${rounded} ${unit === 'km' ? 'km' : 'mi'}`;
}

export default function DistanceField({
  label, theme, accent, fontFamily, radiusPx,
  value, onChange, calculatorId, fieldId,
  distanceUnit = 'miles', roundTrip = false,
  maxDistanceMiles, allowManualDistance = true, serviceArea,
}: Props) {
  const c = theme;
  const isPreview = typeof calculatorId !== 'number';
  // The address the last (settled) lookup ran for — prevents a re-fetch loop
  // when the answer object updates with the lookup result itself.
  const requestedForRef = useRef<string | null>(
    value.status === 'resolved' || value.status === 'error' ? value.address : null,
  );
  const abortRef = useRef<AbortController | null>(null);
  // Precise coords from the last Places pick, bound to the formatted address
  // they belong to. The lookup uses them ONLY when they still match the
  // address being resolved (a user who keeps typing after picking invalidates
  // them → fall back to the address string, which the server geocodes itself).
  const placesCoordsRef = useRef<{ address: string; lat: number; lng: number } | null>(null);
  // Manual-entry input text (display unit). Seeded from a persisted manual
  // answer so step back/forward keeps the typed value.
  const [manualText, setManualText] = useState<string>(() =>
    value.manual && typeof value.distanceMiles === 'number'
      ? String(distanceUnit === 'km'
        ? Math.round(value.distanceMiles * MILES_TO_KM * 10) / 10
        : Math.round(value.distanceMiles * 10) / 10)
      : '');
  const [manualFocused, setManualFocused] = useState(false);

  // Latest value snapshot for the debounce closure (avoids re-arming the
  // timer when unrelated answer sub-fields change).
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /* ── Debounced resolution — 400 ms after the address settles ── */
  useEffect(() => {
    const address = value.address.trim();
    if (address.length < 4) return undefined;          // too short to resolve
    if (value.manual) return undefined;                // customer went manual
    if (requestedForRef.current === value.address) return undefined; // settled

    const timer = setTimeout(() => {
      requestedForRef.current = valueRef.current.address;

      if (isPreview) {
        // Editor preview — sample distance, clearly labelled, no network.
        onChangeRef.current({
          ...valueRef.current,
          distanceMiles: 10,
          durationMin: 18,
          formattedAddress: valueRef.current.address,
          manual: false,
          status: 'resolved',
          errorReason: undefined,
        });
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      onChangeRef.current({ ...valueRef.current, status: 'loading', errorReason: undefined });

      // Send the Places coords only when they still match the address being
      // resolved — the server then uses them as the destination and skips its
      // own geocode (more accurate + no extra Geocoding spend). Typed-only
      // addresses (no pick) send the string and the server geocodes it.
      const coords = placesCoordsRef.current;
      const useCoords = !!coords && coords.address === address;
      fetch('/api/quote-widget/distance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calculator_id: calculatorId,
          field_id: fieldId,
          address,
          ...(useCoords ? { lat: coords!.lat, lng: coords!.lng } : {}),
        }),
        signal: controller.signal,
      })
        .then(async (resp) => {
          const body = (await resp.json().catch(() => null)) as
            | DistanceApiOk | DistanceApiErr | null;
          if (body && (body as DistanceApiOk).ok === true
            && typeof (body as DistanceApiOk).distanceMiles === 'number'
            && isFinite((body as DistanceApiOk).distanceMiles)) {
            const okBody = body as DistanceApiOk;
            onChangeRef.current({
              ...valueRef.current,
              distanceMiles: okBody.distanceMiles,
              durationMin: typeof okBody.durationMin === 'number' ? okBody.durationMin : null,
              formattedAddress: okBody.formattedAddress || valueRef.current.address,
              manual: false,
              status: 'resolved',
              errorReason: undefined,
            });
          } else {
            const reason = (body as DistanceApiErr | null)?.reason;
            onChangeRef.current({
              ...valueRef.current,
              distanceMiles: null,
              manual: false,
              status: 'error',
              errorReason: reason === 'no_origin' || reason === 'quota'
                || reason === 'unavailable' || reason === 'unresolved'
                || reason === 'not_found'
                ? reason : 'unavailable',
            });
          }
        })
        .catch((err: unknown) => {
          if ((err as Error)?.name === 'AbortError') return;
          onChangeRef.current({
            ...valueRef.current,
            distanceMiles: null,
            manual: false,
            status: 'error',
            errorReason: 'network',
          });
        });
    }, 400);
    return () => clearTimeout(timer);
  // Re-arm only when the typed address (or manual mode) changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.address, value.manual, isPreview, calculatorId, fieldId]);

  // Abort any in-flight lookup on unmount (step navigation).
  useEffect(() => () => abortRef.current?.abort(), []);

  const onAddressChange = (next: string) => {
    // A new address invalidates the previous resolution AND exits manual
    // mode — a typo'd not_found must not lock the customer into manual entry
    // forever; the corrected address gets a fresh lookup (manual re-offers
    // itself if that fails too). Abort any in-flight lookup so a stale
    // response can't pair the OLD distance with the NEW address.
    abortRef.current?.abort();
    requestedForRef.current = null;
    // Drop any stale Places coords — they belong to the PREVIOUS address. On a
    // real pick, Places fires onChange (here) BEFORE onSelect, so onSelect
    // re-sets the coords for the new formatted address right after this clear.
    placesCoordsRef.current = null;
    if (value.manual) setManualText('');
    onChange({
      ...value,
      address: next,
      distanceMiles: null,
      formattedAddress: undefined,
      manual: false,
      status: 'idle',
      errorReason: undefined,
    });
  };

  // Capture precise coords when the customer PICKS a Places suggestion, so the
  // server can skip re-geocoding the address string (more accurate, no extra
  // Geocoding spend). `onChange` fires first with the formatted address, then
  // `onSelect` — so bind the coords to that same formatted string.
  const onAddressSelect = (sel: AddressSelection) => {
    if (typeof sel.lat === 'number' && typeof sel.lng === 'number' && sel.formatted) {
      placesCoordsRef.current = { address: sel.formatted, lat: sel.lat, lng: sel.lng };
    } else {
      placesCoordsRef.current = null;
    }
  };

  const onManualChange = (text: string) => {
    setManualText(text);
    const n = parseFloat(text);
    const displayVal = isFinite(n) && n >= 0 ? n : null;
    onChange({
      ...value,
      manual: true,
      distanceMiles: displayVal === null
        ? null
        : distanceUnit === 'km' ? displayVal / MILES_TO_KM : displayVal,
      status: displayVal === null ? 'error' : 'resolved',
    });
  };

  /* ── Chip slot — reserved height so loading → resolved never jumps ── */
  const resolved = value.status === 'resolved' && typeof value.distanceMiles === 'number';
  const outOfArea = resolved
    && typeof maxDistanceMiles === 'number' && maxDistanceMiles > 0
    && (value.distanceMiles as number) > maxDistanceMiles;
  const showManual = allowManualDistance
    && (value.manual === true || value.status === 'error');
  const chipFg = guardTextColor(accent, c.bg, 'distanceChip');
  const errFg = guardTextColor('#dc2626', c.bg, 'distanceError');
  const warnFg = guardTextColor(c.textBody, c.bg, 'distanceOutOfArea');

  const chipBase: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    minHeight: 26, padding: '3px 10px', borderRadius: 999,
    fontSize: '12.5px', fontWeight: 600, fontFamily,
    maxWidth: '100%', boxSizing: 'border-box',
  };

  let chipSlot: React.ReactNode = null;
  if (value.status === 'loading') {
    chipSlot = (
      <span data-testid={`adv-distance-loading-${fieldId}`}
        style={{ ...chipBase, background: c.accentTint, color: chipFg }}>
        <svg width={12} height={12} viewBox="0 0 24 24" aria-hidden
          style={{ animation: 'qq-dist-spin 0.8s linear infinite', flexShrink: 0 }}>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor"
            strokeWidth={3} strokeLinecap="round" strokeDasharray="42" strokeDashoffset="14" />
        </svg>
        Calculating distance…
      </span>
    );
  } else if (resolved && !value.manual) {
    chipSlot = (
      <span data-testid={`adv-distance-chip-${fieldId}`}
        style={{ ...chipBase, background: c.accentTint, color: chipFg }}
        title={value.formattedAddress || undefined}>
        <span aria-hidden="true" style={{ flexShrink: 0 }}>↦</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {formatDistance(value.distanceMiles as number, distanceUnit)} from our location
          {roundTrip ? ' · round trip ×2' : ''}
          {isPreview ? ' · sample' : ''}
        </span>
      </span>
    );
  } else if (value.status === 'error' && !value.manual) {
    chipSlot = (
      <span role="alert" data-testid={`adv-distance-error-${fieldId}`}
        style={{ fontSize: '12.5px', color: errFg, fontFamily, lineHeight: 1.4 }}>
        {ERROR_COPY[value.errorReason ?? 'unavailable']}
        {!showManual ? ' You can still request your quote below.' : ''}
      </span>
    );
  }

  /* ── Manual fallback — compact "Distance in miles/km" number input ── */
  const manualLifted = manualFocused || manualText.length > 0;
  const manualLabel = distanceUnit === 'km' ? 'Distance in km' : 'Distance in miles';
  const manualInput = showManual ? (
    <div style={{ position: 'relative', maxWidth: 220 }}>
      <input
        type="number"
        min={0}
        inputMode="decimal"
        value={manualText}
        data-testid={`adv-distance-manual-${fieldId}`}
        onChange={(e) => onManualChange(e.target.value)}
        onFocus={() => setManualFocused(true)}
        onBlur={() => setManualFocused(false)}
        placeholder=" "
        style={{
          width: '100%', height: 48, borderRadius: radiusPx,
          border: `1px solid ${manualFocused ? accent : c.border}`,
          padding: '18px 12px 6px 12px', fontSize: 14,
          color: c.text, background: c.surface,
          fontFamily, outline: 'none', boxSizing: 'border-box',
          transition: 'border-color 150ms ease-out',
        }}
      />
      <span aria-hidden="true" style={{
        position: 'absolute', left: 12,
        top: manualLifted ? 6 : 14,
        fontSize: manualLifted ? 10 : 13,
        color: manualLifted ? (manualFocused ? chipFg : c.textMuted) : c.textMuted,
        pointerEvents: 'none', transition: 'all 150ms ease-out', fontFamily,
        letterSpacing: manualLifted ? '0.04em' : 'normal',
        textTransform: manualLifted ? 'uppercase' : 'none',
        fontWeight: manualLifted ? 700 : 400,
      }}>{manualLabel}</span>
    </div>
  ) : null;

  return (
    <div
      data-testid={`adv-distance-${fieldId}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      {/* Spinner keyframes — scoped name, tiny, premium-pack independent. */}
      <style>{'@keyframes qq-dist-spin { to { transform: rotate(360deg); } }'}</style>
      <AddressAutocompleteField
        theme={c}
        fontFamily={fontFamily}
        radiusPx={radiusPx}
        value={value.address}
        onChange={onAddressChange}
        onSelect={onAddressSelect}
        serviceArea={serviceArea}
        label={label || 'Service address'}
        testId={`adv-distance-address-${fieldId}`}
      />
      {/* Reserved chip slot — fixed min height once an address exists so the
          spinner → chip swap never shifts the fields below. */}
      {(chipSlot || showManual || value.address.trim() !== '') && (
        <div style={{ minHeight: 26, display: 'flex', alignItems: 'center' }}>
          {chipSlot}
        </div>
      )}
      {manualInput}
      {outOfArea && (
        <span data-testid={`adv-distance-outofarea-${fieldId}`} style={{
          fontSize: '12.5px', color: warnFg, fontFamily, lineHeight: 1.4,
        }}>
          That address looks outside our service area — you can still send your
          details below and we&apos;ll confirm.
        </span>
      )}
    </div>
  );
}
