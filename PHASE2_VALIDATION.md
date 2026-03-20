# Phase 2 Validation Plan: QuoteWidget

---

## A. MANUAL QA CHECKLIST

Test using: `/calculator?slug=<SLUG>&widget=v2`

### A1. Basic Rendering

| # | Test | How | Pass Criteria |
|---|------|-----|---------------|
| 1 | Widget loads without crash | Visit `?slug=<any>&widget=v2` | White card renders, no console errors |
| 2 | Business header shows | Any calculator | Logo, name, tagline visible |
| 3 | Progress bar visible for multi-step flows | Use multi-step template calculator | Shows "Step X of Y", bar fills proportionally |
| 4 | Progress bar hidden for single-page flows | Use classic_single template calculator | No progress bar or step count |
| 5 | Embed mode strips outer padding | Add `&embed=true` | No min-h-screen, no bg-slate-50 |

### A2. Step Navigation

| # | Test | How | Pass Criteria |
|---|------|-----|---------------|
| 6 | "Continue" button advances to next step | Click Continue on step 1 | currentStepIndex increments, new step renders |
| 7 | "Back" button goes to previous step | Click Back on step 2+ | Returns to prior step, answers preserved |
| 8 | No Back button on first step | Load widget | Only Continue visible |
| 9 | No Continue button on last step | Navigate to confirmation | No Continue in footer |
| 10 | "Skip" button appears when `can_skip: true` | Navigate to addon step | Skip visible, advances step |
| 11 | Answers persist across step navigation | Fill in step 1, go forward, go back | Step 1 shows original answers |

### A3. Question Components

| # | Test | How | Pass Criteria |
|---|------|-----|---------------|
| 12 | Slider renders and updates | Use hourly pricing calculator | Slider moves, value badge updates, answer stored |
| 13 | Select dropdown works | Use calculator with select question | Options appear, selection stored |
| 14 | Toggle switch works | Use calculator with after-hours toggle | Switch flips, boolean stored |
| 15 | Number input works | Use calculator without slider mapping | Input accepts numbers, stored |
| 16 | Text input works | Custom flow with text_input | Text entered, stored |
| 17 | Checkbox group multi-select | Calculator with add-ons | Multiple checkboxes, array stored |
| 18 | Radio group single-select | Custom flow with radio_group | One selection at a time, string stored |
| 19 | Package cards render | tiered_packages calculator | Cards show label/price/features, selection highlighted |
| 20 | Info display is read-only | Custom flow with info step | No input, just text |

### A4. Price Reveal

| # | Test | How | Pass Criteria |
|---|------|-----|---------------|
| 21 | Exact price shows total + breakdown | hourly/per_unit calculator | Dollar amount, breakdown line items |
| 22 | Range shows min–max | price_range_only calculator | "$X – $Y" format |
| 23 | Call-for-quote shows message | call_for_quote_only calculator | Phone icon + "Request a Quote" |
| 24 | Price updates when going back and changing inputs | Change quantity, re-advance to reveal | New total reflects change |
| 25 | "Call us" warning shows above threshold | Config with `callUsThreshold` set low | Amber warning bar appears |

### A5. Lead Capture

| # | Test | How | Pass Criteria |
|---|------|-----|---------------|
| 26 | Lead form renders all fields | Any calculator | Name, email, phone, company, SMS consent |
| 27 | Form validation blocks empty submission | Click submit with all fields empty | Error message shown |
| 28 | Successful submission shows thank-you | Fill name + email, submit | Checkmark, thank-you message |
| 29 | CTA button text from config | Calculator with custom `cta_button_text` | Button shows custom text |
| 30 | Thank-you message from config | Calculator with custom `lead_thank_you_message` | Custom message displayed |
| 31 | Lead appears in database | Submit lead, check dashboard | Lead record created with correct data |

### A6. Booking (if enabled)

| # | Test | How | Pass Criteria |
|---|------|-----|---------------|
| 32 | Booking step appears only when enabled | estimate_plus_booking calculator | Booking step in flow |
| 33 | Date picker works | Select a date | Available slots fetch fires |
| 34 | Time slots render | After date selection | Grid of time buttons |
| 35 | Customer info appears after time selection | Select a time slot | Name/email/phone inputs visible |
| 36 | Confirm updates local state | Fill info + confirm | Shows "Booking Confirmed" |

