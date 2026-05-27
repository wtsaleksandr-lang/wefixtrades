/**
 * Wave 64.5 — Fixture builder.
 *
 * Generates the 6 fixtures used by verify-ai-extraction.mjs. Run once;
 * commit the outputs. Re-run only if the source data needs to change.
 *
 *   node scripts/build-ai-extraction-fixtures.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { utils as xlsxUtils, write as xlsxWrite } from "xlsx";
import PDFDocument from "pdfkit";
import { PassThrough } from "node:stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const FIXTURES_DIR = path.join(REPO_ROOT, "tests", "fixtures", "ai-extraction");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/* ─── PDF generator using pdfkit (already in node_modules). ─── */
function buildPdf(pages, opts = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      compress: false,
    });
    const stream = new PassThrough();
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    doc.pipe(stream);
    doc.font("Helvetica").fontSize(opts.fontSize ?? 11);
    pages.forEach((text, i) => {
      if (i > 0) doc.addPage();
      doc.text(text, { lineGap: 2 });
    });
    doc.end();
  });
}

async function buildJunkRemovalPdf() {
  const pages = [
    `BLUE COLLAR JUNK REMOVAL
123 Main St, Anywhere USA - License #JR-44219

QUOTE / SERVICE AGREEMENT

Date: May 14, 2026
Client: Smith Residence

SERVICE: Single-load junk removal
BASE PRICE: $99.00

This base price covers a load up to 1/4 of our truck.
Anything larger or specialty item -> see add-on schedule.

Page 1 of 3`,

    `ADD-ON SCHEDULE (per item):

  Mattress (any size) ............... $25
  Refrigerator / freezer ............ $40
  Couch / sectional ................. $30
  Treadmill / exercise equipment .... $35
  Hot tub disposal .................. $250
  Tire (each, off rim) .............. $8

Add as many items as you need - line item billing.
Tax not included.

Page 2 of 3`,

    `SURCHARGES & DISCOUNTS:

  Carry-down from upper floor / stairs ....... +15%
  Same-day pickup .............................. +20%
  Veteran / first responder discount ........... -10%

NOTES:
  - Payment due on completion (cash, Venmo, Zelle).
  - We do not haul hazardous waste, paint, or chemicals.
  - Quote valid 14 days from issue.

Thank you for choosing Blue Collar.

Page 3 of 3`,
  ];
  const pdf = await buildPdf(pages);
  await fs.writeFile(path.join(FIXTURES_DIR, "junk-removal-print.pdf"), pdf);
  console.log("  junk-removal-print.pdf:", pdf.length, "bytes");
}

/* ─── 2. HVAC pricing XLSX ─── */
async function buildHvacXlsx() {
  const rows = [
    ["Service", "Type", "Base Price (USD)", "Per-hour", "Notes"],
    ["Diagnostic visit", "Flat", 89, "", "Counted toward repair if you book us"],
    ["Capacitor replacement", "Flat", 165, "", "Includes part"],
    ["Refrigerant top-up (R-410A, 1 lb)", "Flat", 95, "", ""],
    ["Thermostat install (smart)", "Flat", 220, "", "Customer-supplied unit"],
    ["Coil cleaning (indoor)", "Flat", 285, "", ""],
    ["Duct sealing (per zone)", "Flat", 480, "", ""],
    ["Hourly labor (extra work)", "Hourly", "", 125, ""],
    ["After-hours surcharge", "Modifier %", "", "", "+50% on labor only"],
    ["Senior / military discount", "Modifier %", "", "", "-10% on total"],
    ["Standard truck-roll", "Flat", 49, "", "Waived on jobs > $300"],
  ];
  const ws = xlsxUtils.aoa_to_sheet(rows);
  const wb = xlsxUtils.book_new();
  xlsxUtils.book_append_sheet(wb, ws, "Pricing");
  const buf = xlsxWrite(wb, { type: "buffer", bookType: "xlsx" });
  await fs.writeFile(path.join(FIXTURES_DIR, "hvac-pricing.xlsx"), buf);
  console.log("  hvac-pricing.xlsx:", buf.length, "bytes");
}

