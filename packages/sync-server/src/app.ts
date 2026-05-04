import fs, { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';

import { bootstrap, getAccountDb } from './account-db';
import * as accountApp from './app-account';
import * as adminApp from './app-admin';
import * as corsApp from './app-cors-proxy';
import * as enableBankingApp from './app-enablebanking/app-enablebanking.js';
import * as goCardlessApp from './app-gocardless/app-gocardless';
import * as openidApp from './app-openid';
import * as pluggai from './app-pluggyai/app-pluggyai';
import * as productionTrustApp from './app-production-trust.js';
import * as secretApp from './app-secrets';
import * as simpleFinApp from './app-simplefin/app-simplefin';
import * as syncApp from './app-sync';
import { config } from './load-config';
import { startScheduler } from './scheduler.js';
import { getRecentAlerts, acknowledgeAlert } from './util/alerter.js';
import { runAuditMigrations } from './util/audit-migrations.js';
import { getLatencyPercentiles, getSyncStats } from './util/metrics.js';
import { latencyMiddleware } from './util/middlewares.js';

const app = express();

process.on('unhandledRejection', reason => {
  console.log('Rejection:', reason);
});

app.disable('x-powered-by');
app.use(cors({ origin: config.get('corsOrigin') }));
app.set('trust proxy', config.get('trustedProxies'));
if (process.env.NODE_ENV !== 'development') {
  app.use((_req, res, next) => {
    res.set('Strict-Transport-Security', 'max-age=31536000');
    res.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    );
    next();
  });
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 500,
      legacyHeaders: false,
      standardHeaders: true,
    }),
  );
}

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  legacyHeaders: false,
  standardHeaders: true,
  message: { status: 'error', reason: 'too-many-requests' },
});

app.use(express.json({ limit: `${config.get('upload.fileSizeLimitMB')}mb` }));
app.use(latencyMiddleware);

app.use(
  express.raw({
    type: 'application/actual-sync',
    limit: `${config.get('upload.fileSizeSyncLimitMB')}mb`,
  }),
);

app.use(
  express.raw({
    type: 'application/encrypted-file',
    limit: `${config.get('upload.syncEncryptedFileSizeLimitMB')}mb`,
  }),
);

app.use('/sync', syncApp.handlers);
app.use(
  ['/account/login', '/account/bootstrap', '/openid/login'],
  authRateLimit,
);
app.use('/account', accountApp.handlers);
app.use('/enablebanking', enableBankingApp.handlers);
app.use('/gocardless', goCardlessApp.handlers);
app.use('/simplefin', simpleFinApp.handlers);
app.use('/pluggyai', pluggai.handlers);
app.use('/secret', secretApp.handlers);

if (config.get('corsProxy.enabled')) {
  app.use('/cors-proxy', corsApp.handlers);
}

app.use('/admin', adminApp.handlers);
app.use('/openid', openidApp.handlers);
app.use('/production-trust', productionTrustApp.handlers);

app.get('/mode', (req, res) => {
  res.send(config.get('mode'));
});

app.get('/info', (_req, res) => {
  function findPackageJson(startDir: string) {
    // find the nearest package.json file while traversing up the directory tree
    let currentPath = startDir;
    let directoriesSearched = 0;
    const pathRoot = resolve(currentPath, '/');
    try {
      while (currentPath !== pathRoot && directoriesSearched < 5) {
        const packageJsonPath = resolve(currentPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(
            readFileSync(packageJsonPath, 'utf-8'),
          );

          if (packageJson.name === '@actual-app/sync-server') {
            return packageJson;
          }
        }

        currentPath = resolve(join(currentPath, '..')); // Move up one directory
        directoriesSearched++;
      }
    } catch (error) {
      console.error('Error while searching for package.json:', error);
    }

    return null;
  }

  const dirname = resolve(fileURLToPath(import.meta.url), '../');
  const packageJson = findPackageJson(dirname);

  res.status(200).json({
    build: {
      name: packageJson?.name,
      description: packageJson?.description,
      version: packageJson?.version,
    },
  });
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'UP' });
});

