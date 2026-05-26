// @ts-strict-ignore
import * as monthUtils from '../../shared/months';
import * as db from '../db';
import * as sheet from '../sheet';

import * as budgetActions from './actions';
import { createAllBudgets } from './base';

beforeEach(() => {
  return global.emptyDatabase()();
});

async function setupBasicBudget(opts?: { extraCategories?: string[] }) {
  await sheet.loadSpreadsheet(db);
  sheet.get().meta().budgetType = 'envelope';

  await db.insertCategoryGroup({ id: 'group1', name: 'Bills' });
  await db.insertCategoryGroup({
    id: 'income-group',
    name: 'Income',
    is_income: 1,
  });

  const cats: string[] = [];
  cats.push(
    await db.insertCategory({
      name: 'Groceries',
      cat_group: 'group1',
    }),
  );

  if (opts?.extraCategories) {
    for (const name of opts.extraCategories) {
      cats.push(await db.insertCategory({ name, cat_group: 'group1' }));
    }
  }

  await db.insertAccount({ id: 'checking', name: 'Checking' });
  await createAllBudgets();

  return cats;
}

describe('Envelope budget', () => {
  it('creates budget cells for expense categories after createAllBudgets', async () => {
    const [catId] = await setupBasicBudget();
    const month = monthUtils.currentMonth();
    const sheetName = monthUtils.sheetForMonth(month);

    expect(sheet.getCellValue(sheetName, `budget-${catId}`)).toBe(0);
    expect(sheet.getCellValue(sheetName, `leftover-${catId}`)).toBe(0);
    expect(sheet.getCellValue(sheetName, `leftover-pos-${catId}`)).toBe(0);
    expect(sheet.getCellValue(sheetName, `carryover-${catId}`)).toBe(false);
    expect(sheet.getCellValue(sheetName, `sum-amount-${catId}`)).toBe(0);
  });

  it('sets and retrieves a budget amount', async () => {
    const [catId] = await setupBasicBudget();
    const month = monthUtils.currentMonth();
    const sheetName = monthUtils.sheetForMonth(month);

    await budgetActions.setBudget({ category: catId, month, amount: 10000 });
    await sheet.waitOnSpreadsheet();

    expect(sheet.getCellValue(sheetName, `budget-${catId}`)).toBe(10000);
    expect(budgetActions.getBudget({ category: catId, month })).toBe(10000);
  });

  it('updates sum-amount when transactions are inserted', async () => {
    const [catId] = await setupBasicBudget();
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

  it('calculates leftover as budgeted + spent', async () => {
    const [catId] = await setupBasicBudget();
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
    expect(sheet.getCellValue(sheetName, `leftover-pos-${catId}`)).toBe(4000);
  });

  it('clamps leftover-pos to 0 when leftover is negative', async () => {
    const [catId] = await setupBasicBudget();
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

    expect(sheet.getCellValue(sheetName, `leftover-${catId}`)).toBe(-3000);
    expect(sheet.getCellValue(sheetName, `leftover-pos-${catId}`)).toBe(0);
  });

  it('carries over leftover to next month when carryover is enabled', async () => {
    const [catId] = await setupBasicBudget();
    const month1 = monthUtils.currentMonth();
    const month2 = monthUtils.addMonths(month1, 1);
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

    expect(sheet.getCellValue(sheet1, `leftover-${catId}`)).toBe(4000);

    await budgetActions.setCategoryCarryover({
      startMonth: month1,
      category: catId,
      flag: true,
    });

    await sheet.waitOnSpreadsheet();

    expect(sheet.getCellValue(sheet1, `carryover-${catId}`)).toBe(true);
    // leftover = budget(0) + spent(0) + prevLeftover(4000) = 4000
    expect(sheet.getCellValue(sheet2, `leftover-${catId}`)).toBe(4000);
  });

  it('does not carry over full leftover when carryover is disabled (uses leftover-pos)', async () => {
    const [catId] = await setupBasicBudget();
    const month1 = monthUtils.currentMonth();
    const month2 = monthUtils.addMonths(month1, 1);
    const sheet1 = monthUtils.sheetForMonth(month1);
    const sheet2 = monthUtils.sheetForMonth(month2);

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

    // Negative leftover does NOT carry over when carryover is off
    // because the formula uses leftover-pos (clamped to 0)
    expect(sheet.getCellValue(sheet1, `leftover-${catId}`)).toBe(-3000);
    expect(sheet.getCellValue(sheet1, `leftover-pos-${catId}`)).toBe(0);
    expect(sheet.getCellValue(sheet1, `carryover-${catId}`)).toBe(false);

    // month2 leftover = budget(0) + spent(0) + leftover-pos(0) = 0
    expect(sheet.getCellValue(sheet2, `leftover-${catId}`)).toBe(0);
  });

  it('setZero zeroes all budgets for a month', async () => {
    const [catA, catB] = await setupBasicBudget({
      extraCategories: ['Rent'],
    });
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
    const [catA, catB] = await setupBasicBudget({
      extraCategories: ['Rent'],
    });
    const month1 = monthUtils.currentMonth();
    const month2 = monthUtils.addMonths(month1, 1);
    const sheet2 = monthUtils.sheetForMonth(month2);

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

    await budgetActions.copyPreviousMonth({ month: month2 });
    await sheet.waitOnSpreadsheet();

    expect(sheet.getCellValue(sheet2, `budget-${catA}`)).toBe(7500);
    expect(sheet.getCellValue(sheet2, `budget-${catB}`)).toBe(15000);
  });

  it('tracks total-budgeted and total-spent summary cells', async () => {
    const [catA, catB] = await setupBasicBudget({
      extraCategories: ['Rent'],
    });
    const month = monthUtils.currentMonth();
    const sheetName = monthUtils.sheetForMonth(month);

    await budgetActions.setBudget({ category: catA, month, amount: 5000 });
    await budgetActions.setBudget({ category: catB, month, amount: 10000 });

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
    expect(sheet.getCellValue(sheetName, 'total-spent')).toBe(-10000);
  });

  it('accumulates multiple transactions in sum-amount', async () => {
    const [catId] = await setupBasicBudget();
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

    const result = await budgetActions.holdForNextMonth({
      month,
      amount: 10000,
    });

    await sheet.waitOnSpreadsheet();

    expect(result).toBe(true);
    const toBudgetAfter = sheet.getCellValue(sheetName, 'to-budget');
    expect(toBudgetAfter).toBe(Number(toBudgetBefore) - 10000);
  });

  it('propagates positive leftover across months with carryover enabled', async () => {
    const [catId] = await setupBasicBudget();
    const month1 = monthUtils.currentMonth();
    const month2 = monthUtils.addMonths(month1, 1);
    const month3 = monthUtils.addMonths(month1, 2);

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
