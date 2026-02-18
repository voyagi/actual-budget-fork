import express from 'express';

import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '../util/middlewares.js';

import { testAuth } from './enablebanking-service.js';
import { handleError } from './util/handle-error.js';

const app = express();
app.use(requestLoggerMiddleware);

// Unauthenticated health-check route to verify JWT auth against Enable Banking
// during development. Placed before session middleware intentionally so it does
// not require a logged-in Actual user session.
app.get('/test-auth', async (req, res) => {
  try {
    await testAuth();
    res.send({ status: 'ok', data: { configured: true } });
  } catch (err) {
    res.send({
      status: 'ok',
      data: { configured: false, reason: err.message },
    });
  }
});

export { app as handlers };
app.use(express.json());
app.use(validateSessionMiddleware);

// Session-authenticated status route for production use by the frontend.
app.post(
  '/status',
  handleError(async (req, res) => {
    const keyPath = process.env.ENABLE_BANKING_KEY_PATH;
    const bankingAppId = process.env.ENABLE_BANKING_APP_ID;

    if (!bankingAppId || !keyPath) {
      return res.send({
        status: 'ok',
        data: {
          configured: false,
          reason: 'Missing ENABLE_BANKING_APP_ID or ENABLE_BANKING_KEY_PATH',
        },
      });
    }

    try {
      await testAuth();
      res.send({ status: 'ok', data: { configured: true } });
    } catch (err) {
      res.send({
        status: 'ok',
        data: { configured: false, reason: err.message },
      });
    }
  }),
);
