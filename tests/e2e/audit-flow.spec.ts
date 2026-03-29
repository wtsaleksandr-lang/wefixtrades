import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ─── Configuration ───────────────────────────────────────────────
const BASE_URL = 'http://localhost:5000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const RESULTS_DIR = path.join(__dirname, 'results');

// ─── Types ───────────────────────────────────────────────────────
interface TestCase {
  id: string;
  query: string;
  category: 'strong-local' | 'moderate' | 'weak-visibility' | 'misaligned-niche';
  strict: boolean;
  notes: string;
}

interface KeywordRow {
  keyword: string;
  rank: string;
  visibility: string;
  cpc: string;
  lpPosition: number | null; // parsed from "LP #N"
}

interface BreakdownRow {
  key: string;
  score: number;
  max: number;
}

interface TestResult {
  testId: string;
  query: string;
  category: string;
  strict: boolean;
  timestamp: string;
  strictAssertions: Record<string, { passed: boolean; detail?: string }>;
  diagnostics: Record<string, any>;
  verdict: 'pass' | 'fail' | 'skip';
}

// Position-based LP floor thresholds (must match server scoring logic)
const LP_FLOOR: Record<number, number> = {
  1: 12, 2: 10, 3: 8,
};
const LP_DEFAULT_FLOOR = 6; // LP #4-10

// ─── Load test cases ─────────────────────────────────────────────
const testCases: TestCase[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'test-cases.json'), 'utf-8')
);

// ─── Helpers ─────────────────────────────────────────────────────

