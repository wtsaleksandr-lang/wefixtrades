#!/usr/bin/env node
/**
 * Deploy Safety Wave 3 — identify which PR currently occupies rolling staging.
 *
 * Rolling staging is a single URL backed by the `staging` git branch. Before
 * we force-push the CURRENT PR's head to `staging`, we look up the SHA that
 * `staging` is sitting on and ask GitHub which PR last produced that SHA.
 *
 * Output (written to $GITHUB_OUTPUT):
 *   previous_pr=<number>     OR     previous_pr=
 *
 * The empty value is the normal case the first time the gate runs, or when
 * the staging branch is currently sitting on a commit that doesn't trace
 * back to a still-open PR.
 *
 * Env:
 *   GH_TOKEN              — token with PR-read permission (workflow GITHUB_TOKEN works)
 *   GITHUB_REPOSITORY     — owner/repo
 *   STAGING_BRANCH        — branch name (defaults to "staging")
 *   CURRENT_PR_NUMBER     — the PR being deployed right now; never name itself as occupant
 */

import { writeFileSync, appendFileSync } from "node:fs";

const TOKEN = process.env.GH_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
const BRANCH = process.env.STAGING_BRANCH ?? "staging";
const CURRENT = String(process.env.CURRENT_PR_NUMBER ?? "");
const OUT = process.env.GITHUB_OUTPUT;

function emit(key, value) {
  const line = `${key}=${value ?? ""}\n`;
  if (OUT) {
    appendFileSync(OUT, line);
  } else {
    process.stdout.write(line);
  }
}

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
}

async function main() {
  if (!TOKEN || !REPO) {
    console.error("[identify-previous] missing GH_TOKEN or GITHUB_REPOSITORY — emitting empty");
    emit("previous_pr", "");
    return;
  }

  // 1. What SHA is `staging` sitting on right now?
  const branchRes = await gh(`/repos/${REPO}/branches/${encodeURIComponent(BRANCH)}`);
  if (branchRes.status === 404) {
    console.log(`[identify-previous] '${BRANCH}' branch does not exist yet — first deploy`);
    emit("previous_pr", "");
    return;
  }
  if (branchRes.status !== 200) {
    console.warn(`[identify-previous] could not read '${BRANCH}' (HTTP ${branchRes.status}) — emitting empty`);
    emit("previous_pr", "");
    return;
  }
  const stagingSha = branchRes.body?.commit?.sha;
  if (!stagingSha) {
    emit("previous_pr", "");
    return;
  }
  console.log(`[identify-previous] staging currently at ${stagingSha.substring(0, 7)}`);

  // 2. Which PRs produced that SHA?
  // GitHub search returns PRs whose head matches the SHA.
  const prsRes = await gh(`/repos/${REPO}/commits/${stagingSha}/pulls`);
  if (prsRes.status !== 200 || !Array.isArray(prsRes.body)) {
    console.warn(`[identify-previous] no PR found for ${stagingSha.substring(0, 7)} — emitting empty`);
    emit("previous_pr", "");
    return;
  }

  const candidates = prsRes.body
    .filter((pr) => String(pr.number) !== CURRENT)
    .filter((pr) => pr.state === "open");

  if (candidates.length === 0) {
    console.log("[identify-previous] no open previous-occupant PR — emitting empty");
    emit("previous_pr", "");
    return;
  }

  // Pick the most recently updated open PR — most likely the one the author cares about.
  candidates.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  const previous = candidates[0];
  console.log(`[identify-previous] previous occupant: PR #${previous.number}`);
  emit("previous_pr", String(previous.number));
}

main().catch((err) => {
  console.error(`[identify-previous] uncaught: ${err?.stack ?? err}`);
  // Never break the gate over a comment-target lookup.
  emit("previous_pr", "");
});
