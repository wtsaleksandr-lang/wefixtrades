# npm vulnerability sweep — 2026-05-21 (W-AQ-4)

Snapshot from `npm audit` on `chore/wave-aq4-npm-vulns` against `origin/main` (commit d63ebc38).

## Before

**Total: 14 vulnerabilities** — 6 low / 7 moderate / 1 high

| Package | Severity | Path | Fix available |
|---|---|---|---|
| axios <=1.15.1 | high | direct | yes (semver) |
| brace-expansion 5.0.2–5.0.5 | moderate | transitive | yes (semver) |
| follow-redirects <=1.15.11 | moderate | transitive (axios) | yes (semver) |
| postcss <8.5.10 | moderate | transitive | yes (semver) |
| ws 8.0.0–8.20.0 | moderate | transitive (socket.io) | yes (semver) |
| engine.io / engine.io-client / socket.io-adapter | moderate | transitive (ws) | yes (semver) |
| @tootallnate/once <3.0.1 | low | transitive | NO |
| http-proxy-agent 4.0.1–5.0.0 | low | transitive (@tootallnate/once) | NO |
| teeny-request 7.1.3–10.1.0 | low | transitive (http-proxy-agent) | NO |
| retry-request 7.0.0–7.0.2 | low | transitive (teeny-request) | NO |
| @google-cloud/storage >=5.19.0 | low | transitive | NO |
| @replit/object-storage * | low | direct | NO |

## Auto-fixed via `npm audit fix`

All 7 moderate + 1 high resolved within existing semver ranges. Only `package-lock.json` changed — no `package.json` bumps needed. Resolved packages:

- axios — high → patched
- brace-expansion — patched
- follow-redirects — patched
- postcss — patched
- ws — patched
- engine.io — patched
- engine.io-client — patched
- socket.io-adapter — patched

Typecheck (`npx tsc --noEmit`) and build (`npm run build`) both pass clean post-fix.

## After

**Total: 6 vulnerabilities** — 6 low / 0 moderate / 0 high

All remaining vulns are a single transitive chain rooted in `@replit/object-storage`:

```
@replit/object-storage@1.0.0 (latest, direct dep)
  └── @google-cloud/storage
      ├── teeny-request
      │   └── http-proxy-agent
      │       └── @tootallnate/once (GHSA-vpq2-c234-7xj6)
      └── retry-request → teeny-request → http-proxy-agent → @tootallnate/once
```

## Why these remain

- `@replit/object-storage` is already pinned at the **latest published version (1.0.0)**; only `0.0.1` and `1.0.0` exist on the registry.
- The vulnerable transitive `@tootallnate/once <3.0.1` has **no fix available upstream** — `npm audit` marks all 6 entries "No fix available".
- The fix must come from the `@replit/object-storage` maintainers bumping their `@google-cloud/storage` pin to a release that uses `gaxios` instead of the deprecated `teeny-request` chain.
- Severity is **low** and the affected code path (`@tootallnate/once` control-flow scoping) is only reached via the Replit object-storage SDK, which runs server-side under our own auth — not exposed to untrusted input.

## Recommended next steps

1. **Watch** `@replit/object-storage` for a 1.1+ release that drops `teeny-request`.
2. **Alternative** (if Replit stalls): replace `@replit/object-storage` with direct `@google-cloud/storage@^7` calls — the newer GCS SDK uses `gaxios` and is clean. Two usage sites: `server/lib/objectStorage.ts`, `server/routes/mobileAiImagesRoutes.ts`. Estimated 2–4h port.
3. **Risk acceptance** is reasonable in the interim — low severity, no fix path, no internet-exposed input flowing through the vulnerable call site.

No further automated action recommended for this sweep.