function ensureDirs() {
  for (const dir of [SCREENSHOT_DIR, RESULTS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function saveResult(result: TestResult) {
  fs.writeFileSync(
    path.join(RESULTS_DIR, `${result.testId}.json`),
    JSON.stringify(result, null, 2)
  );
}

function addStrict(result: TestResult, name: string, passed: boolean, detail?: string) {
  result.strictAssertions[name] = { passed, detail };
}

function addDiagnostic(result: TestResult, name: string, value: any) {
  result.diagnostics[name] = value;
}

function lpFloorForPosition(pos: number): number {
  return LP_FLOOR[pos] ?? LP_DEFAULT_FLOOR;
}

/** Parse LP position from rank label like "LP #2" */
function parseLpPosition(rank: string): number | null {
  const m = rank.match(/^LP\s*#(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

/** Wait for the report to fully render. */
async function waitForReport(page: Page, timeoutMs = 150_000) {
  // Race: busy indicator vs immediate report (cached)
  const state = await Promise.race([
    page.getByTestId('score-breakdown').waitFor({ timeout: 15_000 }).then(() => 'report' as const),
    page.locator('text=Running your audit').waitFor({ timeout: 15_000 }).then(() => 'busy' as const),
  ]).catch(() => 'neither' as const);

  if (state === 'report') return;

  // Wait for full report render
  await page.getByTestId('score-breakdown').waitFor({ timeout: timeoutMs });
  // Let score animation settle
  await page.waitForTimeout(1500);
}

/** Extract score and grade from data-testid="score-value" hidden element */
async function extractScore(page: Page): Promise<{ score: number; grade: string } | null> {
  const el = page.getByTestId('score-value');
  if (!(await el.isVisible().catch(() => false)) && !(await el.count())) {
    // Hidden element — try to read attributes
  }
  try {
    const score = await el.getAttribute('data-score');
    const grade = await el.getAttribute('data-grade');
    if (score && grade) return { score: parseInt(score, 10), grade };
  } catch {}
  return null;
}

/** Extract all score breakdown rows via data-testid attributes */
async function extractBreakdown(page: Page): Promise<BreakdownRow[]> {
  const rows: BreakdownRow[] = [];
  const keys = ['googleMaps', 'websiteQuality', 'searchVisibility', 'competitorPosition', 'adOpportunity', 'demandCoverage'];
  for (const key of keys) {
    const el = page.getByTestId(`breakdown-row-${key}`);
    if (await el.count() === 0) continue;
    const score = parseInt(await el.getAttribute('data-score') || '0', 10);
    const max = parseInt(await el.getAttribute('data-max') || '0', 10);
    rows.push({ key, score, max });
  }
  return rows;
}

/** Extract keyword rows from data-testid="keyword-row" elements */
async function extractKeywords(page: Page): Promise<KeywordRow[]> {
  const keywords: KeywordRow[] = [];
  const rows = page.getByTestId('keyword-row');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const keyword = await row.getAttribute('data-keyword') || '';
    const rank = await row.getAttribute('data-rank') || '—';
    const visibility = await row.getAttribute('data-visibility') || '—';
    const cpc = await row.getAttribute('data-cpc') || '—';
    const lpPosition = parseLpPosition(rank);
    keywords.push({ keyword, rank, visibility, cpc, lpPosition });
  }
  return keywords;
}

// ─── Test Suite ──────────────────────────────────────────────────

test.describe('Audit Flow E2E', () => {
  test.beforeAll(() => { ensureDirs(); });

  for (const tc of testCases) {
    test(`[${tc.category}] ${tc.id}: ${tc.query}`, async ({ page }) => {
      test.setTimeout(180_000);

      const result: TestResult = {
        testId: tc.id,
        query: tc.query,
        category: tc.category,
        strict: tc.strict,
        timestamp: new Date().toISOString(),
        strictAssertions: {},
        diagnostics: {},
        verdict: 'pass',
      };

      // ── 1. Navigate ──────────────────────────────────────────
      await page.goto(`${BASE_URL}/free-audit`, { waitUntil: 'networkidle', timeout: 20_000 });
      const title = page.getByTestId('text-audit-title');
      await expect(title).toBeVisible({ timeout: 10_000 });
      addStrict(result, 'pageLoaded', true);

      // ── 2. Search ────────────────────────────────────────────
      const searchInput = page.getByTestId('input-audit-search');
      await expect(searchInput).toBeVisible();
      await searchInput.fill(tc.query);

      // ── 3. Wait for suggestions ──────────────────────────────
      let suggestionCount = 0;
      try {
        const suggestionsList = page.getByTestId('list-suggestions');
        await expect(suggestionsList).toBeVisible({ timeout: 15_000 });
        const suggestions = suggestionsList.locator('button');
        suggestionCount = await suggestions.count();
      } catch {
        suggestionCount = 0;
      }

      addDiagnostic(result, 'suggestionCount', suggestionCount);

      if (suggestionCount === 0) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${tc.id}-no-suggestions.png`), fullPage: true });

        if (tc.strict) {
          // STRICT test case — no suggestions is a failure
          addStrict(result, 'suggestionsFound', false, `No suggestions for "${tc.query}"`);
          result.verdict = 'fail';
          saveResult(result);
          expect.soft(suggestionCount, `STRICT: Expected suggestions for "${tc.query}"`).toBeGreaterThan(0);
          return;
        } else {
          // DIAGNOSTIC test case — skip gracefully
          addStrict(result, 'suggestionsFound', false, 'Skipped — no suggestions (diagnostic case)');
          result.verdict = 'skip';
          saveResult(result);
          console.log(`[${tc.id}] SKIP: No suggestions for diagnostic query "${tc.query}"`);
          test.skip(true, `No suggestions for diagnostic query "${tc.query}"`);
          return;
        }
      }
      addStrict(result, 'suggestionsFound', true);

      // ── 4. Select first business ─────────────────────────────
      const suggestions = page.getByTestId('list-suggestions').locator('button');
      const selectedName = await suggestions.first().locator('div').first().innerText().catch(() => 'unknown');
      addDiagnostic(result, 'selectedBusiness', selectedName.split('\n')[0]);
      await suggestions.first().click();

      // ── 5. Wait for report ───────────────────────────────────
      await waitForReport(page, 150_000);
      addStrict(result, 'reportGenerated', true);

      // Screenshot: maps tab (default)
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${tc.id}-maps.png`), fullPage: true });

      // ── 6. Extract score data ────────────────────────────────
      const scoreData = await extractScore(page);
      addDiagnostic(result, 'score', scoreData?.score ?? null);
      addDiagnostic(result, 'grade', scoreData?.grade ?? null);

      // STRICT: Score must exist and be 0-100
      if (scoreData) {
        const scoreValid = scoreData.score >= 0 && scoreData.score <= 100;
        addStrict(result, 'scoreInRange', scoreValid, `Score: ${scoreData.score}`);
        expect(scoreData.score, 'Score must be 0-100').toBeGreaterThanOrEqual(0);
        expect(scoreData.score).toBeLessThanOrEqual(100);

        // STRICT: Grade must be A/B/C/D
        const gradeValid = ['A', 'B', 'C', 'D'].includes(scoreData.grade);
        addStrict(result, 'gradeValid', gradeValid, `Grade: ${scoreData.grade}`);
        expect(['A', 'B', 'C', 'D']).toContain(scoreData.grade);
      } else {
        addStrict(result, 'scoreInRange', false, 'Score element not found');
        addStrict(result, 'gradeValid', false, 'Grade element not found');
      }

      // ── 7. Extract breakdown rows ────────────────────────────
      const breakdown = await extractBreakdown(page);
      addDiagnostic(result, 'breakdownRows', breakdown);

      // DIAGNOSTIC: expect 6 rows, warn if fewer
      addDiagnostic(result, 'breakdownRowCount', breakdown.length);
      if (breakdown.length < 5) {
        console.warn(`[${tc.id}] Only ${breakdown.length} breakdown rows (expected 6)`);
      }

      // ── 8. Tab switching ─────────────────────────────────────

      // STRICT: All 3 tabs must exist
      for (const tabId of ['tab-maps', 'tab-website', 'tab-plan'] as const) {
        const tab = page.getByTestId(tabId);
        const exists = (await tab.count()) > 0;
        addStrict(result, `tab_${tabId}_exists`, exists);
        expect(exists, `Tab ${tabId} must exist`).toBe(true);
      }

      // Switch to Website tab
      await page.getByTestId('tab-website').click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${tc.id}-website.png`), fullPage: true });

      // Switch to Action Plan tab
      await page.getByTestId('tab-plan').click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${tc.id}-plan.png`), fullPage: true });

      addStrict(result, 'tabSwitching', true);

      // ── 9. Keyword validation (Website tab) ──────────────────

      // Switch back to Website tab for keyword extraction
      await page.getByTestId('tab-website').click();
      await page.waitForTimeout(800);

      const keywords = await extractKeywords(page);
      addDiagnostic(result, 'keywordCount', keywords.length);
      addDiagnostic(result, 'keywords', keywords);

      if (keywords.length > 0) {
        // STRICT: CPC format — must be "$X", "$X.Y", or "—"; never "$0.00"
        let cpcValid = true;
        for (const kw of keywords) {
          if (kw.cpc !== '—') {
            if (kw.cpc === '$0.00' || !kw.cpc.startsWith('$')) {
              cpcValid = false;
              addDiagnostic(result, `cpc_issue_${kw.keyword}`, kw.cpc);
            }
          }
        }
        addStrict(result, 'cpcFormat', cpcValid, cpcValid ? 'All CPC values formatted correctly' : 'Invalid CPC format detected');
        if (!cpcValid) {
          expect.soft(cpcValid, 'CPC must be "$X", "$X.Y", or "—"').toBe(true);
        }

        // STRICT: No legacy "Not ranking" text
        const hasLegacyNotRanking = keywords.some(k => k.rank === 'Not ranking');
        addStrict(result, 'noLegacyNotRanking', !hasLegacyNotRanking);
        expect(hasLegacyNotRanking, 'No rank column should show "Not ranking"').toBe(false);

        // STRICT: LP labels must match "LP #N" format
        const lpKeywords = keywords.filter(k => k.rank.startsWith('LP'));
        for (const kw of lpKeywords) {
          const validFormat = /^LP #\d+$/.test(kw.rank);
          if (!validFormat) {
            addStrict(result, `lpFormat_${kw.keyword}`, false, `Bad LP format: "${kw.rank}"`);
          }
          expect(kw.rank, `LP format for "${kw.keyword}"`).toMatch(/^LP #\d+$/);
        }
        addStrict(result, 'lpFormatValid', true);

        // STRICT: No rank/visibility contradiction
        // "—" rank + "strong" or "dominant" visibility = contradiction
        let contradictionFound = false;
        for (const kw of keywords) {
          if (kw.rank === '—') {
            const vis = kw.visibility.toLowerCase();
            if (vis === 'strong' || vis === 'dominant') {
              contradictionFound = true;
              addDiagnostic(result, `contradiction_${kw.keyword}`, { rank: kw.rank, visibility: kw.visibility });
            }
          }
        }
        addStrict(result, 'noRankVisibilityContradiction', !contradictionFound,
          contradictionFound ? 'Found rank=— with visibility=strong/dominant' : 'No contradictions');
        expect(contradictionFound, 'No rank/visibility contradictions allowed').toBe(false);

        // DIAGNOSTIC: volume zeros
        addDiagnostic(result, 'localPackKeywordCount', lpKeywords.length);
        addDiagnostic(result, 'lpPositions', lpKeywords.map(k => ({ keyword: k.keyword, position: k.lpPosition })));

      } else {
        addDiagnostic(result, 'keywordSectionMissing', true);
        console.warn(`[${tc.id}] No keyword rows found on Website tab`);
      }

      // ── 10. LP floor validation ──────────────────────────────

      // Find the best LP position across all keywords
      const lpPositions = keywords.filter(k => k.lpPosition !== null).map(k => k.lpPosition!);
      const bestLpPos = lpPositions.length > 0 ? Math.min(...lpPositions) : null;

      if (bestLpPos !== null) {
        // Find the visibility score from breakdown
        const visRow = breakdown.find(r => r.key === 'searchVisibility');

        if (visRow) {
          const expectedFloor = lpFloorForPosition(bestLpPos);
          const floorMet = visRow.score >= expectedFloor;

          addDiagnostic(result, 'bestLpPosition', bestLpPos);
          addDiagnostic(result, 'visibilityScore', visRow.score);
          addDiagnostic(result, 'expectedFloor', expectedFloor);
          addDiagnostic(result, 'floorRule', `LP #${bestLpPos} → floor ${expectedFloor}/20`);

          // STRICT: visibility must meet position-based floor
          addStrict(result, 'lpFloorMet', floorMet,
            `LP #${bestLpPos} → floor ${expectedFloor}, actual ${visRow.score}/20`);
          expect(
            visRow.score,
            `Visibility with LP #${bestLpPos} should be >= ${expectedFloor}/20 (got ${visRow.score})`
          ).toBeGreaterThanOrEqual(expectedFloor);
        } else {
          addDiagnostic(result, 'visibilityRowMissing', true);
        }
      } else {
        addDiagnostic(result, 'noLocalPackDetected', true);
      }

      // ── 11. DIAGNOSTIC: Zero-score check ─────────────────────
      if (scoreData && scoreData.score === 0) {
        addDiagnostic(result, 'zeroScoreWarning', 'Total score is 0 — may indicate issue');
        console.warn(`[${tc.id}] WARNING: Total score is 0`);
      }

      // Score should not be near-zero if LP is present
      if (bestLpPos !== null && scoreData && scoreData.score < 15) {
        addDiagnostic(result, 'lowScoreWithLP', `Score ${scoreData.score} is very low despite LP #${bestLpPos}`);
        console.warn(`[${tc.id}] WARNING: Score ${scoreData.score} with LP #${bestLpPos} is suspiciously low`);
      }

      // ── Finalize ─────────────────────────────────────────────
      const failedStrict = Object.values(result.strictAssertions).some(a => !a.passed);
      result.verdict = failedStrict ? 'fail' : 'pass';
      saveResult(result);

      // Console summary
      console.log(`\n[${'='.repeat(50)}]`);
      console.log(`[${tc.id}] ${result.verdict.toUpperCase()}`);
      console.log(`  Query: ${tc.query}`);
      console.log(`  Business: ${result.diagnostics.selectedBusiness || 'unknown'}`);
      console.log(`  Score: ${scoreData?.score ?? '?'}/100 (Grade ${scoreData?.grade ?? '?'})`);
      console.log(`  Breakdown: ${breakdown.map(r => `${r.key.replace(/([A-Z])/g, ' $1').trim()}=${r.score}/${r.max}`).join(', ')}`);
      console.log(`  Keywords: ${keywords.length} total, ${lpPositions.length} with LP`);
      if (bestLpPos !== null) {
        console.log(`  Best LP: #${bestLpPos} → floor ${lpFloorForPosition(bestLpPos)}`);
      }
      const failedNames = Object.entries(result.strictAssertions).filter(([, v]) => !v.passed).map(([k]) => k);
      if (failedNames.length > 0) {
        console.log(`  FAILED: ${failedNames.join(', ')}`);
      }
      console.log(`  Results: tests/e2e/results/${tc.id}.json`);
    });
  }
});
