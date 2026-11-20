# Global UI Quality Audit

**Date:** 2026-11-19  
**Scope:** Read-only audit of Leaderboard, Guilds, Promotion Trials, Skill Tree, Achievements, and Seasons. No application or backend source was changed.

## Executive summary

The six routes are implemented and render against the current local application. Guilds, Skill Tree, Achievements, Promotion Trials, and Seasons use backend or progression-context data; the Leaderboard has a mock-data fallback that can make a failed request look like live rankings. The strongest reproduced visual defect is on the Leaderboard: long hunter names escape their mobile podium cards, and the wide table is clipped by its wrapper. Other confirmed concerns are missing request-error presentation on Leaderboard and Achievements, missing skill-tree connector markup despite connector CSS, keyboard semantics on available Promotion Trial cards, and stale Season details when selection changes quickly.

The pages are not equally integrated with the shared SCDS layer. Guilds uses shared UI primitives; most other screens retain page-specific markup and styles. Existing CSS provides some mobile breakpoints, but the exact requested viewport sizes could not be set in the available in-app browser. Responsive conclusions below distinguish source review from the narrow live view that was visible.

## Repository and architecture inspected

- Routes: `src/App.tsx:35-48` (`/skills`, `/promotion`, `/achievements`, `/guilds`, `/seasons`, `/leaderboard`).
- Shared SCDS primitives: `src/components/ui/index.tsx:13-94`; tokens are in `src/styles/tokens.css` and imported through `src/index.css`.
- Page and style pairs: `src/pages/{Leaderboard,Guilds,PromotionTrials,SkillTree,Achievements,Seasons}.{tsx,css}`.
- Data integration: `src/context/ProgressionContext.tsx:513-590`, `src/pages/Achievements.tsx:55-89`, `src/pages/Seasons.tsx:77-149`, and the direct leaderboard request in `src/pages/Leaderboard.tsx:44-80`.
- API services present under `src/services/`: Arena, Guilds, and Tournaments. The six audited screens otherwise use direct `fetch` calls or progression context.
- Backend test scripts cover achievements, promotion trials, seasons, progression/mastery, guilds, arena, tournaments, dungeons, and daily quests. `npm run test:all` uses a fixed backend port (`tests/run_backend_tests.mjs:23-27`) and was not run during this audit because the existing local app/backend was active and the runner could collide on port 3001.

## Findings by screen

### 1. Leaderboard

| Category | Finding |
|---|---|
| Current condition | The live `/leaderboard` route displayed real ranked entries and the top-three podium. In the current narrow embedded browser view, the podium appears as horizontal cards. A long username visibly overflows its card and runs into the rank/level/XP content. |
| Problems | **High:** long usernames are not constrained in the mobile row layout. **High:** the table wrapper uses `overflow: hidden` around a seven/eight-column table, so narrow screens can clip columns rather than offer horizontal scrolling. **Medium:** failed or non-OK API requests have no visible error state; the player tab falls back to mock rows, while other tabs can appear empty. |
| Root cause | `Leaderboard.tsx:41-42,56-73,82-128` stores untyped `any[]`, returns silently on non-OK response, only logs exceptions, and supplies `defaultLeaderboard` when server data is absent. `.podium-name` has no width/wrapping/ellipsis constraint (`Leaderboard.css:96-102`); the mobile rule changes podium cards to a 300px max-width horizontal row (`337-352`). `.leaderboard-table-wrap` clips overflow (`127-132`). |
| Severity | High for clipping/overflow; Medium for misleading fallback and absent error state. |
| Proposed fix | Bound podium text with `min-width:0` plus wrap/ellipsis and a title/accessible full name. Make the table horizontally scrollable on small screens or present a responsive row layout. Use a typed API result and separate loading, error, and empty states; remove or clearly label offline sample data so it cannot be mistaken for authoritative rankings. |
| Verification | **Live-verified:** `/leaderboard` rendered real entries; overflow reproduced in the current narrow embedded view (below the 768px CSS breakpoint). **Source-reviewed:** filters and pagination. Exact 390×844, 768×1024, 1440×900, and 1920×1080 verification not available. |

