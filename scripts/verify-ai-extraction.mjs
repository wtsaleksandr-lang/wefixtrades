/**
 * Wave 64.5 — AI pricing-doc extraction verification harness.
 *
 * Runs each fixture through the FULL pipeline:
 *   extractFromFile(buffer, mime) → preamble + prompt → Claude → JSON parse →
 *   zod schema validate
 *
 * Bypasses the Express server (no port-5000 / DelayPredict collision). Calls
 * the extractor + Anthropic SDK directly so we can iterate prompts without
 * a server restart loop.
 *
 * Usage:
 *   doppler run -- node scripts/verify-ai-extraction.mjs
 *
 * Optional CLI flags:
 *   --fixture <name>      run a single fixture (basename without ext)
 *   --prompt <variant>    use a named prompt variant (default | pdf-tuned |
 *                         excel-tuned | email-tuned | handwritten-tuned)
 *   --no-call             skip the Claude call (extract-only)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const FIXTURES_DIR = path.join(REPO_ROOT, "tests", "fixtures", "ai-extraction");
const OUTPUT_DIR = path.join(
  "c:",
  "Users",
  "Owner",
  "claude-orchestrator",
  "WORKSTREAMS",
  "ai-extraction-verification-2026-05-27",
);

/* ─── Bring in the real extractor via tsx-style dynamic import.
 *     We use the .ts file directly under tsx; if you run plain node, the
 *     wrapper script (doppler run -- npx tsx scripts/verify-ai-extraction.mjs)
 *     handles transpilation. ─── */
async function loadExtractor() {
  // tsx hooks .ts into node's resolver when this script runs under tsx.
  // If not running under tsx, fall back to the pre-compiled .js (none today),
  // which will fail with a clear message.
  const url = pathToFileURL(
    path.join(REPO_ROOT, "server", "services", "pricingDocExtractor.ts"),
  ).href;
  return import(url);
}

/* ─── Mirror of the route handlers' prompt + schema. Kept in sync with
 *     aiImageToTemplateRoutes.ts. The harness supports variant prompts so
 *     we can A/B iterations without editing the live route. ─── */
const PROMPT_VARIANTS = {
  default: {
    system:
      "You extract pricing structure from quote/invoice/spreadsheet text. Always respond with a single JSON object and nothing else.",
    body: `You are looking at a service-business quote, estimate, invoice, or pricing list for a trades business.
Extract the following and respond with ONLY a valid JSON object matching this schema:

{
  "title": "string — what kind of service",
  "basePrice": number,
  "currency": "USD",
  "addons": [
    { "label": "string", "price": number, "type": "checkbox" | "quantity" }
  ],
  "modifiers": [
    { "label": "string", "type": "percent" | "fixed", "value": number, "appliesTo": "base" | "total" }
  ],
  "notes": "string — any pricing rules or fine print visible"
}

Use null for any field you can't extract confidently. Do not guess. Return ONLY the JSON, no preamble.`,
  },

  // Round-2 tuned variant — adds format-aware hints so Claude can ignore
  // page breaks, header/signature noise, TSV row framing, and handwriting.
  "tuned-v2": {
    system:
      "You extract pricing structure from quote/invoice/spreadsheet/email content. Always respond with a single JSON object and nothing else. The base price is the headline service charge, NOT the grand total. Add-ons are optional line items the customer can pick; modifiers are percentage or fixed adjustments (discounts, surcharges, hourly multipliers).",
    body: `You are looking at a service-business quote, estimate, invoice, or pricing list for a trades business.

Source-format hints:
- If the input came from a PDF, ignore page-break artifacts, page numbers, and repeated headers / footers across pages.
- If the input came from a spreadsheet, each row is one pricing item. Tabs separate columns; common columns: label, price, qty, rate.
- If the input came from an email, ignore the signature block, "Sent from my iPhone" lines, quoted-reply blocks, and headers like From/To/Subject.
- If the input is from an image and the writing looks handwritten, read carefully — handwritten "0" can look like "O", "1" like "l". Use surrounding context (currency symbols, line layout) to disambiguate.

Extract the following and respond with ONLY a valid JSON object matching this schema:

{
  "title": "string — what kind of service this quote is for (e.g. 'Junk removal', 'HVAC service call', 'Lawn mowing')",
  "basePrice": number — the headline service charge a customer pays before any add-ons,
  "currency": "USD",
  "addons": [
    { "label": "string", "price": number, "type": "checkbox" | "quantity" }
  ],
  "modifiers": [
    { "label": "string", "type": "percent" | "fixed", "value": number, "appliesTo": "base" | "total" }
  ],
  "notes": "string — any pricing rules, payment terms, or fine print"
}

Rules:
- basePrice is a single number, not a range. If the source shows a range, use the LOWER bound and put the range in notes.
- addons: each is one optional item a customer can pick. "checkbox" = on/off, "quantity" = customer enters a count.
- modifiers: percent values are stored as numbers (e.g. 15 for 15%, not 0.15). "appliesTo": "base" means it adjusts the base price only; "total" means after add-ons.
- Hourly rates / multipliers go in modifiers as type="percent" only if they're % surcharges (after-hours +50% etc.). A flat per-hour rate is a modifier with type="fixed" and appliesTo="total".
- Don't invent items. If the source doesn't mention something, omit it. Use null only for top-level fields you can't extract confidently.

Return ONLY the JSON, no preamble, no code fences.`,
  },
};

