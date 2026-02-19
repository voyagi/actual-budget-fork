// [eb] Custom error classes for Enable Banking error handling.
// Using named classes (not anonymous class expressions) so that instanceof
// checks and error.name remain reliable across module boundaries.

export class EnableBankingError extends Error {
  constructor(message, errorCode) {
    super(message);
    this.name = 'EnableBankingError';
    this.errorCode = errorCode;
  }
}

export class SessionExpiredError extends Error {
  constructor(message) {
    super(message ?? 'Enable Banking session has expired');
    this.name = 'SessionExpiredError';
  }
}

export class RateLimitError extends Error {
  constructor(message) {
    super(message ?? 'Enable Banking rate limit exceeded');
    this.name = 'RateLimitError';
  }
}
