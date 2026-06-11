/**
 * Regression tests for the ContentFlow Phase 2 video-pipeline storage layer
 * (server/storage/contentflowVideo.ts).
 *
 * What this gate protects:
 *
 *   1. Claim semantics — claimPlannedScenes only hands out unlocked,
 *      backoff-elapsed scenes of in-flight projects; a second worker can
 *      never receive a scene the first worker already claimed; the SQL
 *      really carries FOR UPDATE ... SKIP LOCKED + the stale-lock guard.
 *   2. Stale-claim recovery — a crashed worker's claim auto-recovers after
 *      the 10-min threshold WITH an attempts bump; fresh claims are left
 *      alone; lost submits (rendering with no operation ref) re-plan.
 *   3. Dual-write COST INVARIANT — addProjectCost writes the project's
 *      actual_cost_micro_usd + cost_breakdown AND forwards the same amount
 *      to the draft via addDraftGenerationCost so the existing monthly
 *      spend cap counts video spend.
 *   4. Idempotency — createVideoProject on a duplicate idempotency_key
 *      returns the EXISTING project (no second project, no extra scenes).
 *   5. Deliberate-failure fixture — a "regressed" claim missing the
 *      stale-cutoff/SKIP LOCKED lock guard double-claims against the same
 *      store, and the no-double-claim invariant assertion fails red against
 *      it — proving this gate catches that regression class, not just runs.
 *
 * Runnable standalone via:
 *   npx tsx server/storage/contentflowVideo.test.ts
 * Wired as `npm run check:contentflow-video-storage`.
 *
 * Excluded from `tsc --noEmit` via the tsconfig test pattern. Uses
 * node:assert/strict, no test-runner dependency, no live DB: the module's
 * db seam (VideoDb) is injected with an in-memory fake that renders each
 * drizzle query through PgDialect and dispatches on the `cfv:<name>`
 * marker comments, honoring the WHERE-clause guards that are actually
 * present in the rendered SQL (which is what makes the deliberate-failure
 * fixture meaningful).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

/* The module imports server/db.ts, which throws without a DATABASE_URL.
 * Nothing here ever touches the pool (every call injects the fake db),
 * so a stub URL is fine. Must be set BEFORE the dynamic import. */
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";

const impl = await import("./contentflowVideo");
const {
  createVideoProject,
  claimPlannedScenes,
  claimStitchableProject,
  recoverStaleVideoClaims,
  recordSceneProviderRequest,
  markSceneRendering,
  markSceneRendered,
  markSceneFailed,
  advanceProjectIfComplete,
  addProjectCost,
  cancelVideoProject,
  retryScene,
  listProjectsForClient,
  getProjectWithScenes,
  getAdminVideoQueue,
} = impl;
type VideoDb = import("./contentflowVideo").VideoDb;

const dialect = new PgDialect();

/* ═══ In-memory fake of the VideoDb seam ═══════════════════════════════
   Renders each statement to text+params and applies the semantics implied
   by the SQL. Crucially, the claim handler only honors the lock guard /
   row-lock skipping when those clauses are PRESENT in the rendered SQL —
   so a regressed query that drops them genuinely double-claims here. */

type Row = Record<string, any>;

const ts = (v: any): number | null => (v == null ? null : new Date(v).getTime());

class FakeVideoDb {
  nextProjectId = 1;
  nextSceneId = 1;
  projects = new Map<number, Row>();
  scenes = new Map<number, Row>();
  drafts = new Map<number, Row>();
  lastSqlByMarker = new Map<string, string>();

  seedDraft(id: number): void {
    this.drafts.set(id, { id, metadata: null, generation_cost_micro_usd: 0 });
  }

  async execute(query: any): Promise<{ rows: Row[] }> {
    const { sql: text, params } = dialect.sqlToQuery(query);
    const m = text.match(/\/\*cfv:([a-z_]+)\*\//);
    if (!m) throw new Error(`statement without cfv marker: ${text.slice(0, 120)}`);
    this.lastSqlByMarker.set(m[1], text);
    return { rows: this.dispatch(m[1], text, params as any[]) };
  }

  async transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }

  private sceneList(): Row[] {
    return [...this.scenes.values()];
  }