### A7. Confirmation

| # | Test | How | Pass Criteria |
|---|------|-----|---------------|
| 37 | Confirmation shows after lead + booking | Complete full flow | Party popper, both confirmations |
| 38 | Confirmation shows after lead only | No booking, complete flow | Party popper, "quote details sent" only |

---

## B. PRICING VALIDATION CHECKLIST

For each test: compare `calculateEstimate()` output in old widget vs new widget for identical inputs.

### B1. Core Calculation Integrity

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Hourly: base rate | qty=3, rate=$50 | total=$150 |
| 2 | Hourly: with baseFee | qty=2, rate=$75, baseFee=$25 | total=$175 |
| 3 | Per unit: basic | qty=5, rate=$20 | total=$100 |
| 4 | Per sqft: basic | qty=500, rate=$0.50 | total=$250 |
| 5 | Base plus rate | qty=3, baseFee=$100, rate=$30 | total=$190 |
| 6 | Tiered packages: select tier | tier 1 = $200 | total=$200 |
| 7 | Tiered ranges: in-range qty | qty=15, tiers=[{min:1,max:20,price:$300}] | total=$300 |
| 8 | Tiered ranges: out-of-range | qty=100, tiers max=50 | call_for_quote |
| 9 | Min charge: no addons | minCharge=$150 | total=$150 |
| 10 | Price range only | rangeMin=200, rangeMax=500 | type=range, min=200, max=500 |
| 11 | Call for quote | message="Contact us" | type=call_for_quote |

### B2. Modifier Stacking

| # | Test | Scenario | Expected |
|---|------|----------|----------|
| 12 | Travel fee adds | travelFee=$25 on any type | +$25 in breakdown |
| 13 | After-hours multiplier | isAfterHours=true, afterHoursMult=1.5 | 50% extra on subtotal |
| 14 | Difficulty tier multiplier | selectedDifficultyId matches tier with 1.25x | 25% extra |
| 15 | Add-on fixed | Select addon with type=fixed, amount=$30 | +$30 |
| 16 | Add-on percentage | Select addon with type=pct, amount=10 | +10% of subtotal |
| 17 | Min charge enforcement | Calculated total < minCharge | total = minCharge |
| 18 | callUsThreshold trigger | total >= callUsThreshold | callUs=true |
| 19 | Multiple modifiers stacking | travelFee + afterHours + addon | All applied in order |

### B3. maps_to Binding Correctness

| # | maps_to Value | Question Type | Verify |
|---|---------------|---------------|--------|
| 1 | `quantity` | slider | estimateInputs.quantity updates on slide |
| 2 | `quantity` | number_input | estimateInputs.quantity updates on type |
| 3 | `selected_tier_index` | package_card | estimateInputs.selectedTierIndex updates on click |
| 4 | `selected_add_on_ids` | checkbox_group | estimateInputs.selectedAddOnIds updates as array |
| 5 | `selected_difficulty_id` | select/radio | estimateInputs.selectedDifficultyId updates |
| 6 | `is_after_hours` | toggle | estimateInputs.isAfterHours updates boolean |

---

## C. WIDGETFLOWBUILDER VALIDATION MATRIX

For each pricing type: verify the generated WizardFlow has the correct step sequence and correct question definitions.

