# Handoff: Buddy V2 Redesign for Actual Budget

**Updated:** 2026-02-26
**Branch:** `chore/techdebt-remediation`
**Working tree:** Remaining uncommitted changes from pre-audit work (see below)

## Goal

Redesign Actual Budget's visual identity using the "Buddy" design language.
V1 used a pink/purple/teal triad with heavy gradients (AI-slop). V2 replaced
that with a single purple primary (`#6C5CE7`), restrained accents, solid
headers, and a proper light theme variant.

## Current Progress

All 6 implementation phases are complete. A design audit was performed and
all actionable findings have been resolved.

### What's committed (4 audit-fix commits on branch)

1. `a6659c8` **fix(theme): move hardcoded values to palette**
   - H1: `heroCardBudgetStart` (#ECFDF5) now references `buddyLightPositiveBg`
   - M1: `heroCardTextSubdued` (rgba) now references `buddyDarkTextSubdued`
   - M5: `sidebarBackground` references `buddyLightSidebarBg` (semantic name)

2. `d6a6628` **refactor(mobile): remove dead headerGradients variant system**
   - Removed `HeaderVariant` type, `headerGradients` lookup, variant/headerVariant props
   - Removed 8 `headerGradient*` tokens from dark.ts, light.ts, theme.ts
   - Cleaned `variant=` prop from 24 consumer files (29 occurrences)
   - Removed unused React default import in Page.tsx (L1)

3. `9b39f47` **fix(ui): prevent hero card label wrapping**
   - Added `whiteSpace: 'nowrap'` to uppercase labels in both hero cards

4. `b0cd7ec` **docs(ui): document CategoryIcon colors as theme-independent**
   - Added comment explaining why ICON_COLORS are not in palette.ts

### What's still uncommitted (pre-audit work)

These files were modified before the audit session and remain unstaged:
- `HANDOFF.md`, `Button.tsx`, `Card.tsx`, `SidebarCategory.tsx`
- `MobileNavTabs.tsx`, `ExpenseCategoryListItem.tsx`, `IncomeCategoryListItem.tsx`
- `development.ts`, `midnight.ts`, `category.ts`
- New files: `CategoryIcon.tsx` (committed in audit), migration SQL

### Theme system architecture

- `palette.ts`: All color values (single source of truth)
- `dark.ts`: Full dark theme with 250+ token mappings to palette
- `light.ts`: Full light theme variant (proper light mode, not a re-export)
- `midnight.ts`, `development.ts`: Currently re-export from dark.ts
- `theme.ts` (component-library): CSS variable declarations

Color roles: purple = interactive, teal/green = positive, pink = restricted
accent (nav selected + decorative only).

## What Worked

- **Token-based theme system**: palette -> theme -> CSS vars. Clean separation.
- **Solid headers over gradients**: Removing the gradient system simplified 24
  files and the codebase is easier to maintain.
- **Hero cards with CellValue bindings**: Reactive financial data via the
  existing spreadsheet binding system.

## What Didn't Work / Known Issues

- **BudgetHeroCard only uses envelope budget bindings** - doesn't handle
  tracking budget type. Will show wrong data if user switches budget types.
- **No visual testing done** - all changes verified by code review, lint, and
  TypeScript checks. The app has not been run to verify visual output.
- **Category icon/color picker not built** - DB migration adds columns,
  CategoryIcon renders hash-based defaults, but no UI to customize.
- **Theme selector still shows all options** even though midnight and
  development are identical to dark. Could confuse users.
- **Pre-existing TS module resolution errors** - `@actual-app/components/*`
  imports fail typecheck without building the component-library first. Not
  related to our changes.

## Audit Results Summary

9 issues found (1 High, 5 Medium, 3 Low). All actionable items resolved:
- H1 (hardcoded hex): FIXED
- M1 (rgba not in palette): FIXED
- M3 (dead headerGradients): FIXED
- M5 (semantic naming): FIXED
- L1 (unused import): FIXED
- L3 (label wrapping): FIXED
- M2 (CategoryIcon colors): DOCUMENTED as intentionally theme-independent
- M4 (touch targets): No action needed (passes AA)
- L2 (contrast formula): No action needed (correct for current color set)

## Next Steps

1. **Commit remaining uncommitted files** from pre-audit work
2. **Run the app visually** - `yarn start`, check all pages at mobile + desktop
3. **Address BudgetHeroCard tracking budget** - check budgetType pref
4. **Build category icon/color picker** - modal in category edit
5. **Simplify theme selector** - hide midnight/development or differentiate them
6. **Grep for remaining hardcoded colors** in component files
