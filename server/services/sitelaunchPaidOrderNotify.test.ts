/**
 * SiteLaunch paid-order notify guard.
 *
 * Invariant: the instant a SiteLaunch order is paid, the system must (a) fire
 * exactly ONE admin notification through the existing alert channel and (b)
 * create exactly ONE tracked, actionable kickoff task carrying the 5-day
 * delivery clock — and it must do so AT MOST ONCE per Stripe session
 * (the webhook can retry) and ONLY for SiteLaunch (never other products).
 *
 * Coverage:
 *   1. isSiteLaunchServiceId — pure predicate: matches "sitelaunch" + tier
 *      variants, rejects other products and lookalikes.
 *   2. BEHAVIORAL: a paid SiteLaunch order fires the alert + creates the
 *      kickoff task exactly once; the task has a high priority, a due date
 *      ~5 days out, and the session id stamped for idempotency.
 *   3. IDEMPOTENCY: a retry of the SAME session (kickoff task already on the
 *      client_service) fires NOTHING — no second alert, no second task.
 *   4. SCOPING: a non-SiteLaunch service id is a no-op — no alert, no task.
 *   5. NON-BLOCKING: a throwing task sink never propagates — the service
 *      returns { notified:false } instead of throwing into the webhook.
 *
 * The notification sinks are mocked: fireAlert's DB writes (findRecentAlert /
 * createSystemAlert) are spied so the alert is observed without email/Slack,
 * and createFulfillmentTask is spied to observe the task. No network, no DB.
 *
 * Excluded from `tsc --noEmit` via the **\/*.test.ts tsconfig pattern.
 * Runnable standalone:  npx tsx server/services/sitelaunchPaidOrderNotify.test.ts
 * Wired into CI as `npm run check:sitelaunch-notify`.
 */
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";
if (process.env.NODE_ENV === "production") process.env.NODE_ENV = "test";
// Ensure fireAlert never tries to send a real email/Slack in CI.
delete process.env.ADMIN_EMAIL;
delete process.env.SMTP_FROM;
delete process.env.SLACK_WEBHOOK_URL;

const { storage } = await import("../storage");
const { notifySiteLaunchPaidOrder, isSiteLaunchServiceId, SITELAUNCH_DELIVERY_DAYS } =
  await import("./sitelaunchPaidOrderNotify");