| Pricing Type | Expected Steps | Quantity Question? | Package Question? | Addon Question? | Price Reveal? | Lead Capture? | Notes |
|---|---|---|---|---|---|---|---|
| `hourly` | input_quantity → [addons] → reveal → lead → [booking] → confirm | YES: slider(hours), maps_to=quantity | NO | IF config.addOns | YES | YES | Slider should use `hours` config from sliderMappings |
| `per_unit` | input_quantity → [addons] → reveal → lead → [booking] → confirm | YES: slider(unitName), maps_to=quantity | NO | IF config.addOns | YES | YES | unitName varies — may not have slider config |
| `per_sqft` | input_quantity → [addons] → reveal → lead → [booking] → confirm | YES: slider(sqft), maps_to=quantity | NO | IF config.addOns | YES | YES | sliderMappings has sqft: 100-5000 |
| `per_linear_ft` | input_quantity → [addons] → reveal → lead → [booking] → confirm | YES: slider(linear_ft), maps_to=quantity | NO | IF config.addOns | YES | YES | sliderMappings has linear_ft: 10-500 |
| `base_plus_rate` | input_quantity → [addons] → reveal → lead → [booking] → confirm | YES: slider(unitName), maps_to=quantity | NO | IF config.addOns | YES | YES | |
| `tiered_packages` | input_packages → [addons] → reveal → lead → [booking] → confirm | NO | YES: package_card, maps_to=selected_tier_index | IF config.addOns | YES | YES | Tiers from config.tiers |
| `tiered_ranges` | input_quantity → [addons] → reveal → lead → [booking] → confirm | YES: slider(unitName), maps_to=quantity | NO | IF config.addOns | YES | YES | |
| `min_charge_plus_addons` | [addons] → reveal → lead → [booking] → confirm | NO | NO | IF config.addOns | YES | YES | No input step — straight to addons |
| `price_range_only` | reveal → lead → [booking] → confirm | NO | NO | NO | YES | YES | Shortest flow — no input at all |
| `call_for_quote_only` | reveal → lead → [booking] → confirm | NO | NO | NO | YES (call msg) | YES | Same as range_only structure |

### C1. Specific Validation Points

| # | Check | How to Verify |
|---|-------|--------------|
| 1 | `hourly` slider uses `hours` key | Inspect generated question: min=1, max=24, step=0.5 from sliderMappings |
| 2 | `per_unit` with custom unitName gets number_input fallback | Use unitName that isn't in sliderMappings (e.g., "widgets") — should get number_input, not slider |
| 3 | `per_sqft` slider uses sqft range 100-5000 | Inspect generated question min/max |
| 4 | `tiered_packages` with 3 tiers generates 3 package cards | Inspect generated question.packages array length |
| 5 | `tiered_packages` middle tier is highlighted | packages[1].highlighted === true |
| 6 | Addon step skipped when config has no addOns | buildAddOnStep returns null, step not in flow |
| 7 | Addon step included when config has addOns | Step present with checkbox_group question |
| 8 | Booking step only present when bookingEnabled=true | Check flow.steps for type=booking |
| 9 | Template with wizard_steps overrides auto-generation | Use multi_step_progressive template — should use its preset steps |
| 10 | Custom template without wizard_steps auto-generates | Use classic_single template — should auto-build from pricing config |

---

## D. COMPARISON PLAN: OLD WIDGET vs NEW WIDGET

### D1. Side-by-Side Method

For each test calculator, open two browser tabs:
- Tab 1: `/calculator?slug=<SLUG>` (old widget)
- Tab 2: `/calculator?slug=<SLUG>&widget=v2` (new widget)

### D2. Comparison Points

| # | What to Compare | How to Verify | Acceptable Differences |
|---|----------------|--------------|----------------------|
| 1 | Pricing total for identical inputs | Enter same qty in both, compare totals | Must be identical (both use same calculateEstimate) |
| 2 | Breakdown line items | Compare breakdown lists | Same labels and amounts |
| 3 | Add-on selection → price impact | Select same add-ons in both | Same total after add-ons |
| 4 | Package selection → correct tier price | Select same tier in both | Same tier price shown |
| 5 | Lead form fields present | Compare visible fields | New widget always shows 4 fields; old widget reads from lead_form config |
| 6 | Lead submission payload | Open Network tab, submit in both | Same fields sent to POST /api/leads |
| 7 | Lead record in DB | Check DB after submission from both | Same data shape stored |
| 8 | Accent color/theme | Compare visual color | Same accent color from calculator.primary_color |
| 9 | Call-for-quote display | Use call_for_quote_only config | Both show "Request a Quote" or custom message |
| 10 | Price range display | Use price_range_only config | Both show same min-max range |

### D3. Known Intentional Differences