  private dispatch(marker: string, text: string, p: any[]): Row[] {
    switch (marker) {
      case "insert_project": {
        for (const row of this.projects.values()) {
          if (row.idempotency_key === p[2]) return []; // ON CONFLICT DO NOTHING
        }
        const row: Row = {
          id: this.nextProjectId++,
          client_id: p[0], draft_id: p[1], idempotency_key: p[2], title: p[3],
          source_prompt: p[4],
          prompt_source: p[5] == null ? null : JSON.parse(p[5]),
          scene_plan: p[6] == null ? null : JSON.parse(p[6]),
          aspect_ratio: p[7], narration_enabled: p[8], audio_mode: p[9],
          estimated_cost_micro_usd: p[10],
          status: "planned", stitch_status: "pending", stitch_operation_ref: null,
          actual_cost_micro_usd: 0, cost_breakdown: {},
          video_url: null, error: null, locked_at: null, locked_by: null,
          created_at: new Date(), updated_at: new Date(),
        };
        this.projects.set(row.id, row);
        return [{ ...row }];
      }
      case "select_project_by_key":
        return [...this.projects.values()].filter((r) => r.idempotency_key === p[0]).map((r) => ({ ...r }));
      case "select_scenes":
      case "get_scenes":
        return this.sceneList().filter((s) => s.project_id === p[0])
          .sort((a, b) => a.scene_index - b.scene_index).map((r) => ({ ...r }));
      case "insert_scene": {
        for (const s of this.scenes.values()) {
          if (s.project_id === p[0] && s.scene_index === p[1]) return []; // ON CONFLICT
        }
        const row: Row = {
          id: this.nextSceneId++,
          project_id: p[0], scene_index: p[1], prompt: p[2], narration: p[3],
          duration_sec: p[4], status: "planned", provider: null,
          provider_operation_ref: null, provider_request_id: null,
          video_url: null, cost_micro_usd: 0, attempts: 0, last_error: null,
          next_attempt_at: null, locked_at: null, locked_by: null,
          rendered_at: null, created_at: new Date(), updated_at: new Date(),
        };
        this.scenes.set(row.id, row);
        return [{ ...row }];
      }
      case "link_draft": {
        const draft = this.drafts.get(p[1]);
        if (draft) draft.metadata = { ...(draft.metadata ?? {}), ...JSON.parse(p[0]) };
        return [];
      }
      case "claim_scenes": {
        const now = ts(p[0])!;
        const lockedBy = p[1];
        const limit = Number(p[p.length - 1]);
        // Honor each guard ONLY if the rendered SQL carries it — this is
        // what lets the regressed-claim fixture double-claim below.
        const honorLock = text.includes("locked_at IS NULL OR") && text.includes("SKIP LOCKED");
        const staleCutoff = honorLock ? ts(p[3])! : null;
        const honorBackoff = text.includes("next_attempt_at");
        const honorProject = text.includes("p.status IN");
        const eligible = this.sceneList()
          .filter((s) => {
            if (s.status !== "planned") return false;
            if (honorProject) {
              const proj = this.projects.get(s.project_id);
              if (!proj || !["planned", "rendering"].includes(proj.status)) return false;
            }
            if (honorBackoff && s.next_attempt_at != null && ts(s.next_attempt_at)! > now) return false;
            if (honorLock && s.locked_at != null && ts(s.locked_at)! >= staleCutoff!) return false;
            return true;
          })
          .sort((a, b) => a.project_id - b.project_id || a.scene_index - b.scene_index)
          .slice(0, limit);
        for (const s of eligible) {
          s.locked_at = new Date(now);
          s.locked_by = lockedBy;
          s.updated_at = new Date();
        }
        return eligible.map((r) => ({ ...r }));
      }
      case "projects_rendering": {
        for (const id of p) {
          const proj = this.projects.get(Number(id));
          if (proj && proj.status === "planned") proj.status = "rendering";
        }
        return [];
      }
      case "claim_stitch": {
        const now = ts(p[0])!;
        const cutoff = ts(p[2])!;
        const candidate = [...this.projects.values()]
          .filter((r) => r.status === "stitching" && r.stitch_status === "pending"
            && (r.locked_at == null || ts(r.locked_at)! < cutoff))
          .sort((a, b) => a.id - b.id)[0];
        if (!candidate) return [];
        candidate.stitch_status = "stitching";
        candidate.locked_at = new Date(now);
        candidate.locked_by = p[1];
        return [{ ...candidate }];
      }
      case "recover_scene_locks": {
        const cutoff = ts(p[0])!;
        const hit = this.sceneList().filter((s) =>
          s.status === "planned" && s.locked_at != null && ts(s.locked_at)! < cutoff);
        for (const s of hit) {
          s.locked_at = null; s.locked_by = null;
          s.attempts += 1; s.last_error = "recovered from stale claim";
        }
        return hit.map((s) => ({ id: s.id }));
      }
      case "recover_lost_submits": {
        const cutoff = ts(p[0])!;
        const hit = this.sceneList().filter((s) =>
          s.status === "rendering" && s.provider_operation_ref == null
          && ts(s.locked_at ?? s.updated_at)! < cutoff);
        for (const s of hit) {
          s.status = "planned"; s.locked_at = null; s.locked_by = null;
          s.attempts += 1; s.last_error = "submit lost (rendering with no operation ref)";
        }
        return hit.map((s) => ({ id: s.id }));
      }
      case "recover_stitch_locks": {
        const cutoff = ts(p[0])!;
        const hit = [...this.projects.values()].filter((r) =>
          r.stitch_status === "stitching" && r.locked_at != null && ts(r.locked_at)! < cutoff);
        for (const r of hit) {
          r.stitch_status = "pending"; r.locked_at = null; r.locked_by = null;
        }
        return hit.map((r) => ({ id: r.id }));
      }
      case "record_request": {
        const s = this.scenes.get(p[2]);
        if (!s) return [];
        s.provider = p[0]; s.provider_request_id = p[1]; s.updated_at = new Date();
        return [{ ...s }];
      }
      case "scene_rendering": {
        const s = this.scenes.get(p[3]);
        if (!s) return [];
        s.status = "rendering"; s.provider = p[0]; s.provider_operation_ref = p[1];
        s.provider_request_id = p[2] ?? s.provider_request_id;
        s.locked_at = null; s.locked_by = null; s.last_error = null; s.updated_at = new Date();
        return [{ ...s }];
      }
      case "scene_rendered": {
        const s = this.scenes.get(p[2]);
        if (!s) return [];
        s.status = "rendered"; s.video_url = p[0]; s.cost_micro_usd += Number(p[1]);
        s.rendered_at = new Date(); s.locked_at = null; s.locked_by = null;
        s.last_error = null; s.updated_at = new Date();
        return [{ ...s }];
      }
      case "scene_failed": {
        const s = this.scenes.get(p[p.length - 1]);
        if (!s) return [];
        const [error, retryable, ceiling, nowIso, baseSec] = p;
        const prevAttempts = s.attempts;
        s.attempts = prevAttempts + 1;
        s.last_error = error;
        s.provider_operation_ref = null; s.locked_at = null; s.locked_by = null;
        if (retryable && prevAttempts + 1 < ceiling) {
          s.status = "planned";
          s.next_attempt_at = new Date(ts(nowIso)! + baseSec * 2 ** prevAttempts * 1000);
        } else {
          s.status = "failed";
          s.next_attempt_at = null;
        }
        s.updated_at = new Date();
        return [{ ...s }];
      }
      case "advance_to_stitching": {
        const proj = this.projects.get(p[0]);
        if (!proj || proj.status !== "rendering") return [];
        const scenes = this.sceneList().filter((s) => s.project_id === proj.id);
        if (scenes.length === 0 || scenes.some((s) => s.status !== "rendered")) return [];
        proj.status = "stitching"; proj.stitch_status = "pending"; proj.updated_at = new Date();
        return [{ ...proj }];
      }
      case "advance_to_needs_attention": {
        const proj = this.projects.get(p[0]);
        if (!proj || !["planned", "rendering"].includes(proj.status)) return [];
        const anyFailed = this.sceneList().some((s) => s.project_id === proj.id && s.status === "failed");
        if (!anyFailed) return [];
        proj.status = "needs_attention"; proj.updated_at = new Date();
        return [{ ...proj }];
      }
      case "add_project_cost": {
        const proj = this.projects.get(p[p.length - 1]);
        if (!proj) return [];
        const amount = Number(p[0]);
        const category = p[1];
        proj.actual_cost_micro_usd += amount;
        proj.cost_breakdown = {
          ...(proj.cost_breakdown ?? {}),
          [category]: ((proj.cost_breakdown ?? {})[category] ?? 0) + amount,
        };
        proj.updated_at = new Date();
        return [{ ...proj }];
      }
      case "cancel_project": {
        const proj = this.projects.get(p[0]);
        const guarded = text.includes("client_id =");
        if (!proj || !["planned", "rendering"].includes(proj.status)) return [];
        if (guarded && proj.client_id !== p[1]) return [];
        proj.status = "canceled"; proj.locked_at = null; proj.locked_by = null;
        proj.updated_at = new Date();
        return [{ ...proj }];
      }
      case "retry_scene": {
        const guarded = text.includes("p.client_id");
        const s = this.sceneList().find((r) => r.project_id === p[0] && r.scene_index === p[1]);
        const proj = this.projects.get(p[0]);
        if (!s || s.status !== "failed") return [];
        if (!proj || proj.status !== "needs_attention") return [];
        if (guarded && proj.client_id !== p[2]) return [];
        s.status = "planned"; s.attempts = 0; s.next_attempt_at = null;
        s.last_error = null; s.provider_operation_ref = null; s.provider_request_id = null;
        s.locked_at = null; s.locked_by = null; s.updated_at = new Date();
        return [{ ...s }];
      }
      case "retry_project": {
        const proj = this.projects.get(p[0]);
        if (proj && proj.status === "needs_attention") {
          proj.status = "rendering"; proj.error = null; proj.updated_at = new Date();
        }
        return [];
      }
      case "list_projects":
        return [...this.projects.values()]
          .filter((r) => r.client_id === p[0])
          .sort((a, b) => b.created_at - a.created_at || b.id - a.id)
          .slice(Number(p[2]), Number(p[2]) + Number(p[1]))
          .map((r) => ({ ...r }));
      case "get_project": {
        const proj = this.projects.get(p[0]);
        if (!proj) return [];
        if (text.includes("client_id =") && proj.client_id !== p[1]) return [];
        return [{ ...proj }];
      }
      case "admin_counts": {
        const counts: Record<string, number> = {};
        for (const r of this.projects.values()) counts[r.status] = (counts[r.status] ?? 0) + 1;
        return Object.entries(counts).map(([status, count]) => ({ status, count }));
      }
      case "admin_queue":
        return [...this.projects.values()]
          .sort((a, b) => b.created_at - a.created_at || b.id - a.id)
          .slice(0, Number(p[0]))
          .map((r) => {
            const scenes = this.sceneList().filter((s) => s.project_id === r.id);
            return {
              ...r,
              scene_count: scenes.length,
              rendered_count: scenes.filter((s) => s.status === "rendered").length,
              failed_count: scenes.filter((s) => s.status === "failed").length,
              providers: [...new Set(scenes.map((s) => s.provider).filter(Boolean))],
            };
          });
      default:
        throw new Error(`fake db: unhandled marker cfv:${marker}`);
    }
  }
}

