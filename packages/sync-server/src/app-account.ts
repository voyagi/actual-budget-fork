import type { Request, Response } from 'express';
import express from 'express';

import {
  bootstrap,
  getActiveLoginMethod,
  getLoginMethod,
  getServerPrefs,
  getUserInfo,
  isAdmin,
  listLoginMethods,
  needsBootstrap,
  setServerPrefs,
} from './account-db';
import { isValidRedirectUrl, loginWithOpenIdSetup } from './accounts/openid';
import { changePassword, loginWithPassword } from './accounts/password';
import { getBackupStatus, runBackup } from './util/backup.js';
import { writeAuditLog } from './util/audit.js';
import { triggerAlert } from './util/alerter.js';
import logger from './util/logger.js';
import { errorMiddleware, requestLoggerMiddleware } from './util/middlewares';
import { validateAuthHeader, validateSession } from './util/validate-user';

// In-memory auth failure rate tracking per IP for alert triggering.
// Map<ip, { count, windowStart }> -- resets on server restart.
const authFailureTracker = new Map<string, { count: number; windowStart: number }>();
const AUTH_FAILURE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const AUTH_FAILURE_THRESHOLD = 3;

function trackAuthFailure(ip: string): void {
  const now = Date.now();
  const entry = authFailureTracker.get(ip);
  if (!entry || now - entry.windowStart > AUTH_FAILURE_WINDOW_MS) {
    authFailureTracker.set(ip, { count: 1, windowStart: now });
    return;
  }
  entry.count++;
  if (entry.count >= AUTH_FAILURE_THRESHOLD) {
    triggerAlert({
      event_type: 'auth_failure_burst',
      message: `${entry.count} authentication failures from IP ${ip} in ${Math.round((now - entry.windowStart) / 1000)}s`,
      severity: 'warning',
    }).catch(() => {}); // fire-and-forget
    // Reset counter after alerting to avoid spamming (cooldown handles rapid re-fires)
    authFailureTracker.delete(ip);
  }
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(errorMiddleware);
app.use(requestLoggerMiddleware);
export { app as handlers };

// Non-authenticated endpoints:
//
// /needs-bootstrap
// /boostrap (special endpoint for setting up the instance, cant call again)
// /login

app.get('/needs-bootstrap', (_req: Request, res: Response) => {
  const availableLoginMethods = listLoginMethods();
  res.send({
    status: 'ok',
    data: {
      bootstrapped: !needsBootstrap(),
      loginMethod:
        availableLoginMethods.length === 1
          ? availableLoginMethods[0].method
          : getLoginMethod(),
      availableLoginMethods,
      multiuser: getActiveLoginMethod() === 'openid',
    },
  });
});

app.post('/bootstrap', async (req: Request, res: Response) => {
  const boot = await bootstrap(req.body);

  if (boot?.error) {
    res.status(400).send({ status: 'error', reason: boot?.error });
    return;
  }
  writeAuditLog({
    event_type: 'bootstrap',
    actor: 'system',
    ip_address: req.ip,
    outcome: 'success',
  });
  res.send({ status: 'ok', data: boot });
});

app.get('/login-methods', (_req: Request, res: Response) => {
  const methods = listLoginMethods();
  res.send({ status: 'ok', methods });
});

app.post('/login', async (req: Request, res: Response) => {
  const loginMethod = getLoginMethod(req);
  logger.info('Login attempt', { method: loginMethod });
  let tokenRes: { error?: string; token?: string } | null = null;
  switch (loginMethod) {
    case 'header': {
      const headerVal = req.get('x-actual-password') || '';
      const obfuscated =
        '*'.repeat(headerVal.length) || 'No password provided.';
      console.debug('HEADER VALUE: ' + obfuscated);
      if (headerVal === '') {
        res.send({ status: 'error', reason: 'invalid-header' });
        writeAuditLog({ event_type: 'login_failure', actor: 'unauthenticated', ip_address: req.ip, outcome: 'fail', details: { reason: 'invalid-header', method: 'header' } });
        trackAuthFailure(req.ip ?? 'unknown');
        return;
      } else {
        if (validateAuthHeader(req)) {
          tokenRes = loginWithPassword(headerVal);
        } else {
          res.send({ status: 'error', reason: 'proxy-not-trusted' });
          writeAuditLog({ event_type: 'login_failure', actor: 'unauthenticated', ip_address: req.ip, outcome: 'fail', details: { reason: 'proxy-not-trusted', method: 'header' } });
          trackAuthFailure(req.ip ?? 'unknown');
          return;
        }
      }
      break;
    }
    case 'openid': {
      if (!isValidRedirectUrl(req.body.returnUrl)) {
        res
          .status(400)
          .send({ status: 'error', reason: 'Invalid redirect URL' });
        return;
      }

      const { error, url } = await loginWithOpenIdSetup(
        req.body.returnUrl,
        req.body.password,
      );
      if (error) {
        res.status(400).send({ status: 'error', reason: error });
        return;
      }
      res.send({ status: 'ok', data: { returnUrl: url } });
      return;
    }

    default:
      tokenRes = loginWithPassword(req.body.password);
      break;
  }
  const { error, token } = tokenRes!;

  if (error) {
    writeAuditLog({
      event_type: 'login_failure',
      actor: 'unauthenticated',
      ip_address: req.ip,
      outcome: 'fail',
      details: { reason: error, method: loginMethod },
    });
    trackAuthFailure(req.ip ?? 'unknown');
    res.status(400).send({ status: 'error', reason: error });
    return;
  }

  writeAuditLog({
    event_type: 'login_success',
    actor: token!,
    ip_address: req.ip,
    outcome: 'success',
    details: { method: loginMethod },
  });
  res.send({ status: 'ok', data: { token } });
});

app.post('/change-password', (req: Request, res: Response) => {
  const session = validateSession(req, res);
  if (!session) return;

  const { error } = changePassword(req.body.password);

  if (error) {
    writeAuditLog({
      event_type: 'password_change',
      actor: (req.headers['x-actual-token'] as string) ?? 'unknown',
      ip_address: req.ip,
      outcome: 'fail',
      details: { reason: error },
    });
    res.status(400).send({ status: 'error', reason: error });
    return;
  }

  writeAuditLog({
    event_type: 'password_change',
    actor: (req.headers['x-actual-token'] as string) ?? 'unknown',
    ip_address: req.ip,
    outcome: 'success',
  });
  res.send({ status: 'ok', data: {} });
});

app.post('/server-prefs', (req: Request, res: Response) => {
  const session = validateSession(req, res);
  if (!session) return;

  if (!isAdmin(session.user_id)) {
    res.status(403).send({
      status: 'error',
      reason: 'forbidden',
      details: 'permission-not-found',
    });
    return;
  }

  const { prefs } = req.body || {};

  if (!prefs || typeof prefs !== 'object') {
    res.status(400).send({ status: 'error', reason: 'invalid-prefs' });
    return;
  }

  setServerPrefs(prefs);

  res.send({ status: 'ok', data: {} });
});

app.get('/validate', (req: Request, res: Response) => {
  const session = validateSession(req, res);
  if (session) {
    const user = getUserInfo(session.user_id);
    if (!user) {
      res.status(400).send({ status: 'error', reason: 'User not found' });
      return;
    }

    res.send({
      status: 'ok',
      data: {
        validated: true,
        userName: user?.user_name,
        permission: user?.role,
        userId: session?.user_id,
        displayName: user?.display_name,
        loginMethod: session?.auth_method,
        prefs: getServerPrefs(),
      },
    });
  }
});

// [eb] Backup endpoints

app.get('/backup/status', (req: Request, res: Response) => {
  const session = validateSession(req, res);
  if (!session) return;
  res.send({ status: 'ok', data: getBackupStatus() });
});

app.post('/backup/trigger', async (req: Request, res: Response) => {
  const session = validateSession(req, res);
  if (!session) return;
  if (!isAdmin(session.user_id)) {
    res.status(403).send({ status: 'error', reason: 'forbidden' });
    return;
  }
  const result = await runBackup();
  if (result.success) {
    res.send({
      status: 'ok',
      data: {
        archivePath: result.archivePath,
        filesCount: result.filesCount,
        sizeBytes: result.sizeBytes,
      },
    });
  } else {
    res.status(500).send({ status: 'error', reason: result.error });
  }
});
