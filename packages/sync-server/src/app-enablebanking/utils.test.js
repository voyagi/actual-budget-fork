import { describe, expect, it } from 'vitest';

import {
  extractBalance,
  normalizeAccount,
  normalizeTransaction,
} from './utils';

describe('normalizeTransaction', () => {
  const baseTransaction = {
    entry_reference: 'REF-001',
    transaction_amount: { amount: '100.50', currency: 'EUR' },
    credit_debit_indicator: 'CRDT',
    booking_date: '2026-01-15',
    value_date: '2026-01-14',
    creditor: { name: 'Shop ABC' },
    debtor: { name: 'John Doe' },
    remittance_information: ['Payment for invoice #42'],
  };

  it('produces positive amount for CRDT (credit) transactions', () => {
    const result = normalizeTransaction(baseTransaction, true);
    expect(result.transactionAmount.amount).toBe('100.5');
    expect(parseFloat(result.transactionAmount.amount)).toBeGreaterThan(0);
  });

  it('produces negative amount for DBIT (debit) transactions', () => {
    const tx = { ...baseTransaction, credit_debit_indicator: 'DBIT' };
    const result = normalizeTransaction(tx, true);
    expect(result.transactionAmount.amount).toBe('-100.5');
    expect(parseFloat(result.transactionAmount.amount)).toBeLessThan(0);
  });

  it('preserves currency from transaction_amount', () => {
    const result = normalizeTransaction(baseTransaction, true);
    expect(result.transactionAmount.currency).toBe('EUR');
  });

  it('uses booking_date as primary date', () => {
    const result = normalizeTransaction(baseTransaction, true);
    expect(result.date).toBe('2026-01-15');
    expect(result.bookingDate).toBe('2026-01-15');
  });

  it('falls back to value_date when booking_date is missing', () => {
    const tx = { ...baseTransaction, booking_date: undefined };
    const result = normalizeTransaction(tx, true);
    expect(result.date).toBe('2026-01-14');
  });

  it('returns null date when both booking_date and value_date are missing', () => {
    const tx = {
      ...baseTransaction,
      booking_date: undefined,
      value_date: undefined,
    };
    const result = normalizeTransaction(tx, true);
    expect(result.date).toBeNull();
  });

  it('uses debtor name as payee for CRDT (credit) transactions', () => {
    const result = normalizeTransaction(baseTransaction, true);
    expect(result.payeeName).toBe('John Doe');
  });

  it('uses creditor name as payee for DBIT (debit) transactions', () => {
    const tx = { ...baseTransaction, credit_debit_indicator: 'DBIT' };
    const result = normalizeTransaction(tx, true);
    expect(result.payeeName).toBe('Shop ABC');
  });

  it('falls back to remittance_information when payee name is missing', () => {
    const tx = {
      ...baseTransaction,
      credit_debit_indicator: 'DBIT',
      creditor: undefined,
    };
    const result = normalizeTransaction(tx, true);
    expect(result.payeeName).toBe('Payment for invoice #42');
  });

  it('falls back to Unknown when no payee info is available', () => {
    const tx = {
      ...baseTransaction,
      credit_debit_indicator: 'DBIT',
      creditor: undefined,
      remittance_information: undefined,
    };
    const result = normalizeTransaction(tx, true);
    expect(result.payeeName).toBe('Unknown');
  });

  it('sets notes from remittance_information[0]', () => {
    const result = normalizeTransaction(baseTransaction, true);
    expect(result.notes).toBe('Payment for invoice #42');
  });

  it('sets null notes when remittance_information is missing', () => {
    const tx = { ...baseTransaction, remittance_information: undefined };
    const result = normalizeTransaction(tx, true);
    expect(result.notes).toBeNull();
  });

  it('maps entry_reference to transactionId and internalTransactionId', () => {
    const result = normalizeTransaction(baseTransaction, true);
    expect(result.transactionId).toBe('REF-001');
    expect(result.internalTransactionId).toBe('REF-001');
  });

  it('handles null entry_reference gracefully', () => {
    const tx = { ...baseTransaction, entry_reference: undefined };
    const result = normalizeTransaction(tx, true);
    expect(result.transactionId).toBeNull();
    expect(result.internalTransactionId).toBeNull();
  });

  it('sets booked flag correctly for booked transactions', () => {
    const result = normalizeTransaction(baseTransaction, true);
    expect(result.booked).toBe(true);
  });

  it('sets booked flag correctly for pending transactions', () => {
    const result = normalizeTransaction(baseTransaction, false);
    expect(result.booked).toBe(false);
  });

  it('handles zero amount', () => {
    const tx = {
      ...baseTransaction,
      transaction_amount: { amount: '0.00', currency: 'EUR' },
    };
    const result = normalizeTransaction(tx, true);
    expect(result.transactionAmount.amount).toBe('0');
  });

  it('handles amounts with many decimal places', () => {
    const tx = {
      ...baseTransaction,
      transaction_amount: { amount: '123.456', currency: 'EUR' },
    };
    const result = normalizeTransaction(tx, true);
    expect(parseFloat(result.transactionAmount.amount)).toBeCloseTo(123.456);
  });
});

