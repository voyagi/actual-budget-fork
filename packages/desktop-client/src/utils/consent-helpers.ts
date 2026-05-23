/**
 * Pure helper functions for consent expiry display and dismissal.
 * Extracted from useEnableBankingStatus.ts for testability.
 */

export function formatExpiryDate(validUntil: string | null): string {
  if (!validUntil) return 'Unknown date';
  const date = new Date(validUntil);
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getDismissalKey(
  sessionId: string,
  dateString: string,
): string {
  return `consent-dismissed-${sessionId}-${dateString}`;
}

export function isDismissed(sessionId: string): boolean {
  const key = getDismissalKey(sessionId, new Date().toDateString());
  return localStorage.getItem(key) === 'true';
}

export function dismiss(sessionId: string): void {
  const key = getDismissalKey(sessionId, new Date().toDateString());
  localStorage.setItem(key, 'true');
}

export function formatAlertTitle(eventType: string): string {
  switch (eventType) {
    case 'sync_failure':
      return 'Sync failed';
    case 'consent_expiry':
      return 'Bank connection expiring';
    case 'auth_failure_burst':
      return 'Repeated login failures';
    default:
      return 'Operational alert';
  }
}
