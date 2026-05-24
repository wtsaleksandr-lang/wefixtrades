# Error boundaries + UX failure modes audit — 2026-05-24

Site-wide audit of what the user sees when something goes wrong: render crashes,
404s, server 500s, network failures. Repo: `wefixtrades`. Branch:
`audit/error-boundaries-ux-failures`.

Inline fix shipped in this PR: **global `AppErrorBoundary` mounted at the root
of `App.tsx`** (was previously absent — see Finding 1).

---

## 1. React error boundaries

### Pre-audit state

`grep` for `ErrorBoundary | componentDidCatch | getDerivedStateFromError` across
`client/src/` returned **3 files**, all narrowly scoped:

| File | Scope | Quality |
|---|---|---|
| `client/src/components/quote-widget/QuoteWidget.tsx` (`WidgetErrorBoundary`) | Embed widget only | Good — branded fallback, on-brand copy |
| `client/src/pages/portal/PortalDashboard.tsx` (`PortalErrorBoundary`) | `/portal` dashboard only | Good — Refresh + Help CTAs, brand colors |
| `client/src/pages/admin/QuoteQuickTemplateDetailPage.tsx` (`PreviewBoundary`) | Template-editor live preview pane only | Good — clears error when children change |

**Critical gap:** there was **no top-level `<ErrorBoundary>` wrapping the
`<Router>` in `App.tsx`**. A render exception in any of the ~150 routes that
isn't `/portal` or the embed widget would unmount the React tree and leave the
user staring at a blank page. The `PortalErrorBoundary` comment even reads
*"Replace with the app's global error boundary once the underlying bug is
fixed"* — confirming the global boundary was assumed-but-not-present.

Sentry was wired in `main.tsx` (`Sentry.init` with `VITE_SENTRY_DSN`) so the
error would be captured server-side, but the user got no recovery affordance.

### What this PR ships

`client/src/components/shared/AppErrorBoundary.tsx`:

- Wraps the entire app (mounted as the outermost element in `App()`, ahead of
  `QueryClientProvider`).
- Renders a dark-themed, brand-neutral fallback with **Reload page** + **Go
  home** buttons.
- Uses only inline styles + a hard-coded color palette so it still renders if
  Tailwind / theme CSS itself failed to load (a common root cause of a render
  crash on first paint).
- Bridges into Sentry with `tags: { surface: 'app-root' }` + componentStack
  extra, matching the pattern already used by `AdminProductPageShell`.

### Coverage matrix (post-fix)

| Surface | Boundary | Source |
|---|---|---|
| App root (everything) | `AppErrorBoundary` | `App.tsx` (NEW) |
| `/portal/*` dashboard | `PortalErrorBoundary` (in-page) | `PortalDashboard.tsx` |
| Embed widget | `WidgetErrorBoundary` | `QuoteWidget.tsx` |
| QQ template editor live preview | `PreviewBoundary` | `QuoteQuickTemplateDetailPage.tsx` |

Per-route boundaries for `/admin/*` and the marketing routes would catch
narrower errors without unmounting siblings, but the root boundary is the
must-have. Top fix #1 below.

---

## 2. 404 handling

### Client-side 404 (unknown route)

`client/src/pages/not-found.tsx` is the catch-all. **Quality: B+.** It uses
the `MarketingLayout` chrome, brand tokens (`mkt.onDark`, `mkt.accent`), and a
back-to-home link.

Issues:

- Single "Back to home" link. **No secondary CTAs** for the user who actually
  wanted Products / Pricing / Login. Top fix #2.
- No search box. For a marketing surface with 30+ pages this is a missed
  affordance, but defensible at current scale.

### Deleted product slug (e.g., `/products/old-slug`)

`pages/products/EffortelProductPage.tsx:125` —
`if (!cfg) return <NotFound />;`. Good — slug lookup misses fall back to the
same branded 404. The most common deleted-slug cases (`/products/quotequick`,
`/products/booking-addon`, etc.) are explicit `<Redirect>`s in `App.tsx` lines
402–411, so SEO equity flows through 301s rather than 404s.

### Server-side 404 (API / asset)

API endpoints return ad-hoc `res.status(404).json(...)` per-route — no
centralized handler. Asset-not-found is delegated to Express static + the SPA
catch-all, which works correctly: any non-API unknown URL serves
`index.html`, which then renders the client `<NotFound>`. Good.

---

## 3. Server 500 handling

`server/index.ts:553-568`:

