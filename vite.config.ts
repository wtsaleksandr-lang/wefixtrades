import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
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
