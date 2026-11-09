# Design system

Status: foundation installed and checked with `pnpm check` and `pnpm build`. The reference page at `/design-system` renders on the server. Visual browser QA and keyboard/focus review are not yet done.

## Decisions

- **Preset:** shadcn `b6YWkyQTI` (style `base-nova`, base color `mauve`, icon library `lucide`, font Raleway, radius `0.625rem`).
- **Primitives:** Base UI (`@base-ui/react`), not Radix. The preset's `base-nova` style is built on Base UI.
- **Ownership:** shared primitives and tokens live in `packages/ui` (`src/components`, `src/styles/globals.css`). App-specific Simon Says composites live in `apps/web/src/components`.
- **Tokens:** semantic CSS variables on `:root`, redefined under `.dark`. Use token classes (`bg-primary`, `text-muted-foreground`, `bg-live`), not raw OKLCH values.
- **Font:** Raleway via `next/font/google` in `apps/web/src/app/layout.tsx`, exposed as `--font-sans`.

## Scope

This is the design system only. Product screens (host console, guest views, sign-in) are not built. The design canvas is the reference for those screens, and they belong to later milestones.

## Components

Installed in `packages/ui/src/components` from the registry: alert, avatar, badge, breadcrumb, button, card, dialog, drawer, dropdown-menu, empty, field, input, input-otp, item, label, radio-group, scroll-area, select, separator, sheet, skeleton, sonner, spinner, switch, table, tabs, textarea, toggle, toggle-group, tooltip.

Simon Says composites in `apps/web/src/components`:

| Composite        | Purpose                                               |
| ---------------- | ----------------------------------------------------- |
| `BrandMark`      | Logo tile and wordmark in headers                     |
| `LiveBadge`      | Red live pill with elapsed time                       |
| `LevelMeter`     | Microphone input level, labelled for screen readers   |
| `JoinCode`       | Join code block for hosts                             |
| `TranscriptLine` | Caption row with timestamp; interim lines use a caret |

## Rules

- Use shadcn/ui components for controls. Keep focus rings and keyboard behavior from the primitives.
- Icon-only buttons need `aria-label`.
- Live captions stay readable: body caption text is `text-base` or larger, with `leading-relaxed`.
- Timestamps and counters use tabular numerals (`tabular-nums`).
- Radius: controls use `rounded-lg`, panels and cards use `rounded-xl`.

## Verification

- `pnpm check`: lint, format, typecheck, tests. Passed.
- `pnpm build`: passed; `/design-system` prerendered as static.
- Not yet verified: visual rendering in a browser, dark mode, keyboard walk-through, narrow-screen layout.

## Open items

- Confirm the Raleway font is loaded from Google at runtime in the target environment.
- `src/components/*` composites are not covered by tests yet.