describe('normalizeAccount', () => {
  const baseAccount = {
    uid: 'eb-uid-abc-123',
    account_id: { iban: 'FI2112345600000785' },
    name: 'My Checking Account',
    aspsp_name: 'Nordea',
    product: 'Personal Current Account',
  };

  it('uses uid as account_id', () => {
    const result = normalizeAccount(baseAccount, 'session-1');
    expect(result.account_id).toBe('eb-uid-abc-123');
  });

  it('extracts IBAN from account_id object', () => {
    const result = normalizeAccount(baseAccount, 'session-1');
    expect(result.iban).toBe('FI2112345600000785');
  });

  it('falls back to root iban field when account_id.iban is missing', () => {
    const acc = {
      ...baseAccount,
      account_id: {},
      iban: 'DE89370400440532013000',
    };
    const result = normalizeAccount(acc, 'session-1');
    expect(result.iban).toBe('DE89370400440532013000');
  });

  it('returns null iban when neither source has it', () => {
    const acc = { ...baseAccount, account_id: {} };
    const result = normalizeAccount(acc, 'session-1');
    expect(result.iban).toBeNull();
  });

  it('uses name as display name', () => {
    const result = normalizeAccount(baseAccount, 'session-1');
    expect(result.name).toBe('My Checking Account');
  });

  it('falls back to account_name when name is missing', () => {
    const acc = {
      ...baseAccount,
      name: undefined,
      account_name: 'Savings Acct',
    };
    const result = normalizeAccount(acc, 'session-1');
    expect(result.name).toBe('Savings Acct');
  });

  it('falls back to IBAN when name and account_name are missing', () => {
    const acc = { ...baseAccount, name: undefined };
    const result = normalizeAccount(acc, 'session-1');
    expect(result.name).toBe('FI2112345600000785');
  });

  it('falls back to Unknown Account when nothing is available', () => {
    const acc = { uid: 'uid-1', account_id: {} };
    const result = normalizeAccount(acc, 'session-1');
    expect(result.name).toBe('Unknown Account');
  });

  it('sets institution from aspsp_name', () => {
    const result = normalizeAccount(baseAccount, 'session-1');
    expect(result.institution).toBe('Nordea');
  });

  it('defaults institution to empty string when aspsp_name is missing', () => {
    const acc = { ...baseAccount, aspsp_name: undefined };
    const result = normalizeAccount(acc, 'session-1');
    expect(result.institution).toBe('');
  });

  it('mask is last 4 digits of IBAN', () => {
    const result = normalizeAccount(baseAccount, 'session-1');
    expect(result.mask).toBe('0785');
  });

  it('mask is empty when IBAN is missing', () => {
    const acc = { uid: 'uid-1', account_id: {} };
    const result = normalizeAccount(acc, 'session-1');
    expect(result.mask).toBe('');
  });

  it('sets official_name from product', () => {
    const result = normalizeAccount(baseAccount, 'session-1');
    expect(result.official_name).toBe('Personal Current Account');
  });

  it('sets balance to null', () => {
    const result = normalizeAccount(baseAccount, 'session-1');
    expect(result.balance).toBeNull();
  });

  it('preserves session_id', () => {
    const result = normalizeAccount(baseAccount, 'session-1');
    expect(result.session_id).toBe('session-1');
  });
});

