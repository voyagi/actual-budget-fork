// [eb] TypeScript interfaces for Enable Banking API response shapes.
// Field names match the Enable Banking REST API exactly (snake_case).
// These types are used for documentation and editor autocomplete only -
// the service functions and utils are plain JS with JSDoc.

export interface EBTransactionAmount {
  amount: string;
  currency: string;
}

export interface EBParty {
  name?: string;
  iban?: string;
}

export interface EBTransaction {
  entry_reference?: string;
  transaction_amount: EBTransactionAmount;
  credit_debit_indicator: 'CRDT' | 'DBIT';
  booking_date?: string;
  value_date?: string;
  creditor?: EBParty;
  debtor?: EBParty;
  remittance_information?: string[];
  status: 'BOOK' | 'PDNG' | 'INFO' | 'OTHR';
}

export interface EBBalanceAmount {
  amount: string;
  currency: string;
}

export interface EBBalance {
  balance_type: 'CLAV' | 'ITAV' | 'ITBD' | 'CLBD' | string;
  balance_amount: EBBalanceAmount;
  credit_debit_indicator?: 'CRDT' | 'DBIT';
}

export interface EBAccount {
  uid?: string;
  account_id?: string;
  account_name?: string;
  iban?: string;
  currency?: string;
  aspsp_name?: string;
  product?: string;
}

export interface EBSession {
  session_id: string;
  accounts: EBAccount[];
  valid_until: string;
}
