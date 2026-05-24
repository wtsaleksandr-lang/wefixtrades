import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { ogTagMiddleware } from "./lib/ogMiddleware";
import { gtagMiddleware, addGtagToHtml } from "./lib/gtagMiddleware";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  // Inject OG meta tags for shared audit report pages (dev mode)
  const clientTemplate = path.resolve(
    import.meta.dirname,
    "..",
    "client",
    "index.html",
  );
  const renderShell = async (url: string) => {
    let template = await fs.promises.readFile(clientTemplate, "utf-8");
    template = template.replace(
      `src="/src/main.tsx"`,
      `src="/src/main.tsx?v=${nanoid()}"`,
    );
    return await vite.transformIndexHtml(url, template);
  };

  app.use(ogTagMiddleware(() => renderShell("/")));

  // gtag head injection — no-op in dev (NODE_ENV !== 'production') so this
  // is structurally inert here, but registering it keeps dev and prod
  // pipelines mirror-image. Lives ahead of the SPA catch-all.
  app.use(gtagMiddleware(() => renderShell("/")));

  app.use("/{*path}", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const page = await renderShell(url);
      // addGtagToHtml is a no-op outside production / without GA4 configured,
      // so dev keeps the unmodified shell.
      res.status(200).set({ "Content-Type": "text/html" }).end(addGtagToHtml(page));
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
