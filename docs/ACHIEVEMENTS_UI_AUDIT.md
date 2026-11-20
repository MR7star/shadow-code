# Achievements UI Audit

**Date:** 2026-11-19  
**Scope:** Read-only audit of the Achievements frontend. No application source, API contract, backend code, tests, or global audit report was modified. Browser inspection was unavailable in this session; source findings are identified separately from prior browser observations in the global audit.

## Executive summary

The Achievements route is implemented in one page component with page-specific CSS. It fetches achievement records, category summaries, statistics, titles, and the equipped title from the authenticated `GET /api/achievements` endpoint. The same component also handles title equip/unequip and achievement reward claims through direct fetch calls.

Three issues from the global audit are confirmed in the current source:

1. The page conflates request failure with an empty result. Non-success HTTP responses are ignored; network errors are only logged; `loading` is cleared in either case, after which the page can show “No achievements match your filters.” There is no retry action or visible error state.
2. Statistics begin with placeholder values (`20` total achievements and `1` unlocked title) and are rendered before the request completes. The prior global audit recorded a live response with 22 achievements and 12 titles, so the initial figures can contradict the loaded figures.
3. Category, achievement, state, title, and reward iconography uses emoji or Unicode glyphs. The project already includes `lucide-react` and shared SCDS components, but the achievement payload exposes an arbitrary `icon: string`, not a stable icon key.

The page contains responsive CSS for its hero, title cards, category tabs, and achievement grid. No current-session browser inspection could be completed because the available browser surface reported that local browser access is unavailable. Therefore, layout, contrast, keyboard behavior, focus visibility, and screen-reader announcements are source-reviewed only in this audit.

## Architecture and relevant files

| File | Role |
|---|---|
| `src/App.tsx` | Registers `/achievements` and renders the page in the application shell. |
| `src/pages/Achievements.tsx` | Fetches data, stores page state, filters achievements, renders overview/titles/cards, and handles equip, unequip, and claim actions. |
| `src/pages/Achievements.css` | Page-specific layout, card states, filters, progress styling, and a mobile breakpoint. |
| `src/types/index.ts` | Defines `Achievement`, category summary, statistics, user title, and response types. |
| `src/components/ui/index.tsx` | Existing shared SCDS primitives, including Button, EmptyState, ErrorState, LoadingState, ProgressBar, Toast, and StatusBadge. |
| `src/components/ui/ui.css` | Shared component presentation and focus/accessibility styles. |
| `src/styles/tokens.css` | SCDS token definitions; imported through `src/index.css`. |
| `src/index.css` | Imports tokens and defines application design variables. |
| `server/runner.mjs` | Read-only contract reference for achievement endpoints. `GET /api/achievements` requires a bearer session and returns `checkAndUnlockAchievements(session.id)`. |
| `server/achievements.mjs` | Read-only source of achievement catalog identifiers, meanings, emoji, and response construction. |
| `tests/backend_achievements.test.mjs` | Existing backend achievement tests. No dedicated frontend test suite or achievement component tests were found. |

There is no `src/services/achievementApi.ts`; the page uses direct `fetch` calls. The response type `AchievementsResponse` contains `achievements`, `categories`, `stats`, `titles`, `equippedTitle`, and `newlyUnlocked`. Each achievement contains an `icon: string`; category is optional and typed as a generic string on `Achievement`.

## Current request lifecycle and API state findings

### Loading

`Achievements.tsx:51` initializes `loading` to `true`. On an authenticated mount, `fetchAchievements` sets it to true and sends `GET /api/achievements` with `Authorization: Bearer <token>`. The grid renders “Loading hunter achievements…” while pending. The message is a plain `div`; it has no `role="status"`, `aria-live`, or `aria-busy` attribute. Hero totals and title content remain visible during this loading state, using initial values.

If the user is unauthenticated, the effect sets `loading` to false without fetching. The component then renders its ordinary empty/default presentation; it does not expose a dedicated authentication-required state. The `/achievements` route is registered in `App.tsx`; the page itself relies on `useAuth` rather than enforcing an explicit local auth state.

### Successful response with data