| Area | Old Widget | New Widget | Why |
|------|-----------|-----------|-----|
| Layout | Template-specific inline rendering (2,287 lines) | Schema-driven step-by-step card | Architectural improvement |
| Navigation | `multiStepIndex` state + hardcoded step logic | `currentStepIndex` + WizardFlow steps | Schema-driven |
| Booking | Full Stripe checkout + confirm API flow | Local state only (CONFIRM_BOOKING) | Server integration deferred |
| Coupon | Full validation + apply + discount display | State exists but no UI triggers it yet | Deferred to polish |
| Quote expiration | Countdown timer, expired state | State exists but no timer yet | Deferred to polish |
| Trust blocks | Testimonials, badges, image gallery | Not built yet | Deferred to polish |
| AI chat bubble | Shown alongside widget | Same — controlled by calculator.tsx, not widget | No difference |

---

## E. TOP 10 BUGS MOST LIKELY TO EXIST RIGHT NOW

### BUG 1 — CONFIRMED: visibility.ts treats `0` and `false` as undefined
**File:** `visibility.ts:17`
**Line:** `if (actual === undefined) return false;`
**Impact:** Any visibility condition on a field with value `0` or `false` silently fails. The step/question becomes invisible when it should be visible.
**Fix:** Change to `if (actual === undefined || actual === null) return false;`
**Severity:** HIGH — breaks conditional visibility for falsy-but-valid answers.

### BUG 2 — CONFIRMED: BookingStep doesn't POST to server
**File:** `BookingStep.tsx:138`
**Impact:** Clicking "Confirm Booking" only sets `booking.confirmed = true` in React state. No API call to `POST /api/bookings`. Booking is not persisted. User thinks they booked but nothing happened.
**Severity:** HIGH — but acceptable as known incomplete feature. Must be fixed before any booking-enabled calculator uses `?widget=v2`.

### BUG 3 — LIKELY: PriceRevealStep recalculate has stale dependency
**File:** `PriceRevealStep.tsx:20-22`
**The `useEffect` depends on `[recalculate]` only.** `recalculate` is a `useCallback` whose deps include `estimateInputs`. If the user goes back, changes a slider, then re-advances to PriceRevealStep, the effect may not re-fire if `recalculate`'s reference didn't change.
**Scenario:** User enters qty=5, sees price, goes back, changes to qty=10, returns to reveal — price might still show qty=5 result.
**Severity:** HIGH — core pricing correctness issue.

### BUG 4 — LIKELY: `per_unit` with non-standard unitName gets number_input with no max
**File:** `widgetFlowBuilder.ts:118-131` → `buildRateQuantityStep()`
**If `getSliderConfig(sliderKey)` returns null (unitName not in sliderMappings), the fallback number_input has `min: 1` but no `max`.** User can enter extremely large numbers, potentially producing absurd estimates.
**Severity:** MEDIUM — cosmetic/UX issue, not a crash.

### BUG 5 — LIKELY: Default values not pre-populated in answers
**File:** `WidgetContext.tsx:12` — `initialWidgetState.answers = {}`
**Questions define `default_value` in their schema, but the reducer starts with empty answers.** The first time a step renders, `getAnswer(questionId)` returns `undefined`, not the default. The question component shows the default visually (via its local fallback), but `estimateInputs` is NOT updated because no `SET_ANSWER` dispatch happened.
**Impact:** If user clicks Continue without touching a slider, `estimateInputs.quantity` stays at `1` even if the slider's `default_value` was `10`.
**Severity:** HIGH — pricing will be wrong if user doesn't interact with a question.

### BUG 6 — LIKELY: Package selection writes index as number but maps_to expects number
**File:** `PackageCardQuestion.tsx:31` — `onChange(i)` sends a number.
**File:** `WidgetContext.tsx:73` — `updated.selectedTierIndex = typeof value === 'number' ? value : Number(value) || 0`
**This actually works correctly.** But the synthesized question in `PackageSelectionStep.tsx` uses `question.id = 'package_tier'`, while `widgetFlowBuilder.ts` also uses `id: 'package_tier'`. If both try to set the answer, they collide correctly. No bug, but fragile.
**Severity:** LOW — works by coincidence.

