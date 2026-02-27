import type { Locator, Page } from '@playwright/test';

export class EnableBankingModal {
  readonly page: Page;
  readonly heading: Locator;
  readonly countryField: Locator;
  readonly bankField: Locator;
  readonly linkBankButton: Locator;
  readonly privacyPolicyLink: Locator;
  readonly closeButton: Locator;
  readonly loadingText: Locator;
  readonly configurationErrorText: Locator;
  readonly waitingText: Locator;
  readonly successText: Locator;
  readonly retryLink: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', {
      name: 'Link Your Bank (Enable Banking)',
    });

    this.countryField = page.locator('#country-field');

    this.bankField = page.locator('#bank-field');

    this.linkBankButton = page.getByRole('button', {
      name: /Link bank in browser/,
    });

    this.privacyPolicyLink = page.getByRole('link', {
      name: 'Privacy Policy',
    });

    this.closeButton = page.getByRole('button', { name: 'Close' });

    this.loadingText = page.getByText(
      'Checking Enable Banking configuration...',
    );

    this.configurationErrorText = page.getByText(
      /Enable Banking integration has not yet been configured/,
    );

    this.waitingText = page.getByText('Waiting for bank authorisation...');

    this.successText = page.getByText(
      /Success! Your bank accounts are being linked/,
    );

    this.retryLink = page.getByText(
      /Bank authorisation not opening in a new tab/,
    );
  }

  async waitToLoad() {
    await this.heading.waitFor({ state: 'visible', timeout: 10000 });
  }

  async selectCountry(country: string) {
    await this.countryField.fill(country);
    await this.page.getByRole('option', { name: country }).first().click();
  }

  async selectBank(bank: string) {
    await this.bankField.fill(bank);
    await this.page.getByRole('option', { name: bank }).first().click();
  }

  async clickLinkBank() {
    await this.linkBankButton.click();
  }

  async close() {
    await this.closeButton.click();
  }
}
