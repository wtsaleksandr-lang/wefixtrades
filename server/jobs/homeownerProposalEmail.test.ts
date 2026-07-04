/**
 * Homeowner "Email me this proposal" — standalone smoke tests.
 *
 * Run:
 *   DATABASE_URL=postgres://test:test@127.0.0.1:5432/test_unused \
 *     npx tsx server/jobs/homeownerProposalEmail.test.ts
 *
 * Fully injected: a fake PDF generator + a fake email sink. No DB, no SMTP,
 * no real sends. Excluded from `tsc --noEmit` (tsconfig excludes **\/*.test.ts).
 *
 * Asserts the contract:
 *   1. A roof lead with intent:"email_quote" + an email → PDF generator is
 *      invoked with the lead's quote data + a transactional homeowner email is
 *      sent with the PDF attached and subject "Your WeFixTrades quote".
 *   2. A lead with NO email → no PDF, no send (gated out).
 *   3. A lead WITHOUT the email_quote intent → no send.
 *   4. Best-effort PDF: generator failure still sends the email (no attachment).
 *
 * IMPORTANT: ends with process.exit(failed > 0 ? 1 : 0). No open handles.
 */

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test_unused";
}

import assert from "node:assert/strict";
import type { Calculator, Lead } from "@shared/schema";
import {
  shouldEmailHomeownerProposal,
  sendHomeownerProposal,
  type HomeownerProposalMessage,
  type ProposalPdfResult,
} from "../lib/homeownerProposalEmail";

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

/* ── Fixtures ── */

const calc = {
  id: 1,
  business_name: "Summit Roofing",
  primary_color: "#0d3cfc",
  trade_type: "roofing",
  owner_email: "owner@summit.com",
  owner_phone: null,
  website_url: null,
  edit_token: "tok_abc",
  slug: "summit",
  calculator_settings: {},
  show_powered_by_badge: true,
} as unknown as Calculator;

function roofLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 42,
    calculator_id: 1,
    name: "Jane Homeowner",
    email: "jane@example.com",
    phone: "+15551234567",
    quote_amount: 21300,
    answers: {
      source: "roof_visualizer",
      trade: "roofing",
      intent: "email_quote",
      address: "123 Main St, Las Vegas, NV",
      material: "architectural_shingle",
      roofSqft: 2400,
      priceLo: 18000,
      priceHi: 21300,
    },
    ...overrides,
  } as unknown as Lead;
}

/* ── Fake dependencies ── */

interface Recorder {
  pdfCalls: Array<{ calc: Calculator; lead: Lead }>;
  sent: HomeownerProposalMessage[];
}

function makeDeps(recorder: Recorder, pdfResult: ProposalPdfResult | Error) {
  return {
    generatePdf: async (c: Calculator, l: Lead): Promise<ProposalPdfResult> => {
      recorder.pdfCalls.push({ calc: c, lead: l });
      if (pdfResult instanceof Error) throw pdfResult;
      return pdfResult;
    },
    sendMail: async (msg: HomeownerProposalMessage) => {
      recorder.sent.push(msg);
    },
    log: { info: () => {}, warn: () => {} },
  };
}

const okPdf: ProposalPdfResult = {
  ok: true,
  buffer: Buffer.from("%PDF-1.4 fake"),
  filename: "Summit-Roofing-Proposal-Lead-42.pdf",
};

