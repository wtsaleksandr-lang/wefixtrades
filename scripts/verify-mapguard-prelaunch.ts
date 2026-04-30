/**
 * MapGuard prelaunch verification.
 *
 * Exercises the kickoff + scan + completion paths against the local DB
 * with tag-isolated test rows that are cleaned up in a finally block.
 *
 * NEVER commit. Throwaway script. Run with:
 *   npx tsx scripts/verify-mapguard-prelaunch.ts
 */

import "dotenv/config";

import { db } from "../server/db";
import { storage } from "../server/storage";
import {
  clients,
  clientServices,
  serviceCatalog,
  fulfillmentTasks,
} from "@shared/schemas/adminCrm";
import { mapguardTasks, mapguardTaskActivity } from "@shared/schemas/mapguard";
import { mapguardSnapshots, mapguardAlerts } from "@shared/schemas/mapguardMonitoring";
import { jobLogs } from "@shared/schemas/db";
import {
  kickoffMapguardService,
  updateMapguardTaskStatus,
} from "../server/services/mapguardTaskEngine";
import { eq, and, sql, like, inArray } from "drizzle-orm";

const TEST_TAG = `__MAPGUARD_VERIFY_${Date.now()}__`;
let pass = 0;
let fail = 0;
const failures: string[] = [];

