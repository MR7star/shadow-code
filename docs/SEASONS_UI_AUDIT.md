# Seasons UI and Reliability Audit

**Date:** 2026-11-19  
**Scope:** Read-only source and contract inspection. No application source, backend code, API contract, tests, or existing audit reports were modified.

## Executive summary

The Seasons route is implemented in `src/pages/Seasons.tsx` with page-local response interfaces and CSS. It loads a public season archive from `GET /api/seasons`, selects the active season (or first available season), then fetches selected details from `GET /api/seasons/:id`. Authenticated users may claim a backend-confirmed reward through `POST /api/seasons/:id/claim`.

The stale-detail defect identified in the global audit remains present in source. `fetchDetails` unconditionally writes `details` and `error`; requests are neither aborted nor scoped to the selected season, so an earlier response can overwrite a newer selection. The selection effect also leaves the prior `details` visible while the new request is pending. The page has one shared `isLoading` flag for archive loading, but no selected-detail loading state. This can temporarily pair the newly selected season status in the hero with the previous season’s detail panel.

The CSS provides responsive breakpoints at 960px and 640px, and several sections are visually consistent with the application tokens. However, reward callout and reward-tier cards use different surface treatments; status labels, compact labels, and table typography are smaller than surrounding body copy; and source review cannot establish actual contrast or alignment. Browser access was unavailable in this session, so there is no fresh visual or interaction verification.

## Architecture and relevant files

| File | Role |
|---|---|
| `src/App.tsx` | Registers the `/seasons` route. |
| `src/pages/Seasons.tsx` | Owns local season response interfaces, archive/detail/reward state, API calls, selection, claim action, and rendered UI. |
| `src/pages/Seasons.css` | Page-specific layout, status, detail, reward, standings, empty/error, and responsive styles. |
| `src/context/AuthContext.tsx` | Supplies token, authentication state, and auth modal action used by reward claims. |
| `src/context/ProgressionContext.tsx` | Supplies `refreshProgress` after a reward claim. |
| `src/components/ui/index.tsx` / `src/components/ui/ui.css` | Existing SCDS primitives, including loading, error, empty, progress, button, status badge, and panel components; Seasons currently uses local presentation instead. |
| `src/styles/tokens.css` / `src/index.css` | SCDS token definitions and application color/type variables. |
| `src/services/` | No dedicated Seasons API service found. Seasons uses direct `fetch`; other services exist for Arena, Guilds, and Tournaments. |
| `tests/backend_seasons.test.mjs` | Backend integration coverage for seasonal lifecycle, XP, rankings, rewards, and archives; not a frontend component test. |

No shared Season component or shared Season response type was found. Local interfaces define `SeasonSummary`, `SeasonStanding`, `SeasonRanker`, `SeasonDetails`, and reward shapes directly in `Seasons.tsx`.

## Season detail request lifecycle and stale-request root cause

1. `selectedSeasonId` is local state, initialized to `null`.
2. `fetchSeasons()` requests `/api/seasons`, stores the returned list, and keeps the current selection if it still exists; otherwise it selects the active season, then the first season, then `null`.
3. A `useEffect` reacts to `selectedSeasonId` and `token`. If an ID exists, it calls `fetchDetails(selectedSeasonId, token)`.
4. `fetchDetails` clears the shared `error`, fetches `/api/seasons/:id`, parses `SeasonDetails`, then unconditionally calls `setDetails(data)`. On failure it unconditionally clears details and sets the shared error.
5. No `AbortController`, request ID, selected-ID comparison, or cleanup is used. The function’s identity is stable via `useCallback([])`, but that does not prevent overlapping HTTP requests.
6. The details request does not set a detail-specific loading flag. `isLoading` only wraps `fetchSeasons`; after archive loading has finished, the detail placeholder condition `!isLoading && selectedSeason` may not represent the active details request reliably. While a previous `details` object exists, the render condition `{selectedSeason && details ? ...}` continues displaying it during a new request.
7. On unmount, no detail fetch is cancelled or invalidated, so a completion may attempt state updates after the component has left the screen.

**Exact root cause:** completion handlers do not verify that the request still belongs to the current `selectedSeasonId`; the detail effect provides no cancellation or cleanup, and the rendered detail panel is not associated with a season ID/loading state. A slow old response can therefore overwrite the current selection’s details and can also clear or set a shared error for the wrong season.

## Visual and responsive audit (source-reviewed)

### Layout and hierarchy

- Hero, archive list, and detail panel use shared background/border/radius/shadow treatment through common CSS declarations. Hero gets a separate cyan/purple radial surface.
- Desktop uses a two-column grid (`minmax(240px, 300px) minmax(0, 1fr)`) with the season list sticky under the top bar. At `max-width: 960px`, the layout stacks and the archive list becomes a responsive card grid. At `max-width: 640px`, panels reduce padding, hero/detail heading stack, stats become two columns, and the claim action fills its row.
- Season list titles are single-line ellipsized. Participant count and status remain present. No explicit `:focus-visible` selector was found in `Seasons.css`.
- The detail panel uses sections for summary stats, optional reward callout, standings, and division rewards. The standings table is placed in an `overflow-x:auto` wrapper, which contains horizontal scrolling.

### Cards, rewards, progress, and status

