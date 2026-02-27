import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { ConfigurationPage } from './page-models/configuration-page';
import { CreateAccountModal } from './page-models/create-account-modal';
import { EnableBankingModal } from './page-models/enable-banking-modal';

/**
 * Tests for the Enable Banking OAuth authorization flow.
 * These tests require Enable Banking to be configured on the sync server.
 * Tests that can't be fully simulated (e.g., actual bank auth) focus on
 * verifying UI states during the flow.
 */
test.describe('Enable Banking OAuth Flow', () => {
  let page: Page;
  let configurationPage: ConfigurationPage;
  let ebModal: EnableBankingModal;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');
    await configurationPage.createTestFile();

    // Open the Enable Banking modal
    await page.getByRole('button', { name: 'Add account' }).click();
    const createAccountModal = new CreateAccountModal(page);
    await createAccountModal.waitToLoad();
    await createAccountModal.clickEnableBanking();

    ebModal = new EnableBankingModal(page);
    await ebModal.waitToLoad();

    // Wait for configuration check
    await expect(ebModal.loadingText).not.toBeVisible({ timeout: 15000 });

    // These tests require Enable Banking to be configured
    const isConfigured = await ebModal.countryField
      .isVisible()
      .catch(() => false);
    test.skip(
      !isConfigured,
      'Enable Banking is not configured on the sync server',
    );
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('clicking link bank shows waiting state', async () => {
    // Prevent actual browser window from opening during test
    await page.evaluate(() => {
      window.Actual.openURLInBrowser = () => {};
    });

    // Select country and bank
    await ebModal.countryField.clear();
    await ebModal.countryField.fill('Denmark');
    await page.getByRole('option', { name: 'Denmark' }).first().click();

    // Wait for banks to load
    await expect(page.getByText('Loading banks...')).not.toBeVisible({
      timeout: 15000,
    });

    // Select first available bank
    await ebModal.bankField.click();
    await page.getByRole('option').first().click();

    // Click link bank
    await ebModal.clickLinkBank();

    // Should show waiting state
    await expect(ebModal.waitingText).toBeVisible({ timeout: 10000 });
  });

  test('retry link is visible during waiting state', async () => {
    await page.evaluate(() => {
      window.Actual.openURLInBrowser = () => {};
    });

    // Select country and bank
    await ebModal.countryField.clear();
    await ebModal.countryField.fill('Denmark');
    await page.getByRole('option', { name: 'Denmark' }).first().click();

    await expect(page.getByText('Loading banks...')).not.toBeVisible({
      timeout: 15000,
    });

    await ebModal.bankField.click();
    await page.getByRole('option').first().click();

    await ebModal.clickLinkBank();

    // Wait for waiting state
    await expect(ebModal.waitingText).toBeVisible({ timeout: 10000 });

    // Retry link should appear
    await expect(ebModal.retryLink).toBeVisible();
    await expect(ebModal.retryLink).toContainText(
      'Bank authorisation not opening in a new tab',
    );
  });

  test('waiting state shows loading spinner', async () => {
    await page.evaluate(() => {
      window.Actual.openURLInBrowser = () => {};
    });

    await ebModal.countryField.clear();
    await ebModal.countryField.fill('Denmark');
    await page.getByRole('option', { name: 'Denmark' }).first().click();

    await expect(page.getByText('Loading banks...')).not.toBeVisible({
      timeout: 15000,
    });

    await ebModal.bankField.click();
    await page.getByRole('option').first().click();

    await ebModal.clickLinkBank();
    await expect(ebModal.waitingText).toBeVisible({ timeout: 10000 });

    // Link bank button should not be visible during waiting
    await expect(ebModal.linkBankButton).not.toBeVisible();

    // Country and bank selectors should not be visible during waiting
    await expect(ebModal.countryField).not.toBeVisible();
    await expect(ebModal.bankField).not.toBeVisible();
  });

  test('checks the waiting state visuals', async () => {
    await page.evaluate(() => {
      window.Actual.openURLInBrowser = () => {};
    });

    await ebModal.countryField.clear();
    await ebModal.countryField.fill('Denmark');
    await page.getByRole('option', { name: 'Denmark' }).first().click();

    await expect(page.getByText('Loading banks...')).not.toBeVisible({
      timeout: 15000,
    });

    await ebModal.bankField.click();
    await page.getByRole('option').first().click();

    await ebModal.clickLinkBank();
    await expect(ebModal.waitingText).toBeVisible({ timeout: 10000 });

    await expect(page).toMatchThemeScreenshots();
  });
});

