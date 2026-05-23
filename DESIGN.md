---
name: Actual Budget (Buddy Fork)
description: A warm, clear personal finance app with EU bank sync
colors:
  soft-amethyst: "#6C5CE7"
  soft-amethyst-hover: "#7D6FEE"
  soft-amethyst-deep: "#5A4BD4"
  soft-amethyst-muted: "#3D3566"
  soft-amethyst-wash: "#EDE8FF"
  soft-amethyst-whisper: "#F4F1FF"
  soft-amethyst-light: "#5B4ED4"
  warm-coral: "#FF6B8A"
  steady-teal: "#2DD4A8"
  steady-teal-light: "#0D9B6A"
  compass-blue: "#4FC3F7"
  parchment: "#F4F3F0"
  warm-white: "#FDFCFB"
  soft-linen: "#F0F0ED"
  quiet-stone: "#F8F7F5"
  linen-border: "#E2E1DD"
  linen-border-dark: "#D1D0CC"
  ink: "#1A1B2E"
  ink-secondary: "#5A5D6E"
  ink-muted: "#9295A5"
  ink-deep: "#0D0E1A"
  night-sky: "#0D1117"
  night-surface: "#1A1B2E"
  night-surface-mid: "#252638"
  night-surface-high: "#2E2F42"
  night-border: "#2A2B3D"
  night-text: "#F5F5FF"
  night-text-secondary: "#8E8E93"
  night-text-muted: "#555566"
  signal-negative: "#E12D39"
  signal-warning: "#D4A31C"
typography:
  display:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.2
  headline:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "25px"
    fontWeight: 500
    lineHeight: 1.3
  title:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.35
  body:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "4px"
  md: "8px"
  lg: "16px"
  pill: "30px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "15px"
  lg: "20px"
  xl: "30px"
