import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { ogTagMiddleware } from "./lib/ogMiddleware";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  const indexPath = path.resolve(distPath, "index.html");

  // Inject OG meta tags for shared audit report pages
  app.use(
    ogTagMiddleware(async () => fs.promises.readFile(indexPath, "utf-8"))
  );

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(indexPath);
  });
}