- Season list entries are buttons with selected styling and status text. Their icon cell uses status-specific color/background.
- The source contains no season progress bar or percent field in the local summary/detail contract. Do not propose a progress visualization unless the existing API provides an appropriate progress value.
- The personalized claim callout is cyan-tinted and visually more prominent than the division reward cards, which use a neutral elevated surface. Both use small typography and compact spacing; the callout includes reward tier/XP/title and claim action, while reward cards show division, XP, and optional title.
- Claim eligibility is displayed only when both `details.canClaimReward` and `details.claimableReward` are true/non-null, preserving backend authority. A claimed notice is displayed when `userStanding.rewardsClaimed === 1`.
- Status uses text (`active`, `upcoming`, `completed`) plus color and a dot/icon glyph. CSS defines distinct colors. Contrast was not measured.
- Detail loading/error/empty feedback shares a panel branch and is text-only. It does not display a dedicated detail skeleton, and an error is also shown in a separate alert above the layout.

### Spacing and typography observations

- Cards and panels have consistent rounded surfaces, but season archive rows, stat cards, reward cards, and the claim callout are distinct page-specific patterns rather than reusable SCDS cards.
- Several labels are deliberately condensed (`0.6–0.75rem`); at mobile widths, small labels and status text warrant visual/contrast verification.
- The list’s sticky positioning is disabled on the stacked layout. The layout and table’s contained scroll appear responsive in source, but exact rendered behavior was not inspected in this phase.

## Accessibility findings

- Season selection, reward claim, and sign-in prompt use native `<button>` elements and are keyboard-operable by semantics. Selected season is only conveyed by a CSS class; there is no `aria-pressed`, `aria-current`, or radio/listbox selection state.
- Season status icon glyphs and the empty-panel glyph are presentation-only spans without `aria-hidden`; nearby status text exists for list/header status, but the empty illustration has no visible text duplication requirement. Lucide migration is not part of this audit.
- Season detail loading text is not announced with `role="status"` or `aria-live`. Errors use `role="alert"`; reward claim success uses `role="status"`.
- No page-local focus-visible rule exists in `Seasons.css`. Global/shared focus rules may apply, but this was not verified in a browser.
- No progress indicator exists in the current Season page/API interface, so no progress-bar accessibility issue is confirmed. The standings table has semantic table structure and headers.
- The clickable season item is a native button and does not nest other controls. The reward claim button disables while claiming, with a text update.

## Severity-ranked recommendations

| Severity | Finding | Recommendation |
|---|---|---|
| High | Stale detail responses can replace data for the currently selected season; previous details remain visible during a selection change. | Add detail-specific loading state and cancel obsolete requests or ignore results whose request ID/season ID no longer matches. Clear or key details by selected ID. Invalidate work on unmount. Keep errors scoped to the requested season. |
| Medium | Archive/detail loading are conflated and can present ambiguous placeholder/error state. | Separate archive and detail states; show a selected-season loading presentation while details are pending, and distinct retry/error feedback. |
| Medium | Selection state is conveyed visually only. | Expose the selected state accessibly (for example `aria-pressed` on toggle buttons) while preserving native button keyboard interaction. |
| Low | Reward callout and division reward cards have different visual emphasis and sizing. | Normalize internal spacing, heading/value hierarchy, and reward typography while retaining the claim callout’s importance. |
| Low | Several status/metadata labels are very small, and contrast has not been measured. | Verify text contrast and legibility on actual viewports; adjust only if a reproducible issue is observed. |
| Low | Status/empty glyphs lack explicit decorative treatment and no page-local focus style is visible. | Mark purely decorative glyphs hidden from assistive technology and verify global focus treatment on every action. |

## Proposed implementation order

1. Add a dedicated detail request state keyed to `selectedSeasonId`; prevent the old detail panel from being mistaken for the new selection.
2. Abort or invalidate requests on selection/token changes and component unmount; ensure stale success/error/finally paths cannot update current state.
3. Keep archive and detail loading/error states independent and add a working selected-season retry.
4. Expose selected season state accessibly and verify keyboard/focus behavior.
5. Inspect responsive layouts, reward cards, table scrolling, contrast, and label readability in a real browser before making any visual refinements.

## Browser verification and limitations

- **Current-session attempt:** Browser inspection was not completed. The available browser automation surface reported `Browsers: Error: Local browser access is unavailable for this chat`; no browser tab was available for `/seasons`.
- **Rapid season switching:** Not tested in a browser. The race condition is confirmed by source control flow only; no stale response was observed at runtime in this phase.
- **Responsive layout, card heights, focus, and contrast:** Source-reviewed only. No viewport was set and no screenshots were captured.
- **Prior observation:** `docs/GLOBAL_UI_QUALITY_AUDIT.md` reports that `/seasons` rendered live with an active season and archive entry; it also documents that rapid switching and reward claims were not tested. This is prior audit evidence, not fresh verification here.
- **Automated tests:** Not run. Existing coverage is backend integration testing, and this read-only audit made no behavior changes.

## Backend handoff

No backend change is required to address the confirmed stale-request defect. It is a frontend request ownership/state problem.

The Seasons frontend currently has no shared response types or dedicated service, but existing route contracts were not exhaustively re-audited in this phase. Do not invent fields to support progress UI; if a future feature requires progress information absent from the current response, confirm the backend contract with the project owner first. Reward eligibility and reward contents should continue to use the backend-provided `canClaimReward`, `claimableReward`, and claim response.

## Files inspected and created

**Inspected:** `src/pages/Seasons.tsx`, `src/pages/Seasons.css`, `src/App.tsx`, `src/context/AuthContext.tsx`, `src/context/ProgressionContext.tsx`, `src/components/ui/index.tsx`, `src/components/ui/ui.css`, `src/styles/tokens.css`, `src/index.css`, `src/services/`, `src/types/index.ts`, `tests/backend_seasons.test.mjs`, `docs/GLOBAL_UI_QUALITY_AUDIT.md`, and `docs/ACHIEVEMENTS_UI_AUDIT.md`.

**Created:** `docs/SEASONS_UI_AUDIT.md`.

**Not modified:** application source, backend files, tests, API contracts, and both existing audit reports.
