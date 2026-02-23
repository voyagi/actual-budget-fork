import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { ConfigurationPage } from './page-models/configuration-page';
import { EnableBankingModal } from './page-models/enable-banking-modal';
import { MobileNavigation } from './page-models/mobile-navigation';

test.describe('Mobile Enable Banking', () => {
  let page: Page;
  let navigation: MobileNavigation;
  let configurationPage: ConfigurationPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    navigation = new MobileNavigation(page);
    configurationPage = new ConfigurationPage(page);

    await page.setViewportSize({
      width: 350,
      height: 600,
    });

    await page.goto('/');
    await configurationPage.createTestFile();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('create account shows Enable Banking option', async () => {
    // Navigate to accounts and open add account
    await page.getByRole('button', { name: 'Add account' }).click();

    await expect(
      page.getByRole('button', { name: /Enable Banking/ }),
    ).toBeVisible();
  });

  test('enable banking modal opens on mobile', async () => {
    await page.getByRole('button', { name: 'Add account' }).click();
    await page.getByRole('button', { name: /Enable Banking/ }).click();

    const ebModal = new EnableBankingModal(page);
    await ebModal.waitToLoad();

    await expect(ebModal.heading).toBeVisible();
    await expect(
      page.getByText(
        /you will be redirected to a new page where your bank will ask you to authorise access/,
      ),
    ).toBeVisible();
  });

  test('enable banking modal shows configuration status on mobile', async () => {
    await page.getByRole('button', { name: 'Add account' }).click();
    await page.getByRole('button', { name: /Enable Banking/ }).click();

    const ebModal = new EnableBankingModal(page);
    await ebModal.waitToLoad();

    // Wait for configuration check
    await expect(ebModal.loadingText).not.toBeVisible({ timeout: 15000 });

    const isConfigured = await ebModal.countryField
      .isVisible()
      .catch(() => false);

    if (isConfigured) {
      await expect(ebModal.countryField).toBeVisible();
    } else {
      await expect(ebModal.configurationErrorText).toBeVisible();
    }

    await expect(page).toMatchThemeScreenshots();
  });

  test('enable banking modal can be closed on mobile', async () => {
    await page.getByRole('button', { name: 'Add account' }).click();
    await page.getByRole('button', { name: /Enable Banking/ }).click();

    const ebModal = new EnableBankingModal(page);
    await ebModal.waitToLoad();

    await ebModal.close();
    await expect(ebModal.heading).not.toBeVisible();
  });
});

test.describe('Mobile Enable Banking - Configured', () => {
  let page: Page;
  let configurationPage: ConfigurationPage;
  let ebModal: EnableBankingModal;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    configurationPage = new ConfigurationPage(page);

    await page.setViewportSize({
      width: 350,
      height: 600,
    });

    await page.goto('/');
    await configurationPage.createTestFile();

    // Open the Enable Banking modal
    await page.getByRole('button', { name: 'Add account' }).click();
    await page.getByRole('button', { name: /Enable Banking/ }).click();

    ebModal = new EnableBankingModal(page);
    await ebModal.waitToLoad();

    // Wait for configuration check
    await expect(ebModal.loadingText).not.toBeVisible({ timeout: 15000 });

    // Skip if not configured
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

  test('country selector is usable on mobile viewport', async () => {
    await expect(ebModal.countryField).toBeVisible();
    await expect(page.getByText('Choose your country:')).toBeVisible();

    // Verify the field is interactive
    await ebModal.countryField.clear();
    await ebModal.countryField.fill('Ger');
    await expect(page.getByRole('option', { name: /Germany/ })).toBeVisible();
  });

  test('privacy warning is visible on mobile', async () => {
    await expect(
      page.getByText(/By enabling bank sync, you will be granting/),
    ).toBeVisible();
    await expect(ebModal.privacyPolicyLink).toBeVisible();
  });

  test('link button is disabled without selections on mobile', async () => {
    await expect(ebModal.linkBankButton).toBeDisabled();
  });
});
