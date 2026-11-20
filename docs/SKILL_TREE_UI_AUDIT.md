# Phase 3.5A — Skill Tree UI and Architecture Audit

**Date:** 2026-11-19
**Scope:** Read-only audit. No application source, backend source, API contract, database file, or existing audit report was changed.

## Executive summary

The Skill Tree route renders a fixed list of skill nodes from `ProgressionContext`. Prerequisite relationships are separate from visual ordering: authenticated prerequisite state is computed from the backend `SKILL_PREREQS` map and returned by `GET /api/skills`; guest preview relationships come from `defaultSkills` in `src/data/mockData.ts`. The page groups records into eight hard-coded rows and does not use each skill's `position` field.

The global audit's two findings are confirmed. `SkillTree.css` contains SVG connector styles, but `SkillTree.tsx` renders no SVG or connector elements. The eight row groups and column-based CSS make the page tall and leave much of the tree as single-node tiers. Additional high-impact integration issues are present: authenticated startup does not load `skillStates` from `/api/skills`, while invoking `refreshSkills` replaces the fully described client skill records with API records that omit `name`, `description`, `icon`, and `category`. Subsequent node/detail rendering can therefore become blank or throw on `selectedSkill.category.replace(...)`.

This report distinguishes source-confirmed findings from browser observations. No browser observation was possible because the local frontend and backend ports had no listeners.

## Architecture and data flow

| Area | Source | Behavior |
|---|---|---|
| Route | `src/App.tsx:31-38` | `/skills` renders `SkillTree` inside the application layout. |
| Page | `src/pages/SkillTree.tsx:6-251` | Reads `skillStates` and `refreshSkills` from progression context, groups known IDs into rows, renders nodes and an inline detail panel. |
| Layout data | `src/types/index.ts:74-83` | `Skill` includes display metadata, `prerequisiteIds`, and a `{x,y}` position. The page does not use `position`. |
| Enriched state | `src/types/index.ts:184-190` | `SkillWithState` extends the full `Skill` and adds state/unlock metadata. |
| Guest state | `src/context/ProgressionContext.tsx:135-174`; `src/data/mockData.ts:270-431` | `createPreviewData()` builds `skillStates` from static preview skills and their prerequisite IDs. This is intentional guest preview data. |
| Authenticated state | `src/context/ProgressionContext.tsx:343-351` | On authentication, the provider calls `refreshProgress()`, but that function updates `data.skills`, not `data.skillStates`; it does not call `refreshSkills()`. |
| Skills endpoint | `server/runner.mjs:868-928` | Authenticated `GET /api/skills` returns `{ skills }` with `id`, `level`, `maxLevel`, `state`, `unlockReason`, `conceptId`, `conceptMasteryLevel`, and `prerequisiteIds`. It does not return the page's display metadata or `position`. |
| Backend prerequisite source | `server/db.mjs:471-484` | `SKILL_PREREQS` is used to compute live prerequisite status; the endpoint returns these prerequisite IDs. The map comments that it matches the client definition, so guest mock data is a duplicate preview definition. |
| Context request | `src/context/ProgressionContext.tsx:533-550` | `refreshSkills()` calls `/api/skills` with the bearer token and assigns `backendData.skills || []` directly to `skillStates`. It has no request state, response validation, cancellation, or user-facing error. |

## Confirmed findings

### 1. Connector rendering — Medium

- CSS defines `.skill-tree-svg`, `.skill-connector`, and `.skill-connector.active` at `src/pages/SkillTree.css:83-104`.
- The tree JSX at `src/pages/SkillTree.tsx:71-123` renders only `.skill-tree-nodes`, `.skill-tree-row`, and `.skill-node`; there is no `<svg>`, `<line>`, `<path>`, or connector component.
- Prerequisite IDs are available on the skill records and are shown textually in the detail panel (`SkillTree.tsx:171-188`). No connector data is derived from them.
- The mock `Skill.position` is defined in `src/types/index.ts:74-83` and populated in `mockData.ts:280-428`, but the page does not read it. The live endpoint does not return `position`.
- Current flex rows wrap and use percentage-independent alignment. A connector layer based only on mock positions would not align reliably with the rendered row layout, especially after wrapping or resize. The container also has `overflow: hidden` (`SkillTree.css:63-70`), which may clip overlay details/connectors.

### 2. Vertical layout and row membership — Medium

