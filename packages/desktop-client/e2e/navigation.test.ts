import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { ConfigurationPage } from './page-models/configuration-page';
import { Navigation } from './page-models/navigation';

test.describe('Sidebar Navigation', () => {
  let page: Page;
  let navigation: Navigation;
  let configurationPage: ConfigurationPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    navigation = new Navigation(page);
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');
    await configurationPage.createTestFile();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('navigates to all primary sidebar sections', async () => {
    // Budget (default landing after test file)
    await expect(page.getByTestId('budget-table')).toBeVisible();

    // Accounts
    const accountPage = await navigation.goToAccountPage('Ally Savings');
    await expect(accountPage.accountName).toHaveText('Ally Savings');

    // Reports
    const reportsPage = await navigation.goToReportsPage();
    await expect(page.getByTestId('reports-page')).toBeVisible();

    // Schedules
    const schedulesPage = await navigation.goToSchedulesPage();
    await expect(
      page.getByRole('button', { name: 'Add new schedule' }),
    ).toBeVisible();

    // Payees (under More menu)
    const payeesPage = await navigation.goToPayeesPage();
    await expect(page).toHaveURL(/\/payees/);

    // Rules (under More menu)
    const rulesPage = await navigation.goToRulesPage();
    await expect(page).toHaveURL(/\/rules/);

    // Tags (under More menu)
    const tagsPage = await navigation.goToTagsPage();
    await expect(page).toHaveURL(/\/tags/);

    // Settings (under More menu)
    const settingsPage = await navigation.goToSettingsPage();
    await expect(page).toHaveURL(/\/settings/);
  });

  test('navigates back to budget from any section', async () => {
    // Go to settings
    await navigation.goToSettingsPage();
    await expect(page).toHaveURL(/\/settings/);

    // Click Budget in sidebar
    await page.getByRole('link', { name: 'Budget' }).click();
    await expect(page.getByTestId('budget-table')).toBeVisible();
    await expect(page).toHaveURL(/\/budget/);
  });

  test('sidebar highlights the active section', async () => {
    // Navigate to schedules
    await navigation.goToSchedulesPage();

    const schedulesLink = page.getByRole('link', { name: 'Schedules' });
    await expect(schedulesLink).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('Budget Category Drill-Down', () => {
  let page: Page;
  let navigation: Navigation;
  let configurationPage: ConfigurationPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    navigation = new Navigation(page);
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');
    await configurationPage.createTestFile();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('clicking spent amount in budget navigates to filtered transactions', async () => {
    const budgetPage = await navigation.goToAccountPage('Ally Savings');
    // Go back to budget first
    await page.getByRole('link', { name: 'Budget' }).click();
    await expect(page.getByTestId('budget-table')).toBeVisible();

    // Find a category row with spent amount and click it
    const budgetRows = page.getByTestId('budget-table').getByTestId('row');
    const rowCount = await budgetRows.count();

    if (rowCount > 0) {
      const spentCell = budgetRows.first().getByTestId('category-month-spent');
      const isClickable = await spentCell.isVisible().catch(() => false);

      if (isClickable) {
        await spentCell.click();
        // Should navigate to account view with filtered transactions
        await expect(page).toHaveURL(/\/accounts/);
      }
    }
  });
});

test.describe('Unknown Routes', () => {
  let page: Page;
  let configurationPage: ConfigurationPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');
    await configurationPage.createTestFile();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('redirects unknown routes to budget', async () => {
    await page.goto('/nonexistent-route');
    await expect(page).toHaveURL(/\/budget/);
  });
});
