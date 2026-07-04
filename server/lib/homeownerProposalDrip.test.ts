/**
 * Unit tests for the default homeowner proposal drip builder.
 * Self-contained node script (mirrors homeownerProposalEmail.test.ts): ends with process.exit(failed>0?1:0).
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test_unused";
}

import assert from "node:assert/strict";
import {
  buildHomeownerProposalDripJobs,
  HOMEOWNER_PROPOSAL_DRIP_STEPS,
} from "./homeownerProposalDrip";

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err?.message || err}`);
  }
}

const calc: any = { id: 42, business_name: "Summit Roofing", owner_phone: "555-0100", slug: "summit" };
const lead: any = { id: 7, name: "Jamie", email: "jamie@example.com", quote_amount: 8200 };

async function main() {
  await test("returns [] when the lead has no email (email-only sequence)", () => {
    const jobs = buildHomeownerProposalDripJobs({ ...lead, email: null }, calc, { calculatorId: 42 });
    assert.equal(jobs.length, 0);
  });

  await test("builds one job per drip step, in order", () => {
    const jobs = buildHomeownerProposalDripJobs(lead, calc, { calculatorId: 42 });
    assert.equal(jobs.length, HOMEOWNER_PROPOSAL_DRIP_STEPS.length);
    assert.equal(jobs[0].type, "homeowner_proposal_d1");
    assert.equal(jobs[1].type, "homeowner_proposal_d3");
  });

  await test("every job is a pending email carrying the bypass flag", () => {
    const jobs = buildHomeownerProposalDripJobs(lead, calc, { calculatorId: 42 });
    for (const j of jobs) {
      assert.equal(j.channel, "email");
      assert.equal(j.status, "pending");
      assert.equal(j.lead_id, 7);
      assert.equal(j.calculator_id, 42);
      assert.equal((j.payload as any).homeowner_proposal_drip, true);
      assert.ok((j.payload as any).template.subject && (j.payload as any).template.body);
    }
  });

  await test("run_at reflects the step offsets (24h then 72h)", () => {
    const before = Date.now();
    const jobs = buildHomeownerProposalDripJobs(lead, calc, { calculatorId: 42 });
    const after = Date.now();
    const t0 = new Date(jobs[0].run_at as any).getTime();
    const t1 = new Date(jobs[1].run_at as any).getTime();
    assert.ok(t0 >= before + 24 * 3600e3 - 5000 && t0 <= after + 24 * 3600e3 + 5000, "d1 ~24h out");
    assert.ok(t1 >= before + 72 * 3600e3 - 5000 && t1 <= after + 72 * 3600e3 + 5000, "d3 ~72h out");
  });

  await test("personalization uses calc business/phone + provided booking link", () => {
    const jobs = buildHomeownerProposalDripJobs(lead, calc, { calculatorId: 42, bookingLink: "https://x.co/book" });
    const p = (jobs[0].payload as any).personalization;
    assert.equal(p.business_name, "Summit Roofing");
    assert.equal(p.phone, "555-0100");
    assert.equal(p.booking_link, "https://x.co/book");
  });

  await test("business_name falls back when the tenant hasn't set one", () => {
    const jobs = buildHomeownerProposalDripJobs(lead, { id: 42 } as any, { calculatorId: 42 });
    assert.equal((jobs[0].payload as any).personalization.business_name, "your contractor");
  });

  await test("copy is trade-agnostic (no roof/solar-specific words)", () => {
    const blob = HOMEOWNER_PROPOSAL_DRIP_STEPS.map((s) => s.subject + " " + s.body).join(" ").toLowerCase();
    for (const w of ["roof", "solar", "shingle", "panel"]) {
      assert.ok(!blob.includes(w), `copy should not mention "${w}"`);
    }
  });

  console.log(`\nhomeownerProposalDrip: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
main();