async function run(): Promise<void> {
  console.log("Homeowner proposal-email smoke tests:\n");

  await test("shouldEmail: roof lead w/ email_quote intent + email → true", () => {
    assert.equal(shouldEmailHomeownerProposal(roofLead()), true);
  });

  await test("shouldEmail: no email → false", () => {
    assert.equal(shouldEmailHomeownerProposal(roofLead({ email: null } as any)), false);
    assert.equal(shouldEmailHomeownerProposal(roofLead({ email: "   " } as any)), false);
  });

  await test("shouldEmail: wrong/absent intent → false", () => {
    assert.equal(
      shouldEmailHomeownerProposal(roofLead({ answers: { intent: "book_assessment" } } as any)),
      false,
    );
    assert.equal(shouldEmailHomeownerProposal(roofLead({ answers: {} } as any)), false);
    assert.equal(shouldEmailHomeownerProposal(roofLead({ answers: null } as any)), false);
  });

  await test("email_quote lead → PDF generated w/ lead quote data + transactional email attached", async () => {
    const rec: Recorder = { pdfCalls: [], sent: [] };
    const lead = roofLead();
    const result = await sendHomeownerProposal(calc, lead, makeDeps(rec, okPdf));

    assert.equal(result.sent, true, "reported sent");
    assert.equal(rec.pdfCalls.length, 1, "PDF generator invoked exactly once");
    // Invoked with THIS lead's quote data (material/size/price live in answers).
    const gotLead = rec.pdfCalls[0].lead;
    assert.equal((gotLead.answers as any).material, "architectural_shingle");
    assert.equal((gotLead.answers as any).roofSqft, 2400);
    assert.equal(gotLead.quote_amount, 21300);

    assert.equal(rec.sent.length, 1, "exactly one email sent");
    const msg = rec.sent[0];
    assert.equal(msg.to, "jane@example.com");
    assert.equal(msg.subject, "Your WeFixTrades quote", "transactional homeowner subject");
    assert.ok(msg.attachments && msg.attachments.length === 1, "PDF attached");
    assert.equal(msg.attachments![0].contentType, "application/pdf");
    assert.equal(msg.attachments![0].filename, "Summit-Roofing-Proposal-Lead-42.pdf");
    // The homeowner sees their own price in the body.
    assert.ok(msg.html.includes("$21,300"), "price rendered in email body");
    // Transactional: no marketing unsubscribe fragment.
    assert.ok(!msg.html.includes("/api/unsubscribe/"), "no unsubscribe link (transactional)");
  });

  await test("no-email lead → no PDF, no send", async () => {
    const rec: Recorder = { pdfCalls: [], sent: [] };
    const result = await sendHomeownerProposal(
      calc,
      roofLead({ email: null } as any),
      makeDeps(rec, okPdf),
    );
    assert.equal(result.sent, false, "not sent");
    assert.equal(rec.pdfCalls.length, 0, "PDF generator NOT invoked");
    assert.equal(rec.sent.length, 0, "no homeowner email");
  });

  await test("wrong-intent lead → no send", async () => {
    const rec: Recorder = { pdfCalls: [], sent: [] };
    const result = await sendHomeownerProposal(
      calc,
      roofLead({ answers: { intent: "book_assessment", email: "x" } } as any),
      makeDeps(rec, okPdf),
    );
    assert.equal(result.sent, false);
    assert.equal(rec.sent.length, 0);
  });

  await test("PDF failure → email still sent WITHOUT attachment (best-effort)", async () => {
    const rec: Recorder = { pdfCalls: [], sent: [] };
    const result = await sendHomeownerProposal(
      calc,
      roofLead(),
      makeDeps(rec, { ok: false, error: "boom" }),
    );
    assert.equal(result.sent, true);
    assert.equal(rec.sent.length, 1, "email still sent");
    assert.ok(!rec.sent[0].attachments, "no attachment when PDF failed");
  });

  await test("PDF throws → email still sent WITHOUT attachment", async () => {
    const rec: Recorder = { pdfCalls: [], sent: [] };
    const result = await sendHomeownerProposal(
      calc,
      roofLead(),
      makeDeps(rec, new Error("pdfkit exploded")),
    );
    assert.equal(result.sent, true);
    assert.equal(rec.sent.length, 1);
    assert.ok(!rec.sent[0].attachments);
  });

  /* ── Deliberate-failure fixture: prove the gate actually catches. ── */
  await test("REGRESSION GUARD: a lead missing BOTH intent and email must never send", async () => {
    const rec: Recorder = { pdfCalls: [], sent: [] };
    await sendHomeownerProposal(
      calc,
      roofLead({ email: null, answers: {} } as any),
      makeDeps(rec, okPdf),
    );
    assert.equal(rec.sent.length, 0, "silent lead must produce zero homeowner emails");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