### 2. Guilds

| Category | Finding |
|---|---|
| Current condition | `/guilds` rendered the command header, discovery tab, search, rank selector, create action, and the API-backed empty state. The settled response showed `0 guilds found` and “No Guilds Available”; no guild records were displayed. |
| Problems | No visual defect was reproduced in the available view. Discovery and empty/error/loading handling are comparatively explicit. The component is large and includes discovery, membership, invitations, roster, cooperative quests, achievements, and dialogs in one page, increasing future change risk. Two `.guilds-grid` rules exist: the earlier 320px minimum is overridden by the later discovery-specific 270px/min(100%,…) rule. Focus rules are also repeated at lines 980-987 and 1336-1342. These are maintainability risks, not confirmed runtime failures. |
| Root cause | One page owns many management areas (`Guilds.tsx:59-99` onward). Duplicate/overridden grid rules are in `Guilds.css:319-324` and `1029-1032`; overlapping focus rules are at `980-987` and `1336-1342`. |
| Severity | Low (maintainability); no reproduced functional defect. |
| Proposed fix | Preserve the current discovery behavior. During future cleanup, consolidate the CSS overrides and keep discovery concerns isolated from management state. Continue using the existing service and SCDS components. |
| Verification | **Live-verified:** route, loading-to-empty transition, search/filter controls, and empty state rendered. The actual page displayed no guild records. **Source-reviewed:** responsive grid, retry/error handling, and management flows. Join/create/invitation/member/quest interactions were not exercised. Exact requested viewport sizes not available. |

### 3. Promotion Trials

| Category | Finding |
|---|---|
| Current condition | `/promotion` showed the current rank/progress card and five trial cards. In the live session, trials were locked by actual eligibility/level requirements. The list is a single column below 768px and a two-column grid at/above 768px. |
| Problems | **Medium:** a failed or empty trial refresh has no page-level loading, error, or empty presentation; the context catches/logs failures and leaves the list empty. **Medium:** available trial cards advertise `role="button"` and a tab stop but have no Enter/Space handler; the actual Attempt Trial button is nested inside that button-like `div`. **Low:** the detail close button is absolutely positioned while the detail panel has no `position: relative`, so it can anchor outside the panel depending on ancestor positioning. |
| Root cause | `ProgressionContext.tsx:533-551` silently returns for non-OK responses and logs network failures. `PromotionTrials.tsx:121-193` puts an interactive button inside a clickable `div role="button"` but only wires pointer click on the parent. `.promotion-detail-close` is absolute and `.promotion-trial-detail` does not establish a positioning context (`PromotionTrials.css:286-305`). |
| Severity | Medium for keyboard access and silent data failure; Low for close-button positioning. |
| Proposed fix | Add explicit context/page loading and error state with retry; use one semantic button per action or make the card noninteractive and keep the action button; add an explicit `position: relative` to the detail panel and verify the close control. |
| Verification | **Live-verified:** route and locked-trial list rendered with current progression data. **Source-reviewed:** status, requirements, editor, and submission state. No eligible trial was available to test attempt/editor actions. Exact requested viewport sizes not available. |

### 4. Skill Tree

| Category | Finding |
|---|---|
| Current condition | `/skills` showed summary metrics and a vertically tiered set of nodes. The first three tiers each contain one skill, so the tree occupies substantial vertical space before the multi-node tiers. |
| Problems | **Medium:** the UI is strongly vertical and the requested connection lines do not render. CSS defines `.skill-tree-svg` and connectors, but the component renders only the node rows and no SVG connector layer. This weakens dependency hierarchy and extends scrolling. **Low:** page state has no explicit loading/error/empty view; the skill list comes from progression context and can render as an empty tree if unavailable. |
| Root cause | `SkillTree.tsx:20-34` explicitly builds eight vertical rows; JSX at `70-123` renders rows but no SVG. CSS sets column layout and 32px tier gaps (`SkillTree.css:107-123`) and clips content at the container (`63-70`). `refreshSkills` silently returns/logs errors (`ProgressionContext.tsx:513-531`). |
| Severity | Medium for absent connectors/vertical hierarchy; Low for missing state feedback. |
| Proposed fix | Render dependency connectors from the same row/node layout data or remove unused connector styling. Rebalance tiers into a more compact responsive map while retaining a clear scroll strategy. Surface context loading/error status rather than presenting a blank tree. |
| Verification | **Live-verified:** page and actual unlocked/in-progress/locked nodes rendered. The vertical tier structure was visible. **Source-reviewed:** keyboard activation, lock reasons, progress, and detail panel. Exact viewport sizes not available. |

