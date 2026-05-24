/**
 * Lighthouse CI config — SEO Wave C hard-fail thresholds.
 *
 * Asserts category scores on critical public marketing pages. Any score
 * below the documented thresholds fails the build.
 *
 * Pages audited:
 *   /                         — homepage
 *   /products                 — products index
 *   /pricing                  — pricing
 *   /free-audit               — lead magnet
 *   /products/tradeline       — Tradeline product page
 *   /products/quickquotepro   — QuickQuote Pro product page
 *
 * Thresholds (hard-fail):
 *   performance     >= 0.75 mobile / >= 0.85 desktop
 *   accessibility   >= 0.95 (both)
 *   best-practices  >= 0.90 (both)
 *   seo             >= 0.95 (both)
 *
 * Each URL runs 3 times; Lighthouse CI uses the median to absorb flake.
 *
 * Form factor is selected via the LHCI_FORM_FACTOR env var
 * ("mobile" | "desktop"), defaulting to "mobile". The workflow runs the
 * job twice in a matrix (one per form factor). See
 * docs/operations/seo-wave-c-lighthouse-thresholds.md.
 */

const ROUTES = [
  '/',
  '/products',
  '/pricing',
  '/free-audit',
  '/products/tradeline',
  '/products/quickquotepro',
];

const BASE_URL = process.env.LHCI_BASE_URL || 'http://localhost:5000';
const FORM_FACTOR = process.env.LHCI_FORM_FACTOR === 'desktop' ? 'desktop' : 'mobile';

const PERF_MIN = FORM_FACTOR === 'desktop' ? 0.85 : 0.75;

module.exports = {
  ci: {
    collect: {
      url: ROUTES.map((path) => `${BASE_URL}${path}`),
      numberOfRuns: 3,
      settings: {
        preset: FORM_FACTOR,
        // Site is not a PWA — skip that category entirely.
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        // Skip the Chrome extension probe inside CI runners.
        chromeFlags: '--no-sandbox --headless=new --disable-gpu',
      },
    },
    assert: {
      preset: 'lighthouse:no-pwa',
      assertions: {
        'categories:performance': ['error', { minScore: PERF_MIN }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.95 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
