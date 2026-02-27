import {
  EnableBankingError,
  SessionExpiredError,
  RateLimitError,
} from '../errors.js';

export function handleError(func) {
  return (req, res) => {
    func(req, res).catch(err => {
      console.log('Error', req.originalUrl, err.message || String(err));

      let errorCode = 'INTERNAL_ERROR';
      let errorType = 'internal-error';

      if (err instanceof SessionExpiredError) {
        errorCode = 'SESSION_EXPIRED';
        errorType = 'session-expired';
      } else if (err instanceof RateLimitError) {
        errorCode = 'RATE_LIMIT';
        errorType = 'rate-limit';
      } else if (err instanceof EnableBankingError) {
        errorCode = err.errorCode ?? 'ENABLE_BANKING_ERROR';
        errorType = 'enable-banking-error';
      }

      res.send({
        status: 'ok',
        data: { error_code: errorCode, error_type: errorType },
      });
    });
  };
}