### 5. Achievements

| Category | Finding |
|---|---|
| Current condition | `/achievements` loaded server-backed achievement and title data after a brief “Syncing progression…” phase. Settled data showed 10 of 22 achievements, 12 titles, progress/status filters, and locked/in-progress/unlocked records. The current live cards use emoji glyphs. |
| Problems | **Medium:** failed requests are indistinguishable from a genuine empty result: `fetchAchievements` logs exceptions, silently ignores non-OK responses, then clears loading; the page renders “No achievements match your filters.” **Medium:** initial stats default to 20 achievements and one title, while the settled API data showed 22 and 12; the page renders these defaults during the fetch, producing a transient mismatch. **Low:** category icons and achievement icons are emoji strings, with lock emoji for locked cards, so they do not follow the shared Lucide/SCDS icon convention. |
| Root cause | `Achievements.tsx:40-53,56-81` initializes placeholder stats and has no request error state. The empty branch is shared for genuine zero results and failed loads (`393-399`). Category strings are emoji (`15-22`); card icon renders `ach.icon` or `🔒` (`415-424`). |
| Severity | Medium for error/initial-data accuracy; Low for icon consistency. |
| Proposed fix | Add explicit loading/error/empty states and a retry path; avoid presenting default totals as authoritative before API success. Map achievement categories/status to Lucide icons while preserving any data-driven icon contract through a safe icon mapping. |
| Verification | **Live-verified:** route, transient sync presentation, settled API data, titles, filters, and achievement records. **Source-reviewed:** claim and equip handlers; no claim/equip mutation was performed. Exact viewport sizes not available. |

### 6. Seasons

| Category | Finding |
|---|---|
| Current condition | `/seasons` displayed the active “Season 1: Monarch Awakening” archive entry, status, date range, participant count, personal season stats, and a season standings area. Layout changes from a two-column list/detail at wide widths to a stacked layout below 960px; stat cards reduce to two columns below 640px. |
| Problems | **Medium:** selecting a different season while a details request is pending can allow the earlier response to overwrite the currently selected season’s details. **Low:** request loading/errors are communicated with text/alert, but detail loading has no dedicated skeleton and selected detail is cleared only after the request fails or when selection becomes null. The response shape is locally declared in the page rather than shared with a typed service. |
| Root cause | `fetchDetails` sets `details` from any response without checking the active season (`Seasons.tsx:98-111`); the selection effect launches it without abort/stale protection (`117-123`). Types are declared inline (`6-51`). |
| Severity | Medium for stale cross-season content; Low for loading/contract maintainability. |
| Proposed fix | Cancel or ignore obsolete detail requests and bind displayed details to the selected season ID. Add an explicit detail loading state. In a later service layer, share validated season response types without changing the API contract. |
| Verification | **Live-verified:** route, actual active season, archive list, and detail fields rendered. **Source-reviewed:** standings, reward eligibility, claim refresh, and error handling. Rapid season switching and reward claims were not tested. Exact viewport sizes not available. |

## Severity-ranked issue list