On `res.ok`, JSON is cast to `AchievementsResponse`; arrays are copied with `|| []`, and `stats`, `titles`, and `equippedTitle` are only updated when their fields are truthy. Successful populated data feeds the hero, category counts, status counts, title section, progress, and achievement cards.

The overall stats come from `data.stats`; per-category counts come from `data.categories`; status-filter counts derive from the `achievements` array. The card progress uses API `progress`, `target`, and optionally `progressPercent`, with a locally calculated percentage as fallback. No schema validation is performed after parsing.

### Successful response without matching records

When filtering yields no records, the grid renders “No achievements match your filters.” This is a reasonable filtered-results message, but it is also the only non-loading grid outcome for an empty list. It does not distinguish a genuinely empty successful catalog from a filter that excludes all records.

### HTTP or network failure

At `Achievements.tsx:68-79`, the component updates state only when `res.ok` is true. A non-2xx response has no `else` branch, so no error is recorded. A rejected fetch is caught and logged with `console.warn`, but no visible error is stored. `finally` clears `loading` in both paths. With the initial empty achievement array, the grid then displays “No achievements match your filters.” This is the exact failure-to-empty path. No retry control exists.

### Retry, cancellation, and stale requests

There is no retry UI or refresh control for the achievement collection. `fetchAchievements` has no `AbortSignal`, request-generation guard, or unmount cancellation. The effect can run again if authentication or token state changes; the component does not protect against an older response winning a race with a newer request.

### Mutation path (source reviewed only)

Title equip and unequip requests are direct authenticated POST requests. Achievement claims POST to `/api/achievements/:id/claim`. On a successful claim the page calls `fetchAchievements()` and `refreshProgress()`. These mutation flows were not exercised. The claim button visibility is inferred client-side from `!isUnlocked && progress >= target`; the backend remains authoritative when the claim endpoint accepts or rejects it.

### Backend contract note

In `server/runner.mjs:1224-1232`, the authenticated GET handler invokes `checkAndUnlockAchievements(session.id)` and returns its result. This is a confirmed read-triggered evaluation/update behavior; the endpoint is not strictly read-only. The current response does not expose a separate explicit `claimable` field in the frontend type. The frontend uses progress/unlocked fields for the button and relies on the claim POST for authoritative eligibility. Any change to this behavior or response contract belongs to a separate backend phase and is outside this audit.

## Placeholder and loaded-statistics findings

| Display | Current source | Finding |
|---|---|---|
| Total achievements | `stats.total` starts at 20 (`Achievements.tsx:40-46`) and later uses API stats if present. | Placeholder is visible during initial loading. The prior global audit observed 22 from the API. |
| Unlocked count | Starts at 0 and is displayed beside the placeholder total. | May show `0 / 20` while actual loaded data is pending. |
| Overall completion | Starts at 0%; width and label are displayed immediately. | Placeholder completion is visually indistinguishable from a real zero-progress response. |
| XP earned | Starts at 0 and appears as `+0`. | Placeholder appears authoritative during loading. |
| Titles unlocked | `titlesUnlockedCount` starts at 1; hero shows `titles.length || stats.titlesUnlockedCount`. | The `||` fallback means a valid loaded empty titles array can still display the stats count, potentially disagreeing with “0 Owned” in the titles section. |
| Category totals | `categories` starts empty; category labels are blank until matching summaries arrive. | Avoids fabricated category counts, but may create an initially incomplete filter row. |
| Status filter counts | Calculated from `achievements`, initially an empty array. | Displays zero counts while the initial request is pending. |
| Card progress | Derived from returned `progress`, `target`, and `progressPercent`. | Uses API data where available; fallback target is 1 and fallback percentage is calculated locally. |

The reported catalog contains 22 definitions in `server/achievements.mjs`; the page's initial value of 20 is not based on the frontend response. Prefer withholding these values until the first successful response or deriving counts from confirmed API data in a future implementation. Do not replace the API catalog with a frontend hardcoded count.

## Emoji and Lucide mapping recommendations

The mapping below preserves the current icon's concept. These are implementation recommendations only; no icons were changed. Use explicit Lucide imports or a typed semantic mapping in a later frontend phase. Keep the server's current icon string contract intact unless a separately approved API migration is made. For backend-provided emoji, a frontend map keyed by known achievement IDs is safer than trying to parse arbitrary glyph strings.

