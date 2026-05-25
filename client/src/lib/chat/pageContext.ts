/**
 * Page-context helpers for the persistent AI chat widget.
 *
 * The chat panel now lives at the layout level and stays mounted across
 * route changes. To keep the AI in sync with where the user actually IS
 * inside the admin/portal SPA, every navigation pushes a lightweight
 * page-context update to a shared in-memory ring buffer + dispatches a
 * window CustomEvent the chat widgets listen for. The next outbound
 * chat request carries the recent navigation trail as a `recent_navigation`
 * field, which the server folds into the assistant's next system prompt
 * (see server/routes/portal/chat.ts and server/routes/chatRoutes.ts).
 *
 * Design constraints:
 *  - NO server hit on each navigation — the trail only goes out with the
 *    next user message, so a chatty user gets fresh context without us
 *    spamming the AI endpoint on every router transition.
 *  - Bounded ring buffer (last 5 routes) so token cost stays flat even
 *    if a user clicks through 50 admin pages between messages.
 *  - DOM snapshot capped at 500 chars per route to stay well under the
 *    existing 1500-char page_content cap the server already enforces.
 */

export interface PageContextSnapshot {
  /** Wouter location path the user navigated to. */
  route: string;
  /** document.title at navigation time. */
  page_title: string;
  /** Wall-clock timestamp (ms since epoch). */
  ts: number;
  /** Visible entity IDs extracted from the URL (e.g. ["clients/123"]). */
  visible_entities: string[];
  /** Short DOM excerpt — first ~500 chars of the main element's innerText. */
  excerpt?: string;
}

const EVENT_NAME = "wft:page-context-change";
const TRAIL_LIMIT = 5;
/** In-memory ring of the last few page contexts. Module-scoped so it
 *  survives layout re-mounts (the layout itself re-renders per route
 *  but the JS module stays loaded). */
const trail: PageContextSnapshot[] = [];

/**
 * Extract a lightweight context snapshot for the page the user just
 * navigated to. Pulls path + title + the first ~500 chars of <main>'s
 * innerText, plus any "entity/:id" pairs embedded in the path.
 */
export function extractPageContext(route: string): PageContextSnapshot {
  const page_title = typeof document !== "undefined" ? document.title : "";
  const visible_entities = extractEntitiesFromRoute(route);
  let excerpt: string | undefined;
  if (typeof document !== "undefined") {
    const main =
      document.querySelector("main") ??
      document.querySelector("[data-portal-main]") ??
      document.body;
    const text = (main as HTMLElement | null)?.innerText ?? "";
    excerpt = text.replace(/\s+/g, " ").trim().slice(0, 500) || undefined;
  }
  return { route, page_title, ts: Date.now(), visible_entities, excerpt };
}

/**
 * Extract "entity/123" style breadcrumbs from a route. We treat any
 * `/<word>/<digits>` pair as an entity reference — covers `/admin/crm/
 * clients/123`, `/portal/invoices/45`, etc. without hardcoding routes.
 */
function extractEntitiesFromRoute(route: string): string[] {
  const out: string[] = [];
  // /word/123 — word is at least 3 chars to skip noise like /v1/...
  const re = /\/([a-z][a-z0-9-]{2,})\/(\d+)(?=\/|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(route)) !== null) out.push(`${m[1]}/${m[2]}`);
  return out;
}

/**
 * Push a snapshot onto the shared trail (bounded) and broadcast a
 * CustomEvent the chat widgets can listen to (e.g. to update a "you
 * just navigated to X" hint). Skips duplicate consecutive entries so
 * a route effect firing twice doesn't pollute the ring.
 */
export function pushPageContext(snapshot: PageContextSnapshot): void {
  const last = trail[trail.length - 1];
  if (last && last.route === snapshot.route) return;
  trail.push(snapshot);
  while (trail.length > TRAIL_LIMIT) trail.shift();
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: snapshot }),
    );
  }
}

/** Latest snapshot, or null if no navigation has been recorded yet. */
export function getCurrentPageContext(): PageContextSnapshot | null {
  return trail[trail.length - 1] ?? null;
}

/** Full recent-navigation trail (oldest first), bounded to TRAIL_LIMIT. */
export function getNavigationTrail(): PageContextSnapshot[] {
  return [...trail];
}

/** Subscribe to navigation events. Returns an unsubscribe callback. */
export function onPageContextChange(
  handler: (snapshot: PageContextSnapshot) => void,
): () => void {
  if (typeof window === "undefined") return () => { /* noop */ };
  const listener = (e: Event) => handler((e as CustomEvent<PageContextSnapshot>).detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

/** Test-only: clear the trail between cases. */
export function _resetPageContextTrailForTests(): void {
  trail.length = 0;
}