```ts
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}
app.use((err, _req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  logger.error("Internal Server Error", { error: String(err) });
  if (res.headersSent) return next(err);
  return res.status(status).json({ message });
});
```

**Quality: B.** Sentry middleware runs before the JSON fallback, errors are
logged, and the response is a clean JSON envelope. Two concerns:

- **`err.message` is forwarded to the client unchanged.** In production this
  can leak internal details (DB constraint names, file paths in stack-loaded
  errors). Should sanitize when `status >= 500` and `NODE_ENV === 'production'`
  — return a generic message and an opaque request id. Top fix #3.
- **No `Request-Id` correlation in the response.** Logs include `rid` (line
  482) only for `/api/v1/*`. Surfacing the rid in the 500 JSON envelope would
  give support a copy-paste handle. Tie to top fix #3.

### Client-side degradation when API returns 500

`client/src/lib/queryClient.ts`:

```ts
queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
mutations: { retry: false },
```

`retry: false` is intentional (avoids retry storms on a flaky endpoint) but
means a single 500 surfaces immediately to `useQuery({ error })`. **Behavior
varies wildly by page** — some pages show a `SectionErrorRetry` block
(`client/src/components/shared/SectionErrorRetry.tsx`), others just render
`undefined` and produce a blank section, and some throw, which (before this
PR) would white-screen. With the new `AppErrorBoundary` they now get a
recoverable fallback. Adoption of `SectionErrorRetry` is not enforced. Top
fix #4.

### Try/catch coverage on most-trafficked endpoints

Spot-check: `catch (err` appears in 170+ places across 20 admin route files,
which suggests reasonable coverage on the admin surface. The public marketing
endpoints (`server/routes/marketing*`, `server/routes/auditRoutes.ts`) should
get a second pass — out of scope for this audit, but flagged for follow-up.

---

## 4. Network failure / offline

`grep` for `navigator.onLine | offline` returns **2 files**
(`AdminAiChannelsPage`, `AdminCopilot`) — both narrow uses inside admin AI
features.

**Site-wide there is no offline detection, no offline banner, and no mutation
queue.** A mobile user on a flaky connection submitting the wizard or
checkout sees:

1. Spinner indefinitely (fetch hangs), then
2. A toast like `"Failed to fetch"` once the browser times out, then
3. Their form state is preserved in component state but **not persisted** —
   navigating away loses it.

React-query's `retry: false` means no retry-on-reconnect.

This is acceptable for a launch baseline but a real gap for the embed widget
on customer sites, where a contractor's phone may bounce between cellular
networks. Top fix #5.

---

## 5. JS crash mid-render

Pre-audit: render crash → unmount → blank page (because no top-level
boundary). Sentry captured it but the user saw a white screen.

Post-audit: render crash → `AppErrorBoundary` renders a brand-neutral
fallback with Reload + Go-home affordances. Sentry still captures with a new
`surface: 'app-root'` tag so app-root crashes can be triaged separately from
section-level catches.

---

## Top 5 recommendations

| # | Fix | Surface | Effort | Status |
|---|---|---|---|---|
| 1 | **Add global `<AppErrorBoundary>` wrapping `<Router>` in `App.tsx`.** Plus Sentry bridge with `surface: 'app-root'` tag. | All routes | S | **SHIPPED INLINE** |
| 2 | Add Products / Pricing / Login secondary CTAs (and a "Report broken link" mailto) to `client/src/pages/not-found.tsx`. | Marketing 404 | XS | Open |
| 3 | Sanitize 500-error JSON in `server/index.ts` error middleware: in production with `status >= 500`, replace `err.message` with a generic string and return `{ message, requestId }` so support can correlate. Requires propagating `requestId` middleware beyond `/api/v1/*`. | Server | S | Open |
| 4 | Adopt `SectionErrorRetry` as the standard `useQuery({ error })` fallback across admin + portal pages. Currently inconsistent — many pages render nothing or throw. Lint rule or shared `<QueryStateBoundary>` wrapper would enforce. | Admin + portal | M | Open |
| 5 | Add offline banner + mutation toast: hook `navigator.onLine` + `online`/`offline` events into a global banner; switch react-query mutation defaults to `retry: 1` on network errors only. Embed widget gets a localStorage-backed draft so a lead form on a flaky cell connection isn't lost. | Global + embed widget | M | Open |

## Files touched in this PR

- `client/src/components/shared/AppErrorBoundary.tsx` (new)
- `client/src/App.tsx` (import + wrap)
- `docs/operations/error-boundaries-audit-2026-05-24.md` (this doc)
