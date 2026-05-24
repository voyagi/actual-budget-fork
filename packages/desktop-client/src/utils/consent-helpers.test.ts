import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  dismiss,
  formatAlertTitle,
  formatExpiryDate,
  getDismissalKey,
  isDismissed,
} from './consent-helpers';

describe('formatExpiryDate', () => {
  it('returns "Unknown date" for null', () => {
    expect(formatExpiryDate(null)).toBe('Unknown date');
  });

  it('formats a valid ISO date string', () => {
    const result = formatExpiryDate('2026-03-15');
    expect(result).toContain('2026');
    expect(result).toContain('15');
  });

  it('formats a full ISO datetime', () => {
    const result = formatExpiryDate('2026-12-25T10:00:00Z');
    expect(result).toContain('2026');
    expect(result).toContain('25');
  });
});

describe('getDismissalKey', () => {
  it('builds key from sessionId and dateString', () => {
    expect(getDismissalKey('sess-42', 'Mon Jan 01 2026')).toBe(
      'consent-dismissed-sess-42-Mon Jan 01 2026',
    );
  });
});

describe('isDismissed / dismiss', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when not dismissed', () => {
    expect(isDismissed('sess-1')).toBe(false);
  });

  it('returns true after dismiss is called', () => {
    dismiss('sess-1');
    expect(isDismissed('sess-1')).toBe(true);
  });

  it('dismissals are scoped per session', () => {
    dismiss('sess-1');
    expect(isDismissed('sess-1')).toBe(true);
    expect(isDismissed('sess-2')).toBe(false);
  });

  it('dismissals are scoped per day', () => {
    dismiss('sess-1');
    expect(isDismissed('sess-1')).toBe(true);

    // Simulate next day by checking a key with a different date
    const tomorrowStr = new Date(Date.now() + 24 * 3600 * 1000).toDateString();
    const todayKey = getDismissalKey('sess-1', new Date().toDateString());
    const tomorrowKey = getDismissalKey('sess-1', tomorrowStr);
    expect(localStorage.getItem(todayKey)).toBe('true');
    expect(localStorage.getItem(tomorrowKey)).toBeNull();
  });
});

describe('formatAlertTitle', () => {
  it('maps sync_failure', () => {
    expect(formatAlertTitle('sync_failure')).toBe('Sync failed');
  });

  it('maps consent_expiry', () => {
    expect(formatAlertTitle('consent_expiry')).toBe('Bank connection expiring');
  });

  it('maps auth_failure_burst', () => {
    expect(formatAlertTitle('auth_failure_burst')).toBe(
      'Repeated login failures',
    );
  });

  it('returns generic title for unknown event types', () => {
    expect(formatAlertTitle('unknown_event')).toBe('Operational alert');
  });
});