### Category navigation icons (`Achievements.tsx:15-22`)

| Current icon | Meaning | Suggested Lucide icon | Accessibility treatment |
|---|---|---|---|
| ✨ All | Collection / all achievements | `Sparkles` | Decorative; category button text already names the target. |
| 💻 Programming | Coding | `Code2` | Decorative; button label supplies meaning. |
| ⚡ Progression | Advancement / energy | `Zap` | Decorative. |
| 🏰 Exploration | Dungeon exploration | `Castle` | Decorative. |
| 🔥 Consistency | Streak / persistence | `Flame` | Decorative. |
| 🌟 Mastery | Excellence / mastery | `Star` | Decorative. |

### Individual achievement catalog icons (`server/achievements.mjs`)

| Achievement ID and name | Current icon | Semantic meaning | Suggested Lucide icon |
|---|---:|---|---|
| `ach_first_spell` — First Spell | 🪄 | First programming accomplishment / spell | `WandSparkles` |
| `ach_code_weaver` — Code Weaver | 📜 | Crafted code / script | `ScrollText` |
| `ach_tenacious_coder` — Tenacious Coder | ⚡ | Repeated challenge mastery / energy | `Zap` |
| `ach_concept_master` — Deep Understanding | 🧠 | Concept mastery | `Brain` |
| `ach_omni_caster` — Omni-Caster | 🔮 | Broad conceptual capability / magic | `Orbit` or `Sparkles` |
| `ach_level_5` — Awakened Hunter | 🌱 | Growth / awakening | `Sprout` |
| `ach_level_10` — Vanguard of Shadows | 🛡️ | Defense / vanguard | `Shield` |
| `ach_rank_d` — Breaking the Mold | 🗡️ | Rank breakthrough / blade | `Sword` |
| `ach_rank_c` — Ascending Shadows | ⚔️ | Advancement / combat | `Swords` |
| `ach_gate_explorer` — Into the Shadows | ⛩️ | Entering a dungeon gate | `DoorOpen` |
| `ach_first_boss` — Giant Slayer | 💀 | Boss defeat | `Skull` |
| `ach_awakening_gate` — Master of the First Gate | 🏰 | Dungeon clear | `Castle` |
| `ach_dungeon_master` — Dungeon Dominator | 👑 | Mastery over multiple dungeons | `Crown` |
| `ach_streak_3` — Unyielding Will | 🔥 | Learning streak | `Flame` |
| `ach_streak_7` — Iron Discipline | ⚡ | Sustained discipline | `Zap` |
| `ach_daily_bounty` — Hunter's Bounty | 🎁 | Claimed daily reward | `Gift` |
| `ach_first_skill` — The Spark | 🌟 | First skill unlocked | `Sparkles` |
| `ach_skill_collector` — Arsenal Expansion | 🗝️ | Skill collection | `KeyRound` |
| `ach_promotion_trial` — Tested in Combat | 🏆 | Trial victory | `Trophy` |
| `ach_grandmaster` — Grandmaster of Code | 👑 | Top mastery | `Crown` |
| `ach_tourn_contender` — Arena Contender | ⚔️ | Tournament entry | `Swords` |
| `ach_tourn_champion` — Tournament Champion | 🏆 | Tournament victory | `Trophy` |

### Other glyphs in page UI

| Use | Current glyph | Suggested icon | Accessibility treatment |
|---|---:|---|---|
| Feedback toast | ⚡ | `Zap` | Decorative; toast text announces the event. |
| Hero | 🎖️ | `Medal` | Decorative; heading names the collection. |
| Hunter Titles heading | 🏷️ | `Tags` | Decorative. |
| Equipped title | ⚡ | `Zap` | Decorative; title text is present. |
| Status filter unlocked / in progress / locked | ✓ / ⏳ / 🔒 | `Check`, `Clock3`, `LockKeyhole` | Decorative because visible status text is also included. |
| Locked achievement card | 🔒 | `LockKeyhole` | Decorative if card status text remains present; otherwise label the icon explicitly. |
| XP reward | ⭐ | `Star` or `Sparkles` | Decorative; `+N XP` is the accessible content. |
| Title reward | 🏷️ | `Tags` | Decorative; “Title” and title name are present. |
| Equipped action | ✓ | `Check` | Decorative next to “Equipped.” |