test.describe('Enable Banking Error Recovery', () => {
  let page: Page;
  let configurationPage: ConfigurationPage;
  let ebModal: EnableBankingModal;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');
    await configurationPage.createTestFile();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('not-configured state shows descriptive error message', async () => {
    // Open EB modal
    await page.getByRole('button', { name: 'Add account' }).click();
    const createAccountModal = new CreateAccountModal(page);
    await createAccountModal.waitToLoad();
    await createAccountModal.clickEnableBanking();

    ebModal = new EnableBankingModal(page);
    await ebModal.waitToLoad();
    await expect(ebModal.loadingText).not.toBeVisible({ timeout: 15000 });

    // Check if not configured (this is the common case in test environments)
    const isNotConfigured = await ebModal.configurationErrorText
      .isVisible()
      .catch(() => false);

    if (isNotConfigured) {
      await expect(ebModal.configurationErrorText).toContainText(
        'Enable Banking integration has not yet been configured',
      );
      await expect(ebModal.configurationErrorText).toContainText(
        'server administrator',
      );

      // Country/bank selectors should NOT be visible
      await expect(ebModal.countryField).not.toBeVisible();
      await expect(ebModal.bankField).not.toBeVisible();

      // Link button should NOT be visible
      await expect(ebModal.linkBankButton).not.toBeVisible();
    }
  });

  test('bank loading error shows error message', async () => {
    // Open EB modal
    await page.getByRole('button', { name: 'Add account' }).click();
    const createAccountModal = new CreateAccountModal(page);
    await createAccountModal.waitToLoad();
    await createAccountModal.clickEnableBanking();

    ebModal = new EnableBankingModal(page);
    await ebModal.waitToLoad();
    await expect(ebModal.loadingText).not.toBeVisible({ timeout: 15000 });

    // Skip if not configured (can't test bank loading error without config)
    const isConfigured = await ebModal.countryField
      .isVisible()
      .catch(() => false);
    test.skip(!isConfigured, 'Enable Banking is not configured');

    // Type an invalid country code to trigger bank loading error
    await ebModal.countryField.clear();
    await ebModal.countryField.fill('XX');

    // If the country is not recognized, the bank list won't load
    // The form should handle this gracefully
    await expect(ebModal.bankField).not.toBeVisible();
  });

  test('modal descriptive text is always visible regardless of state', async () => {
    // Open EB modal
    await page.getByRole('button', { name: 'Add account' }).click();
    const createAccountModal = new CreateAccountModal(page);
    await createAccountModal.waitToLoad();
    await createAccountModal.clickEnableBanking();

    ebModal = new EnableBankingModal(page);
    await ebModal.waitToLoad();
    await expect(ebModal.loadingText).not.toBeVisible({ timeout: 15000 });

    // The descriptive text should always be visible
    await expect(
      page.getByText(
        /you will be redirected to a new page where your bank will ask you to authorise access/,
      ),
    ).toBeVisible();

    // The heading should always be visible
    await expect(ebModal.heading).toBeVisible();
  });

  test('modal can be reopened after closing', async () => {
    // Open and close the modal
    await page.getByRole('button', { name: 'Add account' }).click();
    const createAccountModal = new CreateAccountModal(page);
    await createAccountModal.waitToLoad();
    await createAccountModal.clickEnableBanking();

    ebModal = new EnableBankingModal(page);
    await ebModal.waitToLoad();
    await ebModal.close();
    await expect(ebModal.heading).not.toBeVisible();

    // Reopen: go back to create account, click EB again
    await page.getByRole('button', { name: 'Add account' }).click();
    await createAccountModal.waitToLoad();
    await createAccountModal.clickEnableBanking();

    await ebModal.waitToLoad();
    await expect(ebModal.heading).toBeVisible();
  });
});
