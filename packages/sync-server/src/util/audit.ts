import { createHash } from 'node:crypto';

import { getAccountDb } from '../account-db.js';
import logger from './logger.js';

export type AuditEventType =
  | 'login_success'
  | 'login_failure'
  | 'bootstrap'
  | 'password_change'
  | 'openid_auth'
  | 'eb_consent_auth'
  | 'eb_consent_expiry'
  | 'eb_consent_renewal'
  | 'eb_account_link';

function hashActor(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 8);
}

export function writeAuditLog(opts: {
  event_type: AuditEventType;
  actor: string;
  ip_address?: string;
  outcome: 'success' | 'fail';
  details?: Record<string, unknown>;
}): void {
  try {
    const db = getAccountDb();
    const actorValue =
      opts.actor === 'system' ? 'system' : hashActor(opts.actor);
    db.mutate(
      `INSERT INTO audit_log (event_type, actor, ip_address, outcome, details)
       VALUES (?, ?, ?, ?, ?)`,
      [
        opts.event_type,
        actorValue,
        opts.ip_address ?? null,
        opts.outcome,
        opts.details ? JSON.stringify(opts.details) : null,
      ],
    );
  } catch (err) {
    logger.error('audit log write failed', {
      error: String(err),
      event_type: opts.event_type,
    });
  }
}
