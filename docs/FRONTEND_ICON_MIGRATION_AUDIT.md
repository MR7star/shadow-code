# Frontend Icon Migration Audit

## Scope and baseline

- Audited all 56 frontend source files under `src` with `.tsx`, `.ts`, `.jsx`, `.js`, or `.css` extensions before implementation.
- Found 199 emoji code points across 173 matching source lines in 13 files.
- Checked CSS pseudo-element content declarations; the only nonempty icon-like content found is the tournament breadcrumb chevron (`›`) in `src/pages/Tournaments.css`.
- Existing uncommitted files and reports were recorded before edits and are to be preserved.

## Emoji inventory

| File | Matching lines | Main rendered/data areas |
| --- | ---: | --- |
| `src/components/auth/AuthModal.tsx` | 3 | Auth modal brand, error and action icons |
| `src/components/editor/CodeEditor.tsx` | 2 | Language marker, copy and reset actions |
| `src/components/layout/Layout.tsx` | 15 | Sidebar, top bar, navigation, progression toast |
| `src/data/mockData.ts` | 29 | Skill, achievement and activity icon values |
| `src/pages/Arena.tsx` | 38 | Tabs, queue, combat, results, status, rank and reward icons |
| `src/pages/DungeonSolver.tsx` | 10 | Victory, boss, hint, runner and submit states |
| `src/pages/Guilds.tsx` | 15 | Emblem choices, tabs, roster, cards and empty states |
| `src/pages/Leaderboard.tsx` | 10 | Ranking tabs, search and guild emblems |
| `src/pages/PromotionTrials.tsx` | 4 | Status, attempt, error and success indicators |
| `src/pages/QuestSolver.tsx` | 35 | Error states, lesson headings, hints, test results and actions |
| `src/pages/SkillTree.tsx` | 4 | Summary values and locked/mastered nodes |
| `src/services/arenaApi.ts` | 6 | Arena division/rank icon data |
| `src/utils/progression.ts` | 2 | Progression event icon data |

## Migration approach

- Use `lucide-react` only, with a shared semantic icon registry and shared renderer for legacy data glyph values.
- Preserve stored emoji values in data and service contracts; render those values as mapped outline icons at UI boundaries.
- Replace hardcoded rendered emoji and icon-like Unicode symbols in components with semantic Lucide icons.
- Preserve component dimensions, layouts, behavior, and API contracts.

## Non-emoji Unicode review

- `src/pages/Tournaments.css` used a generated `›` bracket connector; it now uses a CSS-drawn chevron.
- UI checkmarks, crosses, arrows, reset marks, navigation glyphs and status icons found during the broader symbol pass now use Lucide components. Ordinary punctuation and prose remain text.

## Completion audit

- Re-ran the emoji scan across `src`: 50 pictographic code points remain, all in legacy values or choices in `src/data/mockData.ts` (29), `src/services/arenaApi.ts` (6), `src/utils/progression.ts` (2), and `src/pages/Guilds.tsx` (13 emblem choices/default). They are retained to preserve existing values and are rendered through `AppIcon` at UI boundaries.
- The baseline scan found 199 pictographic code points; 149 were removed from rendered source. No rendered UI emoji remains in the scan results.
- Added `src/components/ui/AppIcon.tsx` as the shared semantic Lucide registry, and migrated shared navigation, dashboard, profile, achievements, skill tree, arena, guild, leaderboard, tournament, authentication, editor, quest, dungeon, and promotion-trial icon renderers.
- The browser inventory reported no browser surfaces for this chat. A local Vite server started at `http://127.0.0.1:5176/`, but the available Firefox window did not expose accessibility state, so route screenshots and visual browser inspection could not be completed.
