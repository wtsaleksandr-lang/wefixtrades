import http from "http";
import { exec } from "child_process";

const EXEC_SECRET = process.env.EXEC_SECRET;
const PORT = parseInt(process.env.EXEC_PORT ?? "5001", 10);

if (!EXEC_SECRET) {
  console.warn("[exec-server] EXEC_SECRET not set — server will reject all requests");
}

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST" || req.url !== "/api/exec") {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!EXEC_SECRET || token !== EXEC_SECRET) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    let parsed: { command?: string; cwd?: string; timeout?: number };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    const { command, cwd, timeout } = parsed;

    if (!command || typeof command !== "string") {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Missing or invalid 'command' field" }));
      return;
    }

    const execTimeout = Math.min(timeout ?? 30_000, 120_000);
    const execCwd = cwd ?? process.cwd();

    exec(
      command,
      { cwd: execCwd, timeout: execTimeout, maxBuffer: 10 * 1024 * 1024, env: process.env },
      (err, stdout, stderr) => {
        res.writeHead(200);
        res.end(JSON.stringify({
          exitCode: err?.code ?? 0,
          stdout,
          stderr,
          timedOut: err?.killed ?? false,
        }));
      }
    );
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[exec-server] Listening on port ${PORT}`);
});