- `SkillTree.tsx:20-34` hard-codes eight rows, including several rows containing only one skill. The component filters a fixed set of IDs into those groups; backend records not included in the lists would not render.
- `SkillTree.css:107-132` stacks rows in a column with a 32px tier gap. The tree container uses 40px vertical padding and a 600px minimum height (`63-70`). The page has no compact map or internal tree-scroll strategy; the document grows vertically.
- `position` coordinates in mock records do not affect layout. The page therefore has two layout descriptions (mock positions and fixed row groups), only one of which is used.
- Node names are limited to `max-width: 90px` (`SkillTree.css:197-204`). They can wrap, but the narrow width creates tall labels for long names such as “Dynamic Programming.” No line clamp is present.
- Rows allow wrapping (`SkillTree.css:116-122`), but node dimensions and gaps are not tied to viewport width. Exact overflow and clipping behavior is source-reviewed, not browser-reproduced.

### 3. Authenticated data lifecycle and response mismatch — High

- Provider state starts from `createPreviewData()` (`ProgressionContext.tsx:196` and `135-174`). The authentication effect at `343-351` invokes `refreshProgress()` only; no `refreshSkills()` call occurs on initial authenticated entry.
- Consequently, the Skill Tree can initially show preview skill levels/states for an authenticated player. This is not the user's persisted skill state.
- `GET /api/skills` returns a compact state record and omits `name`, `description`, `icon`, `category`, and `position` (`server/runner.mjs:884-925`).
- `refreshSkills()` replaces the complete `SkillWithState[]` with this compact response (`ProgressionContext.tsx:533-550`), although the TypeScript context advertises `SkillWithState[]` and `SkillWithState` extends the full `Skill` interface.
- The page subsequently reads omitted fields (`SkillTree.tsx:95-98`, `137-150`, and `181-184`). In particular, selecting a refreshed node can evaluate `selectedSkill.category.replace(...)` when `category` is absent and throw. This is a source-confirmed contract/type mismatch; no runtime browser reproduction was possible.
- The `Start Learning` action calls `refreshSkills()` and immediately closes the panel (`SkillTree.tsx:225-237`). It does not itself submit a learning mutation. The response can then replace all records with the compact shape.
- `refreshSkills()` silently returns on non-OK responses and logs network errors, so the page has no visible loading, failure, empty, or retry state (`ProgressionContext.tsx:533-550`).

### 4. Node state styling mismatch — Medium

- `SkillWithState['state']` is `locked | available | in-progress | mastered` (`src/types/index.ts:182-190`).
- JSX uses the actual state as a class (`SkillTree.tsx:78-80`). CSS styles `.locked`, `.unlocked`, and `.mastered` (`SkillTree.css:138-190`), but there are no `.available` or `.in-progress` styles. The `.unlocked` styles therefore do not match the actual state names returned by either preview or backend data. Available and in-progress rings lack their intended state-specific treatment.

### 5. Mouse selection and detail-panel lifecycle — High

- The node's `onMouseEnter` selects it (`SkillTree.tsx:82`), its click handler toggles the same selected ID (`81`), and `onMouseLeave` clears it when selected (`83`).
- Source-derived event sequence: hover selects and opens the detail panel; clicking the already-hovered node can toggle the selection off; moving the pointer away also clears it. This couples details to hover and may prevent a user from moving from a node to the detail panel before it disappears. This behavior was not runtime-reproduced.

### 6. Keyboard, focus, and state communication — High/Medium

- Nodes are `div role="button" tabIndex={0}` with custom Enter/Space handlers (`SkillTree.tsx:78-93`). Enter and Space are handled and default Space scrolling is prevented, but native buttons are not used.
- No `.skill-node:focus-visible` rule exists in `SkillTree.css`; the custom role-button nodes do not receive the shared native-button focus style. Keyboard focus is therefore not visibly specified.
- The accessible name includes skill name, state, and level (`SkillTree.tsx:92`), which is useful. However, it does not reference the visible lock-reason element with `aria-describedby`; details are only exposed after selection. There is no `aria-expanded`/`aria-controls` relationship to the detail panel.
- Locked nodes remain focusable and can open details, so they are not inert. The CSS gives them `cursor: not-allowed` (`SkillTree.css:138-144`), which conflicts with their actual detail-view action.
- Mouse hover controls selection, but no equivalent hover tooltip exists in the JSX. `.skill-tooltip` styles at `SkillTree.css:235-278` are unused.
- The progress bar is a visual `div` with an inline width and no `role="progressbar"`, label, or value attributes (`SkillTree.tsx:241-250`). If the skill array is empty, `totalMastered / skillStates.length` evaluates to `0 / 0`; the resulting `NaN%` width is invalid. Empty-data handling is not explicit.
- Emoji icons are used for summary values, node data, locked/mastered overrides, and the detail close control. Their accessible treatment is not specified (`SkillTree.tsx:45-64`, `95-97`, `131-134`).
- No Skill Tree reduced-motion override was found; node and ring transitions and page animation are defined in CSS (`SkillTree.css:5`, `124-165`, `212-219`).

