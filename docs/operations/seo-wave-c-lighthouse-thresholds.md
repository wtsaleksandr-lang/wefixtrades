# SEO Wave C — Lighthouse CI hard-fail thresholds

This document describes the Lighthouse CI gate added in SEO Wave C and how to
debug a failure.

## What runs

The `Audit` workflow (`.github/workflows/audit.yml`) runs a `lighthouse` job
on every PR to `main` and every push to `main`. The job uses a 2-cell matrix
(`mobile`, `desktop`) so each PR gets two independent Lighthouse passes.

For each form factor we audit these public marketing pages:

| Route                     | Why it matters                          |
| ------------------------- | --------------------------------------- |
| `/`                       | Homepage — primary landing surface      |
| `/products`               | Products index                          |
| `/pricing`                | Pricing — direct revenue surface        |
| `/free-audit`             | Lead-magnet entry point                 |
| `/products/tradeline`     | Tradeline product detail                |
| `/products/quickquotepro` | QuickQuote Pro product detail           |

Each URL is sampled 3 times and Lighthouse CI uses the median run to absorb
single-run flake.

## Thresholds (hard-fail)

If any category falls below its threshold, the job exits non-zero and the PR
gate is red.

| Category       | Mobile | Desktop |
| -------------- | ------ | ------- |
| performance    | 0.75   | 0.85    |
| accessibility  | 0.95   | 0.95    |
| best-practices | 0.90   | 0.90    |
| SEO            | 0.95   | 0.95    |

The thresholds live in `lighthouserc.cjs` at the repo root.

## Local debugging

When a PR fails, reproduce locally before guessing:

```bash
npm run build
npx vite preview --port 5000 --strictPort &

# mobile (default)
LHCI_FORM_FACTOR=mobile  npm run lh:assert

# desktop
LHCI_FORM_FACTOR=desktop npm run lh:assert
```

Lighthouse CI prints a per-URL summary and, for any failed assertion, the
median score plus the URL of the full HTML report uploaded to temporary
public storage.

### Common causes by category

- **performance** drop — new heavy JS bundle (check `dist/` size diff),
  added blocking script/font, large hero image not optimised (use
  `loading="lazy"` and serve next-gen formats), unoptimised third-party
  embeds (Stripe, PostHog).
- **accessibility** drop — missing `alt` text, `aria-label`, or label/input
  association on a new form field; insufficient contrast on a new button
  or text colour; new interactive element rendered as a non-button element
  without proper role/keyboard handling.
- **best-practices** drop — mixed content (http asset on https page),
  console errors, deprecated APIs, missing `rel="noopener"` on
  `target="_blank"` links.
- **SEO** drop — missing `<title>` or meta description on a new route,
  missing `lang` attribute, links without discernible text, robots
  blocking pages that should be indexed.

## Updating the thresholds

Edit `lighthouserc.cjs`. Bumping a threshold up is encouraged once a page
has comfortably exceeded the current floor for a few weeks. Lowering a
threshold requires sign-off — capture the reason in the PR description so
we know what regression we accepted.

## Why two form factors

Mobile and desktop Lighthouse runs throttle CPU and network differently
and exercise different render paths (responsive layouts, conditional
imports, image `srcset` selection). A page can pass desktop and fail
mobile — both signals matter, so we gate on both.
