/**
 * Accessibility audit — runs axe-core against the key client pages.
 *
 * Gate: zero `critical` violations fails the build. `serious` / `moderate`
 * findings are printed to the log so they can be worked down over time.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  { name: 'wizard', path: '/wizard' },
];

for (const pg of PAGES) {
  test(`accessibility — ${pg.name}`, async ({ page }) => {
    await page.goto(pg.path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (violations.length) {
      const lines = violations.flatMap((v) => [
        `  [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} node(s))`,
        ...v.nodes.slice(0, 10).map((n) => {
          const target = Array.isArray(n.target) ? n.target.join(' ') : String(n.target);
          const why = n.any?.[0]?.message || n.failureSummary || '';
          return `      ${target}  ::  ${why}`;
        }),
      ]);
      console.log(`axe — ${pg.name}: ${violations.length} violation(s)\n${lines.join('\n')}`);
    } else {
      console.log(`axe — ${pg.name}: no violations`);
    }

    // Hard gate — no critical violations. Serious/moderate are reported above.
    const critical = violations.filter((v) => v.impact === 'critical');
    expect(
      critical,
      `critical accessibility violations: ${critical.map((v) => v.id).join(', ')}`,
    ).toHaveLength(0);
  });
}
