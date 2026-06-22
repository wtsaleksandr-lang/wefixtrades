# Roof + Solar instant-quote widget (spike)

Consumer "instant roof & solar quote" widget. Address → photoreal 3D roof →
EagleView-grade measurement → solar panel layout/tiers → roofing
material + colour visualizer ("see it on **your** house") → instant price →
branded quote.

This is a **self-contained spike** lifted from the standalone prototype. It is
**not yet wired into the QuoteQuick wizard** — it lives here as a committed
foundation to polish from. Intended eventual home: a QuoteQuick wizard step.

## Files

| File | What it is |
|------|------------|
| `roof3d.html` | The widget (main). Map3D + measurement + material/colour catalogue + quote card. ~100 KB, self-contained. |
| `serve.mjs` | Node HTTP backend (port 5300). Routes: `/roof3d`, `/geocode`, `/solar`, `/datalayers`, `/geotiff`, `/streetview`, `/capture`, `/analyze`, `/airender`, `/pricing`, `/lead`, `/map3d`. Disk cache under `.cache/`. |
| `roofgeo.mjs` | Roof Geometry Engine — facet planes → ridge/hip/valley/eave/rake classification + linear footage. **17/17 inline tests** (`node roofgeo.mjs`). |
| `rooffeatures.mjs` | Roof feature detector (chimneys/vents/roof-type via Gemini vision). **12/12 inline tests** (`node rooffeatures.mjs`). |
| `index.html`, `map3d.html`, `pricing.html` | Earlier 3D-viewer / map / pricing experiments. `serve.mjs` loads index.html + map3d.html at startup, so they're required to boot. |

## Run

```sh
# from this dir; needs the env keys below + a playwright install for headless capture
PLAYWRIGHT_PATH=/abs/path/to/node_modules/playwright \
SOLAR_KEY=... TILES_KEY=... GEMINI_KEY=... REPLICATE_KEY=... FAL_KEY=... OPENAI_KEY=... \
node serve.mjs
# → http://localhost:5300/roof3d
```

No `package.json` / dependencies beyond Node builtins + an installed
**playwright** (for the headless oblique-capture; SwiftShader software-WebGL so
it renders Google 3D tiles with no GPU — deployable on a standard container).
`PLAYWRIGHT_PATH` points at an installed playwright; defaults to a bare
`playwright` resolve.

### Env keys (read from `process.env`, never committed)

`TILES_KEY` (Maps/3D-Tiles, injected into HTML in place of `__TILES__`),
`SOLAR_KEY` (Google Solar API), `GEMINI_KEY` (vision + cheap image gen),
`REPLICATE_KEY` (Flux Kontext img2img), `OPENAI_KEY` (gpt-image-1),
`FAL_KEY` (fal.ai, currently exhausted). All live in Doppler `wefixtrades/prd`.

## Image-gen cost routing (`/airender?tier=…`)

Two tiers keep catalogue-browsing cheap and only spend on the final pick:

- **`tier=browse`** — every material/colour click. Skips gpt-image-1; renders on
  Replicate Flux Kontext (~$0.04) / Gemini (~$0.039).
- **`tier=final`** — the colour the user *settles* on (1.8 s debounce after the
  last click, in `roof3d.html` `scheduleFinal()`). Tries gpt-image-1 first
  (ChatGPT-quality), falls through the chain if unavailable. Upgrades the photo
  in place; each colour upgrades once (`window.__matFinal`).

Failover order: `openai → replicate → gemini → fal`. Disk cache keyed
`address|material|tier` makes repeat renders free.

> **Known blocker:** the OpenAI org (both `OPENAI_API_KEY` and
> `AI_INTEGRATIONS_OPENAI_API_KEY` in Doppler) has hit its **billing hard
> limit**, so `tier=final` currently falls back to Replicate. Raise the OpenAI
> monthly limit / add credit to re-enable gpt-image-1 — no code change needed.

## Polish backlog (next)

- Lift the Solar/Roofing category selector to the literal top of the UI.
- Mobile material row: horizontal-scroll instead of wrap.
- Wire into the QuoteQuick wizard (step + real server routes + guard set).
- Tier-gating / quota for the quote flow.
