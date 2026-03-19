---
phase: 04
slug: pwa-completion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (configured in vite.config.mts `test` block) |
| **Config file** | `packages/desktop-client/vite.config.mts` |
| **Quick run command** | `cd packages/desktop-client && yarn test --run` |
| **Full suite command** | `cd packages/desktop-client && yarn test --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** No automated test run required (all PWA verification is manual/browser-based)
- **After every plan wave:** Manual checklist verification documented in commit message
- **Before `/gsd:verify-work`:** Lighthouse PWA audit + Android Chrome install confirmation
- **Max feedback latency:** N/A (manual verification)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | PWA-01 | manual | Chrome DevTools > Application > Manifest | N/A | pending |
| 04-01-02 | 01 | 1 | PWA-02 | manual | Load app, go offline, reload | N/A | pending |
| 04-01-03 | 01 | 1 | PWA-05 | manual | Chrome DevTools 375px emulation | N/A | pending |
| 04-01-04 | 01 | 1 | PWA-06 | manual | Chrome DevTools splash/theme check | N/A | pending |
| 04-01-05 | 01 | 1 | PWA-03 | manual | Android Chrome install prompt | N/A | pending |
| 04-01-06 | 01 | 1 | PWA-04 | manual-deferred | Deferred to Phase 5 (requires HTTPS) | N/A | deferred |

*Status: pending / green / red / flaky / deferred*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No automated PWA tests exist or are needed — PWA installability and offline behavior are inherently browser-based and manually verified.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Manifest has required fields | PWA-01 | Browser-specific installability check | Chrome DevTools > Application > Manifest; verify all fields present |
| SW precaches app shell; offline read works | PWA-02 | Requires browser with SW support | Load app, enable offline in DevTools, reload; verify budget data readable |
| Android install prompt appears | PWA-03 | Requires Android device/emulation | Chrome DevTools > Application > Manifest > "Add to home screen" |
| iOS install works | PWA-04 | Requires iOS Safari with trusted cert | Deferred to Phase 5 (Cloudflare Tunnel) |
| No horizontal scroll at 375px | PWA-05 | Visual layout check | Chrome DevTools device emulation at 375px; check all fork-specific components |
| Splash screen and theme color correct | PWA-06 | Visual check on device | Install on Android; verify icon, splash, theme color on launch |

---

## Validation Sign-Off

- [ ] All tasks have manual verification procedures documented
- [ ] Sampling continuity: manual checklist per wave
- [ ] Wave 0 covers all MISSING references (none needed)
- [ ] No watch-mode flags
- [ ] Feedback latency: N/A (manual)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
