# Promotion Trials UI Audit

**Date:** 2026-11-19  
**Scope:** Read-only frontend audit. No application source, backend code, API contract, test, or existing audit report was modified.

## Executive summary

The `/promotion` route renders `PromotionTrials`, reads player and trial data from `ProgressionContext`, and delegates trial attempts to that context. Trial data is fetched from `/api/promotion/trials`; no dedicated promotion API service or frontend component test suite was found.

The keyboard issue is confirmed in source: available trial cards are `div` elements with `role="button"` and `tabIndex={0}`, but the card has only an `onClick` handler. There is no Enter/Space key handler. The card contains a separate native “Attempt Trial” button, creating nested interactive semantics and potentially overlapping activation paths. Locked/completed cards are also focusable because `tabIndex` is assigned regardless of availability, although their card handler does nothing.

Trial loading/error handling is owned by `ProgressionContext`, which stores trials but exposes no loading/error state. On non-OK responses it returns silently; on network errors it logs only. The page therefore cannot distinguish loading, a valid empty list, or a failed fetch. No retry control exists on the page. This matches the global audit diagnosis.

## Architecture and files

| File | Role |
|---|---|
| `src/pages/PromotionTrials.tsx` | Promotion overview, trial cards, eligibility display, selected-trial detail/editor, submission feedback, success result. |
| `src/pages/PromotionTrials.css` | Rank header, card states, detail/editor, success overlay, and responsive styling. |
| `src/context/ProgressionContext.tsx` | Loads `/api/promotion/trials`, stores `promotionTrials`, exposes `refreshPromotions` and `attemptPromotion`. |
| `src/types/index.ts` | Defines `PromotionTrialEligibility`, `PromotionAttemptResult`, and related API-backed fields. |
| `src/App.tsx` | Registers `/promotion` route. |
| `src/components/ui/index.tsx` / `src/components/ui/ui.css` | Existing SCDS primitives, including Button, LoadingState, ErrorState, EmptyState, StatusBadge, and ProgressBar. Promotion Trials uses local markup and styles instead. |
| `src/styles/tokens.css` / `src/index.css` | Shared design tokens and app-level styles. |
| `tests/backend_promotion_trials.test.mjs` | Backend integration tests; not frontend interaction tests. |

No Promotion Trial API service was found under `src/services/`. `PromotionTrials` obtains `player`, `promotionTrials`, `refreshPromotions`, and `attemptPromotion` from `useProgression()`. The context performs the fetch and stores data. The page derives current/locked/completed/available state from `player.rank`, trial status, and `eligible`.

## Keyboard accessibility root cause

At `PromotionTrials.tsx` around the trial-card map, each outer card is a clickable `div` with `role="button"`, `tabIndex={0}`, an accessible label, and an `onClick` callback that opens the trial only when `available` is true. It does not implement `onKeyDown` for Enter or Space. A `div` does not acquire native button activation from `role="button"` alone.

The card also contains an inner native button for “Attempt Trial”, which calls the same selected-trial action. This is nested interactive content. Its click may bubble to the parent card; currently that can result in the same selected ID being set twice, while future parent behavior could be triggered unintentionally. Locked and completed cards still receive a tab stop and role-button label even though activation has no effect.

CSS defines hover treatment for cards, but no `.promotion-trial-card:focus-visible` rule was found. The inner button’s own keyboard behavior comes from native button semantics; the parent card’s keyboard activation and visible focus are not implemented in source. Shared/global focus styling was not confirmed in a browser.

**Smallest accessible direction for a later implementation:** prefer one semantic native `<button>` for an actionable card, or keep the card as a noninteractive article and expose its existing attempt/detail button as the sole action. Do not keep nested controls. If a card remains unavailable, render it as noninteractive content and communicate its status/lock reason as text. Preserve any trial flow in which the detail editor is reachable only for eligible trials.

## API lifecycle: loading, success, empty, error, retry

### Fetch and storage

`ProgressionContext.tsx`’s `refreshPromotions` requests `GET /api/promotion/trials` with the current bearer token. On success it reads `backendData.trials || []` and updates `promotionTrials` in context. The context initialization also uses an empty trial array. Attempting a promotion uses a separate POST through `attemptPromotion`, and a successful attempt refreshes promotion state.

### Loading

No promotion-specific loading flag is exposed by the context. The page immediately renders the current array, which starts empty. Thus initial fetch pending is indistinguishable from a genuinely empty successful response.

### Success

Successful response trials are mapped through from/to rank, eligibility requirements, status, lock reason, progress/attempt fields, and challenge identity. The page shows rank requirements, descriptions, attempts, and available/completed/locked styling where fields exist.

### Empty

The card section maps `promotionTrials`; there is no explicit page-level successful-empty message in the source. An empty array results in an empty card area, not an intentional empty state.

### HTTP and network errors

In `ProgressionContext.tsx` around lines 533–551, a non-success response returns without updating trials or exposing an error. Network exceptions are caught and logged with `console.warn`, also without a UI error state. Because the default is `[]`, both failures leave the page looking like an empty catalog. No Retry button is present in the page. The context call does not use AbortController or a request-generation guard; no user-controlled filter is tied to the request, but unmount or overlapping refresh behavior is not explicitly guarded here.

## Visual and responsive findings (source-reviewed)