Lucide SVGs used only to decorate adjacent text should have `aria-hidden="true"` and should not receive redundant accessible labels. If an icon becomes the only identifier for an action or state, provide an accessible name. Keep visible status text in addition to color and icons.

## Visual and accessibility findings

### Source-reviewed findings

- **Icon consistency:** Emoji glyphs are stored in the category constant and backend catalog, and rendered in the hero, toast, title area, title badge, filters, achievement cards, and reward chips. Visual weight and alignment can vary by OS/font because emoji glyph dimensions are platform-dependent.
- **Hierarchy and spacing:** The page has clear hero, titles, filters, and card-grid sections. CSS uses the established dark palette, rarity colors, spacing, radii, and shadows. Existing CSS is page-specific rather than built from SCDS Panel/StatCard/ProgressBar primitives.
- **Responsive behavior:** The achievement grid changes to one column at `max-width: 768px`; hero padding shrinks; hero sections stack; category tabs use contained horizontal scrolling. Title grid uses `minmax(260px, 1fr)` and wraps. This is source evidence, not proof of layout at any viewport.
- **Loading/error feedback:** Loading is plain text in the card grid and is not announced with a live status role. There is no visible error state or retry. The SCDS `LoadingState`, `ErrorState`, `EmptyState`, `Button`, and `ProgressBar` are available for future reuse.
- **Filters:** Category and status controls are real `<button>` elements, so they are keyboard activatable. Their selected state is conveyed by CSS class only; there is no `aria-pressed` or tablist/selected-state semantics. The horizontally scrollable category strip should be checked for focus visibility and keyboard scrolling.
- **Focus:** No page-local `:focus-visible` selector was found in `Achievements.css`. Shared CSS may supply global focus styling; this was not confirmed in a live browser or assistive technology. Verify that focus is visible on category/status, equip/reset, and claim buttons.
- **Progress semantics:** Overall and card progress are styled nested `div`s without `role="progressbar"` or accessible min/max/current values. Text percentages and `progress / target` are also present, but they do not make the visual bar itself a semantic progress indicator.
- **Contrast and state distinction:** Locked cards use `opacity: .72`, reducing all content contrast; the locked label and progress text remain visible in source, but contrast ratios were not measured. Ensure locked/unlocked differences do not rely only on color/opacity.
- **Button behavior:** Equip/reset and claim actions are native buttons. Claim has no visible pending state or duplicate-submission guard in the page handler, unlike title equipping; this is a source-level interaction concern for a later reliability phase, not a change made here.
- **Reduced motion:** Page and child classes use fade/stagger/transition animations. No Achievements-specific `prefers-reduced-motion` rule was found. Global reduced-motion behavior was not inspected in a running browser.

## Severity-ranked recommendations

| Severity | Finding | Evidence | Recommendation |
|---|---|---|---|
| High | Request failures appear as empty achievements and have no retry. | `Achievements.tsx:56-81,393-399` | Introduce explicit loading/success/empty/error states; branch on non-OK HTTP status; surface error text and retry with the same authenticated request. Preserve actual empty results separately from failures. |
| Medium | Placeholder totals/progress are rendered during loading and title count fallback can disagree after success. | `Achievements.tsx:40-46,226-257,501-503` | Avoid authoritative-looking default stats before success. Use API statistics only when loaded and treat a returned empty titles array as zero rather than falling back through truthiness. |
| Medium | Request lifecycle lacks cancellation/stale-response protection. | `Achievements.tsx:56-89` | Future implementation should cancel the previous GET on token changes/unmount or guard updates with a request generation. Ignore aborts as non-errors. |
| Medium | Loading and progress controls have incomplete announcement semantics. | `Achievements.tsx:393-398,249-259,458-477` | Add status semantics to loading; use accessible progressbar semantics or the existing SCDS `ProgressBar`; ensure informative labels. |
| Low | Emoji and Unicode glyphs are inconsistent with the existing Lucide convention. | `Achievements.tsx:15-21,201-217,268-269,315,374-388,423,483-488`; backend catalog | Apply the semantic map in this report while retaining backend response compatibility; mark decorative icons hidden from assistive technology. |
| Low | Selected filter state is conveyed visually but not explicitly to assistive technology. | `Achievements.tsx:346-390` | Add `aria-pressed` to toggle-style buttons or implement a correctly semantic tab interface; preserve native keyboard behavior and visible focus. |
| Low | Locked card opacity may make text difficult to read. | `Achievements.css` locked-state rule | Measure contrast on actual rendered colors and reduce opacity only if necessary; keep state labels/text explicit. |
| Low | Motion preferences and mutation pending states need verification. | `Achievements.css`; `Achievements.tsx:159-180,492-499` | Respect reduced-motion preferences and provide duplicate-claim protection/feedback in a future frontend reliability phase. |

