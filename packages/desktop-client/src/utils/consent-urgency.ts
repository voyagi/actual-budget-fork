import {
  SvgExclamationOutline,
  SvgExclamationSolid,
  SvgInformationOutline,
} from '@actual-app/components/icons/v1';
import { theme } from '@actual-app/components/theme';

/**
 * Urgency level for a consent session.
 * - expired: consent_valid_until is in the past
 * - urgent: within 7 days
 * - soon: within 14 days
 * - ok: more than 14 days away
 */
export type ConsentUrgency = 'expired' | 'urgent' | 'soon' | 'ok';

/**
 * Compute the number of days until a consent expires.
 */
export function getDaysUntilExpiry(validUntil: string): number {
  const now = new Date();
  const expiry = new Date(validUntil);
  return (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Check whether a consent has already expired.
 */
export function isConsentExpired(validUntil: string): boolean {
  return new Date(validUntil) <= new Date();
}

/**
 * Derive urgency level from days until expiry.
 * Thresholds: <=0 → expired, <=7 → urgent, <=14 → soon, else → ok
 */
export function getUrgencyLevel(daysUntilExpiry: number): ConsentUrgency {
  if (daysUntilExpiry <= 0) {
    return 'expired';
  } else if (daysUntilExpiry <= 7) {
    return 'urgent';
  } else if (daysUntilExpiry <= 14) {
    return 'soon';
  }
  return 'ok';
}

/**
 * Color tokens for each urgency level.
 * Used by ConsentExpiryBanner and AccountRow.
 */
export const urgencyColors: Record<
  ConsentUrgency,
  { text: string; background: string; border: string }
> = {
  expired: {
    text: theme.errorText,
    background: theme.errorBackground,
    border: theme.errorText,
  },
  urgent: {
    text: theme.warningText,
    background: theme.warningBackground,
    border: theme.warningText,
  },
  soon: {
    text: theme.noticeText,
    background: theme.noticeBackground,
    border: theme.noticeText,
  },
  ok: {
    text: theme.pageText,
    background: theme.pageBackground,
    border: theme.pageTextSubdued,
  },
};

/**
 * Icon component for each urgency level.
 * null means no icon is rendered (ok/non-alert state).
 */
export const urgencyIcons = {
  expired: SvgExclamationSolid,
  urgent: SvgExclamationOutline,
  soon: SvgInformationOutline,
  ok: null,
} as const;