function assert(label: string, cond: boolean, detail?: string) {
  const mark = cond ? "✓" : "✗";
  console.log(`  ${mark} ${label}${detail ? `  (${detail})` : ""}`);
  if (cond) pass++;
  else { fail++; failures.push(label); }
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function ensureCatalogRow(svcId: string) {
  const [exists] = await db.select().from(serviceCatalog).where(eq(serviceCatalog.id, svcId)).limit(1);
  return !!exists;
}

async function main() {
  console.log(`\nMapGuard prelaunch verification — tag=${TEST_TAG}\n`);

  // Disable real external API calls so the first scan completes fast and
  // does not incur Places/Serper costs.
  process.env.GOOGLE_MAPS_API_KEY = "";
  process.env.SERPER_API_KEY = "";

  // Pre-flight
  console.log("[pre-flight]");
  const hasBasic = await ensureCatalogRow("mapguard-basic");
  const hasSetup = await ensureCatalogRow("mapguard-setup");
  assert("mapguard-basic in service_catalog", hasBasic);
  assert("mapguard-setup in service_catalog", hasSetup);
  if (!hasBasic) {
    console.log("\n  Cannot proceed without mapguard-basic in service_catalog. Run seed.");
    return;
  }

  let testClientId: number | null = null;
  let testCsId: number | null = null;
  let testCsId2: number | null = null;

  try {
    // ─── TEST 1: activation via storage.createClientService (non-Stripe) ───
    console.log("\n[TEST 1] Non-Stripe activation hook");

    const testClient = await storage.createClient({
      business_name: TEST_TAG,
      contact_email: `${TEST_TAG.toLowerCase()}@example.invalid`,
      trade_type: "plumber",
      status: "lead",
    } as any);
    testClientId = testClient.id;
    assert("test client created", !!testClient.id, `id=${testClient.id}`);

    // Insert client_service directly with status=active to fire the
    // storage.createClientService kickoff hook.
    const cs = await storage.createClientService({
      client_id: testClient.id,
      service_id: "mapguard-basic",
      status: "active",
      enabled: true,
      fulfillment_mode: "internal",
      price_cents: 9900,
      billing_period: "monthly",
    } as any);
    testCsId = cs.id;
    assert("test client_service created", !!cs.id, `id=${cs.id}`);

    // Allow async kickoff to finish (it awaits inside the hook, but the
    // first scan is fire-and-forget; give it a tick).
    await sleep(500);

    // Re-read cs to inspect metadata
    const [csAfter] = await db.select().from(clientServices).where(eq(clientServices.id, cs.id)).limit(1);
    const meta1 = (csAfter?.metadata as any) || {};
    assert("metadata.mapguard_kickoff_at set", !!meta1.mapguard_kickoff_at, meta1.mapguard_kickoff_at || "missing");
    assert(
      "metadata.mapguard_kickoff_tasks > 0",
      typeof meta1.mapguard_kickoff_tasks === "number" && meta1.mapguard_kickoff_tasks > 0,
      `count=${meta1.mapguard_kickoff_tasks}`,
    );

    const tasks = await db.select().from(mapguardTasks).where(eq(mapguardTasks.client_service_id, cs.id));
    assert("at least 1 mapguard_task created", tasks.length > 0, `n=${tasks.length}`);
    assert(
      "tasks tagged created_by_system=true",
      tasks.every(t => t.created_by_system === true),
      `${tasks.filter(t => t.created_by_system).length}/${tasks.length}`,
    );

    const ftRows = await db.select().from(fulfillmentTasks).where(eq(fulfillmentTasks.client_service_id, cs.id));
    const tracker = ftRows.find(r => ((r.metadata as any) || {}).mapguard_kickoff_tracker === true);
    assert("fulfillment_tasks tracker row created", !!tracker, tracker ? `id=${tracker.id} status=${tracker.status}` : "missing");
    assert("tracker initial status is not_started", tracker?.status === "not_started", tracker?.status);

    // ─── TEST 2: first scan logged in job_logs ───
    console.log("\n[TEST 2] First scan logged");
    // The scan IIFE may still be running. Wait briefly then poll.
    let scanLog: any = null;
    for (let i = 0; i < 10; i++) {
      const rows = await db
        .select()
        .from(jobLogs)
        .where(and(
          eq(jobLogs.job_name, "mapguard_first_scan"),
          sql`(${jobLogs.metadata}->>'client_service_id')::int = ${cs.id}`,
        ))
        .orderBy(sql`${jobLogs.id} DESC`)
        .limit(1);
      if (rows[0] && rows[0].status !== "running") { scanLog = rows[0]; break; }
      await sleep(500);
    }
    assert("job_logs row for first scan exists", !!scanLog, scanLog ? `id=${scanLog.id} status=${scanLog.status}` : "not found within 5s");
    if (scanLog) {
      assert(
        "first-scan log status is completed or failed",
        scanLog.status === "completed" || scanLog.status === "failed",
        scanLog.status,
      );
      const m = (scanLog.metadata as any) || {};
      const hasInfo = "score" in m || "skipped" in m || scanLog.error_message;
      assert("first-scan log contains score, skipped reason, or error", !!hasInfo, JSON.stringify(m).slice(0, 100));
    }

    // ─── TEST 3: completion flow ───
    console.log("\n[TEST 3] Completion flow");
    // Move every kickoff task through pending → ready → in_progress → completed
    for (const t of tasks) {
      await updateMapguardTaskStatus(t.id, "ready", { actor: { type: "system", name: "verify" } });
      await updateMapguardTaskStatus(t.id, "in_progress", { actor: { type: "system", name: "verify" } });
      await updateMapguardTaskStatus(t.id, "completed", { actor: { type: "system", name: "verify" } });
    }
    await sleep(300);
    const ftAfter = await db.select().from(fulfillmentTasks).where(eq(fulfillmentTasks.client_service_id, cs.id));
    const trackerAfter = ftAfter.find(r => ((r.metadata as any) || {}).mapguard_kickoff_tracker === true);
    assert("tracker fulfillment_task moved to delivered", trackerAfter?.status === "delivered", trackerAfter?.status);
    assert("tracker has completed_at", !!trackerAfter?.completed_at);

    // Service status should have been advanced by checkAndCompleteService.
    const [csCompleted] = await db.select().from(clientServices).where(eq(clientServices.id, cs.id)).limit(1);
    // For mapguard-basic (recurring) starting at active, status stays "active"; that's the expected terminal state.
    // For mapguard-setup (one_time), it would flip to "completed".
    assert(
      "service status is active or completed (cascade ran cleanly)",
      ["active", "completed"].includes(csCompleted?.status || ""),
      csCompleted?.status || "missing",
    );

    // ─── TEST 4: idempotency (re-trigger kickoff) ───
    console.log("\n[TEST 4] Idempotency");
    const tasksBefore = (await db.select().from(mapguardTasks).where(eq(mapguardTasks.client_service_id, cs.id))).length;
    const ftBefore = (await db.select().from(fulfillmentTasks).where(eq(fulfillmentTasks.client_service_id, cs.id))).length;
    const result2 = await kickoffMapguardService(testClientId, cs.id, "mapguard-basic");
    const tasksAfterIdem = (await db.select().from(mapguardTasks).where(eq(mapguardTasks.client_service_id, cs.id))).length;
    const ftAfterIdem = (await db.select().from(fulfillmentTasks).where(eq(fulfillmentTasks.client_service_id, cs.id))).length;
    assert("second kickoff returns kickedOff=false", result2.kickedOff === false, `reason=${result2.reason}`);
    assert("second kickoff reason is already_kicked_off", result2.reason === "already_kicked_off", result2.reason || "");
    assert("no new mapguard_tasks created", tasksAfterIdem === tasksBefore, `before=${tasksBefore} after=${tasksAfterIdem}`);
    assert("no new fulfillment_tasks created", ftAfterIdem === ftBefore, `before=${ftBefore} after=${ftAfterIdem}`);

    // ─── TEST 5: Stripe path regression — same kickoff helper used ───
    console.log("\n[TEST 5] Stripe-path regression (idempotency under simulated webhook re-fire)");
    // Create a second mapguard-basic service to simulate a fresh Stripe activation.
    const cs2 = await storage.createClientService({
      client_id: testClientId,
      service_id: "mapguard-basic",
      status: "pending",  // Stripe path starts pending
      enabled: true,
      fulfillment_mode: "internal",
      price_cents: 9900,
      billing_period: "monthly",
    } as any);
    testCsId2 = cs2.id;
    // Kickoff was NOT fired on insert because status=pending.
    const [cs2Init] = await db.select().from(clientServices).where(eq(clientServices.id, cs2.id)).limit(1);
    assert("pending insert did NOT auto-kickoff", !((cs2Init?.metadata as any) || {}).mapguard_kickoff_at);

    // Simulate first webhook arrival: storage.updateClientService flips to active.
    await storage.updateClientService(cs2.id, { status: "active" });
    await sleep(500);
    const [cs2A] = await db.select().from(clientServices).where(eq(clientServices.id, cs2.id)).limit(1);
    const meta2A = (cs2A?.metadata as any) || {};
    assert("active update fired kickoff (mapguard_kickoff_at set)", !!meta2A.mapguard_kickoff_at);
    const tasks2A = await db.select().from(mapguardTasks).where(eq(mapguardTasks.client_service_id, cs2.id));
    assert("kickoff tasks created on Stripe-style activation", tasks2A.length > 0, `n=${tasks2A.length}`);

    // Simulate webhook retry (replay): direct call to kickoffMapguardService.
    const replay = await kickoffMapguardService(testClientId, cs2.id, "mapguard-basic");
    const tasks2B = (await db.select().from(mapguardTasks).where(eq(mapguardTasks.client_service_id, cs2.id))).length;
    assert("webhook replay returns kickedOff=false", replay.kickedOff === false);
    assert("webhook replay does NOT create duplicate tasks", tasks2B === tasks2A.length, `before=${tasks2A.length} after=${tasks2B}`);

  } finally {
    // ─── Cleanup (always run) ───
    console.log("\n[cleanup]");
    try {
      const csIds: number[] = [];
      if (testCsId != null) csIds.push(testCsId);
      if (testCsId2 != null) csIds.push(testCsId2);

      if (csIds.length > 0) {
        // mapguard_task_activity → mapguard_tasks
        const mTaskIds = (await db.select({ id: mapguardTasks.id }).from(mapguardTasks).where(inArray(mapguardTasks.client_service_id, csIds))).map(r => r.id);
        if (mTaskIds.length > 0) {
          await db.delete(mapguardTaskActivity).where(inArray(mapguardTaskActivity.task_id, mTaskIds));
          await db.delete(mapguardTasks).where(inArray(mapguardTasks.id, mTaskIds));
        }
        await db.delete(fulfillmentTasks).where(inArray(fulfillmentTasks.client_service_id, csIds));
        await db.delete(mapguardSnapshots).where(inArray(mapguardSnapshots.client_service_id, csIds));
      }
      if (testClientId != null) {
        await db.delete(mapguardAlerts).where(eq(mapguardAlerts.client_id, testClientId));
      }
      await db.delete(jobLogs).where(and(
        eq(jobLogs.job_name, "mapguard_first_scan"),
        sql`(${jobLogs.metadata}->>'client_id')::int IN (${sql.raw(testClientId != null ? String(testClientId) : "0")})`,
      ));
      if (csIds.length > 0) {
        await db.delete(clientServices).where(inArray(clientServices.id, csIds));
      }
      if (testClientId != null) {
        await db.delete(clients).where(eq(clients.id, testClientId));
      }
      console.log("  ✓ cleanup complete");
    } catch (e: any) {
      console.log(`  ! cleanup error (manual fix may be needed): ${e.message}`);
      console.log(`    leftover tag: ${TEST_TAG} (clientId=${testClientId} csIds=${[testCsId, testCsId2].filter(x => x != null).join(",")})`);
    }
  }

  console.log(`\n────────────────────────────────`);
  console.log(`Result: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("\n[fatal]", e);
  process.exit(2);
});
