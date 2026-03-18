import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger to suppress output during tests
vi.mock('./logger.js', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import {
  triggerAlert,
  getRecentAlerts,
  acknowledgeAlert,
  _resetAlerter,
} from './alerter.js';

describe('alerter', () => {
  beforeEach(() => {
    _resetAlerter();
    vi.unstubAllEnvs();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  it('sends POST to ALERT_WEBHOOK_URL with correct JSON payload shape', async () => {
    vi.stubEnv('ALERT_WEBHOOK_URL', 'https://hooks.example.com/alert');
    await triggerAlert({
      event_type: 'sync_failure',
      message: 'Sync failed for account X',
      severity: 'error',
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://hooks.example.com/alert');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body as string);
    expect(body).toHaveProperty('event_type', 'sync_failure');
    expect(body).toHaveProperty('message', 'Sync failed for account X');
    expect(body).toHaveProperty('severity', 'error');
    expect(body).toHaveProperty('timestamp');
  });

  it('does nothing (no fetch) when ALERT_WEBHOOK_URL is not set, but still stores alert in-memory', async () => {
    // Do not stub ALERT_WEBHOOK_URL - leave unset
    await triggerAlert({
      event_type: 'sync_failure',
      message: 'no webhook',
      severity: 'warning',
    });

    expect(fetch).not.toHaveBeenCalled();
    const alerts = getRecentAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].event_type).toBe('sync_failure');
  });

  it('respects 1-hour cooldown per event_type (second call within 1h is suppressed)', async () => {
    vi.stubEnv('ALERT_WEBHOOK_URL', 'https://hooks.example.com/alert');
    await triggerAlert({ event_type: 'quota_exceeded', message: 'first', severity: 'warning' });
    await triggerAlert({ event_type: 'quota_exceeded', message: 'second', severity: 'warning' });

    // Only one fetch and one alert stored
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getRecentAlerts()).toHaveLength(1);
  });

  it('does not throw when fetch fails (logs warning instead)', async () => {
    vi.stubEnv('ALERT_WEBHOOK_URL', 'https://hooks.example.com/alert');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    await expect(
      triggerAlert({ event_type: 'test_failure', message: 'oops', severity: 'error' }),
    ).resolves.toBeUndefined();
  });

  it('stores alert in recentAlerts; getRecentAlerts returns it with correct shape', async () => {
    await triggerAlert({ event_type: 'consent_expiry', message: 'expiring soon', severity: 'info' });

    const alerts = getRecentAlerts();
    expect(alerts).toHaveLength(1);
    const alert = alerts[0];
    expect(alert).toHaveProperty('id');
    expect(alert).toHaveProperty('event_type', 'consent_expiry');
    expect(alert).toHaveProperty('message', 'expiring soon');
    expect(alert).toHaveProperty('severity', 'info');
    expect(alert).toHaveProperty('timestamp');
  });

  it('acknowledgeAlert removes alert by id; getRecentAlerts no longer returns it', async () => {
    await triggerAlert({ event_type: 'consent_expiry', message: 'expiring', severity: 'info' });
    const [alert] = getRecentAlerts();
    expect(alert).toBeDefined();

    const result = acknowledgeAlert(alert.id);
    expect(result).toBe(true);
    expect(getRecentAlerts()).toHaveLength(0);
  });

  it('acknowledgeAlert returns false for unknown id', () => {
    expect(acknowledgeAlert('alert-nonexistent')).toBe(false);
  });

  it('evicts oldest alert when recentAlerts exceeds MAX_ALERTS (50)', async () => {
    // Trigger 51 alerts each with a unique event_type to bypass cooldown
    for (let i = 0; i < 51; i++) {
      await triggerAlert({
        event_type: `unique_event_${i}`,
        message: `alert ${i}`,
        severity: 'info',
      });
    }

    const alerts = getRecentAlerts();
    expect(alerts).toHaveLength(50);
    // The first alert (unique_event_0) should have been evicted
    expect(alerts.find(a => a.event_type === 'unique_event_0')).toBeUndefined();
    // The last alert should still be present
    expect(alerts.find(a => a.event_type === 'unique_event_50')).toBeDefined();
  });
});
