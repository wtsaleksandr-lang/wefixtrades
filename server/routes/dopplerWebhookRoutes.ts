/**
 * Doppler -> Replit auto-redeploy webhook.
 *
 *   POST /webhooks/doppler/secret-changed
 *
 * Doppler emits a webhook whenever a secret is added, updated, or
 * deleted in a config. We listen for changes in `wefixtrades/prd`,
 * verify the HMAC-SHA256 signature against a shared secret, and then
 * trigger a Replit redeploy by pushing an empty commit to `main` on
 * GitHub. Replit's git integration auto-deploys on every push to main,
 * so the new secret value is picked up on the next boot without Alex
 * having to click "Republish" in the Replit UI.
 *
 * Setup (Alex, once):
 *   1. https://dashboard.doppler.com → wefixtrades → `prd` config →
 *      Settings → Webhooks → Add Webhook
 *      URL:     https://wefixtrades.com/webhooks/doppler/secret-changed
 *      Secret:  generate one (`openssl rand -hex 32`) and paste it both
 *               into the Doppler webhook form AND into Doppler as
 *               `DOPPLER_WEBHOOK_SECRET` in `wefixtrades/prd`.
 *      Events:  "Secret updated" (or all secret events).
 *   2. Create a fine-grained GitHub PAT at
 *      https://github.com/settings/tokens?type=beta with
 *      `Contents: Write` on the wefixtrades repo. Store it as
 *      `GITHUB_DEPLOY_TOKEN` in Doppler `wefixtrades/prd`.
 *
 * Security posture:
 *   - 503 if `DOPPLER_WEBHOOK_SECRET` is unset (loud, not silent).
 *   - 401 if signature header missing or HMAC mismatch
 *     (constant-time compare via crypto.timingSafeEqual).
 *   - Non-prd / non-wefixtrades events are acknowledged 200 but ignored
 *     so Doppler doesn't retry them.
 *   - GitHub token only needs `Contents: Write` on this one repo, never
 *     logged.
 */

import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import { createLogger } from "../lib/logger";

const log = createLogger("DopplerWebhook");

const SIGNATURE_HEADER = "x-doppler-signature";

const GH_OWNER = "wtsaleksandr-lang";
const GH_REPO = "wefixtrades";
const GH_BRANCH = "main";
const GH_USER_AGENT = "wefixtrades-doppler-webhook";

interface DopplerPayload {
  event_type?: string;
  project?: { slug?: string; name?: string };
  config?: { name?: string };
}

