import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { ConfigurationPage } from './page-models/configuration-page';
import { CreateAccountModal } from './page-models/create-account-modal';
import { EnableBankingModal } from './page-models/enable-banking-modal';
import { Navigation } from './page-models/navigation';

test.describe('Enable Banking', () => {
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

  test('create account modal shows Enable Banking option', async () => {
    await page.getByRole('button', { name: 'Add account' }).click();

    const modal = new CreateAccountModal(page);
    await modal.waitToLoad();

    await expect(modal.enableBankingButton).toBeVisible();
    await expect(
      page.getByText(/Enable Banking provides PSD2-compliant access/),
    ).toBeVisible();
  });

  test('enable banking modal opens with correct heading', async () => {
    await page.getByRole('button', { name: 'Add account' }).click();

    const createAccountModal = new CreateAccountModal(page);
    await createAccountModal.waitToLoad();
    await createAccountModal.clickEnableBanking();

    const ebModal = new EnableBankingModal(page);
    await ebModal.waitToLoad();

    await expect(ebModal.heading).toBeVisible();
    await expect(
      page.getByText(
        /you will be redirected to a new page where your bank will ask you to authorise access/,
      ),
    ).toBeVisible();
  });

  test('enable banking modal shows configuration status', async () => {
    await page.getByRole('button', { name: 'Add account' }).click();

    const createAccountModal = new CreateAccountModal(page);
    await createAccountModal.waitToLoad();
    await createAccountModal.clickEnableBanking();

    const ebModal = new EnableBankingModal(page);
    await ebModal.waitToLoad();

    // Wait for the configuration check to complete (loading spinner disappears)
    await expect(ebModal.loadingText).not.toBeVisible({ timeout: 15000 });

    // The modal shows either country selection (configured) or error (not configured)
    const isConfigured = await ebModal.countryField
      .isVisible()
      .catch(() => false);

    if (isConfigured) {
      await expect(page.getByText('Choose your country:')).toBeVisible();
      await expect(ebModal.countryField).toBeVisible();
    } else {
      await expect(ebModal.configurationErrorText).toBeVisible();
    }
  });

  test('enable banking modal can be closed', async () => {
    await page.getByRole('button', { name: 'Add account' }).click();

    const createAccountModal = new CreateAccountModal(page);
    await createAccountModal.waitToLoad();
    await createAccountModal.clickEnableBanking();

    const ebModal = new EnableBankingModal(page);
    await ebModal.waitToLoad();

    await expect(ebModal.heading).toBeVisible();
    await ebModal.close();
    await expect(ebModal.heading).not.toBeVisible();
  });

  test('checks the page visuals', async () => {
    await page.getByRole('button', { name: 'Add account' }).click();

    const createAccountModal = new CreateAccountModal(page);
    await createAccountModal.waitToLoad();
    await createAccountModal.clickEnableBanking();

    const ebModal = new EnableBankingModal(page);
    await ebModal.waitToLoad();

    // Wait for configuration check to resolve before taking screenshot
    await expect(ebModal.loadingText).not.toBeVisible({ timeout: 15000 });

    await expect(page).toMatchThemeScreenshots();
  });
});

test.describe('Enable Banking - Configured', () => {
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

    // Wait for the configuration check to complete
    await expect(ebModal.loadingText).not.toBeVisible({ timeout: 15000 });

    // Skip these tests if Enable Banking is not configured on the server
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

  test('shows country selector with auto-detected country', async () => {
    await expect(page.getByText('Choose your country:')).toBeVisible();
    await expect(ebModal.countryField).toBeVisible();
    // The country field should have a pre-selected value from browser locale
    await expect(ebModal.countryField).not.toHaveValue('');
  });

  test('link button is disabled without bank selection', async () => {
    await expect(ebModal.linkBankButton).toBeVisible();
    await expect(ebModal.linkBankButton).toBeDisabled();
  });

  test('shows bank selector after country selection', async () => {
    // Clear the country field and select a known country
    await ebModal.countryField.clear();
    await ebModal.countryField.fill('Denmark');
    await page.getByRole('option', { name: 'Denmark' }).first().click();

    // Wait for banks to load
    await expect(page.getByText('Loading banks...')).not.toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByText('Choose your bank:')).toBeVisible();
    await expect(ebModal.bankField).toBeVisible();
  });

  test('shows privacy policy warning', async () => {
    await expect(
      page.getByText(/By enabling bank sync, you will be granting/),
    ).toBeVisible();
    await expect(ebModal.privacyPolicyLink).toBeVisible();
    await expect(ebModal.privacyPolicyLink).toHaveAttribute(
      'href',
      'https://enablebanking.com/privacy-policy/',
    );
  });

  test('enables link button after country and bank selection', async () => {
    // Select a country
    await ebModal.countryField.clear();
    await ebModal.countryField.fill('Denmark');
    await page.getByRole('option', { name: 'Denmark' }).first().click();

    // Wait for banks to load
    await expect(page.getByText('Loading banks...')).not.toBeVisible({
      timeout: 15000,
    });

    // Select a bank (first available)
    await ebModal.bankField.click();
    await page.getByRole('option').first().click();

    // Link button should now be enabled
    await expect(ebModal.linkBankButton).toBeEnabled();
  });
});