describe('extractBalance', () => {
  it('returns null for empty array', () => {
    expect(extractBalance([])).toBeNull();
  });

  it('returns null for non-array input', () => {
    expect(extractBalance(null)).toBeNull();
    expect(extractBalance(undefined)).toBeNull();
  });

  it('picks CLAV over lower-priority types', () => {
    const balances = [
      {
        balance_type: 'ITAV',
        balance_amount: { amount: '50.00', currency: 'EUR' },
      },
      {
        balance_type: 'CLAV',
        balance_amount: { amount: '100.00', currency: 'EUR' },
      },
    ];
    expect(extractBalance(balances)).toBe(10000);
  });

  it('picks ITAV when CLAV is not present', () => {
    const balances = [
      {
        balance_type: 'ITBD',
        balance_amount: { amount: '30.00', currency: 'EUR' },
      },
      {
        balance_type: 'ITAV',
        balance_amount: { amount: '75.00', currency: 'EUR' },
      },
    ];
    expect(extractBalance(balances)).toBe(7500);
  });

  it('picks ITBD when CLAV and ITAV are not present', () => {
    const balances = [
      {
        balance_type: 'CLBD',
        balance_amount: { amount: '20.00', currency: 'EUR' },
      },
      {
        balance_type: 'ITBD',
        balance_amount: { amount: '60.00', currency: 'EUR' },
      },
    ];
    expect(extractBalance(balances)).toBe(6000);
  });

  it('picks CLBD as last resort', () => {
    const balances = [
      {
        balance_type: 'CLBD',
        balance_amount: { amount: '42.50', currency: 'EUR' },
      },
    ];
    expect(extractBalance(balances)).toBe(4250);
  });

  it('returns null for unknown balance types', () => {
    const balances = [
      {
        balance_type: 'XBAL',
        balance_amount: { amount: '10.00', currency: 'EUR' },
      },
    ];
    expect(extractBalance(balances)).toBeNull();
  });

  it('converts to integer minor units (cents)', () => {
    const balances = [
      {
        balance_type: 'CLAV',
        balance_amount: { amount: '123.45', currency: 'EUR' },
      },
    ];
    expect(extractBalance(balances)).toBe(12345);
  });

  it('applies negative sign for DBIT balances', () => {
    const balances = [
      {
        balance_type: 'CLAV',
        balance_amount: { amount: '50.00', currency: 'EUR' },
        credit_debit_indicator: 'DBIT',
      },
    ];
    expect(extractBalance(balances)).toBe(-5000);
  });

  it('applies positive sign for CRDT balances (default)', () => {
    const balances = [
      {
        balance_type: 'CLAV',
        balance_amount: { amount: '50.00', currency: 'EUR' },
        credit_debit_indicator: 'CRDT',
      },
    ];
    expect(extractBalance(balances)).toBe(5000);
  });

  it('defaults to positive when credit_debit_indicator is missing', () => {
    const balances = [
      {
        balance_type: 'CLAV',
        balance_amount: { amount: '80.00', currency: 'EUR' },
      },
    ];
    expect(extractBalance(balances)).toBe(8000);
  });

  it('rounds correctly for amounts with sub-cent precision', () => {
    const balances = [
      {
        balance_type: 'CLAV',
        balance_amount: { amount: '99.999', currency: 'EUR' },
      },
    ];
    // 99.999 * 100 = 9999.9 -> Math.round -> 10000
    expect(extractBalance(balances)).toBe(10000);
  });

  it('handles zero balance', () => {
    const balances = [
      {
        balance_type: 'CLAV',
        balance_amount: { amount: '0.00', currency: 'EUR' },
      },
    ];
    expect(extractBalance(balances)).toBe(0);
  });
});
