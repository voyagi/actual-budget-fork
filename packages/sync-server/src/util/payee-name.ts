import { title } from './title/index';

interface TransactionAccount {
  iban?: string;
}

interface Transaction {
  transactionAmount: { amount: number | string };
  debtorName?: string;
  debtorAccount?: TransactionAccount;
  creditorName?: string;
  creditorAccount?: TransactionAccount;
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  additionalInformation?: string;
}

function formatPayeeIban(iban: string): string {
  return '(' + iban.slice(0, 4) + ' XXX ' + iban.slice(-4) + ')';
}

export const formatPayeeName = (trans: Transaction): string => {
  const amount = trans.transactionAmount.amount;
  const nameParts: string[] = [];

  // get the correct name and account fields for the transaction amount
  let name: string | undefined;
  let account: TransactionAccount | undefined;
  if (Number(amount) > 0 || Object.is(Number(amount), 0)) {
    name = trans.debtorName;
    account = trans.debtorAccount;
  } else {
    name = trans.creditorName;
    account = trans.creditorAccount;
  }

  // use the correct name field if it was found
  // if not, use whatever we can find

  // if the primary name option is set, prevent the account from falling back
  account = name ? account : trans.debtorAccount || trans.creditorAccount;

  name =
    name ||
    trans.debtorName ||
    trans.creditorName ||
    trans.remittanceInformationUnstructured ||
    (trans.remittanceInformationUnstructuredArray || []).join(', ') ||
    trans.additionalInformation;

  if (name) {
    nameParts.push(title(name));
  }

  if (account && account.iban) {
    nameParts.push(formatPayeeIban(account.iban));
  }

  return nameParts.join(' ');
};