components:
  button-primary:
    backgroundColor: "{colors.soft-amethyst-light}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.soft-amethyst}"
  button-normal:
    backgroundColor: "{colors.warm-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-normal-hover:
    backgroundColor: "{colors.soft-linen}"
  button-bare:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-bare-hover:
    backgroundColor: "rgba(0, 0, 0, 0.06)"
  card:
    backgroundColor: "{colors.warm-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "{colors.warm-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
---

# Design System: Actual Budget (Buddy Fork)

## 1. Overview

**Creative North Star: "The Steady Compass"**

A calm instrument that always points true. This design system exists to make personal finance feel manageable, not intimidating. The interface is a compass needle: it shows you where you stand, responds when you interact, and never adds noise to an already stressful topic.

The aesthetic is warm but disciplined. Surfaces feel like quality paper: off-white parchment in light mode, deep indigo night sky in dark. The Soft Amethyst purple acts as a steady guide, drawing your eye to what matters without shouting. Every pixel of decoration must earn its place by reducing cognitive load or reinforcing trust.

This system explicitly rejects: corporate fintech aesthetics (navy suits, gold accents), gamified finance (confetti, achievement badges, dopamine loops), the plain utilitarian default of upstream Actual Budget (bare tables, unstyled inputs), and overdesigned SaaS patterns (gratuitous gradients, hero metrics with big numbers, Notion-clone whitespace). The fork exists to be better than all of these.

**Key Characteristics:**
- **Warm neutrals over pure whites.** Parchment (#F4F3F0), not #FFFFFF. Night Sky (#0D1117), not #000000.
- **Single accent discipline.** Soft Amethyst is the only interactive color. Warm Coral appears in navigation selection and decorative accents only.
- **Tactile components.** Slight rounding, gentle shadows, responsive hover states that feel like physical objects.
- **Data-first hierarchy.** Numbers and financial data dominate; chrome recedes.
- **Financial color semantics.** Steady Teal means positive/income. Signal Red means negative/expense. These never appear decoratively.

## 2. Colors

The palette is restrained with emotional range: a single purple accent anchors interaction, warm neutrals create comfort, and financial semantics (teal for positive, red for negative) carry meaning without explanation.

### Primary

- **Soft Amethyst** (#6C5CE7): The compass needle. Used for interactive elements: buttons, links, selected states, focus rings. Feels like twilight, not neon. Its rarity on any given screen is what makes it effective.
- **Soft Amethyst Deep** (#5A4BD4): The light-theme variant. Slightly deeper for better contrast on light backgrounds. Primary button default.
- **Soft Amethyst Hover** (#7D6FEE): Lighter variant for hover states. The brightening feels responsive, like a surface catching light.

### Secondary

- **Warm Coral** (#FF6B8A): Restricted to navigation selected state and occasional decorative flourishes. A sunset blush, not a call to action. Never used for buttons or interactive elements outside the sidebar.

### Tertiary

- **Steady Teal** (#2DD4A8): Financial positive. Income, savings, surplus, healthy balances. Dark theme variant.
- **Steady Teal Light** (#0D9B6A): Financial positive on light backgrounds.
- **Signal Red** (#E12D39): Financial negative. Overspending, deficits, errors. Never decorative.
- **Signal Warning** (#D4A31C): Caution states. Approaching budget limits, pending transactions.

### Neutral

- **Parchment** (#F4F3F0): Light mode page background. Warm, not sterile.
- **Warm White** (#FDFCFB): Card and surface backgrounds. Almost white, barely tinted.
- **Soft Linen** (#F0F0ED): Secondary surfaces, table headers, hover states.
- **Linen Border** (#E2E1DD): Dividers and borders. Visible but gentle.
- **Ink** (#1A1B2E): Primary text. Deep indigo-black, not pure black.
- **Ink Secondary** (#5A5D6E): Supporting text, labels, metadata.
- **Ink Muted** (#9295A5): Placeholder text, disabled states, tertiary information.
- **Night Sky** (#0D1117): Dark mode page background. Deep blue-black.
- **Night Surface** (#1A1B2E): Dark mode card backgrounds.

### Named Rules

**The Compass Needle Rule.** Soft Amethyst appears on no more than 10% of any screen. Its power comes from scarcity. When everything is purple, nothing guides.

**The Honest Numbers Rule.** Teal means money coming in. Red means money going out. These colors are never decorative, never branded, never overridden. A user should be able to glance at any screen and know their financial direction from color alone, reinforced by icons or labels for accessibility.

## 3. Typography

**System Font Stack:** system-ui, -apple-system, sans-serif

**Character:** The system font stack is invisible by design. It matches the user's operating system, so the app feels native rather than branded. Typography earns its hierarchy through scale and weight alone.

### Hierarchy

- **Display** (700, 32px, line-height 1.2): Net worth totals, account balances on hero cards. The largest number on any screen. Used sparingly.
- **Headline** (500, 25px, line-height 1.3): Page titles, account names in headers. One per view.
- **Title** (400, 22px, line-height 1.35): Section headings within a page. Secondary balance displays.
- **Body** (400, 13px, line-height 1.5): Transaction descriptions, category names, form labels, all running text. The workhorse. Max line length: 65ch for descriptions.
- **Label** (400, 11px, line-height 1.4): Timestamps, status badges, column headers in dense tables. Small but never illegible.

### Named Rules

**The Weight Ladder Rule.** Each step in the hierarchy uses a different weight. Display (700) to Headline (500) to Title (400) to Body (400, but smaller). Weight and size together create contrast; neither alone is sufficient below Headline.

## 4. Elevation

The system is flat by default with tonal layering. Depth comes from background color shifts between surfaces, not from shadows. Shadows appear only in two specific contexts: cards and primary buttons at rest.

### Shadow Vocabulary

- **Card Shadow** (light: `rgba(0, 0, 0, 0.08)`, dark: `rgba(0, 0, 0, 0.3)`): Ambient, diffuse. Cards float barely above the page. The shadow is more about separation than elevation.
- **Button Primary Shadow** (`rgba(0, 0, 0, 0.1)`): Subtle depth under primary buttons, making them feel slightly raised and pressable.
- **Checkbox Selected Shadow** (Soft Amethyst Deep): A colored glow under selected checkboxes, reinforcing the selection state with depth.

### Named Rules

**The Flat Rest Rule.** Surfaces are flat at rest. Tonal layering (Parchment to Warm White to Soft Linen) creates the sense of depth. If you need to visually separate something, change its background color before reaching for a shadow.

## 5. Components

### Buttons

Warm and tactile. Buttons feel like physical objects you can trust with financial decisions.

- **Shape:** Gently curved edges (8px radius)
- **Primary:** Soft Amethyst Deep background, white text, subtle shadow. The only strongly colored element on most screens.
- **Hover / Focus:** Background lightens to Soft Amethyst (#6C5CE7). Transition is immediate and responsive, not animated.
- **Normal (Secondary):** Warm White background, Ink text, Linen Border Dark border. Quiet, deferential.
- **Bare (Tertiary):** Transparent background, Ink text. Appears as text until hovered, when a subtle 6% black overlay appears.
- **Disabled:** Soft Linen background, Ink Muted text. Clearly inert, not broken.
- **Menu:** Transparent background. Selected state uses Soft Amethyst Deep with white text.

### Cards / Containers

- **Corner Style:** Gently curved (8px radius)
- **Background:** Warm White (light) / Night Surface (dark)
- **Shadow Strategy:** Ambient only (see Elevation). Cards are distinguished by background, not by shadow.
- **Border:** Linen Border (light) / Night Border (dark). 1px solid.
- **Internal Padding:** 15-20px. Comfortable but not wasteful.

### Inputs / Fields

- **Style:** Warm White background, 1px Linen Border, 4px radius. Tight, functional.
- **Focus:** Border shifts to Soft Amethyst. No glow, no expand. Clean signal.
- **Error:** Border shifts to Signal Red. Error message below in Signal Red.
- **Disabled:** Soft Linen background, Ink Muted text.

### Navigation (Sidebar)

- **Background:** Sidebar matches page background (Parchment light / Night Sky dark)
- **Default:** Ink Secondary text, no background
- **Hover:** Night Surface Mid background (dark) / subtle overlay (light)
- **Selected:** Soft Amethyst accent indicator. Selected text stays primary color for readability.
- **Positive/Negative indicators:** Steady Teal and Signal Red dots next to account names show sync and balance status.

### Transaction Table

The signature component. Users spend most of their time here.

- **Row hover:** Soft Linen (light) / Night Surface Mid (dark). Gentle highlight, not a color change.
- **Selected row border:** Soft Amethyst. The compass points to your selection.
- **Header:** Soft Linen background, Ink Secondary text. Clearly differentiated from data rows.
- **Highlight row:** Soft Amethyst Wash (#EDE8FF). For search matches, recent imports, batch selections.
- **Financial numbers:** Steady Teal for positive, Signal Red for negative, Ink Muted for zero.

## 6. Do's and Don'ts

### Do:

- **Do** use Parchment (#F4F3F0) and Night Sky (#0D1117) as page backgrounds. Never pure white or pure black.
- **Do** use Soft Amethyst exclusively for interactive affordances: buttons, links, focus rings, selected borders.
- **Do** pair financial colors (Steady Teal, Signal Red) with icons or +/- labels so color is never the sole indicator.
- **Do** use tonal surface shifts (Parchment to Warm White to Soft Linen) to create depth before reaching for shadows.
- **Do** keep body text at 13px for data-dense screens. Readability at density is the goal.
- **Do** test every color combination against WCAG AAA contrast ratios where practical.

### Don't:

- **Don't** use Warm Coral (#FF6B8A) for buttons, alerts, or interactive elements. It is decorative and navigational only.
- **Don't** use generic fintech colors (navy, gold, teal-on-dark-blue). This is personal finance, not corporate banking.
- **Don't** add confetti, achievement badges, streaks, or gamification. Money management is not a game. (Anti-reference: Robinhood)
- **Don't** leave components unstyled or with browser defaults. Every input, button, and table must use the buddy palette. (Anti-reference: upstream Actual)
- **Don't** add gratuitous gradients, hero metric cards with big numbers and small labels, or excessive whitespace. Style serves substance. (Anti-reference: SaaS landing page cliches)
- **Don't** use border-left or border-right greater than 1px as a colored accent stripe on cards, list items, or alerts.
- **Don't** apply gradient text (background-clip: text) anywhere.
- **Don't** use glassmorphism (backdrop-filter blur) decoratively.
- **Don't** animate CSS layout properties. Use opacity and transform only.
- **Don't** use bounce or elastic easing. Ease-out with exponential curves only.
