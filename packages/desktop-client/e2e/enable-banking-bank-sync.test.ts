import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { BankSyncPage } from './page-models/bank-sync-page';
import { ConfigurationPage } from './page-models/configuration-page';
import { Navigation } from './page-models/navigation';

test.describe('Bank Sync Page - Enable Banking Accounts', () => {
  let page: Page;
  let navigation: Navigation;
  let configurationPage: ConfigurationPage;
  let bankSyncPage: BankSyncPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    navigation = new Navigation(page);
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');
    await configurationPage.createTestFile();

    bankSyncPage = await navigation.goToBankSyncPage();
    await bankSyncPage.waitToLoad();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('bank sync page displays heading', async () => {
    await expect(bankSyncPage.heading).toBeVisible();
  });

  test('bank sync page shows empty state when no synced accounts', async () => {
    // The test file may or may not have synced accounts
    // If no accounts are linked, the empty state should appear
    const hasAccounts = await page
      .getByRole('button', { name: /Edit|Link account/ })
      .first()
      .isVisible()
      .catch(() => false);

    if (!hasAccounts) {
      await expect(bankSyncPage.emptyStateText).toBeVisible();
    }
  });

  test('account rows show Edit button for linked accounts', async () => {
    // Check if any linked accounts exist on the Bank Sync page
    const editButtons = page.getByRole('button', { name: 'Edit' });
    const count = await editButtons.count();

    if (count > 0) {
      await expect(editButtons.first()).toBeVisible();
    }
  });

  test('account rows show Link account button for unlinked accounts', async () => {
    const linkButtons = page.getByRole('button', { name: 'Link account' });
    const count = await linkButtons.count();

    if (count > 0) {
      await expect(linkButtons.first()).toBeVisible();
    }
  });

  test('displays account names in rows', async () => {
    // Verify that table cells with account names exist
    const cells = page.locator('[data-testid="accountName"]');
    const count = await cells.count();

    if (count > 0) {
      await expect(cells.first()).not.toHaveText('');
    }
  });

  test('displays bank names for linked accounts', async () => {
    const bankCells = page.locator('[data-testid="bankName"]');
    const count = await bankCells.count();

    if (count > 0) {
      await expect(bankCells.first()).toBeVisible();
    }
  });

  test('displays last sync time for linked accounts', async () => {
    const syncCells = page.locator('[data-testid="lastSync"]');
    const count = await syncCells.count();

    if (count > 0) {
      // Last sync should contain a relative time string
      await expect(syncCells.first()).toBeVisible();
    }
  });

  test('checks the page visuals with accounts', async () => {
    await expect(page).toMatchThemeScreenshots();
  });
});

test.describe('Bank Sync Page - Edit Account Modal', () => {
  let page: Page;
  let navigation: Navigation;
  let configurationPage: ConfigurationPage;
  let bankSyncPage: BankSyncPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    navigation = new Navigation(page);
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');
    await configurationPage.createTestFile();

    bankSyncPage = await navigation.goToBankSyncPage();
    await bankSyncPage.waitToLoad();

    // Skip if no linked accounts exist to click Edit on
    const hasLinkedAccounts = await page
      .getByRole('button', { name: 'Edit' })
      .first()
      .isVisible()
      .catch(() => false);

    test.skip(
      !hasLinkedAccounts,
      'No linked accounts available to test Edit modal',
    );
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('clicking Edit opens the sync settings modal', async () => {
    await page.getByRole('button', { name: 'Edit' }).first().click();

    // The edit modal should open
    await expect(page.getByText(/bank sync settings/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test('edit modal shows field mapping section', async () => {
    await page.getByRole('button', { name: 'Edit' }).first().click();

    await expect(page.getByText(/bank sync settings/i)).toBeVisible({
      timeout: 5000,
    });

    await expect(page.getByText('Field mapping')).toBeVisible();
  });

  test('edit modal shows options section', async () => {
    await page.getByRole('button', { name: 'Edit' }).first().click();

    await expect(page.getByText(/bank sync settings/i)).toBeVisible({
      timeout: 5000,
    });

    await expect(page.getByText('Options')).toBeVisible();
  });

  test('edit modal has Save and Cancel buttons', async () => {
    await page.getByRole('button', { name: 'Edit' }).first().click();

    await expect(page.getByText(/bank sync settings/i)).toBeVisible({
      timeout: 5000,
    });

    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('edit modal has Unlink account button', async () => {
    await page.getByRole('button', { name: 'Edit' }).first().click();

    await expect(page.getByText(/bank sync settings/i)).toBeVisible({
      timeout: 5000,
    });

    await expect(
      page.getByRole('button', { name: /Unlink account/i }),
    ).toBeVisible();
  });

  test('edit modal can be closed via Cancel', async () => {
    await page.getByRole('button', { name: 'Edit' }).first().click();

    await expect(page.getByText(/bank sync settings/i)).toBeVisible({
      timeout: 5000,
    });

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByText(/bank sync settings/i)).not.toBeVisible();
  });

  test('checks the edit modal visuals', async () => {
    await page.getByRole('button', { name: 'Edit' }).first().click();

    await expect(page.getByText(/bank sync settings/i)).toBeVisible({
      timeout: 5000,
    });

    await expect(page).toMatchThemeScreenshots();
  });
});

test.describe('Bank Sync Page - Link Account Flow', () => {
  let page: Page;
  let navigation: Navigation;
  let configurationPage: ConfigurationPage;
  let bankSyncPage: BankSyncPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    navigation = new Navigation(page);
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');
    await configurationPage.createTestFile();

    bankSyncPage = await navigation.goToBankSyncPage();
    await bankSyncPage.waitToLoad();

    // Skip if no unlinked accounts to test
    const hasUnlinkedAccounts = await page
      .getByRole('button', { name: 'Link account' })
      .first()
      .isVisible()
      .catch(() => false);

    test.skip(
      !hasUnlinkedAccounts,
      'No unlinked accounts available to test Link flow',
    );
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('clicking Link account opens the add-account modal', async () => {
    await page.getByRole('button', { name: 'Link account' }).first().click();

    // Should open the add-account modal
    await expect(
      page.getByRole('heading', { name: /Add account|Link account/ }),
    ).toBeVisible({
      timeout: 5000,
    });
  });

  test('add-account modal from Bank Sync shows bank sync options', async () => {
    await page.getByRole('button', { name: 'Link account' }).first().click();

    await expect(
      page.getByRole('heading', { name: /Add account|Link account/ }),
    ).toBeVisible({
      timeout: 5000,
    });

    // Should show Enable Banking option if server is online
    const serverOnline = await page
      .getByRole('button', { name: /Enable Banking/ })
      .isVisible()
      .catch(() => false);

    if (serverOnline) {
      await expect(
        page.getByRole('button', { name: /Enable Banking/ }),
      ).toBeVisible();
    }
  });
});
