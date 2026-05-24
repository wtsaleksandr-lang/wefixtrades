#!/usr/bin/env node
/**
 * Deploy Safety Wave 3 — force-push PR head to the `staging` branch.
 *
 * The staging Replit auto-deploys from this branch (one-time setup, see
 * the PR body). Force-push is correct here: rolling staging is "last PR
 * wins"; we deliberately overwrite the previous deploy. The previous PR
 * gets a courtesy comment from identify-previous-occupant.mjs + the
 * gate workflow.
 *
 * We deliberately do NOT push the PR branch by name — only the resolved
 * SHA. That way fork PRs (where the head ref lives on a different repo)
 * still deploy from the SHA we just checked out into the runner.
 *
 * Env:
 *   STAGING_BRANCH — destination branch (default "staging")
 *   PR_HEAD_SHA    — SHA already checked out at $GITHUB_WORKSPACE
 *   PR_NUMBER      — for the commit log line
 *
 * Auth: relies on the git remote already being configured by actions/checkout@v4
 * with the workflow token (or STAGING_PUSH_TOKEN when provided).
 */

import { spawnSync } from "node:child_process";

const BRANCH = process.env.STAGING_BRANCH ?? "staging";
const SHA = process.env.PR_HEAD_SHA;
const PR = process.env.PR_NUMBER ?? "?";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited ${r.status}`);
  }
}

function runCapture(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf-8" });
  return { code: r.status, stdout: (r.stdout ?? "").trim(), stderr: (r.stderr ?? "").trim() };
}

function main() {
  if (!SHA) {
    console.error("[push-to-staging] PR_HEAD_SHA is required");
    process.exit(2);
  }

  // Sanity: the SHA we're about to push must actually exist locally.
  const have = runCapture("git", ["cat-file", "-t", SHA]);
  if (have.code !== 0 || have.stdout !== "commit") {
    console.error(`[push-to-staging] SHA ${SHA} is not a known commit object`);
    process.exit(2);
  }

  console.log(`[push-to-staging] force-pushing ${SHA.substring(0, 7)} → ${BRANCH} (PR #${PR})`);

  // refs/heads/<branch> form is the safest: it updates only the branch ref,
  // no tag interactions, no remote-tracking ambiguity.
  run("git", ["push", "--force", "origin", `${SHA}:refs/heads/${BRANCH}`]);

  console.log(`[push-to-staging] done — staging Replit should now auto-deploy ${SHA.substring(0, 7)}`);
}

main();
