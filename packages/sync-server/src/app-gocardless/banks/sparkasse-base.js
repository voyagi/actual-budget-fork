import Fallback from './integration-bank';

/** @type {import('./bank.interface').IBank} */
const SparkasseBase = {
  ...Fallback,

  normalizeTransaction(transaction, booked) {
    const editedTrans = { ...transaction };

    const remittanceInformationUnstructured =
      transaction.remittanceInformationUnstructured ??
      transaction.remittanceInformationStructured ??
      transaction.remittanceInformationStructuredArray?.join(' ');

    const usefulCreditorName =
      transaction.ultimateCreditor ||
      transaction.creditorName ||
      transaction.debtorName;

    editedTrans.remittanceInformationUnstructured =
      remittanceInformationUnstructured;
    editedTrans.creditorName = usefulCreditorName;
    editedTrans.debtorName = transaction.debtorName;

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

export default SparkasseBase;