let passed = 0;
let failed = 0;
async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${label}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL ${label}: ${err?.message ?? err}`);
  }
}

/* ═══ Mock sinks ═══ */

interface TaskRow {
  id: number;
  client_service_id: number;
  client_id: number;
  title: string;
  priority: string;
  due_at: Date | null;
  status: string;
  metadata: Record<string, any> | null;
}

const s: any = storage;
let taskStore: TaskRow[] = [];
let nextTaskId = 1;
const createTaskCalls: any[] = [];
const alertCalls: any[] = []; // observed via createSystemAlert (fireAlert's sink)

function installMocks(opts: { taskSinkThrows?: boolean } = {}) {
  taskStore = [];
  nextTaskId = 1;
  createTaskCalls.length = 0;
  alertCalls.length = 0;

  // Task surface — the existing fulfillment-task sink.
  s.listFulfillmentTasks = async (o: { clientId?: number } = {}) =>
    taskStore.filter((t) => (o.clientId ? t.client_id === o.clientId : true)) as any;
  s.createFulfillmentTask = async (data: any) => {
    createTaskCalls.push(data);
    if (opts.taskSinkThrows) throw new Error("simulated task-store failure");
    const row: TaskRow = {
      id: nextTaskId++,
      client_service_id: data.client_service_id,
      client_id: data.client_id,
      title: data.title,
      priority: data.priority,
      due_at: data.due_at ?? null,
      status: data.status,
      metadata: data.metadata ?? null,
    };
    taskStore.push(row);
    return row as any;
  };

  // Notification channel — fireAlert writes the system_alerts row via these.
  // findRecentAlert → null means "not deduped"; createSystemAlert records it.
  s.findRecentAlert = async () => undefined;
  s.createSystemAlert = async (data: any) => {
    alertCalls.push(data);
    return { id: alertCalls.length, ...data } as any;
  };

  s.getClientById = async (id: number) =>
    ({ id, business_name: "Apex Plumbing", contact_email: "owner@apex.test", contact_phone: null }) as any;
  s.logAdminActivity = async () => undefined;
}

const SESSION = "cs_test_sitelaunch_001";
const CLIENT_ID = 77;
const CLIENT_SERVICE_ID = 555;

function paidSiteLaunch(overrides: Partial<Parameters<typeof notifySiteLaunchPaidOrder>[0]> = {}) {
  return notifySiteLaunchPaidOrder({
    sessionId: SESSION,
    clientId: CLIENT_ID,
    serviceId: "sitelaunch",
    clientServiceId: CLIENT_SERVICE_ID,
    amountCents: 119700,
    currency: "usd",
    ...overrides,
  });
}

async function main() {
  /* ═══ 1. Pure predicate ═══ */
  await check("isSiteLaunchServiceId: matches the canonical id + tier variants", () => {
    assert.equal(isSiteLaunchServiceId("sitelaunch"), true);
    assert.equal(isSiteLaunchServiceId("sitelaunch-pro"), true);
    assert.equal(isSiteLaunchServiceId("SiteLaunch"), true, "case-insensitive");
  });
  await check("isSiteLaunchServiceId: rejects other products, lookalikes, and empties", () => {
    assert.equal(isSiteLaunchServiceId("tradeline"), false);
    assert.equal(isSiteLaunchServiceId("quotequick"), false);
    assert.equal(isSiteLaunchServiceId("mysitelaunch"), false, "substring lookalike must not match");
    assert.equal(isSiteLaunchServiceId("sitelaunchpro"), false, "no hyphen → not a tier");
    assert.equal(isSiteLaunchServiceId(""), false);
    assert.equal(isSiteLaunchServiceId(null), false);
    assert.equal(isSiteLaunchServiceId(undefined), false);
  });

  /* ═══ 2. Behavioral — paid SiteLaunch fires alert + task once ═══ */
  await check("paid SiteLaunch: fires exactly one alert AND one kickoff task", async () => {
    installMocks();
    const res = await paidSiteLaunch();

    assert.equal(res.notified, true, `expected notified=true, got ${JSON.stringify(res)}`);
    assert.equal(createTaskCalls.length, 1, "exactly one kickoff task created");
    assert.equal(alertCalls.length, 1, "exactly one admin alert fired");
    assert.equal(res.taskId, 1);
  });

  await check("paid SiteLaunch: kickoff task is actionable + carries the 5-day clock", async () => {
    installMocks();
    await paidSiteLaunch();
    const task = createTaskCalls[0];

    assert.equal(task.client_service_id, CLIENT_SERVICE_ID);
    assert.equal(task.client_id, CLIENT_ID);
    assert.equal(task.priority, "high", "kickoff must be high priority");
    assert.equal(task.status, "not_started");
    assert.ok(task.due_at instanceof Date, "must have a due date");
    // due ≈ now + 5 days (allow generous slack for execution time).
    const expected = Date.now() + SITELAUNCH_DELIVERY_DAYS * 86_400_000;
    assert.ok(
      Math.abs(task.due_at.getTime() - expected) < 60_000,
      `due_at must be ~${SITELAUNCH_DELIVERY_DAYS} days out`,
    );
    // Idempotency key + marker stamped into metadata.
    assert.equal(task.metadata.sitelaunch_paid_kickoff, true);
    assert.equal(task.metadata.stripe_session_id, SESSION);
    assert.equal(task.metadata.delivery_days, SITELAUNCH_DELIVERY_DAYS);
  });

  await check("paid SiteLaunch: alert routes through the existing channel (system_alerts row)", async () => {
    installMocks();
    await paidSiteLaunch();
    const alert = alertCalls[0];
    assert.equal(alert.category, "sitelaunch_paid_order");
    assert.ok(alert.title.includes(SESSION), "title carries the session id so distinct orders stay distinct");
    assert.equal(alert.metadata.kickoff_task_id, 1, "alert references the created task");
  });

  /* ═══ 3. Idempotency — webhook retry fires nothing ═══ */
  await check("retry of the same session: NO second alert, NO second task", async () => {
    installMocks();
    const first = await paidSiteLaunch();
    assert.equal(first.notified, true);
    assert.equal(createTaskCalls.length, 1);
    assert.equal(alertCalls.length, 1);

    // Stripe redelivers the SAME checkout.session.completed.
    const retry = await paidSiteLaunch();
    assert.equal(retry.notified, false, "retry must not re-notify");
    assert.equal(retry.reason, "already_notified");
    assert.equal(createTaskCalls.length, 1, "still exactly one task after retry");
    assert.equal(alertCalls.length, 1, "still exactly one alert after retry");
  });

  /* ═══ 4. Scoping — non-SiteLaunch is a no-op ═══ */
  await check("non-SiteLaunch service: no alert, no task, notified=false", async () => {
    installMocks();
    const res = await notifySiteLaunchPaidOrder({
      sessionId: "cs_test_tradeline_001",
      clientId: CLIENT_ID,
      serviceId: "tradeline-pro",
      clientServiceId: 999,
      amountCents: 14900,
      currency: "usd",
    });
    assert.equal(res.notified, false);
    assert.equal(res.reason, "not_sitelaunch");
    assert.equal(createTaskCalls.length, 0, "no task for a non-SiteLaunch order");
    assert.equal(alertCalls.length, 0, "no alert for a non-SiteLaunch order");
  });

  /* ═══ 5. Non-blocking — a throwing sink never propagates ═══ */
  await check("task-sink failure: never throws into the webhook (returns notified=false)", async () => {
    installMocks({ taskSinkThrows: true });
    let threw = false;
    let res: any;
    try {
      res = await paidSiteLaunch();
    } catch {
      threw = true;
    }
    assert.equal(threw, false, "notifySiteLaunchPaidOrder must never throw into the webhook");
    assert.equal(res.notified, false);
    assert.ok(String(res.reason).startsWith("error:"), "failure surfaced as a reason, not a throw");
  });

  /* ═══ DELIBERATE-FAILURE FIXTURE ═══ */
  // Prove the idempotency gate actually catches a double-fire: an emulated
  // handler that ignores the existing kickoff task would create a 2nd task —
  // the same-session invariant must reject that.
  await check("DELIBERATE-FAILURE: a non-idempotent re-fire trips the same-session invariant", async () => {
    installMocks();
    await paidSiteLaunch(); // first, legitimate
    const tasksAfterFirst = taskStore.filter(
      (t) => t.client_service_id === CLIENT_SERVICE_ID && t.metadata?.sitelaunch_paid_kickoff,
    ).length;
    assert.equal(tasksAfterFirst, 1);

    // Emulate the broken behavior: blindly create a kickoff for the SAME
    // session without checking. THEN assert the invariant catches the dup.
    await s.createFulfillmentTask({
      client_service_id: CLIENT_SERVICE_ID,
      client_id: CLIENT_ID,
      title: "duplicate kickoff (bug)",
      priority: "high",
      status: "not_started",
      due_at: null,
      metadata: { sitelaunch_paid_kickoff: true, stripe_session_id: SESSION },
    });
    const dupCount = taskStore.filter(
      (t) =>
        t.client_service_id === CLIENT_SERVICE_ID &&
        t.metadata?.sitelaunch_paid_kickoff &&
        t.metadata?.stripe_session_id === SESSION,
    ).length;
    assert.throws(
      () => assert.equal(dupCount, 1, "must be exactly one kickoff per session"),
      /must be exactly one kickoff per session/,
      "the same-session invariant must reject a duplicate kickoff",
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