const addonSchema = z.object({
  label: z.string().min(1).max(120),
  price: z.number().finite().nullable(),
  type: z.enum(["checkbox", "quantity"]).default("checkbox"),
});

const modifierSchema = z.object({
  label: z.string().min(1).max(120),
  type: z.enum(["percent", "fixed"]),
  value: z.number().finite(),
  appliesTo: z.enum(["base", "total"]).default("total"),
});

const templateSchema = z.object({
  title: z.string().min(1).max(200).nullable(),
  basePrice: z.number().finite().nullable(),
  currency: z.string().min(1).max(8).default("USD"),
  addons: z.array(addonSchema).max(20).default([]),
  modifiers: z.array(modifierSchema).max(10).default([]),
  notes: z.string().max(2000).nullable().default(null),
});

function extractJson(raw) {
  const trimmed = String(raw ?? "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {}
  }
  return null;
}

/* ─── Fixture registry. mime is the value the route handler would see. ─── */
const FIXTURES = [
  {
    name: "junk-removal-print",
    file: "junk-removal-print.pdf",
    mime: "application/pdf",
    truth: {
      service: "Junk removal",
      basePrice: 99,
      addonLabels: [
        "Mattress",
        "Refrigerator",
        "Couch",
        "Treadmill",
        "Hot tub",
        "Tire",
      ],
      modifiers: [
        { label: "Stairs surcharge", type: "percent", value: 15 },
        { label: "Same-day", type: "percent", value: 20 },
      ],
    },
  },
  {
    name: "hvac-pricing",
    file: "hvac-pricing.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    truth: {
      service: "HVAC",
      basePrice: 89,
      addonLabels: [
        "Diagnostic",
        "Capacitor replacement",
        "Refrigerant top-up",
        "Thermostat install",
        "Coil cleaning",
        "Duct sealing",
      ],
      modifiers: [
        { label: "After-hours", type: "percent", value: 50 },
        { label: "Hourly labor", type: "fixed", value: 125 },
      ],
    },
  },
  {
    name: "lawn-care-email",
    file: "lawn-care-email.eml",
    mime: "message/rfc822",
    truth: {
      service: "Lawn care",
      basePrice: 45,
      addonLabels: ["Bi-weekly", "One-time", "Edging", "Leaf cleanup"],
      modifiers: [{ label: "Pre-pay discount", type: "percent", value: 10 }],
    },
  },
  {
    name: "window-installation-printed",
    file: "window-installation-printed.png",
    mime: "image/png",
    truth: {
      service: "Window installation",
      basePrice: 350,
      addonLabels: [
        "Double pane upgrade",
        "Triple pane upgrade",
        "Grilles",
        "Trim out",
      ],
      modifiers: [{ label: "Senior discount", type: "percent", value: 10 }],
    },
  },
  {
    name: "handwritten-plumbing",
    file: "handwritten-plumbing.png",
    mime: "image/png",
    truth: {
      service: "Plumbing",
      basePrice: 89,
      addonLabels: ["Additional fixture", "Drain snake", "Pipe replacement"],
      modifiers: [{ label: "After-hours", type: "percent", value: 50 }],
    },
    notes: "SYNTHETIC — generated with PIL handwriting font (not real ink+paper)",
  },
  {
    name: "messy-roofing-invoice",
    file: "messy-roofing-invoice.pdf",
    mime: "application/pdf",
    truth: {
      service: "Roofing",
      basePrice: 8500,
      addonLabels: [
        "Tear-off",
        "Ice & water shield",
        "Drip edge",
        "Skylight flashing",
      ],
      modifiers: [{ label: "Payment plan surcharge", type: "fixed", value: 250 }],
    },
  },
];