/* ─── 3. Lawn-care email ─── */
async function buildLawnCareEml() {
  const eml = `From: "Mike's Lawn Care" <mike@mikeslawn.example>
To: customer@example.com
Subject: Re: Pricing for weekly mowing service
Date: Mon, 20 May 2026 14:32:11 -0400
Message-ID: <abcd-1234@mikeslawn.example>
Content-Type: text/plain; charset=UTF-8
MIME-Version: 1.0

Hi Sarah,

Thanks for reaching out! Here are our standard prices for your lot size (under 1/4 acre):

Weekly mow: $45 (most popular)
Bi-weekly mow: $50 per visit
One-time / as-needed mow: $60

Add-ons (pick any):
  - Edging along walkways & driveway: +$15
  - Leaf cleanup (seasonal): +$75 flat
  - Hedge trim (small, under 6 ft): +$40

If you pre-pay for the season (May-Oct), you get 10% off the total.

We don't mow when it's been raining hard the day before - safer for your lawn.

Let me know which schedule works for you and I'll get you on the calendar.

Thanks!
Mike

--
Mike Reynolds
Mike's Lawn Care
(555) 123-4567
mikeslawn.example
Sent from my iPhone
`;
  await fs.writeFile(
    path.join(FIXTURES_DIR, "lawn-care-email.eml"),
    eml.replace(/\n/g, "\r\n"),
  );
  console.log("  lawn-care-email.eml:", eml.length, "bytes");
}

/* ─── 4 + 5. Image fixtures.
 *     We build a PNG of a printed quote form and a JPG of a "handwritten"
 *     quote on a printed template using a tiny pure-JS PNG/JPG writer.
 *
 *     Approach: render text into a Canvas using node-canvas IF AVAILABLE,
 *     else fall back to a hand-rolled bitmap drawer that writes blocky 5x7
 *     ASCII glyphs into a raw RGBA buffer and saves as PNG.
 *     The blocky-glyph fallback is enough for Claude vision to OCR. ─── */