export function registerDopplerWebhookRoutes(app: Express): void {
  app.post(
    "/webhooks/doppler/secret-changed",
    async (req: Request, res: Response) => {
      const secret = process.env.DOPPLER_WEBHOOK_SECRET;
      if (!secret) {
        log.warn(
          "DOPPLER_WEBHOOK_SECRET not configured — refusing webhook",
        );
        return res.status(503).json({ error: "webhook_not_configured" });
      }

      const signature = req.header(SIGNATURE_HEADER);
      if (!signature) {
        log.warn("Missing x-doppler-signature header");
        return res.status(401).json({ error: "missing_signature" });
      }

      // Raw body captured globally via express.json({ verify }) — see
      // server/index.ts. We need the exact bytes Doppler signed.
      const rawBody = (req as Request & { rawBody?: Buffer | string }).rawBody;
      if (!rawBody) {
        log.error(
          "rawBody missing on request — express.json verify hook misconfigured?",
        );
        return res.status(500).json({ error: "raw_body_unavailable" });
      }

      const bodyBuf =
        typeof rawBody === "string" ? Buffer.from(rawBody, "utf-8") : rawBody;

      const expected = crypto
        .createHmac("sha256", secret)
        .update(bodyBuf)
        .digest("hex");
      const provided = signature.replace(/^sha256=/, "");

      let signatureOk = false;
      try {
        const expectedBuf = Buffer.from(expected, "hex");
        const providedBuf = Buffer.from(provided, "hex");
        signatureOk =
          expectedBuf.length === providedBuf.length &&
          crypto.timingSafeEqual(expectedBuf, providedBuf);
      } catch {
        signatureOk = false;
      }

      if (!signatureOk) {
        log.warn("Doppler webhook signature mismatch");
        return res.status(401).json({ error: "signature_mismatch" });
      }

      const payload = (req.body || {}) as DopplerPayload;
      const project = payload.project?.slug ?? payload.project?.name;
      const config = payload.config?.name;
      if (project !== "wefixtrades" || config !== "prd") {
        log.info("Ignoring non-prd Doppler webhook", {
          project,
          config,
          event_type: payload.event_type,
        });
        return res.json({
          ok: true,
          action: "ignored",
          reason: `not wefixtrades/prd (got ${project}/${config})`,
        });
      }

      try {
        const sha = await triggerReplitRedeploy();
        log.info("Replit redeploy triggered via empty commit", {
          event_type: payload.event_type,
          commit_sha: sha,
        });
        return res.json({
          ok: true,
          action: "redeploy_triggered",
          commit_sha: sha,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("Failed to trigger redeploy", { error: msg });
        return res
          .status(500)
          .json({ error: "redeploy_trigger_failed", details: msg });
      }
    },
  );
}

/**
 * Push an empty commit to wefixtrades/main via the GitHub REST API.
 * Replit's git integration auto-deploys on push, so this is enough to
 * recycle the running container with the latest Doppler secrets.
 *
 * Returns the new commit SHA.
 */
async function triggerReplitRedeploy(): Promise<string> {
  const ghToken = process.env.GITHUB_DEPLOY_TOKEN;
  if (!ghToken) {
    throw new Error("GITHUB_DEPLOY_TOKEN not set");
  }

  const headers = {
    Authorization: `Bearer ${ghToken}`,
    "User-Agent": GH_USER_AGENT,
    Accept: "application/vnd.github+json",
  };

  // 1. Resolve current HEAD of main.
  const refRes = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/git/refs/heads/${GH_BRANCH}`,
    { headers },
  );
  if (!refRes.ok) {
    throw new Error(
      `GitHub ref fetch failed: ${refRes.status} ${refRes.statusText}`,
    );
  }
  const refData = (await refRes.json()) as { object?: { sha?: string } };
  const parentSha = refData.object?.sha;
  if (!parentSha) throw new Error("GitHub ref response missing object.sha");

  // 2. Look up the tree SHA of that commit so we can reuse it.
  const commitRes = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/git/commits/${parentSha}`,
    { headers },
  );
  if (!commitRes.ok) {
    throw new Error(
      `GitHub commit fetch failed: ${commitRes.status} ${commitRes.statusText}`,
    );
  }
  const commitData = (await commitRes.json()) as { tree?: { sha?: string } };
  const treeSha = commitData.tree?.sha;
  if (!treeSha) throw new Error("GitHub commit response missing tree.sha");

  // 3. Create a new commit with the same tree (i.e. zero file changes).
  const newCommitRes = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/git/commits`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          "chore(deploy): auto-redeploy triggered by Doppler secret change",
        tree: treeSha,
        parents: [parentSha],
      }),
    },
  );
  if (!newCommitRes.ok) {
    throw new Error(
      `GitHub commit create failed: ${newCommitRes.status} ${newCommitRes.statusText}`,
    );
  }
  const newCommit = (await newCommitRes.json()) as { sha?: string };
  if (!newCommit.sha) throw new Error("GitHub new-commit response missing sha");

  // 4. Fast-forward main to the new commit.
  const updateRes = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/git/refs/heads/${GH_BRANCH}`,
    {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    },
  );
  if (!updateRes.ok) {
    throw new Error(
      `GitHub ref update failed: ${updateRes.status} ${updateRes.statusText}`,
    );
  }

  return newCommit.sha;
}