app.get('/metrics', (_req, res) => {
  let sessions = null;
  try {
    const db = getAccountDb();
    const now = new Date().toISOString();
    const in14Days = new Date(Date.now() + 14 * 86400000).toISOString();
    const activeCount =
      (
        db.first(
          'SELECT COUNT(*) as cnt FROM eb_sessions WHERE valid_until > ?',
          [now],
        ) as { cnt: number } | null
      )?.cnt ?? 0;
    const expiringCount =
      (
        db.first(
          'SELECT COUNT(*) as cnt FROM eb_sessions WHERE valid_until > ? AND valid_until < ?',
          [now, in14Days],
        ) as { cnt: number } | null
      )?.cnt ?? 0;
    sessions = { active: activeCount, expiringWithin14Days: expiringCount };
  } catch {
    // DB not yet bootstrapped - sessions remains null
  }

  res.status(200).json({
    mem: process.memoryUsage(),
    uptime: process.uptime(),
    latency: getLatencyPercentiles(),
    sync: getSyncStats(),
    sessions,
  });
});

app.get('/alerts', (_req, res) => {
  res.status(200).json({ alerts: getRecentAlerts() });
});

app.post('/alerts/acknowledge', (req, res) => {
  const { alertId } = req.body;
  if (!alertId || typeof alertId !== 'string') {
    res.status(400).json({ status: 'error', reason: 'missing-alert-id' });
    return;
  }
  const found = acknowledgeAlert(alertId);
  res.status(found ? 200 : 404).json({ status: found ? 'ok' : 'not-found' });
});

// The web frontend
app.use((req, res, next) => {
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.set('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});
if (process.env.NODE_ENV === 'development') {
  console.log(
    'Running in development mode - Proxying frontend routes to React Dev Server',
  );

  // Imported within Dev block to allow dev dependency in package.json (reduces package size in production)
  const httpProxyMiddleware = await import('http-proxy-middleware');

  app.use(
    httpProxyMiddleware.createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
      ws: true,
    }),
  );
} else {
  console.log('Running in production mode - Serving static React app');

  app.use(express.static(config.get('webRoot'), { index: false }));
  app.get('/{*splat}', (req, res) =>
    res.sendFile('index.html', { root: config.get('webRoot') }),
  );
}

function parseHTTPSConfig(value: string) {
  if (value.startsWith('-----BEGIN')) {
    return value;
  }
  return fs.readFileSync(value);
}

function sendServerStartedMessage() {
  // Signify to any parent process that the server has started. Used in electron desktop app
  // oxlint-disable-next-line typescript/ban-ts-comment
  // @ts-ignore-error electron types
  process.parentPort?.postMessage({ type: 'server-started' });
  console.log(
    'Listening on ' + config.get('hostname') + ':' + config.get('port') + '...',
  );
}

export async function run() {
  const portVal = config.get('port');
  const port = typeof portVal === 'string' ? parseInt(portVal) : portVal;
  const hostname = config.get('hostname');
  const openIdConfig = config?.getProperties()?.openId;
  if (
    openIdConfig?.discoveryURL ||
    openIdConfig?.issuer?.authorization_endpoint
  ) {
    console.log('OpenID configuration found. Preparing server to use it');
    try {
      const { error } = await bootstrap({ openId: openIdConfig }, true);
      if (error) {
        console.log(error);
      } else {
        console.log('OpenID configured!');
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (config.get('https.key') && config.get('https.cert')) {
    const https = await import('node:https');
    const httpsOptions = {
      ...config.get('https'),
      key: parseHTTPSConfig(config.get('https.key')),
      cert: parseHTTPSConfig(config.get('https.cert')),
    };
    https.createServer(httpsOptions, app).listen(port, hostname, () => {
      sendServerStartedMessage();
    });
  } else {
    app.listen(port, hostname, () => {
      sendServerStartedMessage();
    });
  }

  // Create audit_log table if it doesn't exist.
  // Wrapped in try/catch because on first startup before bootstrap, the account DB may not exist yet.
  // The CREATE TABLE IF NOT EXISTS is idempotent so running it again later is fine.
  try {
    runAuditMigrations();
  } catch {
    // DB not bootstrapped yet - migrations will run on first request via getAccountDb()
  }

  // [eb] Start the 6-hour auto-sync scheduler. No-op when ENABLE_AUTO_SYNC != 'true'.
  // EB database tables are ready because runMigrations() runs at module load time
  // in app-enablebanking.ts (before any route or scheduler code).
  startScheduler();
}
