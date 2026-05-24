# Mobile Preview — UX + Premium-Feel Audit (2026-05-24)

Scope: `client/src/pages/admin/MobilePreview/` rendered at `/admin/mobile-preview`.
Baseline: `origin/main` @ `1ac524c6` (after PRs #636 / #637 / #643).
Auditor: orchestrator (read-only review + 4 inline ≤5-line fixes).

The mobile preview is a web-native mirror of the future React Native softphone
app, embedded inside the admin dashboard. Visual parity = "investor demo" grade.

---

## Per-screen findings

Premium-feel score is 1 (rough placeholder) → 5 (App Store-grade).

| Screen | Score | Strengths | Issues |
|---|---|---|---|
| Login | 3.5 | Clean centered form, brand icon, title-in-section pattern matches DESIGN-SYSTEM. | No password-toggle eye icon. "Forgot password" copy lives in a body paragraph instead of a tappable link. |
| Calls | 4.0 | Filter chips with counts, slide-up keypad sheet behind FAB, missed-call red left border + danger soft avatar all read well in both themes. | (a) `📞`/`✗`/`↓`/`↑`/`⌫`/`✕` emoji and ASCII glyphs throughout (PR #643 swapped tab-bar emoji to lucide but stopped at the boundary). (b) Nested `<button role="button">` inside the row `<button>` is invalid HTML — React will warn. (c) Keypad backdrop hardcodes `rgba(15,23,42,0.45)` slate-900 — not a brand token. |
| Ask | 4.0 | Bubble + suggestion-chip + composer feels real. Assistant avatar uses primary-tint. | `📷`/`🎤` emojis in the composer; suggestion chips use round corners but no scale-on-press affordance. |
| Duty | 4.5 | Per-mode color treatment (success / primary / night) is the single best detail in the preview. `is-active` selected state reads instantly in both themes. | Inactive cards show "Switch to {Title}" as full-width outline button — tappable area is right, but copy is verbose. iOS would just tap the card. |
| Messages | 3.0 | Compose bar bottom-anchored is correct. AI badge differentiates AI replies clearly. | (a) Direction `📥`/`📤` emoji (now fixed). (b) **No unread indicators** — every row looks read. (c) **No swipe-to-archive affordance** — list looks static. (d) Each message is its own `Card` (vertical stack), not a true conversation thread grouped by peer. |
| Settings | 2.0 | Account card is clean. | This is the weakest screen by far. Just one card + two sign-out buttons. iOS Settings groups by section (Notifications, Privacy, Display, About) and uses chevron-right disclosure rows. No notification toggle, no theme override, no version footer. |
| Voicemail | 3.5 | Reachable from both Calls + Messages, list layout reads, play button is brand-primary. | "← Back" was a full-width pill (iOS-native is small chevron+screen-name top-left). `▶` emoji on play button (now fixed). |
| Tab bar | 4.0 | Lucide 1.75 stroke-width icons look premium (PR #643 nailed this). Centered FAB with status-colored ring is the signature move. | (a) FAB still uses `🟢/🔵/🌙` emoji glyphs that render inconsistently per-OS (Apple vs Segoe vs Noto). (b) Active-tab indicator is `4×2px` — almost invisible in dark mode. (c) Spacer is `w-[72px]` but FAB is `w-[64px]` — 4px each side is fine but check visually. |

---

## Cross-cutting findings

1. **Emoji vs lucide is the #1 premium-feel regression.** PR #643 switched the
   tab bar to lucide strokeWidth 1.75 — explicitly to look "app-grade". But
   every screen below the tab bar is still emoji-glyphed: Calls (📞 ✗ ↓ ↑ ⌫ ✕),
   Messages (📥 📤), Ask (📷 🎤), Voicemail (▶), and crucially the Duty FAB
   itself (🟢 🔵 🌙). Apple → flat color emoji, Windows → Segoe UI Symbol,
   Android → Noto — all three render visibly different. **This breaks the
   "single visual system" promise.** Inline fixes in this PR convert the
   lowest-friction four (Messages directions, Ask composer ×2, Voicemail
   play). Remaining: FAB glyphs, call-row direction glyph, call-back pill,
   keypad backspace + close, dialer call CTA.

2. **Theme parity is mostly good.** Dark mode tokens are real (lines 3253-
   3288 in `index.css`), the FAB shadow even adapts (`rgba(13,60,252,0.28)` →
   `rgba(0,0,0,0.55)`). One soft spot: the keypad sheet shadow
   `0 -8px 24px rgba(0,0,0,0.18)` (line 682, PreviewScreens.tsx) is too soft
   in dark mode — the sheet's `--wft-mp-surface` and the screen's
   `--wft-mp-surface-soft` are nearly identical in dark (`#111A2E` vs
   `#0F172A`) so the sheet loses its edge. Recommend tokenizing the shadow.

3. **Status bar mock looks like dev placeholders.** `●●●● 5G ▮▮` (PhoneFrame
   line 50) reads as ASCII art, not signal/battery. iOS uses three filled
   bars + carrier label + a battery rectangle. This is the very first thing
   anyone sees on every screen.

4. **`overflow: hidden` on PhoneFrame content wrapper** (line 55 + 84) — per
   MEMORY.md the rule is `overflow: clip` for any embedded shell that might
   contain `position: sticky` children. Currently no sticky descendants
   exist, so it's latent, but worth flipping prophylactically.

5. **Scale-on-press is inconsistent.** Many buttons use `active:opacity-80`
   only; tabs add `transform: scale(0.96)` (line 3432 CSS); FAB adds `scale(0.96)` on press. Filter chips, Ask suggestion chips, Voicemail play, call-back pill — none have the transform. The DESIGN-SYSTEM "satisfying tap" rule is partly applied.

---

## Top 10 polish recommendations (ranked by impact)

1. **Replace emoji glyphs everywhere** with lucide (matches tab-bar style).
   Highest priority: Duty FAB `🟢/🔵/🌙` → `<Circle fill="success">` /
   `<Briefcase>` / `<Moon>`. Then Calls row `↓/↑/✗`, `📞 Call back`, keypad
   `⌫` `✕`. Estimated 12 small swaps, all <5 lines each.
2. **Mock the iOS / Android status bar properly.** Render three lucide
   `<Signal>` bars, "5G", `<Battery>` icon instead of `●●●● ▮▮`. ~10 lines
   in PhoneFrame.tsx.
3. **Rebuild Settings to feel like iOS Settings.** Add 4 grouped sections
   with chevron-right rows: Notifications (Push, Quiet hours), Display
   (Theme override), Account (Profile, Business — current card), About
   (Version, Privacy). ~80 lines, biggest visual lift on the weakest screen.
4. **Add unread + last-message indicators to Messages.** Blue dot left of
   peer name when `unread`, bold sender name, last-line preview truncated
   to one line. Currently every message is its own card — switch to a
   thread-row layout grouped by peer.
5. **Make the active-tab indicator visible.** Current `4×2px` dot is too
   subtle. Suggest `16×3px` pill or restore the underline at 12px width.
   In dark mode it's almost invisible.
6. **Tokenize the keypad-sheet shadow + backdrop.** Add `--wft-mp-shadow-sheet`
   and `--wft-mp-scrim` to both light + dark token blocks; replace the
   hardcoded `rgba(15,23,42,0.45)` + `rgba(0,0,0,0.18)`. Five lines of CSS,
   two lines of JSX.
7. **Fix nested `<button>` in Calls row.** Replace outer `<button>` with
   `<div role="button" tabIndex={0}>` + keyboard handler, OR move the
   call-back pill outside the row and absolutely position it. Currently it's
   invalid HTML and React will log a warning.
8. **Add scale-on-press to chips + small buttons.** One CSS rule:
   `.wft-mp-btn-ghost:active, .wft-mp-card:active { transform: scale(0.98); }`.
9. **Native-style Voicemail back button.** Replace full-width pill with a
   compact `<chevron-left /> Calls` link top-left, ~24px tall.
10. **iOS native cell affordance on Duty inactive cards.** Drop the "Switch
    to {Title}" CTA button — make the whole card tappable with a small
    chevron-right on the right edge to signal the action.

---

## Inline fixes shipped in this PR

Four ≤5-line swaps, all emoji → lucide (consistent with PR #643 direction):

1. **Messages direction** — `📥`/`📤` → `<ArrowDownLeft>`/`<ArrowUpRight>`
   at strokeWidth 1.75 with `wft-mp-text-muted` (PreviewScreens.tsx ~L800).
2. **Ask composer attach** — `📷` → `<Camera>` lucide (~L1031).
3. **Ask composer mic** — `🎤` → `<Mic>` lucide (~L1047).
4. **Voicemail play** — `▶` → `<Play fill="currentColor">` (~L1131).

The four fixes cover the lowest-controversy, highest-visibility emoji
glyphs. The remaining 8+ emoji uses (Duty FAB, Calls row glyphs, dialer
keypad chrome, call-back pill, dialer Call CTA) are flagged for a
follow-up PR because each requires either a new icon-set decision
(Duty FAB) or row-layout tweaks (Calls row direction inside flex).

---

## Blockers

None. Audit + fixes are surgical and non-blocking.
