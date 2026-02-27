import Fallback from './integration-bank';

/** @type {import('./bank.interface').IBank} */
export default {
  ...Fallback,

  institutionIds: ['SANDBOXFINANCE_SFIN0000'],

  calculateStartingBalance(sortedTransactions = [], balances = []) {
    return Fallback.calculateStartingBalanceFromType(
      sortedTransactions,
      balances,
      ['interimAvailable'],
    );
  },
};
