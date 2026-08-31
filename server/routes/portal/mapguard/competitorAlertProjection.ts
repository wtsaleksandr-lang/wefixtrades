/**
 * MapGuard competitor-alert projection — pure, dependency-free.
 *
 * Split out of competitorAlerts.ts so the projection can be unit-tested
 * WITHOUT a database (the CI `gate` job runs DB-less). Nothing here imports
 * drizzle, the db handle or express; the input is described structurally.
 *
 * ── The bug this module exists to keep fixed ────────────────────────────────
 * `evaluateAlertTriggers()` (server/services/mapguardAlerts.ts) writes a
 * rank-drop alert as:
 *
 *     metric_data = { rank_drops: [{ keyword, from, to }], count }
 *
 * The original consumer read `metric_data.keyword` / `metric_data.keywords`
 * — flat keys no producer has ever written — and hard-rejected any row whose
 * keyword came back null. Every row of every matching alert_type was
 * therefore dropped and the endpoint returned `{events: []}` on 100% of
 * calls. The panel is sold, so it silently showed nothing forever.
 */

export interface AlertEvent {
  id: string;
  competitor_name: string;
  keyword: string;
  /** Grid pin, when the producing alert actually knows one. The rank-drop
   *  pipeline is keyword-level and has no pin concept, so this is normally
   *  null — the feed then omits the pin chip rather than inventing (2,2). */
  pin_row: number | null;
  pin_col: number | null;
  previous_rank: number | null;
  current_rank: number | null;
  severity: "info" | "warning" | "critical";
  occurred_at: string;
}

/** Structural shape of a `mapguard_alerts` row — matches the drizzle select. */
export interface AlertRowLike {
  id: number | string;
  severity: string | null;
  created_at: Date | null;
  metric_data: unknown;
}

export const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Project one `mapguard_alerts` row into 0..N feed events. One alert row
 * carries N keyword drops, so this fans out rather than returning a single
 * event.
 */
export function projectAlerts(row: AlertRowLike): AlertEvent[] {
  const meta = (row.metric_data ?? {}) as Record<string, unknown>;
  const severity = (row.severity ?? "warning") as AlertEvent["severity"];
  const occurred = (row.created_at ?? new Date()).toISOString();

  // The alert layer records THAT the customer was overtaken, never BY WHOM —
  // so we say "A competitor" rather than attributing the drop to whichever
  // name happens to be the current top competitor.
  const competitor =
    typeof meta.competitor_name === "string"
      ? meta.competitor_name
      : typeof meta.top_competitor === "string"
        ? meta.top_competitor
        : "A competitor";

  const build = (
    id: string,
    keyword: string,
    previous: number | null,
    current: number | null,
  ): AlertEvent => ({
    id,
    competitor_name: competitor,
    keyword,
    pin_row: numOrNull(meta.pin_row),
    pin_col: numOrNull(meta.pin_col),
    previous_rank: previous,
    current_rank: current,
    severity,
    occurred_at: occurred,
  });

  // PRIMARY shape — what the scanner actually writes for `rank_drops`:
  // the keyword is NESTED in rank_drops[i], ranks are `from`/`to`.
  const drops = Array.isArray(meta.rank_drops) ? meta.rank_drops : [];
  const fromDrops: AlertEvent[] = [];
  drops.forEach((d, i) => {
    if (!d || typeof d !== "object") return;
    const rec = d as Record<string, unknown>;
    if (typeof rec.keyword !== "string" || !rec.keyword) return;
    fromDrops.push(
      build(`${row.id}:${i}`, rec.keyword, numOrNull(rec.from), numOrNull(rec.to)),
    );
  });
  if (fromDrops.length) return fromDrops;

  // Secondary shape — a flat single-keyword blob. No producer writes this
  // today; kept so a future `competitor_outranked` producer works without
  // another silent-empty regression.
  const flat =
    typeof meta.keyword === "string"
      ? meta.keyword
      : Array.isArray(meta.keywords) && typeof meta.keywords[0] === "string"
        ? (meta.keywords[0] as string)
        : null;
  if (!flat) return [];

  return [
    build(
      String(row.id),
      flat,
      numOrNull(meta.previous_rank),
      numOrNull(meta.current_rank),
    ),
  ];
}
