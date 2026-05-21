/**
 * Marketing CTA contrast audit — Wave AE.
 *
 * Alex flagged that some CTA buttons on the TradeLine demo page have dark
 * text on a dark blue / slate background, and suspects the same pattern
 * elsewhere on the marketing site. This spec is the standing regression
 * net for that class of bug: it visits every marketing-facing page, finds
 * every button + link with button affordances, computes the WCAG contrast
 * ratio between the rendered text colour and the rendered background
 * colour, and fails if any sits below the WCAG AA threshold.
 *
 * Thresholds:
 *   - 4.5 : 1  for normal text (≤17px or ≤21px non-bold)
 *   - 3.0 : 1  for large text  (>=18px bold or >=24px non-bold)
 *
 * Reports every failure with: page URL, element selector, text content,
 * computed text colour, computed background colour, contrast ratio.
 *
 * Soft mode: set `process.env.CONTRAST_AUDIT_SOFT = '1'` to log failures
 * without failing the test — useful for an initial inventory pass before
 * fixing everything.
 */

import { test, expect, type Page } from '@playwright/test';

/** Pages to audit. Add more here as we expand coverage. */
const PAGES: ReadonlyArray<{ name: string; path: string }> = [
  { name: 'home',                path: '/' },
  { name: 'tradeline',           path: '/products/tradeline' },
  { name: 'quotequick',          path: '/products/quotequick' },
  { name: 'mapguard',            path: '/products/mapguard' },
  { name: 'rankflow',            path: '/products/rankflow' },
  { name: 'reputationshield',    path: '/products/reputationshield' },
  { name: 'webfix',              path: '/products/webfix' },
  { name: 'webcare',             path: '/products/webcare' },
  { name: 'socialsync',          path: '/products/socialsync' },
  { name: 'sitelaunch',          path: '/products/sitelaunch' },
  { name: 'adflow',              path: '/products/adflow' },
  { name: 'contentflow',         path: '/products/contentflow' },
  { name: 'pricing',             path: '/pricing' },
];

/** WCAG relative-luminance formula. */
function relLuminance(rgb: [number, number, number]): number {
  const lin = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const L1 = relLuminance(fg);
  const L2 = relLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Parse `rgb(r, g, b)` / `rgba(r, g, b, a)` / `#hex` to [r, g, b]. */
function parseColor(s: string): [number, number, number] | null {
  if (!s) return null;
  const v = s.trim().toLowerCase();
  // rgb() / rgba()
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  // #rrggbb
  if (/^#[0-9a-f]{6}$/.test(v)) {
    return [
      parseInt(v.slice(1, 3), 16),
      parseInt(v.slice(3, 5), 16),
      parseInt(v.slice(5, 7), 16),
    ];
  }
  // #rgb (3-char shorthand)
  if (/^#[0-9a-f]{3}$/.test(v)) {
    return [
      parseInt(v.slice(1, 2) + v.slice(1, 2), 16),
      parseInt(v.slice(2, 3) + v.slice(2, 3), 16),
      parseInt(v.slice(3, 4) + v.slice(3, 4), 16),
    ];
  }
  return null;
}

interface ContrastSample {
  selector: string;
  text: string;
  color: string;
  background: string;
  fontSize: number;
  fontWeight: number;
}

/** Browser-side collector — runs inside the page via evaluate(). */
async function collectCtaSamples(page: Page): Promise<ContrastSample[]> {
  return await page.evaluate(() => {
    // CTA-ish selectors. Buttons, links acting as buttons, anything tagged
    // as a CTA. The audit spec is intentionally generous — false positives
    // are cheap to ignore; missing a real one is the failure mode we care
    // about.
    const SELECTORS = [
      'button',
      'a[role="button"]',
      'a[class*="cta"]',
      'a[class*="Cta"]',
      'a[class*="button"]',
      '[data-testid*="cta"]',
      '[data-testid*="button"]',
    ];
    const seen = new Set<Element>();
    const out: Array<{
      selector: string; text: string; color: string; background: string;
      fontSize: number; fontWeight: number;
    }> = [];
    for (const sel of SELECTORS) {
      document.querySelectorAll(sel).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        const html = el as HTMLElement;
        // Skip elements that are not visible / have no text content.
        const rect = html.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        const text = (html.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text) return;
        const cs = window.getComputedStyle(html);
        // Walk up to find the first ancestor with a non-transparent bg.
        let bg = cs.backgroundColor;
        let cur: HTMLElement | null = html;
        while (cur && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent' || !bg)) {
          cur = cur.parentElement;
          if (!cur) break;
          bg = window.getComputedStyle(cur).backgroundColor;
        }
        out.push({
          selector: sel,
          text: text.slice(0, 60),
          color: cs.color,
          background: bg || 'rgba(0, 0, 0, 0)',
          fontSize: parseFloat(cs.fontSize) || 16,
          fontWeight: parseInt(cs.fontWeight, 10) || 400,
        });
      });
    }
    return out;
  });
}

const SOFT_MODE = process.env.CONTRAST_AUDIT_SOFT === '1';

for (const p of PAGES) {
  test(`contrast — ${p.name} (${p.path})`, async ({ page }) => {
    await page.goto(p.path, { waitUntil: 'domcontentloaded' });
    // Let any client-side render settle.
    await page.waitForTimeout(800);

    const samples = await collectCtaSamples(page);

    const failures: string[] = [];
    for (const s of samples) {
      const fg = parseColor(s.color);
      const bg = parseColor(s.background);
      // Skip samples where either colour is unparseable or the bg is
      // transparent (we already walked up the DOM looking for one).
      if (!fg || !bg) continue;
      if (s.background.startsWith('rgba(') && /,\s*0\s*\)/.test(s.background)) continue;

      const ratio = contrastRatio(fg, bg);
      const isLarge = s.fontSize >= 24 || (s.fontSize >= 18 && s.fontWeight >= 700);
      const threshold = isLarge ? 3.0 : 4.5;
      if (ratio < threshold) {
        failures.push(
          `  [${p.name}] "${s.text}" — ratio ${ratio.toFixed(2)} (need ≥${threshold})` +
          ` · color=${s.color} · bg=${s.background} · ${s.fontSize}px/${s.fontWeight}`,
        );
      }
    }

    if (failures.length > 0) {
      const msg = `${failures.length} CTA(s) below WCAG-AA contrast on ${p.path}:\n${failures.join('\n')}`;
      if (SOFT_MODE) {
        console.warn('[soft] ' + msg);
      } else {
        expect(failures, msg).toEqual([]);
      }
    }
  });
}
