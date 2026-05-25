# Product

## Register

product

## Users

People managing their personal or household finances who want automated bank
synchronization without relying on US-centric providers. Primarily EU-based
users whose banks are connected through Enable Banking. They check in daily or
weekly, categorize transactions, set budgets, and track spending. They are not
finance professionals; they want clarity without complexity.

## Product Purpose

A fork of Actual Budget that adds Enable Banking integration for automated EU
bank sync, consent lifecycle management, and operational monitoring. It exists
because the upstream project lacks native European bank connectivity. Success
looks like: users connect their EU bank accounts once, transactions flow in
automatically, consent renewals are handled gracefully, and the budgeting
workflow feels like a natural extension of their financial life rather than
a chore.

## Brand Personality

Warm, personal, trustworthy. The app feels like a clear-headed friend who
helps you see your money situation without judgment or anxiety. It speaks
plainly, shows you what matters, and stays out of the way when you don't
need it.

## Anti-references

- **Generic fintech** (navy suits, gold accents, stock photos of handshakes).
  This is personal finance, not corporate banking.
- **Gamified finance** (Robinhood-style confetti, achievement badges, dopamine
  loops). Money management is not a game. No flashy animations that trivialize
  real financial decisions.
- **Plain upstream Actual**. Bare tables, unstyled inputs, utilitarian defaults.
  The fork exists to be better than this.
- **Overdesigned SaaS** (Notion-clone aesthetics, gratuitous gradients, hero
  metrics with big numbers). Style must serve substance. No decoration that
  competes with data.

## Design Principles

1. **Clarity over cleverness.** Every screen answers one question quickly.
   Strip away anything that makes the user think about the interface instead
   of their finances.
2. **Honest by default.** Show real numbers, real states, real progress. No
   vanity metrics, no hiding bad news behind optimistic framing.
3. **Warmth without noise.** The palette and tone feel approachable, but the
   layout stays disciplined. Warmth comes from thoughtful touches, not visual
   excess.
4. **Respect the routine.** Most sessions are short check-ins. Optimize for
   the person who opens the app for 90 seconds, not the one setting up their
   budget from scratch.
5. **Quiet confidence.** The app should feel like it has everything under
   control. No loading spinners where skeleton screens work. No error dumps
   where a gentle retry works. Competence is calming.

## Accessibility & Inclusion

Target WCAG AAA where practical, especially for contrast ratios and focus
indicators. The upstream Actual already provides basic keyboard navigation and
WCAG AA contrast. This fork should go further:

- Enhanced contrast ratios for text and interactive elements
- Visible, high-contrast focus indicators for keyboard navigation
- Respect `prefers-reduced-motion` for all animations
- Meaningful ARIA labels, not just structural compliance
- Color is never the sole indicator of state (positive/negative amounts use
  icons or labels alongside color)
- Right-to-left layout support is not required but should not be blocked
