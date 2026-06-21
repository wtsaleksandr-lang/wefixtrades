# Roof/Solar widget → QuoteQuick wizard: integration plan

Status: **proposal for alignment** — no wizard code touched until decisions below are made.
Grounded in the actual repo wiring (file:line references are real).

## Recommended approach (de-risked)

**Wrap the proven widget; don't rewrite it in React.** The widget is ~100 KB of
battle-tested Map3D / Three.js / canvas / AI-render logic. Rewriting it as native
`QuestionRenderer` components is months of work and would regress the 3D/measurement
work for little gain. Instead:

1. **Frontend** — add ONE new wizard step type, `roof_visualizer`, that mounts the
   existing widget inside the stepper (scoped mount / web component) so it inherits
   the wizard's chrome, nav, progress, and lead capture.
2. **Backend** — port `serve.mjs`'s routes into a public Express routes file in the app.
3. **Feature-flag** it so it ships dark and is flipped on per-template when ready.

## Concrete wiring (already mapped)

### Frontend — new step type
- Add `"roof_visualizer"` to `STEP_TYPES` in `shared/wizardSchema.ts:162`.
- Add `case 'roof_visualizer':` to the switch in
  `client/src/components/quote-widget/StepRenderer.tsx:24-61` → render a new
  `steps/RoofVisualizerStep.tsx` that mounts the widget.
- No `QuestionRenderer` change needed (it's a step, not a question type).
- Configured into a template's `steps[]` array — code default in
  `shared/templatePresets.ts`, or DB override via `quote_quick_templates` (JSONB).

### Backend — new public routes
- New `server/routes/roofQuoteRoutes.ts` exporting `registerRoofQuoteRoutes(app)`,
  registered in `server/routes/index.ts` (alongside `registerQuoteQuickPublicRoutes`
  at line 318). **Public/no-auth** like `quotequickPublicRoutes.ts` (wizard is public).
- Ports `serve.mjs` routes: `geocode, solar, datalayers, geotiff, streetview,
  capture, analyze, airender`. Lead does NOT get ported — reuse `/api/leads`.
- Move render/business logic into `server/services/roofQuoteService.ts`.

### Keys (via existing Doppler bootstrap `server/bootstrapDoppler.ts`)
- `GOOGLE_MAPS_API_KEY` — **already wired** (`auditRoutes.ts:86`). Reuse for tiles/geocode.
- **New to add to Doppler:** a Google **Solar API** key + **3D Tiles** key (or reuse Maps
  key if entitled), `REPLICATE_API_TOKEN`, `OPENAI_API_KEY` (already present), `GEMINI`.
- All read via `process.env.*` — no hardcoding (matches current pattern).

### AI render cost gate (the money risk)
- Each AI roof render costs real money (~$0.04 Replicate / ~$0.10–0.20 gpt-image-1).
- Hook the render endpoint into the existing budget gate:
  `server/services/quotequickAiBudget.ts` — `gateDecision()` before render,
  `recordSpend()` after. Three-tier caps (lifetime / daily / per-call) already exist.
- The two-tier browse/final routing already in the widget limits spend; the gate adds
  a hard ceiling per account.

### Lead capture — reuse, don't duplicate
- Drop the widget's own lead form; on "Get full quote" advance to the wizard's
  `lead_capture` step (`ContactStep.tsx` / `LeadModal.tsx` → `POST /api/leads`,
  `server/routes/leadRoutes.ts`). Quota (`FREE_MONTHLY_QUOTE_LIMIT=50`,
  `shared/quotequickQuota.ts`) then applies uniformly.

### Powered-by badge
- Free tier forces the badge (`AdvancedCalculator.tsx:1984-1991`). The widget's quote
  card must show the same badge under the same rule.

## The one real infra risk — LARGELY DE-RISKED (verified in repo)

The oblique **capture runs Playwright + headless Chromium (SwiftShader software-WebGL)**
server-side to render Google 3D tiles with no GPU. Originally the biggest unknown —
"will headless Chromium even run in the Replit container?" — but the repo already
answers most of it:

- **`playwright ^1.59.1` is already a dependency** (`package.json`) — no new dep.
- **`.replit` already installs the Chromium Nix system libs** (Wave 90): `glib, nss,
  nspr, atk, at-spi2-atk, cups, libdrm, gtk3, pango, cairo, alsa-lib, libxkbcommon,
  **mesa**, libxshmfence, dbus` — `mesa` provides the software-GL stack.
- **The app already launches headless Chromium on Replit** during deploy builds:
  `scripts/seo/prerender-routes.mjs:530` calls `chromium.launch()` (with a graceful
  fallback if it can't).

So Chromium-on-Replit is proven. The **only remaining unknown is narrow**: whether the
SwiftShader WebGL path (`--use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader`) renders Google 3D tiles in that container (the prerender
launch doesn't exercise WebGL). SwiftShader ships inside Chromium, so this is likely
fine. **Phase 0 shrinks to a quick WebGL-capture smoke test on Replit.** Fallbacks if it
fails: (a) Street View static imagery as the render base instead of 3D-tile capture, or
(b) a tiny separate capture microservice.

## Decisions needed from Alex (alignment)

1. **Placement** — a NEW QuoteQuick "Roof & Solar" *trade*, or a *step* inserted into
   the existing roofing/solar trades? (Shapes templatePresets + trade config.)
2. **AI render quota policy** — do renders count against the 50/mo free quota, gate on a
   separate per-account AI budget (`quotequickAiBudget`), or limit free users to the
   cheap browse tier and reserve gpt-image-1 for paid? (Cost-control call.)
3. **Design system** — keep the widget's dark frosted-glass look, or re-skin to the
   wizard's theme/DESIGN-SYSTEM tokens?

## Phasing + rough effort

| Phase | Work | Effort |
|------|------|--------|
| 0 | WebGL-capture smoke test on Replit (Chromium/Playwright already proven there) | ~2–4 hrs |
| 1 | Port backend routes → `roofQuoteRoutes.ts` + service + Doppler keys | 1–2 days |
| 2 | `roof_visualizer` step type + mount widget in stepper (feature-flagged) | 1–2 days |
| 3 | Wire AI budget gate + reuse `/api/leads` + badge | 1 day |
| 4 | Design-system pass + full guard set + mobile gate + e2e | 1–2 days |

Total ~5–8 focused days, gated by Phase 0. Nothing touches the live wizard until
Phase 2, behind a flag, off by default.
