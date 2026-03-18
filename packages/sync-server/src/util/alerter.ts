import logger from './logger.js';

type Severity = 'info' | 'warning' | 'error';

export type StoredAlert = {
  id: string;
  event_type: string;
  message: string;
  timestamp: string;
  severity: Severity;
};

const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const MAX_ALERTS = 50;
const recentAlerts: StoredAlert[] = [];
let alertCounter = 0;

export async function triggerAlert(opts: {
  event_type: string;
  message: string;
  severity: Severity;
}): Promise<void> {
  const lastFired = cooldowns.get(opts.event_type) ?? 0;
  if (Date.now() - lastFired < COOLDOWN_MS) return;
  cooldowns.set(opts.event_type, Date.now());

  const timestamp = new Date().toISOString();

  // Always store in-memory for client polling (even without webhook configured)
  const alert: StoredAlert = {
    id: `alert-${++alertCounter}`,
    event_type: opts.event_type,
    message: opts.message,
    timestamp,
    severity: opts.severity,
  };
  if (recentAlerts.length >= MAX_ALERTS) recentAlerts.shift();
  recentAlerts.push(alert);

  // Webhook delivery is optional and fire-and-forget
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: opts.event_type,
        message: opts.message,
        timestamp,
        severity: opts.severity,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    logger.warn('webhook alert failed', {
      event_type: opts.event_type,
      error: String(err),
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Returns all unacknowledged alerts (oldest first). */
export function getRecentAlerts(): StoredAlert[] {
  return [...recentAlerts];
}

/** Remove an alert by id (user acknowledged it). Returns true if found. */
export function acknowledgeAlert(alertId: string): boolean {
  const idx = recentAlerts.findIndex(a => a.id === alertId);
  if (idx === -1) return false;
  recentAlerts.splice(idx, 1);
  return true;
}

// For testing: reset all module-level state
export function _resetAlerter(): void {
  cooldowns.clear();
  recentAlerts.length = 0;
  alertCounter = 0;
}
