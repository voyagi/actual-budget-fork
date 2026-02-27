import Fallback from './integration-bank';
import SparkasseBase from './sparkasse-base';

/** @type {import('./bank.interface').IBank} */
export default {
  ...SparkasseBase,

  institutionIds: ['BERLINER_SPARKASSE_BELADEBEXXX'],

  normalizeTransaction(transaction, booked) {
    const editedTrans = { ...transaction };

    const remittanceInformationUnstructured =
      transaction.remittanceInformationUnstructured ??
      transaction.remittanceInformationStructured ??
      transaction.remittanceInformationStructuredArray?.join(' ');

    editedTrans.remittanceInformationUnstructured =
      transaction.additionalInformation
        ? remittanceInformationUnstructured +
          ' ' +
          transaction.additionalInformation
        : remittanceInformationUnstructured;

    editedTrans.creditorName =
      transaction.ultimateCreditor ||
      transaction.creditorName ||
      transaction.debtorName;

    return Fallback.normalizeTransaction(transaction, booked, editedTrans);
  },
};