- The page has a header, current-rank/progress card, section heading, and trial cards. Card CSS uses `repeat(auto-fit, minmax(320px, 1fr))`; at widths below 768px it becomes one column. This creates a large minimum width and can leave significant unused width on some intermediate layouts depending on the available content column.
- The global audit identified excessive blank space and content alignment as a concern. Source CSS shows generous page/rank-card dimensions and a two-column trial grid at wider widths; without live rendering this remains a source-based concern, not a freshly reproduced visual defect.
- Each card contains rank chip, state badge, title/description, three eligibility rows, optional lock reason, attempts, and action. Cards have flexible content but no clear equal-height rule was found; differences in description/lock-reason lengths can change card heights.
- Available, locked, and completed states have separate CSS classes. Eligibility requirements use met/unmet colors plus check/cross glyphs and text labels. The card status badge is visually styled, while content states are also textual.
- A detail panel includes requirements, challenge information, editor, and attempt controls. The success view is an overlay. The page can show either list or selected-trial details according to page state.
- Responsive CSS has a breakpoint at 768px and some action-bar adjustments. Exact device widths and overflow were not browser-verified.

## Accessibility findings

- Trial-card semantics and keyboard activation are the primary confirmed issue described above.
- The outer card’s `aria-label` includes title and status; it does not explain the specific action (“open trial”) or lock reason. The visible action button supplies a more explicit label only on available cards.
- Focus visibility on the card is not defined locally. Button focus may inherit a global style, but this was not confirmed in rendered output.
- Requirement status relies on check/cross glyphs and color with accompanying requirement text. Verify screen-reader exposure and contrast; no contrast ratio was measured.
- Context-driven asynchronous loading/error has no status/error announcement because the page has no corresponding state UI.
- Native controls within the solver/editor remain keyboard-operable by their element semantics; no live keyboard inspection was possible.

## Severity-ranked recommendations

| Severity | Finding | Recommendation |
|---|---|---|
| High | `div role="button"` lacks Enter/Space activation and nests a native action button. | Use one native actionable control or a noninteractive card with a single native action. Remove focusability/action from unavailable cards. |
| High | Failed requests and genuine empty data share the same blank card area; there is no retry. | Expose loading, error, and success-empty states from context/page; show retry that calls `refreshPromotions`. Do not fabricate trial data. |
| Medium | Loading is not represented; default empty context state appears immediately. | Add explicit loading feedback with an accessible status announcement. |
| Medium | Focus ring and action intent are not explicit for outer cards. | Ensure focus-visible styling and concise accessible names for each actionable control. |
| Low | Cards may have uneven heights and trial grid may leave excess space. | Normalize card layout with stretch/aligned footer and inspect actual breakpoints before changing dimensions. |
| Low | Eligibility contrast and responsive overflow are unverified. | Inspect actual rendered page at mobile/tablet/desktop and measure contrast where needed. |

## Proposed implementation order

1. Correct card semantics and remove nested interactive controls; verify Enter, Space, focus, and disabled/unavailable behavior.
2. Add context/page loading, explicit request error and successful-empty states, plus functional retry while preserving current API contract.
3. Add stale-response/unmount protection if refresh can overlap or outlive the consumer; avoid changing the backend contract.
4. Visually review card heights, alignment, blank space, and responsive layout with real trial data.
5. Verify accessible names, announcements, focus, contrast, editor keyboard behavior, and reduced motion in browser.

## Browser verification and limitations

- **Current-session browser attempt:** Not completed. The available browser surface returned `Browsers: Error: Local browser access is unavailable for this chat`; no browser tab was available to open `/promotion`.
- **Mouse/keyboard activation:** Not tested in browser. The missing Enter/Space handler is confirmed by source inspection; no runtime activation result is claimed.
- **Visual/responsive layout:** Source-reviewed only. No viewport was set, no screenshots captured, and no blank-space or clipping defect was freshly reproduced.
- **Prior audit observation:** `docs/GLOBAL_UI_QUALITY_AUDIT.md` records that `/promotion` previously rendered five locked trials and notes the card keyboard issue; it also reports exact requested viewport sizes were unavailable. That is historical audit evidence, not a fresh browser check.
- **Automated tests:** Not run; this read-only phase introduced no code changes. Backend promotion tests exist but do not test frontend keyboard or rendering behavior.

## Backend handoff

The known issues are frontend integration/state/accessibility issues; no backend change is needed to implement semantic trial cards or expose the existing refresh result in the UI. The `/api/promotion/trials` contract was not re-audited in full during this focused page audit. Do not add fields or alter trial eligibility/progression behavior. If future frontend states require distinguishing an empty catalog from a successful empty player response, confirm the existing response semantics with the backend owner before changing contracts.

## Files inspected and created

**Inspected:** `src/pages/PromotionTrials.tsx`, `src/pages/PromotionTrials.css`, `src/context/ProgressionContext.tsx`, `src/types/index.ts`, `src/App.tsx`, `src/components/ui/index.tsx`, `src/components/ui/ui.css`, `src/styles/tokens.css`, `src/index.css`, `tests/backend_promotion_trials.test.mjs`, `docs/GLOBAL_UI_QUALITY_AUDIT.md`, and relevant `src/services/` files.

**Created:** `docs/PROMOTION_TRIALS_UI_AUDIT.md`.

**Not modified:** application source, backend files, tests, API contracts, and existing audit reports.
