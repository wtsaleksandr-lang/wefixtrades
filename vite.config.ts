import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

/**
 * Wave 47 — silent telemetry stub for `vite preview`.
 *
 * The Lighthouse `Audit` workflow serves the built site via `vite preview`,
 * which has no API server. The marketing pages fire best-effort telemetry
 * beacons (`/api/analytics/pageview`, `/api/rum/web-vitals`, `/api/track`)
 * on every load; without a backend, each returns 404 and the browser logs
 * "Failed to load resource: 404" to the console — which trips Lighthouse's
 * `errors-in-console` audit. Suppressing in the client (`.catch(() => {})`)
 * doesn't help because Chrome logs the network error before the fetch
 * promise settles.
 *
 * Root-cause fix: have `vite preview` itself swallow `/api/*` with 204 No
 * Content. Production is unaffected (Replit runs the real Express server,
 * not `vite preview`). Dev (`vite` not `vite preview`) is also unaffected
 * because `configurePreviewServer` is preview-only.
 */
function previewApiStub(): PluginOption {
  return {
    name: "preview-api-stub",
    // `configurePreviewServer` runs ONLY under `vite preview` — it is a
    // no-op in dev (`vite` / `vite serve`) and in build. So we can register
    // the plugin unconditionally without touching the dev or prod path.
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith("/api/")) {
          // 204 No Content — accepted, nothing to return, no error logged.
          res.statusCode = 204;
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    previewApiStub(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  define: {
    'process.env.QQ_HOSTING_DOMAIN': JSON.stringify(process.env.QQ_HOSTING_DOMAIN || ''),
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    /**
     * Wave 47 — emit source maps with discovery comments so Lighthouse's
     * `valid-source-maps` audit passes.
     *
     * Initially tried `'hidden'` (writes the .map but omits the
     * `//# sourceMappingURL=` comment from the .js) hoping Lighthouse would
     * discover the .map from the asset directory. It does not — Lighthouse
     * counts a source map as "missing" unless the .js has the
     * sourceMappingURL comment OR the JS response carries a `X-SourceMap`/
     * `SourceMap` HTTP header. Neither is true with `'hidden'`.
     *
     * `true` adds the comment back. Production users can still pull the
     * .map by appending `.map` to the .js URL with either mode (the file
     * is on disk either way), so 'hidden' didn't actually buy us privacy;
     * it just broke the audit. Trade-off is +~30 bytes per chunk for the
     * comment, which is negligible.
     */
    sourcemap: true,
    /**
     * Wave 45 — slim modulepreload list.
     *
     * Vite's default emits `<link rel="modulepreload">` for every vendor
     * chunk transitively reachable from the entry, even when those chunks
     * only land via React.lazy() dynamic imports. The marketing homepage
     * does not need vendor-globe (Three.js ~515 KiB), vendor-charts,
     * vendor-motion, vendor-gsap, vendor-dnd, vendor-form, vendor-posthog,
     * vendor-sentry up-front — those route through lazy chunks for
     * /portal/*, /admin/*, /wizard, /calculator. Preloading them on every
     * page (including the homepage) was costing ~7s LCP on mobile.
     *
     * We let modulepreload keep only the chunks the homepage actually needs
     * during initial render: vendor-react, vendor-router, vendor-query,
     * vendor-radix, vendor-icons, and the home-entry chunk. Everything else
     * still loads correctly when the route mounts — it's just not
     * pre-fetched at first paint.
     */
    modulePreload: {
      resolveDependencies: (_filename, deps) => {
        const keep = (dep: string) =>
          dep.includes("vendor-react") ||
          dep.includes("vendor-router") ||
          dep.includes("vendor-query") ||
          dep.includes("vendor-radix") ||
          dep.includes("vendor-icons") ||
          // Keep the home/marketing-critical app chunks (index, MarketingHome,
          // its layout, hero subcomponents) — those are statically imported
          // by the entry and need to be modulepreloaded for fast LCP.
          (!dep.startsWith("assets/vendor-") &&
            !dep.includes("vendor-globe") &&
            !dep.includes("vendor-charts") &&
            !dep.includes("vendor-motion") &&
            !dep.includes("vendor-gsap") &&
            !dep.includes("vendor-rive") &&
            !dep.includes("vendor-dnd") &&
            !dep.includes("vendor-form") &&
            !dep.includes("vendor-carousel") &&
            !dep.includes("vendor-html2canvas") &&
            !dep.includes("vendor-qrcode") &&
            !dep.includes("vendor-date") &&
            !dep.includes("vendor-posthog") &&
            !dep.includes("vendor-sentry"));
        return deps.filter(keep);
      },
    },
    rollupOptions: {
      output: {
        /**
         * Wave 9 — vendor splitting. The base manual chunks keep large
         * third-party libs in their own long-cacheable bundles so app-only
         * deploys don't bust the user's vendor cache. The `manualChunks`
         * function below catches the long tail of npm packages (lucide,
         * react-hook-form, zod, @tanstack, wouter, the rest of @radix-ui,
         * swiper, embla, posthog, html2canvas, qrcode, etc.) that would
         * otherwise land in the marketing-route entry chunk.
         *
         * Goal: no single chunk > 1 MB; marketing critical path < 1 MB.
         */
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          // Core runtime — shared by every route, hot-pathed by every page.
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/")
          ) {
            return "vendor-react";
          }

          // Router — small, used by everything.
          if (id.includes("/node_modules/wouter/")) {
            return "vendor-router";
          }

          // Tanstack query — used across portal + admin + a few marketing
          // pages. Big enough to deserve its own chunk.
          if (id.includes("/node_modules/@tanstack/")) {
            return "vendor-query";
          }

          // Heavy vendor groups — kept stable so cache busts are surgical.
          if (id.includes("/node_modules/gsap/")) return "vendor-gsap";
          if (id.includes("/node_modules/@rive-app/")) return "vendor-rive";
          if (id.includes("/node_modules/recharts/")) return "vendor-charts";
          if (
            id.includes("/node_modules/framer-motion/") ||
            id.includes("/node_modules/motion/")
          ) {
            return "vendor-motion";
          }
          if (
            id.includes("/node_modules/three/") ||
            id.includes("/node_modules/globe.gl/") ||
            id.includes("/node_modules/topojson-client/") ||
            id.includes("/node_modules/cobe/")
          ) {
            return "vendor-globe";
          }

          // All Radix primitives — group them. Pulled by lots of pages but
          // a single cacheable chunk is better than splitting per primitive.
          if (id.includes("/node_modules/@radix-ui/")) {
            return "vendor-radix";
          }

          // Icons — lucide-react is ~50 KB of tree-shaken icons but the
          // dynamic-icon table can balloon if many distinct icons are used
          // across the app.
          if (
            id.includes("/node_modules/lucide-react/") ||
            id.includes("/node_modules/react-icons/")
          ) {
            return "vendor-icons";
          }

          // Form layer — react-hook-form + zod + @hookform/resolvers all
          // pulled together everywhere a form lives.
          if (
            id.includes("/node_modules/react-hook-form/") ||
            id.includes("/node_modules/@hookform/") ||
            id.includes("/node_modules/zod/")
          ) {
            return "vendor-form";
          }

          // Analytics — posthog ships its own chunk so marketing pages can
          // defer it via dynamic import later.
          if (id.includes("/node_modules/posthog-js/")) {
            return "vendor-posthog";
          }

          // Carousel / slider libs — used on marketing demo pages.
          if (
            id.includes("/node_modules/swiper/") ||
            id.includes("/node_modules/embla-carousel-react/") ||
            id.includes("/node_modules/embla-carousel/")
          ) {
            return "vendor-carousel";
          }

          // Drag-and-drop — used only in admin/wizard builder surfaces.
          if (
            id.includes("/node_modules/@dnd-kit/") ||
            id.includes("/node_modules/@xyflow/")
          ) {
            return "vendor-dnd";
          }

          // Heavy one-offs: HTML→canvas + QR generator are only used by
          // a couple of pages; isolate so marketing doesn't carry them.
          if (id.includes("/node_modules/html2canvas/")) return "vendor-html2canvas";
          if (id.includes("/node_modules/qrcode/")) return "vendor-qrcode";

          // Date utilities — used widely across portal + admin + a few
          // marketing surfaces, worth pulling into its own chunk.
          if (id.includes("/node_modules/date-fns/")) {
            return "vendor-date";
          }

          // Sentry — error reporter, kept separate for cache stability.
          if (id.includes("/node_modules/@sentry/")) {
            return "vendor-sentry";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    watch: {
      usePolling: true,
    },
  },
});
