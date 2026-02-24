// [eb] Transaction and account normalizers for Enable Banking API data.
// Enable Banking uses snake_case; loot-core expects camelCase GoCardless-compatible
// shapes. These functions are the translation layer between the two.

// Balance type priority order (highest preference first).
// CLAV = Closing Available, ITAV = Interim Available,
// ITBD = Interim Booked, CLBD = Closing Booked.
const BALANCE_PRIORITY = ['CLAV', 'ITAV', 'ITBD', 'CLBD'];

// [eb] Maps an Enable Banking transaction to the camelCase shape expected by
// loot-core's normalizeBankSyncTransactions() via defaultMappings.
//
// CRITICAL: `date` and `notes` are top-level fields required by defaultMappings.
// Without `date`, every transaction throws "'date' is required".
// Without `notes`, all transactions get null notes.
//
// Sign convention: CRDT (credit) = positive, DBIT (debit) = negative.
export function normalizeTransaction(ebTransaction, isBooked) {
  const {
    entry_reference,
    transaction_amount,
    credit_debit_indicator,
    booking_date,
    value_date,
    creditor,
    debtor,
    remittance_information,
  } = ebTransaction;

  const sign = credit_debit_indicator === 'CRDT' ? 1 : -1;
  const signedAmount = sign * parseFloat(transaction_amount.amount);

  // Payee: for debits the creditor is who we paid; for credits the debtor is
  // who paid us. Fall back to remittance info then 'Unknown'.
  const payeeName =
    (credit_debit_indicator === 'DBIT' ? creditor?.name : debtor?.name) ??
    remittance_information?.[0] ??
    'Unknown';

  // date must be a yyyy-MM-dd string. booking_date is preferred over value_date.
  const date = booking_date ?? value_date ?? null;

  const notes = remittance_information?.[0] ?? null;

  return {
    transactionId: entry_reference ?? null,
    internalTransactionId: entry_reference ?? null,
    transactionAmount: {
      amount: String(signedAmount),
      currency: transaction_amount.currency,
    },
    booked: isBooked,
    bookingDate: booking_date ?? null,
    valueDate: value_date ?? null,
    // Top-level date and notes required by loot-core defaultMappings
    date,
    payeeName,
    notes,
    remittanceInformationUnstructured: notes,
  };
}

// [eb] Maps an Enable Banking account to the SyncServerEnableBankingAccount shape.
// Uses ebAccount.uid (UUID string) as the primary identifier - this is the value
// used in Enable Banking API paths like /accounts/{uid}/transactions.
// CRITICAL: The same uid MUST be used in the /callback route when inserting into
// eb_account_map to guarantee consistency between the map and the normalizer output.
// NOTE: ebAccount.account_id is an OBJECT (e.g. { iban: "FI..." }), not a string.
// The IBAN is extracted from account_id.iban for display purposes.
export function normalizeAccount(ebAccount, sessionId) {
  const iban = ebAccount.account_id?.iban ?? ebAccount.iban ?? null;
  return {
    account_id: ebAccount.uid,
    name: ebAccount.name ?? ebAccount.account_name ?? iban ?? 'Unknown Account',
    institution: ebAccount.aspsp_name ?? '',
    mask: (iban ?? '').slice(-4),
    official_name: ebAccount.product ?? null,
    balance: null,
    iban,
    session_id: sessionId,
  };
}

// [eb] Picks the best available balance from an Enable Banking balances response
// and returns it as integer minor units (e.g. 123.45 EUR -> 12345).
// Priority: CLAV > ITAV > ITBD > CLBD.
// Returns null if no recognized balance type is found.
export function extractBalance(balances) {
  if (!Array.isArray(balances) || balances.length === 0) {
    return null;
  }

  for (const balanceType of BALANCE_PRIORITY) {
    const bal = balances.find(b => b.balance_type === balanceType);
    if (bal) {
      const raw = parseFloat(bal.balance_amount.amount);
      // Apply CRDT/DBIT sign if present on the balance object; default positive.
      const sign = bal.credit_debit_indicator === 'DBIT' ? -1 : 1;
      return Math.round(sign * raw * 100);
    }
  }

  return null;
}
