import type { Locator, Page } from '@playwright/test';

export class CreateAccountModal {
  readonly page: Page;
  readonly modal: Locator;
  readonly createLocalAccountButton: Locator;
  readonly enableBankingButton: Locator;
  readonly goCardlessButton: Locator;
  readonly simpleFinButton: Locator;
  readonly pluggyAiButton: Locator;
  readonly bankSyncDisabledButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = page.getByTestId('add-account');

    this.createLocalAccountButton = page.getByRole('button', {
      name: 'Create a local account',
    });

    this.enableBankingButton = page.getByRole('button', {
      name: /Enable Banking/,
    });

    this.goCardlessButton = page.getByRole('button', {
      name: /GoCardless/,
    });

    this.simpleFinButton = page.getByRole('button', {
      name: /SimpleFIN/,
    });

    this.pluggyAiButton = page.getByRole('button', {
      name: /Pluggy\.ai/,
    });

    this.bankSyncDisabledButton = page.getByRole('button', {
      name: 'Set up bank sync',
    });
  }

  async waitToLoad() {
    await this.page
      .getByRole('heading', { name: /Add account|Link account/ })
      .waitFor({ state: 'visible', timeout: 10000 });
  }

  async clickEnableBanking() {
    await this.enableBankingButton.click();
  }

  async clickCreateLocalAccount() {
    await this.createLocalAccountButton.click();
  }
}