## Proposed implementation order

1. Add explicit collection request states and distinct loading, success-empty, populated, and error/retry rendering. Handle missing token/auth readiness as its own state where the auth context exposes readiness.
2. Remove initial placeholder totals; render statistics only from successful API data, and resolve empty-title count semantics from the confirmed response.
3. Add request cancellation or stale-response protection and verify refresh after claims does not race with a newer request.
4. Replace emoji using the semantic category/achievement mapping; keep backend icon strings compatible and provide decorative/accessible treatment consistently.
5. Improve screen-reader semantics for filters, progress bars, loading announcements, and action pending states.
6. Inspect at mobile, tablet, and desktop sizes; test keyboard focus, contrast, reduced motion, and loaded/empty/error states with real API data or existing supported test mechanisms.

## Backend handoff requirements

Confirmed behavior: the authenticated `GET /api/achievements` route calls `checkAndUnlockAchievements`, so the read endpoint can evaluate and update achievement state. The GET response is returned directly from that function. The frontend response type has no separate explicit `claimable` field and the page infers claim visibility from progress and unlock state.

For a future backend phase, review whether GET should remain state-mutating or whether achievement evaluation should occur through an explicit progression/event operation. Consider returning authoritative claimability if the product needs it. Keep any changes separately reviewed because they change backend behavior or the response contract; neither is required for the frontend audit document itself.

No other backend contract changes are recommended from this audit. Do not add response fields or alter current progression/reward behavior as part of the frontend implementation phase without a separate approval.

## Browser verification and limitations

- **Current-session browser attempt:** Not completed. The available CUA surface returned `Browsers: Error: Local browser access is unavailable for this chat`; there was no browser tab to inspect. No screenshots were captured.
- **Prior observation recorded in `docs/GLOBAL_UI_QUALITY_AUDIT.md`:** That report records the Achievements page rendering against live data, a brief “Syncing progression…” phase, 10/22 unlocked-count presentation, 12 titles, category/status filters, and achievement cards with emoji. This is a prior audit observation, not a fresh browser verification in this phase.
- **Unverified visually in this phase:** current page hierarchy, card alignment, mobile behavior, text clipping, icon sizing, contrast, keyboard/focus behavior, empty/error presentation, reduced motion, and screen-reader announcements.
- **Automated verification:** No tests or builds were run; this is an inspection-only phase. Existing backend achievement tests were identified but not run, since no backend behavior was changed and the deliverable is an audit report.

## Files inspected and created

**Inspected:** `src/pages/Achievements.tsx`, `src/pages/Achievements.css`, `src/types/index.ts`, `src/App.tsx`, `src/components/ui/index.tsx`, `src/components/ui/ui.css`, `src/styles/tokens.css`, `src/index.css`, `server/runner.mjs`, `server/achievements.mjs`, `tests/backend_achievements.test.mjs`, `package.json`, and `docs/GLOBAL_UI_QUALITY_AUDIT.md`.

**Created:** `docs/ACHIEVEMENTS_UI_AUDIT.md`.

**Not modified:** application source, backend files, tests, API contracts, and `docs/GLOBAL_UI_QUALITY_AUDIT.md`.
