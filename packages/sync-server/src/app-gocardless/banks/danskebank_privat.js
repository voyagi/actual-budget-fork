import Fallback from './integration-bank';

/** @type {import('./bank.interface').IBank} */
export default {
  ...Fallback,

  // TODO: Add BICs for other Danske Bank regions (Sweden, Finland, etc.).
  // Full list at https://danskeci.com/ci/transaction-banking/bank-identifier-code
  institutionIds: ['DANSKEBANK_DABADKKK', 'DANSKEBANK_DABANO22'],

  normalizeTransaction(transaction, booked) {
    const editedTrans = { ...transaction };

    /**
     * Danske Bank appends the EndToEndID: NOTPROVIDED to
     * remittanceInformationUnstructured, cluttering the data.
     *
     * We clean thais up by removing any instances of this string from all transactions.
     *
     */
    editedTrans.remittanceInformationUnstructured =
      transaction.remittanceInformationUnstructured.replace(
        '\nEndToEndID: NOTPROVIDED',
        '',
      );

    return Fallback.normalizeTransaction(transaction, booked, editedTrans);
  },

  calculateStartingBalance(sortedTransactions = [], balances = []) {
    return Fallback.calculateStartingBalanceFromType(
      sortedTransactions,
      balances,
      ['interimAvailable'],
    );
  },
};