## Severity-ranked recommendations

| Severity | Finding | Recommended direction |
|---|---|---|
| High | Authenticated Skill Tree initially uses preview states; refresh then replaces full records with incomplete API records. | Merge API state by ID into canonical display metadata or expose a typed API-specific model and join it to canonical skill definitions. Load authenticated skill state on entry. Confirm contract ownership before any backend changes. |
| High | Hover/click/leave share one selection state and can close the detail panel during ordinary pointer use. | Separate hover preview from explicit selection, or make the node action stable and keep details open until an explicit close/selection. |
| High | Custom role-button nodes lack visible focus styling. | Add a consistent focus-visible indicator; consider native buttons while retaining a clear locked-node detail action. |
| Medium | Connector styles are unused and row grouping is hard-coded. | Build a layout model from known skill IDs and prerequisite edges, then render connectors from measured node positions (e.g. SVG layer tied to a stable container). Keep fallback text prerequisites. |
| Medium | Tall eight-tier flex layout, unused `position`, and 90px node label width. | Consolidate tiers by dependency depth and allow branches across a responsive grid/map; preserve an intentional contained horizontal-scroll or stacked strategy on narrow widths. Use one layout source. |
| Medium | CSS state classes do not match `available` and `in-progress`. | Style the actual enum values or normalize state classes centrally. |
| Medium | No loading/error/empty handling for `/api/skills`; empty progress can yield `NaN%`. | Add explicit request state, retry, and an accessible empty state; guard the zero denominator. Do not use preview records as authenticated fallback. |
| Low | Locked cursor says “not allowed” though nodes open details; emoji and unused tooltip styles complicate consistency. | Align cursor with action, provide accessible status text/icons, and remove or implement unused tooltip styling. |

## Proposed implementation phases

1. **Data contract and state reliability:** establish a canonical full skill display catalog and safely merge the existing API's state fields by ID; load at authenticated entry and expose loading/error/empty/retry states. Do not change the API contract without backend-owner review.
2. **Interaction and accessibility:** separate hover preview from selection, provide stable detail behavior, visible focus, correct action semantics, and explicit node-to-detail relationships.
3. **Layout and dependencies:** make dependency data drive tier grouping and connector edges; render and measure connectors against the same node layout.
4. **Responsive visual refinement:** define compact tier spacing, name wrapping, narrow-screen scrolling, state styles, accessible progress semantics, and reduced-motion behavior.
5. **Verification:** test actual authenticated skill state, locked/available/mastered nodes, pointer and keyboard use, empty/error cases, resize/scroll connector alignment, and narrow-screen overflow.

## Backend dependencies and handoff

**Confirmed existing behavior:** `GET /api/skills` requires authentication, returns `{ skills }`, and calculates `state`, `unlockReason`, `conceptId`, `conceptMasteryLevel`, and `prerequisiteIds` from user mastery plus backend `SKILL_PREREQS`. The response omits display metadata (`name`, `description`, `icon`, `category`) and visual position. The route is read-only in the inspected handler. The backend map is documented as matching the client prerequisite map.

**Recommendation for backend owner:** decide whether the API should eventually provide a stable full skill catalog or whether the frontend should own display metadata and join the API state by `id`. No missing field should be assumed or fabricated in the frontend audit. If dynamic skill catalog/order is expected, define its ownership and versioning before deriving connector layout from it.

## Browser observations and verification limits

- **Source inspected:** `SkillTree.tsx`, `SkillTree.css`, `types/index.ts`, `ProgressionContext.tsx`, `mockData.ts`, `App.tsx`, `Layout.tsx`, `server/runner.mjs`, `server/db.mjs`, and the relevant section of `docs/GLOBAL_UI_QUALITY_AUDIT.md`.
- **Browser:** not inspected. A listener query found no process on ports 5173 or 3001, so the running application and live authenticated API were unavailable. The click/hover sequence and responsive clipping findings are source-derived, not browser-reproduced.
- **Automated check:** `git diff --check` passed. It emitted existing line-ending conversion warnings for unrelated modified Promotion Trials files; no whitespace errors were reported.
- **Working tree:** existing Promotion Trials edits and four untracked audit reports were present before this audit. They were preserved. This audit adds only this report.