/* ═══ Helpers ═══ */

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
  }
}

const T0 = new Date("2026-06-11T12:00:00.000Z");
const plus = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60_000;

function makeInput(overrides: Partial<import("./contentflowVideo").CreateVideoProjectInput> = {}) {
  return {
    client_id: 1,
    draft_id: 7,
    idempotency_key: "key-default",
    title: "Spring tune-up promo",
    source_prompt: "15s spring furnace tune-up promo",
    prompt_source: { free_form: "15s spring furnace tune-up promo" },
    scene_plan: { title: "Spring tune-up", totalDurationSec: 12 },
    scenes: [
      { scene_index: 0, prompt: "técnico arrives — style bible", duration_sec: 6, narration: "We come to you." },
      { scene_index: 1, prompt: "happy homeowner — style bible", duration_sec: 6, narration: null },
    ],
    ...overrides,
  };
}

async function seedProject(fake: FakeVideoDb, key: string, clientId = 1, draftId = 7) {
  fake.seedDraft(draftId);
  return createVideoProject(
    makeInput({ idempotency_key: key, client_id: clientId, draft_id: draftId }),
    fake as unknown as VideoDb,
  );
}

/* ═══ Tests ═══ */

async function main() {
  console.log("contentflowVideo.test.ts");

  /* ── 1. create + draft linkage ── */
  await test("createVideoProject persists project + scenes + draft back-link", async () => {
    const fake = new FakeVideoDb();
    const { project, scenes, created } = await seedProject(fake, "key-1");
    assert.equal(created, true);
    assert.equal(project.status, "planned");
    assert.equal(project.stitch_status, "pending");
    assert.equal(project.actual_cost_micro_usd, 0);
    assert.equal(scenes.length, 2);
    assert.deepEqual(scenes.map((s) => s.scene_index), [0, 1]);
    assert.equal(scenes[0].status, "planned");
    assert.equal(fake.drafts.get(7)!.metadata.video_project_id, project.id);
    assert.match(fake.lastSqlByMarker.get("insert_project")!, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
  });

  /* ── 2. idempotency conflict returns existing ── */
  await test("duplicate idempotency_key returns the EXISTING project, creates nothing", async () => {
    const fake = new FakeVideoDb();
    const first = await seedProject(fake, "key-dupe");
    const second = await createVideoProject(
      makeInput({ idempotency_key: "key-dupe", title: "different title from a double-submit" }),
      fake as unknown as VideoDb,
    );
    assert.equal(second.created, false);
    assert.equal(second.project.id, first.project.id);
    assert.equal(second.project.title, first.project.title, "existing row returned untouched");
    assert.equal(second.scenes.length, 2);
    assert.equal(fake.projects.size, 1, "no second project row");
    assert.equal(fake.scenes.size, 2, "no extra scene rows");
  });

  /* ── 3. claim semantics ── */
  await test("claimPlannedScenes claims up to limit, locks rows, flips projects to rendering; second worker gets the rest only", async () => {
    const fake = new FakeVideoDb();
    const p1 = await seedProject(fake, "key-a", 1, 7);
    const p2 = await seedProject(fake, "key-b", 2, 8);
    const dbc = fake as unknown as VideoDb;

    const claimedA = await claimPlannedScenes(3, "worker-A", { now: T0 }, dbc);
    assert.equal(claimedA.length, 3);
    assert.ok(claimedA.every((s) => s.locked_by === "worker-A"));
    assert.equal(fake.projects.get(p1.project.id)!.status, "rendering");
    // worker B at the same instant: only the single unclaimed scene remains
    const claimedB = await claimPlannedScenes(3, "worker-B", { now: T0 }, dbc);
    assert.equal(claimedB.length, 1);
    const overlap = claimedB.filter((s) => claimedA.some((a) => a.id === s.id));
    assert.equal(overlap.length, 0, "a locked scene must never be claimed twice");
    // nothing left
    const claimedC = await claimPlannedScenes(3, "worker-C", { now: T0 }, dbc);
    assert.equal(claimedC.length, 0);
    assert.equal(fake.projects.get(p2.project.id)!.status, "rendering");
    // the real SQL carries the load-bearing clauses
    const claimSql = fake.lastSqlByMarker.get("claim_scenes")!;
    assert.match(claimSql, /FOR UPDATE OF s SKIP LOCKED/);
    assert.match(claimSql, /locked_at IS NULL OR s\.locked_at </);
    assert.match(claimSql, /next_attempt_at IS NULL OR/);
    assert.match(claimSql, /p\.status IN \('planned', 'rendering'\)/);
  });

  await test("claim respects retry backoff (next_attempt_at) and skips canceled projects", async () => {
    const fake = new FakeVideoDb();
    const { project, scenes } = await seedProject(fake, "key-backoff");
    const dbc = fake as unknown as VideoDb;
    // scene 0: claimed then failed retryably → planned with next_attempt_at = T0 + 60s
    const [claimed] = await claimPlannedScenes(1, "worker-A", { now: T0 }, dbc);
    const afterFail = await markSceneFailed(claimed.id, { error: "veo 429", retryable: true }, { now: T0 }, dbc);
    assert.equal(afterFail!.status, "planned");
    assert.equal(ts(afterFail!.next_attempt_at), T0.getTime() + 60_000, "first backoff = base 60s");
    // at T0 (+lock gone but backoff pending) only scene 1 is claimable
    const claimedNow = await claimPlannedScenes(5, "worker-B", { now: T0 }, dbc);
    assert.deepEqual(claimedNow.map((s) => s.scene_index), [1]);
    // at T0+61s the backoff has elapsed
    const claimedLater = await claimPlannedScenes(5, "worker-B", { now: plus(61_000) }, dbc);
    assert.deepEqual(claimedLater.map((s) => s.scene_index), [0]);
    // canceled project's scenes never claimable
    const fake2 = new FakeVideoDb();
    const seeded = await seedProject(fake2, "key-cancel");
    const canceled = await cancelVideoProject(seeded.project.id, { clientId: 1 }, fake2 as unknown as VideoDb);
    assert.equal(canceled!.status, "canceled");
    const claimedCanceled = await claimPlannedScenes(5, "worker-A", { now: T0 }, fake2 as unknown as VideoDb);
    assert.equal(claimedCanceled.length, 0, "scenes of a canceled project must never submit");
  });

  /* ── 4. stale-claim recovery ── */
  await test("recoverStaleVideoClaims frees 10-min-stale claims with attempts bump; fresh claims untouched", async () => {
    const fake = new FakeVideoDb();
    await seedProject(fake, "key-stale");
    const dbc = fake as unknown as VideoDb;
    const claimed = await claimPlannedScenes(2, "worker-died", { now: T0 }, dbc);
    assert.equal(claimed.length, 2);

    // 5 minutes later: locks are fresh — nothing recovers, nothing claimable
    const early = await recoverStaleVideoClaims({ now: plus(5 * MIN) }, dbc);
    assert.equal(early.recovered_scene_claims, 0);
    assert.equal((await claimPlannedScenes(5, "worker-B", { now: plus(5 * MIN) }, dbc)).length, 0);

    // 11 minutes later: both claims recover, attempts bumped, re-claimable
    const late = await recoverStaleVideoClaims({ now: plus(11 * MIN) }, dbc);
    assert.equal(late.recovered_scene_claims, 2);
    const rows = [...fake.scenes.values()];
    assert.ok(rows.every((s) => s.attempts === 1), "recovery must bump attempts");
    assert.ok(rows.every((s) => s.locked_at === null && s.locked_by === null));
    const reclaimed = await claimPlannedScenes(5, "worker-B", { now: plus(11 * MIN) }, dbc);
    assert.equal(reclaimed.length, 2);
  });

  await test("recovery re-plans lost submits (rendering with no operation ref)", async () => {
    const fake = new FakeVideoDb();
    const { scenes } = await seedProject(fake, "key-lost");
    const dbc = fake as unknown as VideoDb;
    // simulate a submit that died after status flip but before the ref persisted
    const row = fake.scenes.get(scenes[0].id)!;
    row.status = "rendering";
    row.provider_operation_ref = null;
    row.locked_at = T0;
    const out = await recoverStaleVideoClaims({ now: plus(11 * MIN) }, dbc);
    assert.equal(out.recovered_lost_submits, 1);
    assert.equal(fake.scenes.get(scenes[0].id)!.status, "planned");
    assert.equal(fake.scenes.get(scenes[0].id)!.attempts, 1);
  });

  /* ── 5. DELIBERATE-FAILURE FIXTURE ── */
  await test("deliberate failure: a regressed claim without the stale-cutoff/SKIP LOCKED guard double-claims — the invariant catches it red", async () => {
    const fake = new FakeVideoDb();
    await seedProject(fake, "key-regressed");
    const dbc = fake as unknown as VideoDb;

    const claimedA = await claimPlannedScenes(2, "worker-A", { now: T0 }, dbc);
    assert.equal(claimedA.length, 2);
    const claimedIds = new Set(claimedA.map((s) => s.id));

    /* What a careless refactor of claimPlannedScenes would produce: the
     * same UPDATE, minus the locked_at stale guard and minus
     * FOR UPDATE ... SKIP LOCKED. The fake honors only the clauses present
     * in the SQL, so this regressed query sees the locked rows as fair game. */
    async function regressedClaimPlannedScenes(limit: number, lockedBy: string, now: Date) {
      const nowIso = now.toISOString();
      const res: any = await dbc.execute(sql`
        /*cfv:claim_scenes*/
        UPDATE video_scenes
        SET locked_at = ${nowIso}::timestamptz,
            locked_by = ${lockedBy},
            updated_at = NOW()
        WHERE id IN (
          SELECT s.id FROM video_scenes s
          JOIN video_projects p ON p.id = s.project_id
          WHERE s.status = 'planned'
            AND p.status IN ('planned', 'rendering')
            AND (s.next_attempt_at IS NULL OR s.next_attempt_at <= ${nowIso}::timestamptz)
          ORDER BY s.project_id ASC, s.scene_index ASC
          LIMIT ${limit}
        )
        RETURNING *
      `);
      return (res?.rows ?? res) as Row[];
    }

    const claimedB = await regressedClaimPlannedScenes(2, "worker-B", T0);
    const overlap = claimedB.filter((s) => claimedIds.has(s.id));
    assert.ok(overlap.length > 0, "fixture sanity: the regressed claim must double-claim");
    // ...and the gate's no-double-claim invariant goes red against it:
    assert.throws(
      () => assert.equal(overlap.length, 0, "a locked scene must never be claimed twice"),
      /never be claimed twice/,
      "the invariant assertion must FAIL against the regressed claim",
    );
  });

  /* ── 6. dual-write cost invariant ── */
  await test("addProjectCost writes project cost + breakdown AND forwards to addDraftGenerationCost (dual-write)", async () => {
    const fake = new FakeVideoDb();
    const { project } = await seedProject(fake, "key-cost");
    const dbc = fake as unknown as VideoDb;
    const draftCalls: Array<{ draftId: number; microUsd: number }> = [];
    const spy = async (draftId: number, microUsd: number) => {
      draftCalls.push({ draftId, microUsd });
    };

    const after1 = await addProjectCost(project.id, "scenes", 250_000, { addDraftCost: spy }, dbc);
    assert.equal(after1!.actual_cost_micro_usd, 250_000);
    assert.equal(after1!.cost_breakdown.scenes, 250_000);
    assert.deepEqual(draftCalls, [{ draftId: project.draft_id, microUsd: 250_000 }]);

    const after2 = await addProjectCost(project.id, "director", 50_000, { addDraftCost: spy }, dbc);
    assert.equal(after2!.actual_cost_micro_usd, 300_000, "project total accrues across stages");
    assert.equal(after2!.cost_breakdown.director, 50_000);
    assert.equal(after2!.cost_breakdown.scenes, 250_000);
    assert.equal(draftCalls.length, 2, "EVERY stage cost must also hit the draft");

    // zero / negative / NaN are no-ops on BOTH sides
    assert.equal(await addProjectCost(project.id, "tts", 0, { addDraftCost: spy }, dbc), undefined);
    assert.equal(await addProjectCost(project.id, "tts", -5, { addDraftCost: spy }, dbc), undefined);
    assert.equal(draftCalls.length, 2);

    // static guard: the default draft-side writer IS storage's addDraftGenerationCost
    const src = readFileSync(join(process.cwd(), "server/storage/contentflowVideo.ts"), "utf8");
    assert.ok(
      src.includes("deps.addDraftCost ?? addDraftGenerationCost"),
      "addProjectCost must default its draft-side write to addDraftGenerationCost — the monthly cap gate reads drafts",
    );
  });

  /* ── 7. scene lifecycle + advance ── */
  await test("render lifecycle: request-id before submit → rendering → rendered → project advances to stitching", async () => {
    const fake = new FakeVideoDb();
    const { project, scenes } = await seedProject(fake, "key-lifecycle");
    const dbc = fake as unknown as VideoDb;
    await claimPlannedScenes(2, "worker-A", { now: T0 }, dbc);

    // provider_request_id persists BEFORE submit (idempotency to the provider)
    const preSubmit = await recordSceneProviderRequest(scenes[0].id, "veo_31", "req-abc", dbc);
    assert.equal(preSubmit!.provider_request_id, "req-abc");
    assert.equal(preSubmit!.status, "planned", "request-id write must not flip status");

    const rendering = await markSceneRendering(scenes[0].id, { provider: "veo_31", operationRef: "op/123" }, dbc);
    assert.equal(rendering!.status, "rendering");
    assert.equal(rendering!.provider_operation_ref, "op/123");
    assert.equal(rendering!.provider_request_id, "req-abc", "COALESCE keeps the pre-submit request id");
    assert.equal(rendering!.locked_at, null, "poll path owns the scene — claim released");

    // not complete yet — advance is a no-op
    await markSceneRendered(scenes[0].id, { videoUrl: "r2://scene-0.mp4", costMicroUsd: 480_000 }, dbc);
    assert.equal(await advanceProjectIfComplete(project.id, dbc), null);

    await markSceneRendering(scenes[1].id, { provider: "kling_30", operationRef: "op/456", requestId: "req-def" }, dbc);
    await markSceneRendered(scenes[1].id, { videoUrl: "r2://scene-1.mp4", costMicroUsd: 504_000 }, dbc);
    const advanced = await advanceProjectIfComplete(project.id, dbc);
    assert.equal(advanced!.status, "stitching");
    assert.equal(advanced!.stitch_status, "pending");

    // stitch claim + stale stitch recovery
    const stitchable = await claimStitchableProject("worker-S", { now: T0 }, dbc);
    assert.equal(stitchable!.id, project.id);
    assert.equal(stitchable!.stitch_status, "stitching");
    assert.equal(await claimStitchableProject("worker-S2", { now: T0 }, dbc), null, "one stitch at a time");
    const rec = await recoverStaleVideoClaims({ now: plus(11 * MIN) }, dbc);
    assert.equal(rec.recovered_stitch_claims, 1);
    assert.equal((await claimStitchableProject("worker-S2", { now: plus(11 * MIN) }, dbc))!.id, project.id);
  });

  await test("attempts ceiling + needs_attention + user retry", async () => {
    const fake = new FakeVideoDb();
    const { project, scenes } = await seedProject(fake, "key-fail");
    const dbc = fake as unknown as VideoDb;
    fake.projects.get(project.id)!.status = "rendering";

    // exhaust the ceiling (3): two retryable failures stay planned, third fails terminally
    let row = await markSceneFailed(scenes[0].id, { error: "boom1" }, { now: T0 }, dbc);
    assert.equal(row!.status, "planned");
    assert.equal(ts(row!.next_attempt_at), T0.getTime() + 60_000);
    row = await markSceneFailed(scenes[0].id, { error: "boom2" }, { now: T0 }, dbc);
    assert.equal(row!.status, "planned");
    assert.equal(ts(row!.next_attempt_at), T0.getTime() + 120_000, "exponential backoff: 60s → 120s");
    row = await markSceneFailed(scenes[0].id, { error: "boom3" }, { now: T0 }, dbc);
    assert.equal(row!.status, "failed", "attempts ceiling reached → terminal");
    assert.equal(row!.attempts, 3);
    assert.equal(row!.next_attempt_at, null);

    // non-retryable fails immediately regardless of attempts
    const hard = await markSceneFailed(scenes[1].id, { error: "billing", retryable: false }, { now: T0 }, dbc);
    assert.equal(hard!.status, "failed");

    const advanced = await advanceProjectIfComplete(project.id, dbc);
    assert.equal(advanced!.status, "needs_attention", "permanent scene failure → user-facing attention, NEVER auto-stitch");

    // tenant-scoped retry: wrong client is rejected, right client re-plans
    assert.equal(await retryScene(project.id, 0, { clientId: 999 }, dbc), null);
    const retried = await retryScene(project.id, 0, { clientId: 1 }, dbc);
    assert.equal(retried!.status, "planned");
    assert.equal(retried!.attempts, 0, "human-initiated retry grants a fresh attempts budget");
    assert.equal(retried!.provider_request_id, null, "a new submit gets a new provider request id");
    assert.equal(fake.projects.get(project.id)!.status, "rendering", "project back in flight");
  });

  /* ── 8. reads + tenant scoping + admin queue ── */
  await test("reads are client-scoped; admin queue rolls up counts + providers", async () => {
    const fake = new FakeVideoDb();
    const a = await seedProject(fake, "key-c1", 1, 7);
    const b = await seedProject(fake, "key-c2", 2, 8);
    const dbc = fake as unknown as VideoDb;

    const mine = await listProjectsForClient(1, {}, dbc);
    assert.deepEqual(mine.map((r) => r.id), [a.project.id]);

    assert.equal((await getProjectWithScenes(a.project.id, { clientId: 1 }, dbc))!.scenes.length, 2);
    assert.equal(await getProjectWithScenes(a.project.id, { clientId: 2 }, dbc), undefined, "cross-tenant read must miss");

    fake.scenes.get(b.scenes[0].id)!.status = "rendered";
    fake.scenes.get(b.scenes[0].id)!.provider = "veo_31";
    fake.projects.get(b.project.id)!.status = "rendering";
    const queue = await getAdminVideoQueue({}, dbc);
    assert.equal(queue.counts.planned, 1);
    assert.equal(queue.counts.rendering, 1);
    const bRow = queue.projects.find((r) => r.id === b.project.id)!;
    assert.equal(bRow.scene_count, 2);
    assert.equal(bRow.rendered_count, 1);
    assert.deepEqual(bRow.providers, ["veo_31"]);
  });

  /* ── 9. cancel guards ── */
  await test("cancel only from planned/rendering and only for the owning tenant", async () => {
    const fake = new FakeVideoDb();
    const { project } = await seedProject(fake, "key-cancel-2");
    const dbc = fake as unknown as VideoDb;
    assert.equal(await cancelVideoProject(project.id, { clientId: 999 }, dbc), null, "wrong tenant cannot cancel");
    fake.projects.get(project.id)!.status = "ready";
    assert.equal(await cancelVideoProject(project.id, { clientId: 1 }, dbc), null, "a finished video cannot be canceled");
    fake.projects.get(project.id)!.status = "rendering";
    assert.equal((await cancelVideoProject(project.id, { clientId: 1 }, dbc))!.status, "canceled");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

await main();
