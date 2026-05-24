import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { ogTagMiddleware } from "./lib/ogMiddleware";
import { gtagMiddleware, addGtagToHtml } from "./lib/gtagMiddleware";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  const indexPath = path.resolve(distPath, "index.html");
  const readShell = () => fs.promises.readFile(indexPath, "utf-8");

  // Inject OG meta tags for shared audit report pages (also picks up gtag
  // via addGtagToHtml internally so audit shares are tracked too).
  app.use(ogTagMiddleware(readShell));

  // Inject gtag.js into every other public HTML response (admin/portal/api
  // are filtered inside the middleware).
  app.use(gtagMiddleware(readShell));

  // fall through to index.html if the file doesn't exist. Reads the file
  // once per request so a Doppler-driven GA4_MEASUREMENT_ID change is
  // picked up without a redeploy of the static bundle.
  app.use("/{*path}", async (_req: Request, res: Response) => {
    try {
      const shell = await readShell();
      res.status(200).type("html").send(addGtagToHtml(shell));
    } catch {
      res.sendFile(indexPath);
    }
  });
}
