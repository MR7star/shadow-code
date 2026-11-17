# Shadow Code Design System

## Tokens

Import `src/styles/tokens.css` through `src/index.css`. Prefer `--scds-*` tokens for new shared UI: color (`--scds-void`, `--scds-surface`, `--scds-purple`, semantic colors), spacing (`--scds-space-1` through `--scds-space-8`), radii, shadows, focus ring, fonts, and motion durations. Existing page styles retain their current variables for compatibility.

## Components

Import primitives from `src/components/ui`:

- `Button`: `primary`, `secondary`, `ghost`, `danger`; `sm`, `md`, `lg`; `loading`, `disabled`, optional `icon`.
- `Panel`: `standard`, `elevated`, `interactive`; optional semantic `as` tag.
- `StatCard`: required `label` and `value`, optional `icon`, `description`.
- `RankBadge`: accepts the existing `Rank` union; no new progression ranks are inferred.
- `XPProgress`: current and required XP with accessible progress semantics.
- `StatusBadge`: `loading`, `active`, `completed`, `failed`, `pending`.
- `DifficultyBadge`: existing E through S `QuestDifficulty` values.
- `ProgressBar`: `value`, optional `max`, label, and purple/cyan/gold/success/danger variant.
- `EmptyState`, `ErrorState`, `LoadingState`: shared request and content states.
- `Modal`: controlled `open`, `title`, `onClose`, and children.
- `Toast`: success/error/warning/info presentation; parent owns its lifecycle.

Example:

```tsx
<Panel variant="elevated">
  <StatCard label="Quests cleared" value={12} description="This season" />
  <XPProgress current={640} required={1200} />
</Panel>
```

## Icons

Use `lucide-react` for new shared UI and showcase icons. Use consistent 16–20px sizing, semantic `currentColor`, and `aria-hidden` when decorative. Existing page icons are intentionally not migrated in this phase. Component `icon` slots accept `ReactNode` for caller flexibility.

## Accessibility

Keep native buttons and links keyboard-operable. Do not remove focus indicators. Progress controls expose ARIA values and labels. Modal traps Tab navigation, closes with Escape and backdrop click, and restores focus to the opener. Loading states use `role="status"`; errors use `role="alert"`. Supply meaningful text alongside icons.

## Responsive and motion conventions

Use token spacing and allow content to wrap on narrow screens. Modals constrain width and height to the viewport. Shared CSS is isolated in `ui.css`. Transitions use the SCDS durations/easing and the stylesheet reduces motion under `prefers-reduced-motion`.

## Development showcase

Run the Vite development server and open `/__scds`. The route is conditionally included only when `import.meta.env.DEV` is true; it is absent from production builds.
