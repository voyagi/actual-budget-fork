import express from 'express';

import { validateSessionMiddleware } from './util/middlewares.js';
import {
  getProductionTrustState,
  isProductionTrustCondition,
  recordProductionTrustUntrusted,
  runProductionTrustAutomatedCheck,
  verifyProductionTrustCondition,
} from './util/production-trust.js';

const app = express();

export { app as handlers };

app.use(express.json());
app.use(validateSessionMiddleware);

function parseMaxAgeMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

app.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', data: getProductionTrustState() });
});

app.post('/record', (req, res) => {
  const { condition, reason, message, evidence } = req.body || {};

  if (!isProductionTrustCondition(condition)) {
    res.status(400).json({ status: 'error', reason: 'invalid-condition' });
    return;
  }

  if (!reason || typeof reason !== 'string') {
    res.status(400).json({ status: 'error', reason: 'missing-reason' });
    return;
  }

  res.status(200).json({
    status: 'ok',
    data: recordProductionTrustUntrusted({
      condition,
      reason,
      message: typeof message === 'string' ? message : undefined,
      evidence,
    }),
  });
});

app.post('/check', (req, res) => {
  const { condition, maxAgeMs } = req.body || {};

  if (condition != null && !isProductionTrustCondition(condition)) {
    res.status(400).json({ status: 'error', reason: 'invalid-condition' });
    return;
  }

  res.status(200).json({
    status: 'ok',
    data: runProductionTrustAutomatedCheck({
      condition,
      maxAgeMs: parseMaxAgeMs(maxAgeMs),
    }),
  });
});

app.post('/manual-verify', (req, res) => {
  const { condition, evidence, message } = req.body || {};

  if (!isProductionTrustCondition(condition)) {
    res.status(400).json({ status: 'error', reason: 'invalid-condition' });
    return;
  }

  res.status(200).json({
    status: 'ok',
    data: verifyProductionTrustCondition({
      condition,
      source: 'manual',
      reason: 'manual_verified',
      message: typeof message === 'string' ? message : undefined,
      evidence,
    }),
  });
});