/* ─── Scoring rubric (1-5 each on 4 dims = 20) ─── */
function scoreTemplate(parsed, truth, fixtureName) {
  if (!parsed)
    return {
      title: 1,
      basePrice: 1,
      addons: 1,
      modifiers: 1,
      total: 4,
      notes: "no JSON parsed",
    };

  // Title (1-5): exact key match → 5, contains key term → 4, weak match → 3,
  // wrong but plausible → 2, missing/wrong → 1.
  const title = String(parsed.title ?? "").toLowerCase();
  const serviceLc = truth.service.toLowerCase();
  let titleScore = 1;
  if (title === serviceLc) titleScore = 5;
  else if (title.includes(serviceLc) || serviceLc.includes(title) ||
           serviceLc.split(/\s+/).every((w) => w.length < 4 || title.includes(w)))
    titleScore = 5;
  else if (title.length > 0) {
    // share at least one significant word?
    const words = serviceLc.split(/\s+/).filter((w) => w.length >= 4);
    const shared = words.some((w) => title.includes(w));
    titleScore = shared ? 4 : title.length > 3 ? 3 : 2;
  }

  // basePrice (1-5): exact → 5, ±10% → 4, ±25% → 3, present but wrong → 2,
  // null → 1.
  const bp = Number(parsed.basePrice);
  let baseScore = 1;
  if (Number.isFinite(bp)) {
    const ratio = Math.abs(bp - truth.basePrice) / truth.basePrice;
    if (ratio < 0.001) baseScore = 5;
    else if (ratio <= 0.1) baseScore = 4;
    else if (ratio <= 0.25) baseScore = 3;
    else baseScore = 2;
  }

  // addons (1-5): % of truth.addonLabels covered (label substring, case-insensitive)
  const addonLabels = (parsed.addons || []).map((a) =>
    String(a.label ?? "").toLowerCase(),
  );
  let hit = 0;
  for (const t of truth.addonLabels) {
    const tLc = t.toLowerCase();
    if (
      addonLabels.some((a) => {
        // share any 4+ char word, or whole label substring
        if (a.includes(tLc) || tLc.includes(a)) return true;
        const tWords = tLc.split(/\s+/).filter((w) => w.length >= 4);
        return tWords.some((w) => a.includes(w));
      })
    )
      hit++;
  }
  const pct = truth.addonLabels.length === 0 ? 1 : hit / truth.addonLabels.length;
  let addonScore = 1;
  if (pct >= 0.9) addonScore = 5;
  else if (pct >= 0.7) addonScore = 4;
  else if (pct >= 0.5) addonScore = 3;
  else if (pct >= 0.25) addonScore = 2;

  // modifiers (1-5): % of truth.modifiers with correct type + close value
  const mods = parsed.modifiers || [];
  let modHit = 0;
  for (const tm of truth.modifiers) {
    const match = mods.find((m) => {
      const seen = String(m.label ?? "").toLowerCase();
      const truthLc = tm.label.toLowerCase();
      // Loose match: share any 4+ char alphabetic stem.
      const truthStems = truthLc.split(/[\s\-\/]+/).filter((w) => w.length >= 4);
      const labelMatch =
        truthStems.length === 0
          ? true
          : truthStems.some((w) => seen.includes(w));
      const typeMatch = m.type === tm.type;
      // Compare absolute values — discounts may be stored as negative numbers.
      const truthMag = Math.abs(tm.value);
      const seenMag = Math.abs(Number(m.value));
      const valClose =
        Math.abs(seenMag - truthMag) / Math.max(truthMag, 1) <= 0.25;
      return labelMatch && typeMatch && valClose;
    });
    if (match) modHit++;
  }
  const modPct =
    truth.modifiers.length === 0 ? 1 : modHit / truth.modifiers.length;
  let modScore = 1;
  if (modPct >= 0.9) modScore = 5;
  else if (modPct >= 0.7) modScore = 4;
  else if (modPct >= 0.5) modScore = 3;
  else if (modPct > 0) modScore = 2;
  // No modifiers extracted at all when some expected → 1.

  const total = titleScore + baseScore + addonScore + modScore;
  return {
    title: titleScore,
    basePrice: baseScore,
    addons: addonScore,
    modifiers: modScore,
    total,
    addonHitPct: pct,
    modifierHitPct: modPct,
  };
}

