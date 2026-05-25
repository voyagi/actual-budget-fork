import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeAccountDb, getAccountDb } from '../account-db.js';
import { runMigrations as runEnableBankingMigrations } from '../app-enablebanking/migrations.js';
import { handlers as productionTrustApp } from '../app-production-trust.js';

import {
  acknowledgeAlert,
  getRecentAlerts,
  triggerAlert,
  _resetAlerter,
} from './alerter.js';
import {
  ensureProductionTrustTable,
  getProductionTrustState,
  recordProductionTrustUntrusted,
  runBankSyncProductionTrustCheck,
  verifyProductionTrustCondition,
} from './production-trust.js';

function cleanTables() {
  const db = getAccountDb();
  ensureProductionTrustTable();
  db.mutate('DELETE FROM production_trust_state');
  db.mutate('DELETE FROM eb_sync_log');
}

describe('production trust state', () => {
  beforeEach(() => {
    _resetAlerter();
    runEnableBankingMigrations();
    cleanTables();
  });

  afterEach(() => {
    cleanTables();
  });

  it('creates unverified durable rows for all production trust conditions', () => {
    const state = getProductionTrustState();

    expect(state.isTrusted).toBe(false);
    expect(state.activeConditions.map(row => row.condition).sort()).toEqual([
      'access',
      'bank_sync',
      'multi_device_sync',
      'persistence',
    ]);
  });

  it('persists trust rows after reopening the database handle', () => {
    recordProductionTrustUntrusted({
      condition: 'access',
      reason: 'desktop_https_failed',
      message: 'Desktop HTTPS failed.',
      evidence: { host: 'actual.local' },
    });

    closeAccountDb();

    const state = getProductionTrustState();
    const access = state.conditions.find(row => row.condition === 'access');

    expect(access?.status).toBe('untrusted');
    expect(access?.reason).toBe('desktop_https_failed');
    expect(access?.evidence).toEqual({ host: 'actual.local' });
  });

  it('does not clear production trust state when operational alerts are acknowledged', async () => {
    recordProductionTrustUntrusted({
      condition: 'persistence',
      reason: 'restart_check_failed',
    });
    await triggerAlert({
      event_type: 'sync_failure',
      message: 'Sync failed',
      severity: 'warning',
    });

    const [alert] = getRecentAlerts();
    expect(acknowledgeAlert(alert.id)).toBe(true);

    const persistence = getProductionTrustState().conditions.find(
      row => row.condition === 'persistence',
    );
    expect(persistence?.status).toBe('untrusted');
    expect(persistence?.reason).toBe('restart_check_failed');
  });

  it('keeps bank sync untrusted when no sync log exists', () => {
    const state = runBankSyncProductionTrustCheck();
    const bankSync = state.conditions.find(
      row => row.condition === 'bank_sync',
    );

    expect(bankSync?.status).toBe('untrusted');
    expect(bankSync?.reason).toBe('bank_sync_missing');
  });

  it('keeps bank sync untrusted when the latest sync log failed', () => {
    getAccountDb().mutate(
      "INSERT INTO eb_sync_log (actual_account_id, eb_account_uid, status, error_message) VALUES ('a1', 'e1', 'error', 'timeout')",
    );

    const state = runBankSyncProductionTrustCheck();
    const bankSync = state.conditions.find(
      row => row.condition === 'bank_sync',
    );

    expect(bankSync?.status).toBe('untrusted');
    expect(bankSync?.reason).toBe('bank_sync_failed');
  });

  it('keeps bank sync untrusted when the latest sync log is stale', () => {
    const staleEpoch = Math.floor((Date.now() - 8 * 60 * 60 * 1000) / 1000);
    getAccountDb().mutate(
      "INSERT INTO eb_sync_log (actual_account_id, eb_account_uid, synced_at, status) VALUES ('a1', 'e1', ?, 'ok')",
      [staleEpoch],
    );

    const state = runBankSyncProductionTrustCheck();
    const bankSync = state.conditions.find(
      row => row.condition === 'bank_sync',
    );

    expect(bankSync?.status).toBe('untrusted');
    expect(bankSync?.reason).toBe('bank_sync_stale');
  });

  it('clears bank sync only when an automated check sees a recent successful sync log', () => {
    const recentEpoch = Math.floor(Date.now() / 1000);
    getAccountDb().mutate(
      "INSERT INTO eb_sync_log (actual_account_id, eb_account_uid, synced_at, status) VALUES ('a1', 'e1', ?, 'ok')",
      [recentEpoch],
    );

    const state = runBankSyncProductionTrustCheck();
    const bankSync = state.conditions.find(
      row => row.condition === 'bank_sync',
    );

    expect(bankSync?.status).toBe('trusted');
    expect(bankSync?.reason).toBe('bank_sync_recent_ok');
    expect(bankSync?.recoverySource).toBe('automated');
  });

  it('manual verification clears only the named condition', () => {
    verifyProductionTrustCondition({
      condition: 'access',
      source: 'manual',
      evidence: { verifiedBy: 'desktop-check' },
    });

    const state = getProductionTrustState();
    const access = state.conditions.find(row => row.condition === 'access');
    const persistence = state.conditions.find(
      row => row.condition === 'persistence',
    );

    expect(access?.status).toBe('trusted');
    expect(access?.recoverySource).toBe('manual');
    expect(persistence?.status).toBe('untrusted');
  });

  it('redacts secret-looking evidence keys before storage', () => {
    recordProductionTrustUntrusted({
      condition: 'access',
      reason: 'manual_probe_failed',
      evidence: {
        token: 'raw-token',
        privateKey: 'raw-key',
        host: 'actual.local',
      },
    });

    const access = getProductionTrustState().conditions.find(
      row => row.condition === 'access',
    );
    expect(access?.evidence).toEqual({
      token: '[redacted]',
      privateKey: '[redacted]',
      host: 'actual.local',
    });
  });

  it('rejects unauthenticated production trust route reads', async () => {
    const res = await request(productionTrustApp).get('/');

    expect(res.statusCode).toBe(401);
    expect(res.body.reason).toBe('unauthorized');
  });

  it('allows authenticated production trust route reads', async () => {
    const res = await request(productionTrustApp)
      .get('/')
      .set('x-actual-token', 'valid-token');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.activeConditions).toHaveLength(4);
  });
});
