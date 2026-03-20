export type AccountEntity = {
  id: string;
  name: string;
  offbudget: 0 | 1;
  closed: 0 | 1;
  sort_order: number;
  last_reconciled: string | null;
  tombstone: 0 | 1;

  // Sync fields
  account_id: string | null;
  bank: string | null;
  bankName: string | null;
  bankId: string | null;
  mask: string | null; // end of bank account number
  official_name: string | null;
  balance_current: number | null;
  balance_available: number | null;
  balance_limit: number | null;
  account_sync_source: AccountSyncSource | null;
  last_sync: string | null;
};

export type AccountSyncSource =
  | 'simpleFin'
  | 'goCardless'
  | 'pluggyai'
  | 'enableBanking';

export type SyncServerEnableBankingAccount = {
  account_id: string;
  name: string;
  institution: string;
  mask: string;
  official_name: string | null;
  balance: number | null;
  iban: string | null;
  session_id: string;
};