### BUG 7 — LIKELY: Addon default selections not written to state on mount
**File:** `widgetFlowBuilder.ts:199-200` — `default_value: config.addOns.filter(a => a.default).map(a => a.id)`
**Same as Bug 5.** The default add-on IDs are set on the question definition but never dispatched as initial answers. `estimateInputs.selectedAddOnIds` stays as `[]` until the user interacts.
**Severity:** MEDIUM — add-ons marked as default won't appear in the estimate until user toggles them.

### BUG 8 — POSSIBLE: LeadCaptureStep sends empty string instead of null
**File:** `LeadCaptureStep.tsx:52-55`
**Code:** `name: leadData.name || null` — this correctly converts empty string to null.
**Actually OK.** The server schema accepts `z.string().nullable().optional()`, which handles both. No bug.
**Severity:** NONE — false alarm on closer inspection.

### BUG 9 — LIKELY: Navigation footer shows Continue on lead_capture and confirmation steps
**File:** `QuoteWidget.tsx:107` — `const showNext = !isLastStep;`
**The Continue button shows on every step except the absolute last one.** For LeadCaptureStep, the user should submit the form (not click Continue). But Continue will skip past the form without submitting.
**Impact:** User can click Continue to skip lead capture entirely and jump to confirmation without submitting any data.
**Severity:** HIGH — defeats the purpose of lead capture.

### BUG 10 — POSSIBLE: Theme accent not passed to all components
**File:** `QuoteWidget.tsx:85` — `const accentColor = theme.colors.primary;`
**accentColor is passed to StepRenderer, which passes to step components.** But some sub-components (like PackageCardQuestion) receive it correctly while BookingStep only uses it for styling, not for the slot buttons' default state.
**Severity:** LOW — cosmetic inconsistency.

### SUMMARY BY SEVERITY

| Severity | Bug #s | Count |
|----------|--------|-------|
| HIGH | 1, 2, 3, 5, 9 | 5 |
| MEDIUM | 4, 7 | 2 |
| LOW | 6, 10 | 2 |
| FALSE ALARM | 8 | 1 |

---

## F. RECOMMENDATION: WHAT TO TEST AND FIX FIRST

### Priority 1 — Fix Before Any Testing (code bugs)

These are code defects that will cause wrong behavior in every test:

| Order | Bug | Fix | Effort |
|-------|-----|-----|--------|
| 1st | **Bug 5: Defaults not populated** | On mount, iterate flow questions with `default_value`, dispatch `SET_ANSWER` for each | Small |
| 2nd | **Bug 1: visibility.ts falsy check** | Change `=== undefined` to `=== undefined \|\| actual === null` | Trivial |
| 3rd | **Bug 9: Continue skips lead capture** | Hide Continue on `lead_capture`, `booking`, and `confirmation` step types | Small |
| 4th | **Bug 3: PriceRevealStep stale recalculate** | Add `estimateInputs` to useEffect deps, or recalculate inline (not in effect) | Trivial |

### Priority 2 — Validate After Fixes

After the 4 fixes above, run these tests in this order:

1. **widgetFlowBuilder matrix (Section C)** — test with 1 calculator per pricing type. Verify step count and question types. This is the fastest way to catch structural issues.

2. **Pricing correctness (Section B, B1)** — test calculations 1-11 with both widgets side-by-side. These must match exactly.

3. **maps_to binding (Section B, B3)** — verify each binding type updates estimateInputs correctly. This is the data pipeline between UI and pricing engine.

4. **Navigation flow (Section A, A2)** — verify forward/back/skip with answers preserved. This is the user experience spine.

5. **Lead submission (Section A, A5, items 26-31)** — verify end-to-end lead creation. This is the business value.

### Priority 3 — Known Incomplete (accept for now)

| Item | Status | When to Fix |
|------|--------|-------------|
| Bug 2: Booking no server POST | Known | Before any booking-enabled calculator uses v2 |
| Bug 7: Addon defaults not in state | Fix with Bug 5 (same root cause) | Priority 1 |
| Coupon flow | Not wired | Polish phase |
| Quote expiration timer | Not wired | Polish phase |
| Trust blocks | Not built | Polish phase |
| Multi-column layouts | Not built | Polish phase |
