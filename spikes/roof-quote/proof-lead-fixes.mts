/**
 * Phase-3 lead-pipeline proof (review FIX 2/3/4) — no real DB.
 *
 * Mounts the REAL /api/roofquote/lead handler on an in-memory express app with
 * storage + the notification enqueue stubbed, and asserts:
 *
 *   FIX 2 (attribution): a lead with ?calc=<id> resolves the calculator and persists.
 *   FIX 3 (dedup): a SECOND identical submission (same calc+email+phone) inside the
 *      10s window is deduped — NOT persisted again, NOT re-notified, still ack 200.
 *   FIX 4 (retry on real failure): when storage.createLead THROWS for an
 *      *attributable* lead, the handler returns a non-2xx (503) so the widget's
 *      localStorage queue retries — instead of the old false ok:true that drained it.
 *   Control: an UNATTRIBUTABLE lead (no calc) still acks 200 (nowhere to route).
 *
 * Run: npx tsx spikes/roof-quote/proof-lead-fixes.mts
 */
import express from "express";
import http from "http";
import { storage } from "../../server/storage";

let failed = false;
function assert(cond: boolean, msg: string) {
  if (!cond) { failed = true; console.error("FAIL:", msg); } else console.log("PASS:", msg);
}

// ---- stubs ----
let createLeadCalls = 0;
let createLeadShouldThrow = false;
let notifyCalls = 0;

const FAKE_CALC: any = { id: 7, slug: "acme-roofing", owner_email: "owner@acme.test", calculator_settings: {} };

(storage as any).getCalculatorById = async (id: number) => (id === 7 ? FAKE_CALC : undefined);
(storage as any).getCalculatorBySlug = async (slug: string) => (slug === "acme-roofing" ? FAKE_CALC : undefined);
(storage as any).createLead = async (data: any) => {
  createLeadCalls++;
  if (createLeadShouldThrow) throw new Error("simulated DB write failure");
  return { id: 100 + createLeadCalls, ...data };
};
// The route calls the REAL enqueueLeadNotificationsAndFollowups, which reads the
// calc then enqueues. With empty calc settings the only storage hit is
// enqueueNotification — count it as the notification signal.
(storage as any).enqueueNotification = async () => { notifyCalls++; return { id: 1 }; };

const { registerRoofQuoteRoutes } = await import("../../server/routes/roofQuoteRoutes");

const app = express();
app.use(express.json());
registerRoofQuoteRoutes(app);
const server = http.createServer(app);
await new Promise<void>((r) => server.listen(0, () => r()));
const port = (server.address() as any).port;
const base = `http://127.0.0.1:${port}`;

async function postLead(qs: string, body: any) {
  const r = await fetch(`${base}/api/roofquote/lead${qs}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

try {
  // FIX 2 — attributable lead persists
  createLeadCalls = 0; notifyCalls = 0; createLeadShouldThrow = false;
  let res = await postLead("?calc=7", { name: "A", email: "a@x.io", phone: "555-0001", priceHi: 22000 });
  assert(res.status === 200 && res.json.ok === true && res.json.persisted === true,
    `FIX2 attributed lead persisted (status=${res.status} ${JSON.stringify(res.json)})`);
  assert(createLeadCalls === 1, `FIX2 createLead called once (calls=${createLeadCalls})`);
  assert(notifyCalls === 1, `FIX2 notification enqueued once (calls=${notifyCalls})`);

  // FIX 3 — duplicate within window is deduped (no second persist / notify)
  res = await postLead("?calc=7", { name: "A", email: "a@x.io", phone: "555-0001", priceHi: 22000 });
  assert(res.status === 200 && res.json.persisted === false && res.json.deduped === true,
    `FIX3 duplicate deduped, acked (status=${res.status} ${JSON.stringify(res.json)})`);
  assert(createLeadCalls === 1, `FIX3 createLead NOT called again (calls=${createLeadCalls})`);
  assert(notifyCalls === 1, `FIX3 notification NOT re-enqueued (calls=${notifyCalls})`);

  // FIX 4 — attributable lead whose persist THROWS → non-2xx so the widget retries
  createLeadShouldThrow = true;
  res = await postLead("?calc=7", { name: "B", email: "b@x.io", phone: "555-0002", priceHi: 30000 });
  assert(res.status >= 500 && res.json.ok === false,
    `FIX4 persist failure returns non-2xx ok:false → widget retries (status=${res.status} ${JSON.stringify(res.json)})`);

  // Control — unattributable lead still acks 200 (no calc to route to)
  createLeadShouldThrow = false; createLeadCalls = 0;
  res = await postLead("", { name: "C", email: "c@x.io", phone: "555-0003" });
  assert(res.status === 200 && res.json.ok === true && res.json.persisted === false,
    `CONTROL unattributable lead acked, not persisted (status=${res.status} ${JSON.stringify(res.json)})`);
  assert(createLeadCalls === 0, `CONTROL createLead not called for unattributable lead (calls=${createLeadCalls})`);

  // slug attribution path also resolves
  res = await postLead("?slug=acme-roofing", { name: "D", email: "d@x.io", phone: "555-0004", priceHi: 15000 });
  assert(res.status === 200 && res.json.persisted === true,
    `FIX2 slug-attributed lead persisted (status=${res.status} ${JSON.stringify(res.json)})`);
} finally {
  server.close();
}
console.log(failed ? "\n✗ LEAD-FIXES PROOF FAILED" : "\n✓ LEAD-FIXES PROOF PASSED");
process.exit(failed ? 1 : 0);