/* ─── Call Claude on an extraction result + prompt variant. ─── */
async function callClaude(anthropic, extraction, promptVariant, model) {
  const { system, body } = promptVariant;

  if (extraction.kind === "image") {
    const resp = await anthropic.messages.create({
      model: model || "claude-haiku-4-5-20251001",
      max_tokens: 900,
      system,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: extraction.mediaType,
                data: extraction.buffer.toString("base64"),
              },
            },
            { type: "text", text: body },
          ],
        },
      ],
    });
    return resp.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  } else {
    const preambleLabel =
      extraction.sourceKind === "pdf"
        ? "PDF"
        : extraction.sourceKind === "spreadsheet"
          ? "spreadsheet"
          : "email";
    const preamble = `Below is the text extracted from a ${preambleLabel}. Treat tabs as column separators and newlines as row separators where relevant.\n\n`;
    const resp = await anthropic.messages.create({
      model: model || "claude-haiku-4-5-20251001",
      max_tokens: 900,
      system,
      messages: [
        {
          role: "user",
          content: `${preamble}${body}\n\n--- BEGIN DOCUMENT ---\n${extraction.text}\n--- END DOCUMENT ---`,
        },
      ],
    });
    return resp.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function parseArgs(argv) {
  const out = { fixture: null, prompt: "default", noCall: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fixture") out.fixture = argv[++i];
    else if (a === "--prompt") out.prompt = argv[++i];
    else if (a === "--no-call") out.noCall = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await ensureDir(OUTPUT_DIR);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !args.noCall) {
    console.error("ANTHROPIC_API_KEY missing — run via `doppler run -- ...`");
    process.exit(2);
  }

  const anthropic = apiKey ? new Anthropic({ apiKey }) : null;
  const variant = PROMPT_VARIANTS[args.prompt];
  if (!variant) {
    console.error(`Unknown prompt variant: ${args.prompt}`);
    process.exit(2);
  }

  const { extractFromFile, ExtractionError } = await loadExtractor();

  const fixtures = args.fixture
    ? FIXTURES.filter((f) => f.name === args.fixture)
    : FIXTURES;

  if (fixtures.length === 0) {
    console.error(`No fixtures matched: ${args.fixture}`);
    process.exit(2);
  }

  const summary = [];
  for (const fx of fixtures) {
    const fixturePath = path.join(FIXTURES_DIR, fx.file);
    const outBase = path.join(
      OUTPUT_DIR,
      `${fx.name}.${args.prompt}`,
    );
    let result = {
      fixture: fx.name,
      file: fx.file,
      promptVariant: args.prompt,
      status: "pending",
    };

    let buffer;
    try {
      buffer = await fs.readFile(fixturePath);
    } catch (err) {
      result.status = "missing_fixture";
      result.error = String(err.message ?? err);
      console.log(`[${fx.name}] SKIP — fixture file missing`);
      summary.push(result);
      continue;
    }

    let extraction;
    try {
      extraction = await extractFromFile(buffer, fx.mime);
    } catch (err) {
      result.status = "extraction_failed";
      result.error =
        err && err.userMessage
          ? `${err.code}: ${err.userMessage}`
          : String(err.message ?? err);
      console.log(`[${fx.name}] EXTRACT FAILED — ${result.error}`);
      await fs.writeFile(
        `${outBase}.txt`,
        `Fixture: ${fx.file}\nMIME: ${fx.mime}\nStatus: ${result.status}\nError: ${result.error}\n`,
      );
      summary.push(result);
      continue;
    }

    const extractedText =
      extraction.kind === "image"
        ? `(image — ${extraction.mediaType}, ${extraction.buffer.length} bytes)`
        : extraction.text;

    if (args.noCall) {
      result.status = "extracted_only";
      result.sourceLabel = extraction.sourceLabel;
      await fs.writeFile(
        `${outBase}.txt`,
        `Fixture: ${fx.file}\nMIME: ${fx.mime}\nSource label: ${extraction.sourceLabel}\n\n=== EXTRACTED TEXT ===\n${extractedText}\n`,
      );
      console.log(`[${fx.name}] extracted only (${extraction.sourceLabel})`);
      summary.push(result);
      continue;
    }

    let reply = "";
    try {
      // Mirror prod: vision uses sonnet-4-6; text uses haiku-4-5.
      const model =
        extraction.kind === "image"
          ? process.env.CLAUDE_VISION_MODEL || "claude-sonnet-4-6"
          : process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";
      reply = await callClaude(anthropic, extraction, variant, model);
    } catch (err) {
      result.status = "claude_call_failed";
      result.error = String(err?.message ?? err);
      console.log(`[${fx.name}] CLAUDE FAILED — ${result.error}`);
      await fs.writeFile(
        `${outBase}.txt`,
        `Fixture: ${fx.file}\nMIME: ${fx.mime}\nSource label: ${extraction.sourceLabel}\nStatus: ${result.status}\nError: ${result.error}\n\n=== EXTRACTED TEXT ===\n${extractedText}\n`,
      );
      summary.push(result);
      continue;
    }

    const rawJson = extractJson(reply);
    const parsed = templateSchema.safeParse(rawJson);
    const template = parsed.success ? parsed.data : null;
    const schemaErrors = parsed.success
      ? null
      : parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`);

    const scored = scoreTemplate(template, fx.truth, fx.name);

    result.status = parsed.success ? "ok" : "schema_invalid";
    result.sourceLabel = extraction.sourceLabel;
    result.score = scored;
    result.schemaErrors = schemaErrors;

    await fs.writeFile(
      `${outBase}.json`,
      JSON.stringify(
        {
          fixture: fx.name,
          file: fx.file,
          mime: fx.mime,
          promptVariant: args.prompt,
          sourceLabel: extraction.sourceLabel,
          score: scored,
          truth: fx.truth,
          parsed: template,
          schemaErrors,
          rawReply: reply,
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      `${outBase}.txt`,
      `Fixture: ${fx.file}\nMIME: ${fx.mime}\nPrompt variant: ${args.prompt}\nSource label: ${extraction.sourceLabel}\nScore: ${scored.total}/20 (title=${scored.title}, base=${scored.basePrice}, addons=${scored.addons}, modifiers=${scored.modifiers})\n\n=== EXTRACTED TEXT ===\n${extractedText}\n\n=== CLAUDE RAW REPLY ===\n${reply}\n`,
    );

    console.log(
      `[${fx.name}] ${args.prompt} → ${scored.total}/20 (t=${scored.title} b=${scored.basePrice} a=${scored.addons} m=${scored.modifiers})${parsed.success ? "" : " SCHEMA INVALID"}`,
    );
    summary.push(result);
  }

  await fs.writeFile(
    path.join(OUTPUT_DIR, `_summary.${args.prompt}.json`),
    JSON.stringify(summary, null, 2),
  );

  console.log("\nDone. Outputs in", OUTPUT_DIR);
}

main().catch((err) => {
  console.error("Fatal:", err?.stack ?? err);
  process.exit(1);
});
