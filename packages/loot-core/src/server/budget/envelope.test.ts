// @ts-strict-ignore
import * as monthUtils from '../../shared/months';
import * as db from '../db';
import * as sheet from '../sheet';

import * as budgetActions from './actions';
import { createAllBudgets } from './base';

beforeEach(() => {
  return global.emptyDatabase()();
});

/**
 * Helper: set up a minimal envelope budget with one expense group,
 * one income group, one account, and return the expense category id.
 */
async function setupBasicBudget() {
  await sheet.loadSpreadsheet(db);
  sheet.get().meta().budgetType = 'envelope';

  await db.insertCategoryGroup({ id: 'group1', name: 'Bills' });
  await db.insertCategoryGroup({
    id: 'income-group',
    name: 'Income',
    is_income: 1,
  });

  const catId = await db.insertCategory({
    name: 'Groceries',
    cat_group: 'group1',
  });

  await db.insertAccount({ id: 'checking', name: 'Checking' });

  await createAllBudgets();

  return catId;
}

describe('Envelope budget', () => {
  // ---------------------------------------------------------------
  // 1. Cell creation
  // ---------------------------------------------------------------
  it('creates budget cells for expense categories after createAllBudgets', async () => {
    const catId = await setupBasicBudget();
    const month = monthUtils.currentMonth();
    const sheetName = monthUtils.sheetForMonth(month);

    // Expense categories should have budget, leftover, leftover-pos, carryover cells
    expect(sheet.getCellValue(sheetName, `budget-${catId}`)).toBe(0);
    expect(sheet.getCellValue(sheetName, `leftover-${catId}`)).toBe(0);
    expect(sheet.getCellValue(sheetName, `leftover-pos-${catId}`)).toBe(0);
    expect(sheet.getCellValue(sheetName, `carryover-${catId}`)).toBe(false);
    expect(sheet.getCellValue(sheetName, `sum-amount-${catId}`)).toBe(0);
  });

  // ---------------------------------------------------------------
  // 2. Budget amount via setBudget / getBudget
  // ---------------------------------------------------------------
  it('sets and retrieves a budget amount', async () => {
    const catId = await setupBasicBudget();
    const month = monthUtils.currentMonth();
    const sheetName = monthUtils.sheetForMonth(month);

    await budgetActions.setBudget({ category: catId, month, amount: 10000 });
    await sheet.waitOnSpreadsheet();

    expect(sheet.getCellValue(sheetName, `budget-${catId}`)).toBe(10000);
    expect(budgetActions.getBudget({ category: catId, month })).toBe(10000);
  });

  // ---------------------------------------------------------------
  // 3. Spending tracking via transactions
  // ---------------------------------------------------------------
  it('updates sum-amount when transactions are inserted', async () => {
    const catId = await setupBasicBudget();
    const month = monthUtils.currentMonth();
    const sheetName = monthUtils.sheetForMonth(month);

    await db.insertTransaction({
      date: `${month}-10`,
      amount: -3000, // $30 spent
      account: 'checking',
      category: catId,
    });

    await sheet.waitOnSpreadsheet();

    expect(sheet.getCellValue(sheetName, `sum-amount-${catId}`)).toBe(-3000);
  });

  // ---------------------------------------------------------------
  // 4. Leftover calculation: budget $100, spend $60, leftover = $40
  // ---------------------------------------------------------------
  it('calculates leftover as budgeted + spent', async () => {
    const catId = await setupBasicBudget();
    const month = monthUtils.currentMonth();
    const sheetName = monthUtils.sheetForMonth(month);

    await budgetActions.setBudget({ category: catId, month, amount: 10000 });

    await db.insertTransaction({
      date: `${month}-15`,
      amount: -6000, // spend $60
      account: 'checking',
      category: catId,
    });

    await sheet.waitOnSpreadsheet();

    // leftover = budget (10000) + spent (-6000) = 4000
    expect(sheet.getCellValue(sheetName, `leftover-${catId}`)).toBe(4000);
    // leftover-pos should equal leftover when positive
    expect(sheet.getCellValue(sheetName, `leftover-pos-${catId}`)).toBe(4000);
  });

  // ---------------------------------------------------------------
  // 5. Negative leftover: overspend, leftover-pos clamped to 0
  // ---------------------------------------------------------------
  it('clamps leftover-pos to 0 when leftover is negative', async () => {
    const catId = await setupBasicBudget();
    const month = monthUtils.currentMonth();
    const sheetName = monthUtils.sheetForMonth(month);

    await budgetActions.setBudget({ category: catId, month, amount: 5000 });

    await db.insertTransaction({
      date: `${month}-15`,
      amount: -8000, // overspend: $80 on $50 budget
      account: 'checking',
      category: catId,
    });

    await sheet.waitOnSpreadsheet();

    // leftover = 5000 + (-8000) = -3000
    expect(sheet.getCellValue(sheetName, `leftover-${catId}`)).toBe(-3000);
    // leftover-pos clamped to 0
    expect(sheet.getCellValue(sheetName, `leftover-pos-${catId}`)).toBe(0);
  });

  // ---------------------------------------------------------------
  // 6. Carryover propagation across months
  // ---------------------------------------------------------------
  it('carries over leftover to next month when carryover is enabled', async () => {
    await sheet.loadSpreadsheet(db);
    sheet.get().meta().budgetType = 'envelope';

    await db.insertCategoryGroup({ id: 'group1', name: 'Bills' });
    await db.insertCategoryGroup({
      id: 'income-group',
      name: 'Income',
      is_income: 1,
    });

    const catId = await db.insertCategory({
      name: 'Groceries',
      cat_group: 'group1',
    });

    await db.insertAccount({ id: 'checking', name: 'Checking' });

    // Use current-month-relative dates so they fall within the budget range
    const month1 = monthUtils.currentMonth();
    const month2 = monthUtils.addMonths(month1, 1);

    await createAllBudgets();

    const sheet1 = monthUtils.sheetForMonth(month1);
    const sheet2 = monthUtils.sheetForMonth(month2);

    // Budget $100 in month1, spend $60 => leftover $40
    await budgetActions.setBudget({
      category: catId,
      month: month1,
      amount: 10000,
    });

    await db.insertTransaction({
      date: `${month1}-15`,
      amount: -6000,
      account: 'checking',
      category: catId,
    });

    await sheet.waitOnSpreadsheet();

    // Confirm month1 leftover
    expect(sheet.getCellValue(sheet1, `leftover-${catId}`)).toBe(4000);

    // Enable carryover for the category starting from month1
    await budgetActions.setCategoryCarryover({
      startMonth: month1,
      category: catId,
      flag: true,
    });

    await sheet.waitOnSpreadsheet();

    expect(sheet.getCellValue(sheet1, `carryover-${catId}`)).toBe(true);

    // In month2 with no budget set, leftover should include prev leftover
    // leftover = budget(0) + spent(0) + prevLeftover(4000) = 4000
    expect(sheet.getCellValue(sheet2, `leftover-${catId}`)).toBe(4000);
  });

  it('does not carry over full leftover when carryover is disabled (uses leftover-pos)', async () => {
    await sheet.loadSpreadsheet(db);
    sheet.get().meta().budgetType = 'envelope';

    await db.insertCategoryGroup({ id: 'group1', name: 'Bills' });
    await db.insertCategoryGroup({
      id: 'income-group',
      name: 'Income',
      is_income: 1,
    });

    const catId = await db.insertCategory({
      name: 'Groceries',
      cat_group: 'group1',
    });

    await db.insertAccount({ id: 'checking', name: 'Checking' });

    const month1 = monthUtils.currentMonth();
    const month2 = monthUtils.addMonths(month1, 1);

    await createAllBudgets();

    const sheet1 = monthUtils.sheetForMonth(month1);
    const sheet2 = monthUtils.sheetForMonth(month2);

    // Budget $50 in month1, spend $80 => leftover = -$30
    await budgetActions.setBudget({
      category: catId,
      month: month1,
      amount: 5000,
    });

    await db.insertTransaction({
      date: `${month1}-15`,
      amount: -8000,
      account: 'checking',
      category: catId,
    });

    await sheet.waitOnSpreadsheet();

    // With carryover OFF (default), negative leftover does NOT carry over
    // because the formula uses leftover-pos (clamped to 0) when carryover is false
    expect(sheet.getCellValue(sheet1, `leftover-${catId}`)).toBe(-3000);
    expect(sheet.getCellValue(sheet1, `leftover-pos-${catId}`)).toBe(0);
    expect(sheet.getCellValue(sheet1, `carryover-${catId}`)).toBe(false);

    // month2 leftover = budget(0) + spent(0) + leftover-pos(0) = 0
    expect(sheet.getCellValue(sheet2, `leftover-${catId}`)).toBe(0);
  });

  // ---------------------------------------------------------------
  // 7. Budget actions: setZero, copyPreviousMonth
  // ---------------------------------------------------------------
  it('setZero zeroes all budgets for a month', async () => {
    await sheet.loadSpreadsheet(db);
    sheet.get().meta().budgetType = 'envelope';

    await db.insertCategoryGroup({ id: 'group1', name: 'Bills' });
    await db.insertCategoryGroup({
      id: 'income-group',
      name: 'Income',
      is_income: 1,
    });

    const catA = await db.insertCategory({
      name: 'Groceries',
      cat_group: 'group1',
    });
    const catB = await db.insertCategory({
      name: 'Rent',
      cat_group: 'group1',
    });

    await createAllBudgets();
    const month = monthUtils.currentMonth();
    const sheetName = monthUtils.sheetForMonth(month);

    await budgetActions.setBudget({ category: catA, month, amount: 5000 });
    await budgetActions.setBudget({ category: catB, month, amount: 12000 });
    await sheet.waitOnSpreadsheet();

    expect(sheet.getCellValue(sheetName, `budget-${catA}`)).toBe(5000);
    expect(sheet.getCellValue(sheetName, `budget-${catB}`)).toBe(12000);

    await budgetActions.setZero({ month });
    await sheet.waitOnSpreadsheet();

    expect(sheet.getCellValue(sheetName, `budget-${catA}`)).toBe(0);
    expect(sheet.getCellValue(sheetName, `budget-${catB}`)).toBe(0);
  });

  it('copyPreviousMonth copies prior month budgets', async () => {
    await sheet.loadSpreadsheet(db);
    sheet.get().meta().budgetType = 'envelope';

    await db.insertCategoryGroup({ id: 'group1', name: 'Bills' });
    await db.insertCategoryGroup({
      id: 'income-group',
      name: 'Income',
      is_income: 1,
    });

    const catA = await db.insertCategory({
      name: 'Groceries',
      cat_group: 'group1',
    });
    const catB = await db.insertCategory({
      name: 'Rent',
      cat_group: 'group1',
    });

    await createAllBudgets();

    const month1 = monthUtils.currentMonth();
    const month2 = monthUtils.addMonths(month1, 1);
    const sheet2 = monthUtils.sheetForMonth(month2);

    // Set budgets in month1
    await budgetActions.setBudget({
      category: catA,
      month: month1,
      amount: 7500,
    });
    await budgetActions.setBudget({
      category: catB,
      month: month1,
      amount: 15000,
    });
    await sheet.waitOnSpreadsheet();

    // Copy to month2
    await budgetActions.copyPreviousMonth({ month: month2 });
    await sheet.waitOnSpreadsheet();

    expect(sheet.getCellValue(sheet2, `budget-${catA}`)).toBe(7500);
    expect(sheet.getCellValue(sheet2, `budget-${catB}`)).toBe(15000);
  });

  // ---------------------------------------------------------------
  // Summary cells
  // ---------------------------------------------------------------
  it('tracks total-budgeted and total-spent summary cells', async () => {
    await sheet.loadSpreadsheet(db);
    sheet.get().meta().budgetType = 'envelope';

    await db.insertCategoryGroup({ id: 'group1', name: 'Bills' });
    await db.insertCategoryGroup({
      id: 'income-group',
      name: 'Income',
      is_income: 1,
    });

    const catA = await db.insertCategory({
      name: 'Groceries',
      cat_group: 'group1',
    });
    const catB = await db.insertCategory({
      name: 'Rent',
      cat_group: 'group1',
    });

    await db.insertAccount({ id: 'checking', name: 'Checking' });
    await createAllBudgets();

    const month = monthUtils.currentMonth();
    const sheetName = monthUtils.sheetForMonth(month);

    // Budget both categories
    await budgetActions.setBudget({ category: catA, month, amount: 5000 });
    await budgetActions.setBudget({ category: catB, month, amount: 10000 });

    // Spend in both categories
    await db.insertTransaction({
      date: `${month}-10`,
      amount: -3000,
      account: 'checking',
      category: catA,
    });
    await db.insertTransaction({
      date: `${month}-12`,
      amount: -7000,
      account: 'checking',
      category: catB,
    });

    await sheet.waitOnSpreadsheet();

    // total-budgeted is negated (see createSummary: -sumAmounts)
    expect(sheet.getCellValue(sheetName, 'total-budgeted')).toBe(-15000);
    // total-spent sums the group-sum-amounts
    expect(sheet.getCellValue(sheetName, 'total-spent')).toBe(-10000);
  });

  // ---------------------------------------------------------------
  // Multiple transactions in one category accumulate
  // ---------------------------------------------------------------
  it('accumulates multiple transactions in sum-amount', async () => {
    const catId = await setupBasicBudget();
    const month = monthUtils.currentMonth();
    const sheetName = monthUtils.sheetForMonth(month);

    await db.insertTransaction({
      date: `${month}-05`,
      amount: -2000,
      account: 'checking',
      category: catId,
    });
    await db.insertTransaction({
      date: `${month}-15`,
      amount: -3500,
      account: 'checking',
      category: catId,
    });
    await db.insertTransaction({
      date: `${month}-20`,
      amount: -1500,
      account: 'checking',
      category: catId,
    });

    await sheet.waitOnSpreadsheet();

    expect(sheet.getCellValue(sheetName, `sum-amount-${catId}`)).toBe(-7000);
  });

  // ---------------------------------------------------------------
  // holdForNextMonth buffers money
  // ---------------------------------------------------------------
  it('holdForNextMonth buffers money and reduces to-budget', async () => {
    await sheet.loadSpreadsheet(db);
    sheet.get().meta().budgetType = 'envelope';

    await db.insertCategoryGroup({ id: 'group1', name: 'Bills' });
    await db.insertCategoryGroup({
      id: 'income-group',
      name: 'Income',
      is_income: 1,
    });

    const incomeCat = await db.insertCategory({
      name: 'Salary',
      cat_group: 'income-group',
    });

    await db.insertAccount({ id: 'checking', name: 'Checking' });
    await createAllBudgets();

    const month = monthUtils.currentMonth();
    const sheetName = monthUtils.sheetForMonth(month);

    // Add income so to-budget is positive
    await db.insertTransaction({
      date: `${month}-01`,
      amount: 50000, // $500 income
      account: 'checking',
      category: incomeCat,
    });

    await sheet.waitOnSpreadsheet();

    const toBudgetBefore = sheet.getCellValue(sheetName, 'to-budget');
    expect(toBudgetBefore).toBeGreaterThan(0);

    // Hold $100 for next month
    const result = await budgetActions.holdForNextMonth({
      month,
      amount: 10000,
    });

    await sheet.waitOnSpreadsheet();

    expect(result).toBe(true);
    // to-budget should decrease by the buffered amount
    const toBudgetAfter = sheet.getCellValue(sheetName, 'to-budget');
    expect(toBudgetAfter).toBe(Number(toBudgetBefore) - 10000);
  });

  // ---------------------------------------------------------------
  // Leftover propagation with positive carryover across months
  // ---------------------------------------------------------------
  it('propagates positive leftover across months with carryover enabled', async () => {
    await sheet.loadSpreadsheet(db);
    sheet.get().meta().budgetType = 'envelope';

    await db.insertCategoryGroup({ id: 'group1', name: 'Bills' });
    await db.insertCategoryGroup({
      id: 'income-group',
      name: 'Income',
      is_income: 1,
    });

    const catId = await db.insertCategory({
      name: 'Savings',
      cat_group: 'group1',
    });

    await db.insertAccount({ id: 'checking', name: 'Checking' });

    const month1 = monthUtils.currentMonth();
    const month2 = monthUtils.addMonths(month1, 1);
    const month3 = monthUtils.addMonths(month1, 2);

    await createAllBudgets();

    // Enable carryover
    await budgetActions.setCategoryCarryover({
      startMonth: month1,
      category: catId,
      flag: true,
    });

    // Month1: budget $200, spend $50 => leftover $150
    await budgetActions.setBudget({
      category: catId,
      month: month1,
      amount: 20000,
    });
    await db.insertTransaction({
      date: `${month1}-15`,
      amount: -5000,
      account: 'checking',
      category: catId,
    });

    await sheet.waitOnSpreadsheet();

    const sheet1 = monthUtils.sheetForMonth(month1);
    expect(sheet.getCellValue(sheet1, `leftover-${catId}`)).toBe(15000);

    // Month2: budget $100, spend $30 => leftover = 10000 + (-3000) + 15000 = 22000
    await budgetActions.setBudget({
      category: catId,
      month: month2,
      amount: 10000,
    });
    await db.insertTransaction({
      date: `${month2}-15`,
      amount: -3000,
      account: 'checking',
      category: catId,
    });

    await sheet.waitOnSpreadsheet();

    const sheet2 = monthUtils.sheetForMonth(month2);
    expect(sheet.getCellValue(sheet2, `leftover-${catId}`)).toBe(22000);

    // Month3: no budget, no spend => leftover = 0 + 0 + 22000 = 22000
    const sheet3 = monthUtils.sheetForMonth(month3);
    expect(sheet.getCellValue(sheet3, `leftover-${catId}`)).toBe(22000);
  });
});