1. **High — Leaderboard podium clipping:** long usernames visibly escape podium cards in the current narrow browser view (`Leaderboard.tsx:281-305`; `Leaderboard.css:96-102,337-352`).
2. **High — Leaderboard table clipping:** table wrapper hides overflow instead of allowing narrow-screen access to all columns (`Leaderboard.css:127-136`).
3. **Medium — Leaderboard can misrepresent mock rows as server rankings:** mock fallback is used whenever server data is absent, including request failure (`Leaderboard.tsx:56-73,82-128`).
4. **Medium — Achievement request failure appears as empty/filter-mismatch state; pre-fetch totals are stale defaults** (`Achievements.tsx:40-81,393-399`).
5. **Medium — Season detail requests can race when switching seasons** (`Seasons.tsx:98-123`).
6. **Medium — Promotion Trial available card lacks keyboard activation and nests an action button inside a button-like parent** (`PromotionTrials.tsx:129-193`).
7. **Medium — Skill Tree connector layer is styled but never rendered; tiers are mostly single-node vertical rows** (`SkillTree.tsx:20-34,70-123`; `SkillTree.css:63-123`).
8. **Medium — Promotion Trial fetch failures/empty response have no explicit UI state** (`ProgressionContext.tsx:533-551`).
9. **Low — Achievement/category icon presentation uses emoji rather than the shared icon system** (`Achievements.tsx:15-22,415-424`).
10. **Low — Duplicate/overridden Guilds discovery and focus CSS rules increase maintenance risk** (`Guilds.css:319-324,980-987,1029-1032,1336-1342`).

## Recommended implementation order

1. Correct Leaderboard overflow and make its table usable at narrow widths.
2. Add truthful Leaderboard and Achievements request states; remove misleading data fallbacks/defaults from the visible loading/error path.
3. Fix Promotion Trial keyboard semantics and provide data-loading/error feedback.
4. Add stale-request protection and loading indication to Season details.
5. Render or remove the unused Skill Tree connector layer and improve tier density responsively.
6. Align Achievement icons with SCDS/Lucide and consolidate Guilds CSS overrides.
7. Repeat browser inspection at the four exact target viewport sizes and exercise stateful actions with safe test data.

## Backend handoff

- No missing backend endpoint or required response field was proven by this frontend audit. Existing frontend code expects `/api/leaderboard`, `/api/achievements`, `/api/skills`, `/api/promotion/trials`, and `/api/seasons` plus `/api/seasons/:id`; current route data was observed for each relevant page through the running app.
- Do not add backend fields to address the confirmed defects. The Leaderboard and Achievements concerns are frontend error/loading/fallback behavior; the Season concern is frontend request freshness.
- Achievement icon data is typed as a string (`src/types/index.ts:106-121`); if the backend intends those strings to be icon identifiers rather than display glyphs, document that contract before changing presentation. Do not assume this from the current UI alone.
- Reward display is already conditional on the Season response’s `canClaimReward` and `claimableReward` fields (`Seasons.tsx:46-50,238-248`); the audit did not claim rewards or verify the claim mutation.

## Verification and limitations

- **Repository:** root `C:\Users\muthu\OneDrive\Desktop\Solo-Leveling`; branch `main`, ahead of `origin/main` by one commit before adding this report. The initial worktree was clean.
- **Frontend:** the in-app browser opened all six routes on the already-running app at `http://[::1]:5173`. API-backed content loaded on the observed pages. The browser was used for rendered-page inspection; no application interactions that mutate data were performed.
- **Ports/HTTP tooling:** shell listener and HTTP checks were blocked by the restricted socket permissions. The browser itself loaded the existing Vite app and visible API-backed data, so this is not evidence of an application connectivity defect.
- **Viewport sizes:** the browser surface did not expose a viewport-resize control. The six pages were inspected in its current narrow view only; the exact 390×844, 768×1024, 1440×900, and 1920×1080 layouts remain unverified. No screenshot files were saved; screenshots were observed inline during browser inspection.
- **TypeScript:** `npx tsc --noEmit` passed.
- **Build:** `npm run build` passed. It emitted existing bundler warnings about module-level `"use client"` directives and a minified chunk larger than 500 kB.
- **Backend tests:** not run. `npm run test:all` starts a backend on fixed port 3001 and cleans its test database; with the existing application/backend active, running it risks a port collision and would no longer be a read-only audit check.
- **Changes:** only this audit report is intended to be created. No app, backend, API, or test source was modified.