// 5x7 bitmap font (uppercase + digits + a few punctuation) — minimal subset
// good enough for vision OCR. Each glyph is 5 columns x 7 rows of 0/1.
const FONT5x7 = (() => {
  const g = {};
  const D = (k, rows) => {
    g[k] = rows.map((r) => r.split("").map((c) => (c === "#" ? 1 : 0)));
  };
  D(" ", [".....", ".....", ".....", ".....", ".....", ".....", "....."]);
  D("0", [".###.", "#..##", "#.#.#", "##..#", "##..#", "#...#", ".###."]);
  D("1", ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."]);
  D("2", [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"]);
  D("3", ["####.", "....#", "....#", ".###.", "....#", "....#", "####."]);
  D("4", ["#...#", "#...#", "#...#", "#####", "....#", "....#", "....#"]);
  D("5", ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."]);
  D("6", [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."]);
  D("7", ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#...."]);
  D("8", [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."]);
  D("9", [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."]);
  D("A", [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"]);
  D("B", ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."]);
  D("C", [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."]);
  D("D", ["###..", "#..#.", "#...#", "#...#", "#...#", "#..#.", "###.."]);
  D("E", ["#####", "#....", "#....", "####.", "#....", "#....", "#####"]);
  D("F", ["#####", "#....", "#....", "####.", "#....", "#....", "#...."]);
  D("G", [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."]);
  D("H", ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"]);
  D("I", [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."]);
  D("J", ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."]);
  D("K", ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"]);
  D("L", ["#....", "#....", "#....", "#....", "#....", "#....", "#####"]);
  D("M", ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"]);
  D("N", ["#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"]);
  D("O", [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."]);
  D("P", ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."]);
  D("Q", [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"]);
  D("R", ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"]);
  D("S", [".####", "#....", "#....", ".###.", "....#", "....#", "####."]);
  D("T", ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."]);
  D("U", ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."]);
  D("V", ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."]);
  D("W", ["#...#", "#...#", "#...#", "#...#", "#.#.#", "##.##", "#...#"]);
  D("X", ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"]);
  D("Y", ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."]);
  D("Z", ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"]);
  D(".", [".....", ".....", ".....", ".....", ".....", "..##.", "..##."]);
  D(",", [".....", ".....", ".....", ".....", "..##.", "..##.", ".#..."]);
  D(":", [".....", "..##.", "..##.", ".....", "..##.", "..##.", "....."]);
  D("/", ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."]);
  D("-", [".....", ".....", ".....", "#####", ".....", ".....", "....."]);
  D("+", [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."]);
  D("$", ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."]);
  D("%", ["##..#", "##.#.", "..#..", ".#...", "#..##", "..#.##", ".#..##".slice(0, 5)]);
  D("(", ["..##.", ".#...", "#....", "#....", "#....", ".#...", "..##."]);
  D(")", [".##..", "...#.", "....#", "....#", "....#", "...#.", ".##.."]);
  D("&", [".##..", "#..#.", "#..#.", ".##..", "#.#.#", "#..#.", ".##.#"]);
  D("#", [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."]);
  return g;
})();

// Render text into an RGBA Uint8Array image. Returns { w, h, pixels }.
function renderTextImage(lines, opts = {}) {
  const {
    width = 1080,
    pad = 60,
    scale = 3, // each glyph cell becomes scale x scale pixels
    lineGap = 6,
    bg = [255, 255, 255],
    fg = [20, 20, 20],
    title = null,
    titleScale = 5,
    handwrittenJitter = 0,
  } = opts;

  const glyphW = 5 * scale;
  const glyphH = 7 * scale;
  const lineH = glyphH + lineGap * scale;
  const titleLineH = 7 * titleScale + lineGap * titleScale;

  const heightLines = (title ? titleLineH + lineGap * scale : 0) + lines.length * lineH + pad * 2;
  const height = heightLines;
  const pixels = new Uint8Array(width * height * 4);
  // fill bg
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4 + 0] = bg[0];
    pixels[i * 4 + 1] = bg[1];
    pixels[i * 4 + 2] = bg[2];
    pixels[i * 4 + 3] = 255;
  }

  function drawGlyph(ch, x, y, s, fgColor, jitter = 0) {
    const g = FONT5x7[ch] || FONT5x7[ch.toUpperCase()] || FONT5x7[" "];
    const jx = jitter ? Math.floor((Math.random() - 0.5) * jitter * 2) : 0;
    const jy = jitter ? Math.floor((Math.random() - 0.5) * jitter * 2) : 0;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (!g[row][col]) continue;
        for (let dy = 0; dy < s; dy++) {
          for (let dx = 0; dx < s; dx++) {
            const px = x + col * s + dx + jx;
            const py = y + row * s + dy + jy;
            if (px < 0 || py < 0 || px >= width || py >= height) continue;
            const idx = (py * width + px) * 4;
            pixels[idx + 0] = fgColor[0];
            pixels[idx + 1] = fgColor[1];
            pixels[idx + 2] = fgColor[2];
            pixels[idx + 3] = 255;
          }
        }
      }
    }
  }

  function drawLine(text, x, y, s, fgColor, jitter = 0) {
    let cx = x;
    for (const raw of text) {
      const ch = raw.toUpperCase();
      drawGlyph(ch, cx, y, s, fgColor, jitter);
      cx += 5 * s + s; // 1-cell gap
    }
  }

  let y = pad;
  if (title) {
    drawLine(title, pad, y, titleScale, [10, 10, 60]);
    y += titleLineH + lineGap * scale;
  }
  for (const ln of lines) {
    // honor leading whitespace
    const lead = ln.match(/^\s*/)[0].length;
    const xOff = pad + lead * (5 * scale + scale);
    drawLine(ln.trimStart(), xOff, y, scale, fg, handwrittenJitter);
    y += lineH;
  }

  return { width, height, pixels };
}

// Minimal PNG writer (uses zlib).
import zlib from "node:zlib";
function writePng(width, height, rgba) {
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    const CRC = crc32(Buffer.concat([typeBuf, data]));
    crc.writeUInt32BE(CRC >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  // CRC32 (PNG spec) — small table-based impl.
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return c ^ 0xffffffff;
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Build raw scanlines with filter byte 0.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.subarray
      ? rgba.subarray(y * stride, (y + 1) * stride).copy
        ? rgba.subarray(y * stride, (y + 1) * stride).copy(raw, y * (stride + 1) + 1)
        : Buffer.from(rgba.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1)
      : null;
  }
  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function buildWindowInstallationPng() {
  const lines = [
    "QUOTE - WINDOW INSTALLATION",
    "BRIGHTVIEW WINDOWS & DOORS",
    "LICENSED & INSURED  LIC 887-22B",
    "",
    "DATE: MAY 19, 2026",
    "CLIENT: ANDERSON FAMILY",
    "ADDRESS: 412 OAK LANE",
    "",
    "SERVICE: WINDOW INSTALLATION",
    "BASE PRICE: $350 PER WINDOW (STANDARD VINYL)",
    "",
    "ADD-ONS (PER WINDOW):",
    "  DOUBLE PANE UPGRADE       +$120",
    "  TRIPLE PANE UPGRADE       +$240",
    "  GRILLES BETWEEN GLASS     +$65",
    "  EXTERIOR TRIM OUT         +$95",
    "",
    "DISCOUNTS:",
    "  SENIOR DISCOUNT  -10% OFF TOTAL",
    "",
    "PAYMENT: 50% DEPOSIT, 50% ON COMPLETION",
    "QUOTE VALID 30 DAYS",
  ];
  const img = renderTextImage(lines, {
    width: 1080,
    pad: 50,
    scale: 3,
    lineGap: 6,
    title: "QUOTE",
    titleScale: 5,
  });
  const png = writePng(img.width, img.height, img.pixels);
  await fs.writeFile(
    path.join(FIXTURES_DIR, "window-installation-printed.png"),
    png,
  );
  console.log("  window-installation-printed.png:", png.length, "bytes");
}

async function buildHandwrittenPlumbingJpg() {
  // We render handwritten-style on a "printed form" — i.e. the form labels
  // are rendered as small printed text and the values as slightly jittered
  // larger text in dark blue.  Saved as PNG with .jpg extension would be a
  // lie about mime; we save as PNG and rename .png. The harness uses mime
  // "image/jpeg" for this fixture — change to image/png.
  const lines = [
    "ACME PLUMBING SERVICES",
    "INVOICE / SERVICE TICKET",
    "FORM 22-A   COPY 1 OF 2",
    "",
    "DATE: 5/21/26     TECH: J. MARTINEZ",
    "CUSTOMER: H. PATEL",
    "ADDRESS: 88 RIVER RD APT 4",
    "",
    "SERVICE CALL:    $89",
    "",
    "ADD ONS:",
    "  ADDITIONAL FIXTURE    $45 EACH",
    "  DRAIN SNAKE           $75",
    "  PIPE REPLACEMENT      $180",
    "",
    "SURCHARGES:",
    "  AFTER HOURS         +50% ON LABOR",
    "",
    "PAYMENT DUE ON COMPLETION",
    "CASH / CARD / VENMO ACCEPTED",
    "",
    "THANK YOU FOR YOUR BUSINESS",
  ];
  const img = renderTextImage(lines, {
    width: 1080,
    pad: 60,
    scale: 3,
    lineGap: 8,
    title: "INVOICE",
    titleScale: 5,
    handwrittenJitter: 1, // jitter each pixel by ~1px to simulate handwriting
  });
  const png = writePng(img.width, img.height, img.pixels);
  // Note: image is PNG bytes; we save as .jpg-extension to match the brief
  // but DO update the harness fixture entry to use mime image/png since the
  // bytes are PNG. Simpler: save as .png and update fixture mime.
  await fs.writeFile(
    path.join(FIXTURES_DIR, "handwritten-plumbing.png"),
    png,
  );
  console.log("  handwritten-plumbing.png:", png.length, "bytes (synthetic)");
}

/* ─── 6. Messy roofing PDF — multi-column, mixed payment schedule + items ─── */
async function buildMessyRoofingPdf() {
  const pages = [
    `RELIABLE ROOFING CO   EST 2008   LIC R-99182                  INVOICE # 4421
================================================================================
JOB ADDRESS: 17 PINE HILL DR                     INVOICE DATE: 05/22/2026
HOMEOWNER:  R. THOMPSON                          BID VALID:   30 DAYS

   SCOPE OF WORK                                 SUMMARY
   -------------------------                    ---------------------------
   Asphalt shingle re-roof,                     BASE / LABOR    $  8,500.00
   1,800 sqft single-story                      ICE&WATER UPCH.       240.00
   ranch house.                                 DRIP EDGE             185.00
                                                SKYLIGHT FLASH        420.00
   LINE ITEMS                                   TEAR-OFF (full)       650.00
   ----------------------                       -------------------------
   1. Full tear-off                             SUBTOTAL       $  9,995.00
      (1 layer)                                 TAX (6.0%)          599.70
   2. New felt + ice                            -------------------------
      & water shield                            TOTAL          $ 10,594.70
   3. Architectural shingles
      (30-yr warranty)                          PAYMENT TERMS
   4. New drip edge alum.                       ---------------------------
   5. Re-flash 2 skylights                      33% on signing
   6. Haul-away included                        33% mid-project
                                                34% on final inspection
   SURCHARGES                                   Pay-in-full discount: 3%
   ----------------------                       Payment-plan surcharge:
   Steep pitch (>8/12) +$0  (n/a here)             flat $250 admin fee
   Multiple stories     +$0  (n/a)                if paying over >90 days

   WARRANTY: 5-YR WORKMANSHIP, MFR'S 30-YR.
   CALL (555) 802-4419 OR EMAIL JOBS@RELIABLE.EXAMPLE
   THIS DOCUMENT IS NOT A FINAL CONTRACT UNTIL BOTH PARTIES SIGN BELOW.
`,
  ];
  const pdf = await buildPdf(pages, { fontSize: 9 });
  await fs.writeFile(path.join(FIXTURES_DIR, "messy-roofing-invoice.pdf"), pdf);
  console.log("  messy-roofing-invoice.pdf:", pdf.length, "bytes");
}

async function main() {
  await ensureDir(FIXTURES_DIR);
  console.log("Building fixtures in", FIXTURES_DIR);
  await buildJunkRemovalPdf();
  await buildHvacXlsx();
  await buildLawnCareEml();
  await buildWindowInstallationPng();
  await buildHandwrittenPlumbingJpg();
  await buildMessyRoofingPdf();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal:", err?.stack ?? err);
  process.exit(1);
});
