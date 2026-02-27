import { describe, expect, it, vi } from 'vitest';

import {
  EnableBankingError,
  RateLimitError,
  SessionExpiredError,
} from '../errors';

import { handleError } from './handle-error';

// Minimal mock for Express req/res.
function mockReqRes(url = '/test') {
  const req = { originalUrl: url };
  const res = {
    _body: null,
    send(body) {
      this._body = body;
    },
  };
  return { req, res };
}

describe('handleError', () => {
  it('calls the wrapped function normally on success', async () => {
    const fn = vi.fn(async (req, res) => {
      res.send({ status: 'ok', data: { result: 42 } });
    });

    const wrapped = handleError(fn);
    const { req, res } = mockReqRes();
    await wrapped(req, res);

    expect(fn).toHaveBeenCalledWith(req, res);
    expect(res._body).toEqual({ status: 'ok', data: { result: 42 } });
  });

  it('catches generic errors and returns INTERNAL_ERROR', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fn = async () => {
      throw new Error('something went wrong');
    };

    const wrapped = handleError(fn);
    const { req, res } = mockReqRes();
    await wrapped(req, res);

    expect(res._body).toEqual({
      status: 'ok',
      data: {
        error_code: 'INTERNAL_ERROR',
        error_type: 'internal-error',
      },
    });
    console.log.mockRestore();
  });

  it('maps SessionExpiredError to SESSION_EXPIRED error code', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fn = async () => {
      throw new SessionExpiredError('Session expired');
    };

    const wrapped = handleError(fn);
    const { req, res } = mockReqRes();
    await wrapped(req, res);

    expect(res._body).toEqual({
      status: 'ok',
      data: {
        error_code: 'SESSION_EXPIRED',
        error_type: 'session-expired',
      },
    });
    console.log.mockRestore();
  });

  it('maps RateLimitError to RATE_LIMIT error code', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fn = async () => {
      throw new RateLimitError();
    };

    const wrapped = handleError(fn);
    const { req, res } = mockReqRes();
    await wrapped(req, res);

    expect(res._body).toEqual({
      status: 'ok',
      data: {
        error_code: 'RATE_LIMIT',
        error_type: 'rate-limit',
      },
    });
    console.log.mockRestore();
  });

  it('maps EnableBankingError to custom error code', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fn = async () => {
      throw new EnableBankingError('Bad bank', 'ASPSP_NOT_FOUND');
    };

    const wrapped = handleError(fn);
    const { req, res } = mockReqRes();
    await wrapped(req, res);

    expect(res._body).toEqual({
      status: 'ok',
      data: {
        error_code: 'ASPSP_NOT_FOUND',
        error_type: 'enable-banking-error',
      },
    });
    console.log.mockRestore();
  });

  it('defaults EnableBankingError code to ENABLE_BANKING_ERROR when errorCode is missing', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fn = async () => {
      throw new EnableBankingError('generic EB error');
    };

    const wrapped = handleError(fn);
    const { req, res } = mockReqRes();
    await wrapped(req, res);

    expect(res._body.data.error_code).toBe('ENABLE_BANKING_ERROR');
    console.log.mockRestore();
  });

  it('logs the error with request URL', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fn = async () => {
      throw new Error('test error message');
    };

    const wrapped = handleError(fn);
    const { req, res } = mockReqRes('/my-endpoint');
    await wrapped(req, res);

    expect(logSpy).toHaveBeenCalledWith(
      'Error',
      '/my-endpoint',
      'test error message',
    );
    logSpy.mockRestore();
  });

  it('does not leak stack traces to the client', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fn = async () => {
      throw new Error('secret internal details');
    };

    const wrapped = handleError(fn);
    const { req, res } = mockReqRes();
    await wrapped(req, res);

    const body = JSON.stringify(res._body);
    expect(body).not.toContain('secret internal details');
    expect(body).not.toContain('at ');
    console.log.mockRestore();
  });
});
